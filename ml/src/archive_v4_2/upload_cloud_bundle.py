#!/usr/bin/env python3
"""Upload and remotely verify the immutable A6 cloud bundle with TUS."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import sys
import time
from pathlib import Path
from typing import Any
from urllib.parse import quote, urljoin, urlparse

import httpx


ROOT = Path(__file__).resolve().parents[3]
SERVICE = ROOT / "ml/service"
sys.path.insert(0, str(SERVICE))

from serving_manifest import sha256_file  # noqa: E402


DEFAULT_RESULT_DIR = (
    ROOT
    / "ml/results/propagation_v4_2/propagation_v4_2_phase2_scale"
)
PACKAGE_RECEIPT_NAME = "cloud_bundle_package_receipt.json"
UPLOAD_RECEIPT_NAME = "cloud_bundle_upload_receipt.json"
TUS_VERSION = "1.0.0"
TUS_CHUNK_BYTES = 6 * 1024 * 1024
STORAGE_PART_BYTES = 45 * 1024 * 1024
STORAGE_CONTENT_TYPE = "application/octet-stream"
TRANSIENT_STATUS = {408, 425, 429, 500, 502, 503, 504}


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise RuntimeError(f"JSON artifact must be an object: {path}")
    return value


def write_new_json(path: Path, value: dict[str, Any]) -> None:
    try:
        with path.open("x", encoding="utf-8") as handle:
            json.dump(value, handle, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
    except FileExistsError as error:
        raise RuntimeError(f"immutable artifact already exists: {path}") from error


def auth_headers(service_key: str) -> dict[str, str]:
    if len(service_key) < 32:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY is missing or invalid")
    return {
        "Authorization": f"Bearer {service_key}",
        "apikey": service_key,
    }


def bucket_is_missing(response: httpx.Response) -> bool:
    if response.status_code == 404:
        return True
    if response.status_code != 400:
        return False
    try:
        payload = response.json()
    except ValueError:
        return False
    return (
        isinstance(payload, dict)
        and str(payload.get("statusCode")) == "404"
        and payload.get("error") == "Bucket not found"
        and payload.get("message") == "Bucket not found"
    )


def direct_storage_origin(supabase_url: str) -> str:
    parsed = urlparse(supabase_url.rstrip("/"))
    if parsed.scheme != "https" or not parsed.netloc.endswith(".supabase.co"):
        raise RuntimeError("SUPABASE_URL must be an HTTPS project URL")
    project_ref = parsed.netloc.removesuffix(".supabase.co")
    if not project_ref or "." in project_ref:
        raise RuntimeError("could not derive the Supabase project reference")
    return f"https://{project_ref}.storage.supabase.co"


def ensure_private_bucket(
    client: httpx.Client,
    supabase_url: str,
    service_key: str,
    bucket: str,
    required_bytes: int,
) -> dict[str, Any]:
    headers = auth_headers(service_key)
    base = supabase_url.rstrip("/")
    response = client.get(
        f"{base}/storage/v1/bucket/{quote(bucket, safe='')}",
        headers=headers,
    )
    minimum_limit = required_bytes
    if bucket_is_missing(response):
        created = client.post(
            f"{base}/storage/v1/bucket",
            headers=headers,
            json={
                "id": bucket,
                "name": bucket,
                "public": False,
                "file_size_limit": minimum_limit,
                "allowed_mime_types": [STORAGE_CONTENT_TYPE],
            },
        )
        if created.status_code not in {200, 201}:
            raise RuntimeError(
                f"model bucket creation returned HTTP {created.status_code}: "
                f"{created.text[:300]}"
            )
        response = client.get(
            f"{base}/storage/v1/bucket/{quote(bucket, safe='')}",
            headers=headers,
        )
    if response.status_code not in {200, 201}:
        raise RuntimeError(
            f"model bucket configuration returned HTTP {response.status_code}: "
            f"{response.text[:300]}"
        )
    payload = response.json()
    if not isinstance(payload, dict):
        raise RuntimeError("model bucket response is not an object")
    if payload.get("public") is not False:
        raise RuntimeError("model bucket must remain private")
    limit = payload.get("file_size_limit")
    if type(limit) is not int or limit < required_bytes:
        raise RuntimeError("model bucket file-size limit is too small")
    allowed = payload.get("allowed_mime_types")
    if not isinstance(allowed, list) or STORAGE_CONTENT_TYPE not in allowed:
        raise RuntimeError(
            f"model bucket must allow {STORAGE_CONTENT_TYPE}"
        )
    return payload


def archive_part_records(
    archive_path: Path,
    object_key: str,
    *,
    part_bytes: int = STORAGE_PART_BYTES,
) -> list[dict[str, Any]]:
    if part_bytes < 1:
        raise RuntimeError("storage part size must be positive")
    total_bytes = archive_path.stat().st_size
    records: list[dict[str, Any]] = []
    offset = 0
    with archive_path.open("rb") as handle:
        while offset < total_bytes:
            size = min(part_bytes, total_bytes - offset)
            digest = hashlib.sha256()
            copied = 0
            while copied < size:
                chunk = handle.read(min(1024 * 1024, size - copied))
                if not chunk:
                    raise RuntimeError(
                        "local bundle ended while computing storage parts"
                    )
                digest.update(chunk)
                copied += len(chunk)
            index = len(records)
            records.append({
                "index": index,
                "key": f"{object_key}.part-{index:03d}",
                "offset": offset,
                "bytes": size,
                "sha256": digest.hexdigest(),
            })
            offset += size
    if not records:
        raise RuntimeError("model archive must not be empty")
    return records


def tus_metadata(values: dict[str, str]) -> str:
    return ",".join(
        f"{key} {base64.b64encode(value.encode('utf-8')).decode('ascii')}"
        for key, value in values.items()
    )


def tus_offset(
    client: httpx.Client,
    location: str,
    headers: dict[str, str],
) -> int:
    response = client.head(
        location,
        headers={**headers, "Tus-Resumable": TUS_VERSION},
    )
    if response.status_code != 200:
        raise RuntimeError(f"TUS offset query returned HTTP {response.status_code}")
    try:
        return int(response.headers["Upload-Offset"])
    except (KeyError, ValueError) as error:
        raise RuntimeError("TUS offset response is invalid") from error


def upload_resumable(
    client: httpx.Client,
    endpoint: str,
    archive_path: Path,
    service_key: str,
    bucket: str,
    object_key: str,
    *,
    source_offset: int = 0,
    upload_bytes: int | None = None,
) -> str:
    headers = auth_headers(service_key)
    archive_bytes = archive_path.stat().st_size
    size = archive_bytes - source_offset if upload_bytes is None else upload_bytes
    if source_offset < 0 or size < 1 or source_offset + size > archive_bytes:
        raise RuntimeError("model storage slice is outside the local archive")
    response = client.post(
        endpoint,
        headers={
            **headers,
            "Tus-Resumable": TUS_VERSION,
            "Upload-Length": str(size),
            "Upload-Metadata": tus_metadata({
                "bucketName": bucket,
                "objectName": object_key,
                "contentType": STORAGE_CONTENT_TYPE,
                "cacheControl": "31536000",
            }),
            "x-upsert": "false",
        },
    )
    if response.status_code != 201:
        raise RuntimeError(
            f"TUS upload creation returned HTTP {response.status_code}: "
            f"{response.text[:300]}"
        )
    location_header = response.headers.get("location")
    if not location_header:
        raise RuntimeError("TUS upload creation returned no location")
    location = urljoin(endpoint, location_header)
    if urlparse(location).scheme != "https":
        raise RuntimeError("TUS upload location must use HTTPS")

    offset = 0
    with archive_path.open("rb") as handle:
        while offset < size:
            handle.seek(source_offset + offset)
            chunk = handle.read(min(TUS_CHUNK_BYTES, size - offset))
            if not chunk:
                raise RuntimeError("local bundle ended before TUS upload completed")
            for attempt, delay in enumerate((0, 3, 5, 10), start=1):
                if delay:
                    time.sleep(delay)
                try:
                    response = client.patch(
                        location,
                        headers={
                            **headers,
                            "Tus-Resumable": TUS_VERSION,
                            "Upload-Offset": str(offset),
                            "Content-Type": "application/offset+octet-stream",
                        },
                        content=chunk,
                    )
                except httpx.HTTPError:
                    if attempt == 4:
                        raise
                    offset = tus_offset(client, location, headers)
                    break
                if response.status_code == 204:
                    try:
                        next_offset = int(response.headers["Upload-Offset"])
                    except (KeyError, ValueError) as error:
                        raise RuntimeError("TUS patch offset is invalid") from error
                    if next_offset != offset + len(chunk):
                        raise RuntimeError("TUS patch offset advanced unexpectedly")
                    offset = next_offset
                    break
                if response.status_code not in TRANSIENT_STATUS or attempt == 4:
                    raise RuntimeError(
                        f"TUS patch returned HTTP {response.status_code}: "
                        f"{response.text[:300]}"
                    )
                offset = tus_offset(client, location, headers)
                break
            else:
                raise RuntimeError("TUS upload retry loop ended unexpectedly")
    if offset != size:
        raise RuntimeError("TUS upload did not reach the local file size")
    return location


def verify_remote_object(
    client: httpx.Client,
    supabase_url: str,
    service_key: str,
    bucket: str,
    object_key: str,
    expected_bytes: int,
    expected_sha256: str,
) -> bool:
    url = (
        f"{supabase_url.rstrip('/')}/storage/v1/object/authenticated/"
        f"{quote(bucket, safe='')}/{quote(object_key, safe='/')}"
    )
    digest = hashlib.sha256()
    copied = 0
    with client.stream("GET", url, headers=auth_headers(service_key)) as response:
        if response.status_code == 404:
            return False
        if response.status_code != 200:
            raise RuntimeError(
                f"remote model verification returned HTTP {response.status_code}"
            )
        for chunk in response.iter_bytes(1024 * 1024):
            copied += len(chunk)
            if copied > expected_bytes:
                raise RuntimeError("remote model object exceeds expected size")
            digest.update(chunk)
    if copied != expected_bytes or digest.hexdigest() != expected_sha256:
        raise RuntimeError("remote model object checksum differs")
    return True


def verify_remote_archive(
    client: httpx.Client,
    supabase_url: str,
    service_key: str,
    bucket: str,
    parts: list[dict[str, Any]],
    expected_bytes: int,
    expected_sha256: str,
) -> bool:
    archive_digest = hashlib.sha256()
    archive_bytes = 0
    for part in parts:
        url = (
            f"{supabase_url.rstrip('/')}/storage/v1/object/authenticated/"
            f"{quote(bucket, safe='')}/{quote(part['key'], safe='/')}"
        )
        part_digest = hashlib.sha256()
        part_copied = 0
        with client.stream(
            "GET",
            url,
            headers=auth_headers(service_key),
        ) as response:
            if response.status_code == 404:
                return False
            if response.status_code != 200:
                raise RuntimeError(
                    "remote model part verification returned HTTP "
                    f"{response.status_code}"
                )
            for chunk in response.iter_bytes(1024 * 1024):
                part_copied += len(chunk)
                archive_bytes += len(chunk)
                if part_copied > part["bytes"] or archive_bytes > expected_bytes:
                    raise RuntimeError("remote model part exceeds expected size")
                part_digest.update(chunk)
                archive_digest.update(chunk)
        if (
            part_copied != part["bytes"]
            or part_digest.hexdigest() != part["sha256"]
        ):
            raise RuntimeError("remote model part checksum differs")
    if (
        archive_bytes != expected_bytes
        or archive_digest.hexdigest() != expected_sha256
    ):
        raise RuntimeError("reassembled remote model checksum differs")
    return True


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--result-dir", type=Path, default=DEFAULT_RESULT_DIR)
    parser.add_argument("--archive", type=Path)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    package_receipt_path = args.result_dir / PACKAGE_RECEIPT_NAME
    package_receipt = load_json(package_receipt_path)
    object_record = package_receipt["object"]
    supabase_url = (
        os.environ.get("SUPABASE_URL")
        or os.environ.get("VITE_SUPABASE_URL")
        or ""
    ).strip()
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    archive_path = args.archive or (
        Path("/Volumes/Projects/PropulseML/cloud_bundles/a6")
        / Path(object_record["key"]).name
    )
    if (
        archive_path.stat().st_size != object_record["bytes"]
        or sha256_file(archive_path) != object_record["sha256"]
    ):
        raise RuntimeError("local cloud bundle differs from the package receipt")
    parts = archive_part_records(archive_path, object_record["key"])
    headers = auth_headers(service_key)
    del headers
    with httpx.Client(
        follow_redirects=False,
        timeout=httpx.Timeout(120, connect=15),
    ) as client:
        bucket = ensure_private_bucket(
            client,
            supabase_url,
            service_key,
            object_record["bucket"],
            max(part["bytes"] for part in parts),
        )
        endpoint = (
            direct_storage_origin(supabase_url)
            + "/storage/v1/upload/resumable"
        )
        already_uploaded = verify_remote_archive(
            client,
            supabase_url,
            service_key,
            object_record["bucket"],
            parts,
            object_record["bytes"],
            object_record["sha256"],
        )
        if not already_uploaded:
            for part in parts:
                if verify_remote_object(
                    client,
                    supabase_url,
                    service_key,
                    object_record["bucket"],
                    part["key"],
                    part["bytes"],
                    part["sha256"],
                ):
                    continue
                upload_resumable(
                    client,
                    endpoint,
                    archive_path,
                    service_key,
                    object_record["bucket"],
                    part["key"],
                    source_offset=part["offset"],
                    upload_bytes=part["bytes"],
                )
            if not verify_remote_archive(
                client,
                supabase_url,
                service_key,
                object_record["bucket"],
                parts,
                object_record["bytes"],
                object_record["sha256"],
            ):
                raise RuntimeError("uploaded model parts are missing")
    receipt = {
        "schema_version": 2,
        "uploaded_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "release_stage": package_receipt["release_stage"],
        "bucket": {
            "id": bucket["id"],
            "public": bucket["public"],
            "file_size_limit": bucket["file_size_limit"],
            "allowed_mime_types": bucket["allowed_mime_types"],
        },
        "object": object_record,
        "storage_layout": "ordered-split-object-v1",
        "storage_parts": [
            {key: part[key] for key in ("index", "key", "bytes", "sha256")}
            for part in parts
        ],
        "storage_part_bytes": STORAGE_PART_BYTES,
        "upload_protocol": "tus-v1.0.0",
        "chunk_bytes": TUS_CHUNK_BYTES,
        "remote_verification": "reassembled_full_sha256_download_passed",
    }
    receipt_path = args.result_dir / UPLOAD_RECEIPT_NAME
    write_new_json(receipt_path, receipt)
    print(receipt_path)


if __name__ == "__main__":
    main()
