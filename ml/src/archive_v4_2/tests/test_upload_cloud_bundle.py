from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx

from upload_cloud_bundle import (
    STORAGE_CONTENT_TYPE,
    TUS_CHUNK_BYTES,
    archive_part_records,
    direct_storage_origin,
    ensure_private_bucket,
    upload_resumable,
    verify_remote_archive,
    verify_remote_object,
)


SERVICE_KEY = "s" * 64


class CloudBundleUploadTests(unittest.TestCase):
    def test_derives_direct_storage_origin(self):
        self.assertEqual(
            direct_storage_origin("https://projectref.supabase.co"),
            "https://projectref.storage.supabase.co",
        )
        with self.assertRaisesRegex(RuntimeError, "project URL"):
            direct_storage_origin("http://projectref.supabase.co")

    def test_creates_a_private_size_bounded_bucket(self):
        requests = []

        get_count = 0

        def handler(request):
            nonlocal get_count
            requests.append(request)
            if request.method == "GET":
                get_count += 1
                if get_count == 1:
                    return httpx.Response(404)
                return httpx.Response(200, json={
                    "id": "propagation-models",
                    "public": False,
                    "file_size_limit": 100 * 1024 * 1024,
                    "allowed_mime_types": [STORAGE_CONTENT_TYPE],
                })
            return httpx.Response(201, json={
                "id": "propagation-models",
                "public": False,
                "file_size_limit": 100 * 1024 * 1024,
                "allowed_mime_types": [STORAGE_CONTENT_TYPE],
            })

        with httpx.Client(transport=httpx.MockTransport(handler)) as client:
            bucket = ensure_private_bucket(
                client,
                "https://projectref.supabase.co",
                SERVICE_KEY,
                "propagation-models",
                70 * 1024 * 1024,
            )
        self.assertFalse(bucket["public"])
        self.assertEqual(
            [request.method for request in requests],
            ["GET", "POST", "GET"],
        )

    def test_creates_bucket_for_supabase_wrapped_not_found_response(self):
        requests = []
        get_count = 0

        def handler(request):
            nonlocal get_count
            requests.append(request)
            if request.method == "GET":
                get_count += 1
                if get_count == 1:
                    return httpx.Response(400, json={
                        "statusCode": "404",
                        "error": "Bucket not found",
                        "message": "Bucket not found",
                    })
                return httpx.Response(200, json={
                    "id": "propagation-models",
                    "public": False,
                    "file_size_limit": 100 * 1024 * 1024,
                    "allowed_mime_types": [STORAGE_CONTENT_TYPE],
                })
            return httpx.Response(201)

        with httpx.Client(transport=httpx.MockTransport(handler)) as client:
            bucket = ensure_private_bucket(
                client,
                "https://projectref.supabase.co",
                SERVICE_KEY,
                "propagation-models",
                70 * 1024 * 1024,
            )
        self.assertFalse(bucket["public"])
        self.assertEqual(
            [request.method for request in requests],
            ["GET", "POST", "GET"],
        )

    def test_other_bad_bucket_response_remains_an_error(self):
        def handler(request):
            return httpx.Response(400, json={
                "statusCode": "400",
                "error": "Invalid request",
                "message": "Bucket configuration is invalid",
            })

        with httpx.Client(transport=httpx.MockTransport(handler)) as client:
            with self.assertRaisesRegex(RuntimeError, "HTTP 400"):
                ensure_private_bucket(
                    client,
                    "https://projectref.supabase.co",
                    SERVICE_KEY,
                    "propagation-models",
                    70 * 1024 * 1024,
                )

    def test_builds_checksum_bound_ordered_storage_parts(self):
        with tempfile.TemporaryDirectory() as temporary:
            archive = Path(temporary) / "bundle.tar.zst"
            archive.write_bytes(b"abcdefghij")
            parts = archive_part_records(
                archive,
                "a6/bundle.tar.zst",
                part_bytes=4,
            )
        self.assertEqual([part["index"] for part in parts], [0, 1, 2])
        self.assertEqual([part["offset"] for part in parts], [0, 4, 8])
        self.assertEqual([part["bytes"] for part in parts], [4, 4, 2])
        self.assertEqual(
            [part["key"] for part in parts],
            [
                "a6/bundle.tar.zst.part-000",
                "a6/bundle.tar.zst.part-001",
                "a6/bundle.tar.zst.part-002",
            ],
        )

    def test_verifies_remote_parts_as_the_original_archive(self):
        with tempfile.TemporaryDirectory() as temporary:
            archive = Path(temporary) / "bundle.tar.zst"
            archive.write_bytes(b"abcdefghij")
            parts = archive_part_records(
                archive,
                "a6/bundle.tar.zst",
                part_bytes=4,
            )
            content = archive.read_bytes()

            def handler(request):
                index = int(request.url.path.rsplit("-", 1)[1])
                part = parts[index]
                start = part["offset"]
                return httpx.Response(
                    200,
                    content=content[start:start + part["bytes"]],
                )

            with httpx.Client(
                transport=httpx.MockTransport(handler),
            ) as client:
                verified = verify_remote_archive(
                    client,
                    "https://projectref.supabase.co",
                    SERVICE_KEY,
                    "propagation-models",
                    parts,
                    len(content),
                    archive_part_records(
                        archive,
                        "unused",
                        part_bytes=len(content),
                    )[0]["sha256"],
                )
        self.assertTrue(verified)

    def test_wrapped_missing_object_is_absent_not_an_upload_error(self):
        part = {
            "index": 0,
            "key": "a6/bundle.tar.zst.part-000",
            "offset": 0,
            "bytes": 4,
            "sha256": "0" * 64,
        }

        def handler(request):
            body = json.dumps({
                "statusCode": "404",
                "error": "not_found",
                "message": "Object not found",
            }).encode("utf-8")
            return httpx.Response(
                400,
                stream=httpx.ByteStream(body),
                headers={"content-type": "application/json"},
            )

        with httpx.Client(transport=httpx.MockTransport(handler)) as client:
            self.assertFalse(verify_remote_object(
                client,
                "https://projectref.supabase.co",
                SERVICE_KEY,
                "propagation-models",
                part["key"],
                part["bytes"],
                part["sha256"],
            ))
            self.assertFalse(verify_remote_archive(
                client,
                "https://projectref.supabase.co",
                SERVICE_KEY,
                "propagation-models",
                [part],
                part["bytes"],
                part["sha256"],
            ))

    def test_other_object_400_response_remains_an_error(self):
        def handler(request):
            return httpx.Response(400, json={
                "statusCode": "400",
                "error": "invalid_request",
                "message": "Object key is invalid",
            })

        with httpx.Client(transport=httpx.MockTransport(handler)) as client:
            with self.assertRaisesRegex(RuntimeError, "HTTP 400"):
                verify_remote_object(
                    client,
                    "https://projectref.supabase.co",
                    SERVICE_KEY,
                    "propagation-models",
                    "a6/bundle.tar.zst.part-000",
                    4,
                    "0" * 64,
                )

    def test_uploads_only_the_selected_archive_slice(self):
        with tempfile.TemporaryDirectory() as temporary:
            archive = Path(temporary) / "bundle.tar.zst"
            archive.write_bytes(b"0123456789")
            uploaded = []

            def handler(request):
                if request.method == "POST":
                    self.assertEqual(request.headers["upload-length"], "4")
                    return httpx.Response(201, headers={"location": "/upload/id"})
                body = request.read()
                uploaded.append(body)
                return httpx.Response(
                    204,
                    headers={"upload-offset": str(len(body))},
                )

            with httpx.Client(transport=httpx.MockTransport(handler)) as client:
                upload_resumable(
                    client,
                    "https://projectref.storage.supabase.co/upload",
                    archive,
                    SERVICE_KEY,
                    "propagation-models",
                    "a6/bundle.tar.zst.part-000",
                    source_offset=3,
                    upload_bytes=4,
                )
        self.assertEqual(uploaded, [b"3456"])

    def test_uploads_in_tus_chunks_and_checks_offsets(self):
        with tempfile.TemporaryDirectory() as temporary:
            archive = Path(temporary) / "bundle.tar.zst"
            archive.write_bytes(b"a" * (TUS_CHUNK_BYTES + 17))
            patch_sizes = []
            offsets = []

            def handler(request):
                if request.method == "POST":
                    self.assertEqual(
                        request.headers["upload-length"],
                        str(archive.stat().st_size),
                    )
                    return httpx.Response(
                        201,
                        headers={"location": "/storage/v1/upload/resumable/id"},
                    )
                if request.method == "PATCH":
                    body = request.read()
                    offset = int(request.headers["upload-offset"])
                    offsets.append(offset)
                    patch_sizes.append(len(body))
                    return httpx.Response(
                        204,
                        headers={"upload-offset": str(offset + len(body))},
                    )
                raise AssertionError(request.method)

            with httpx.Client(
                transport=httpx.MockTransport(handler),
            ) as client:
                with patch("upload_cloud_bundle.time.sleep", return_value=None):
                    location = upload_resumable(
                        client,
                        "https://projectref.storage.supabase.co/storage/v1/upload/resumable",
                        archive,
                        SERVICE_KEY,
                        "propagation-models",
                        "a6/bundle.tar.zst",
                    )
            self.assertEqual(
                location,
                "https://projectref.storage.supabase.co/storage/v1/upload/resumable/id",
            )
            self.assertEqual(offsets, [0, TUS_CHUNK_BYTES])
            self.assertEqual(patch_sizes, [TUS_CHUNK_BYTES, 17])


if __name__ == "__main__":
    unittest.main()
