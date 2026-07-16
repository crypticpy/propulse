from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx

from upload_cloud_bundle import (
    TUS_CHUNK_BYTES,
    direct_storage_origin,
    ensure_private_bucket,
    upload_resumable,
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
                    "allowed_mime_types": ["application/zstd"],
                })
            return httpx.Response(201, json={
                "id": "propagation-models",
                "public": False,
                "file_size_limit": 100 * 1024 * 1024,
                "allowed_mime_types": ["application/zstd"],
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
