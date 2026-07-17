from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx

from model_bundle import (
    create_bundle_archive,
    download_bundle,
    extract_bundle_archive,
    sha256_file,
    verify_bundle_directory,
)
from serving_manifest import feature_order_sha256
from test_serving_manifest import valid_manifest


def write_fixture_bundle(root: Path) -> Path:
    manifest = valid_manifest()
    for profile in manifest["profiles"].values():
        components = (
            profile["components"]
            if profile["kind"] == "weighted_ensemble"
            else [profile]
        )
        for component in components:
            for path_field, sha_field in (
                ("model_path", "model_sha256"),
                ("calibrator_path", "calibrator_sha256"),
            ):
                path = root / component[path_field]
                path.write_bytes(f"fixture:{path.name}".encode("ascii"))
                component[sha_field] = sha256_file(path)
    for profile in manifest["profiles"].values():
        profile["feature_order_sha256"] = feature_order_sha256(
            profile["features"]
        )
    manifest_path = root / "internal.json"
    manifest_path.write_text(
        json.dumps(manifest, indent=2) + "\n",
        encoding="ascii",
    )
    return manifest_path


class ModelBundleTests(unittest.TestCase):
    def test_streaming_archive_round_trip(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "source"
            source.mkdir()
            manifest_path = write_fixture_bundle(source)
            archive = root / "bundle.tar.zst"
            receipt = create_bundle_archive(
                manifest_path,
                archive,
                compression_threads=2,
            )
            destination = root / "active"
            extracted_manifest = extract_bundle_archive(
                archive,
                receipt["sha256"],
                destination,
            )
            self.assertEqual(extracted_manifest.name, "serving_manifest.json")
            verify_bundle_directory(extracted_manifest)
            self.assertEqual(
                sorted(path.name for path in destination.iterdir()),
                sorted(member["name"] for member in receipt["members"]),
            )

    def test_outer_checksum_fails_before_extraction(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "source"
            source.mkdir()
            manifest_path = write_fixture_bundle(source)
            archive = root / "bundle.tar.zst"
            create_bundle_archive(manifest_path, archive, compression_threads=1)
            with self.assertRaisesRegex(RuntimeError, "outer model bundle"):
                extract_bundle_archive(archive, "0" * 64, root / "active")
            self.assertFalse((root / "active").exists())

    def test_member_tampering_is_rejected_before_packaging(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "source"
            source.mkdir()
            manifest_path = write_fixture_bundle(source)
            (source / "M1_physics.json").write_text("changed", encoding="ascii")
            with self.assertRaisesRegex(RuntimeError, "member checksum"):
                create_bundle_archive(
                    manifest_path,
                    root / "bundle.tar.zst",
                    compression_threads=1,
                )

    def test_downloads_ordered_parts_into_one_archive(self):
        requests = []
        values = {
            "/bundle.tar.zst.part-000": b"first-",
            "/bundle.tar.zst.part-001": b"second",
        }

        def handler(request):
            requests.append(request)
            return httpx.Response(200, content=values[request.url.path])

        with tempfile.TemporaryDirectory() as temporary:
            destination = Path(temporary) / "bundle.tar.zst"
            client = httpx.Client(transport=httpx.MockTransport(handler))
            with patch("model_bundle.httpx.Client", return_value=client):
                download_bundle(
                    "https://storage.example/bundle.tar.zst",
                    destination,
                    bearer_token="private-token",
                    max_bytes=32,
                    part_count=2,
                )
            self.assertEqual(destination.read_bytes(), b"first-second")
        self.assertEqual(
            [request.url.path for request in requests],
            list(values),
        )
        self.assertTrue(all(
            request.headers["authorization"] == "Bearer private-token"
            for request in requests
        ))

    def test_failed_part_download_removes_partial_archive(self):
        def handler(request):
            if request.url.path.endswith("part-000"):
                return httpx.Response(200, content=b"first")
            return httpx.Response(404)

        with tempfile.TemporaryDirectory() as temporary:
            destination = Path(temporary) / "bundle.tar.zst"
            client = httpx.Client(transport=httpx.MockTransport(handler))
            with patch("model_bundle.httpx.Client", return_value=client):
                with self.assertRaisesRegex(RuntimeError, "HTTP 404"):
                    download_bundle(
                        "https://storage.example/bundle.tar.zst",
                        destination,
                        bearer_token="private-token",
                        max_bytes=32,
                        part_count=2,
                    )
            self.assertFalse(destination.exists())

    def test_rejects_unbounded_part_count(self):
        with self.assertRaisesRegex(RuntimeError, "between 1 and 64"):
            download_bundle(
                "https://storage.example/bundle.tar.zst",
                Path("unused"),
                bearer_token="",
                part_count=65,
            )


if __name__ == "__main__":
    unittest.main()
