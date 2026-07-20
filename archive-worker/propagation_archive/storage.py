"""Private Supabase Storage upload, download, and byte-level verification."""

from __future__ import annotations

import base64
import hashlib
import time
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote, urljoin, urlparse

import httpx


BUCKET = "propagation-archives"
CONTENT_TYPE = "application/octet-stream"
TUS_VERSION = "1.0.0"
TUS_CHUNK_BYTES = 6 * 1024 * 1024
TRANSIENT_STATUS = {408, 425, 429, 500, 502, 503, 504}


@dataclass(frozen=True)
class StorageObject:
    path: str
    size: int


def auth_headers(service_key: str) -> dict[str, str]:
    if len(service_key) < 32:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY is missing or invalid")
    return {"Authorization": f"Bearer {service_key}", "apikey": service_key}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _error_payload(response: httpx.Response) -> dict[str, object] | None:
    try:
        response.read()
        payload = response.json()
    except (UnicodeDecodeError, ValueError, httpx.HTTPError):
        return None
    return payload if isinstance(payload, dict) else None


def _missing(response: httpx.Response) -> bool:
    if response.status_code == 404:
        return True
    if response.status_code != 400:
        return False
    payload = _error_payload(response)
    return payload is not None and str(payload.get("statusCode")) == "404"


def direct_storage_origin(supabase_url: str) -> str:
    parsed = urlparse(supabase_url.rstrip("/"))
    if parsed.scheme != "https" or not parsed.netloc.endswith(".supabase.co"):
        raise RuntimeError("SUPABASE_URL must be an HTTPS Supabase project URL")
    project_ref = parsed.netloc.removesuffix(".supabase.co")
    if not project_ref or "." in project_ref:
        raise RuntimeError("could not derive the Supabase project reference")
    return f"https://{project_ref}.storage.supabase.co"


def _tus_metadata(values: dict[str, str]) -> str:
    return ",".join(
        f"{key} {base64.b64encode(value.encode()).decode('ascii')}"
        for key, value in values.items()
    )


class SupabaseArchiveStorage:
    def __init__(
        self,
        supabase_url: str,
        service_key: str,
        *,
        client: httpx.Client | None = None,
    ) -> None:
        self.supabase_url = supabase_url.rstrip("/")
        self.service_key = service_key
        self.headers = auth_headers(service_key)
        self._owned_client = client is None
        self.client = client or httpx.Client(
            follow_redirects=False,
            timeout=httpx.Timeout(120, connect=15),
        )

    def close(self) -> None:
        if self._owned_client:
            self.client.close()

    def __enter__(self) -> "SupabaseArchiveStorage":
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def ensure_private_bucket(self, required_bytes: int) -> dict[str, object]:
        response = self.client.get(
            f"{self.supabase_url}/storage/v1/bucket/{BUCKET}",
            headers=self.headers,
        )
        if _missing(response):
            created = self.client.post(
                f"{self.supabase_url}/storage/v1/bucket",
                headers=self.headers,
                json={
                    "id": BUCKET,
                    "name": BUCKET,
                    "public": False,
                    "file_size_limit": None,
                    "allowed_mime_types": [
                        CONTENT_TYPE,
                        "application/vnd.apache.parquet",
                    ],
                },
            )
            if created.status_code not in {200, 201}:
                raise RuntimeError(
                    f"archive bucket creation returned HTTP {created.status_code}: "
                    f"{created.text[:300]}"
                )
            response = self.client.get(
                f"{self.supabase_url}/storage/v1/bucket/{BUCKET}",
                headers=self.headers,
            )
        if response.status_code != 200:
            raise RuntimeError(
                f"archive bucket lookup returned HTTP {response.status_code}: "
                f"{response.text[:300]}"
            )
        payload = response.json()
        if not isinstance(payload, dict) or payload.get("public") is not False:
            raise RuntimeError("propagation archive bucket must remain private")
        limit = payload.get("file_size_limit")
        if limit is not None and (type(limit) is not int or limit < required_bytes):
            raise RuntimeError("archive bucket file-size limit is too small")
        return payload

    def _object_url(self, object_path: str) -> str:
        return (
            f"{self.supabase_url}/storage/v1/object/authenticated/{BUCKET}/"
            f"{quote(object_path, safe='/')}"
        )

    def list_objects(self, *, max_objects: int = 100_000) -> list[StorageObject]:
        if max_objects < 1:
            raise ValueError("max_objects must be positive")
        objects: list[StorageObject] = []
        pending = [""]
        while pending:
            prefix = pending.pop()
            offset = 0
            while True:
                response = self.client.post(
                    f"{self.supabase_url}/storage/v1/object/list/{BUCKET}",
                    headers=self.headers,
                    json={
                        "prefix": prefix,
                        "limit": 1000,
                        "offset": offset,
                        "sortBy": {"column": "name", "order": "asc"},
                    },
                )
                if response.status_code != 200:
                    raise RuntimeError(
                        "archive inventory returned HTTP "
                        f"{response.status_code}: {response.text[:300]}"
                    )
                payload = response.json()
                if not isinstance(payload, list):
                    raise RuntimeError("archive inventory response is not a list")
                for item in payload:
                    if not isinstance(item, dict) or not isinstance(item.get("name"), str):
                        raise RuntimeError("archive inventory contains an invalid item")
                    name = item["name"]
                    path = f"{prefix}/{name}" if prefix else name
                    metadata = item.get("metadata")
                    if metadata is None:
                        pending.append(path)
                        continue
                    if not isinstance(metadata, dict):
                        raise RuntimeError("archive object metadata is invalid")
                    size = metadata.get("size")
                    if type(size) is not int or size < 0:
                        raise RuntimeError("archive object size is invalid")
                    objects.append(StorageObject(path=path, size=size))
                    if len(objects) > max_objects:
                        raise RuntimeError("archive inventory exceeds its object limit")
                if len(payload) < 1000:
                    break
                offset += len(payload)
        return sorted(objects, key=lambda item: item.path)

    def verify(self, object_path: str, expected_bytes: int, expected_sha256: str) -> bool:
        digest = hashlib.sha256()
        copied = 0
        with self.client.stream(
            "GET", self._object_url(object_path), headers=self.headers
        ) as response:
            if _missing(response):
                return False
            if response.status_code != 200:
                raise RuntimeError(
                    f"archive download returned HTTP {response.status_code}"
                )
            for chunk in response.iter_bytes(1024 * 1024):
                copied += len(chunk)
                if copied > expected_bytes:
                    raise RuntimeError("remote archive exceeds its manifest size")
                digest.update(chunk)
        if copied != expected_bytes or digest.hexdigest() != expected_sha256:
            raise RuntimeError("remote archive size or SHA-256 differs from manifest")
        return True

    def download(self, object_path: str, target: Path) -> tuple[int, str]:
        temporary = target.with_suffix(target.suffix + ".partial")
        temporary.unlink(missing_ok=True)
        digest = hashlib.sha256()
        copied = 0
        try:
            with self.client.stream(
                "GET", self._object_url(object_path), headers=self.headers
            ) as response:
                if response.status_code != 200:
                    raise RuntimeError(
                        f"archive download returned HTTP {response.status_code}"
                    )
                with temporary.open("xb") as output:
                    for chunk in response.iter_bytes(1024 * 1024):
                        output.write(chunk)
                        copied += len(chunk)
                        digest.update(chunk)
                    output.flush()
            temporary.chmod(0o600)
            temporary.replace(target)
        except Exception:
            temporary.unlink(missing_ok=True)
            raise
        return copied, digest.hexdigest()

    def upload(self, source: Path, object_path: str) -> None:
        size = source.stat().st_size
        digest = sha256_file(source)
        self.ensure_private_bucket(size)
        if self.verify(object_path, size, digest):
            return
        endpoint = direct_storage_origin(self.supabase_url) + "/storage/v1/upload/resumable"
        response = self.client.post(
            endpoint,
            headers={
                **self.headers,
                "Tus-Resumable": TUS_VERSION,
                "Upload-Length": str(size),
                "Upload-Metadata": _tus_metadata({
                    "bucketName": BUCKET,
                    "objectName": object_path,
                    "contentType": CONTENT_TYPE,
                    "cacheControl": "31536000",
                }),
                "x-upsert": "false",
            },
        )
        if response.status_code != 201:
            raise RuntimeError(
                f"TUS archive creation returned HTTP {response.status_code}: "
                f"{response.text[:300]}"
            )
        location_header = response.headers.get("location")
        if not location_header:
            raise RuntimeError("TUS archive creation returned no location")
        location = urljoin(endpoint, location_header)
        if urlparse(location).scheme != "https":
            raise RuntimeError("TUS archive location must use HTTPS")

        offset = 0
        with source.open("rb") as handle:
            while offset < size:
                handle.seek(offset)
                chunk = handle.read(min(TUS_CHUNK_BYTES, size - offset))
                if not chunk:
                    raise RuntimeError("local archive ended before upload completed")
                for attempt, delay in enumerate((0, 3, 5, 10), start=1):
                    if delay:
                        time.sleep(delay)
                    try:
                        patched = self.client.patch(
                            location,
                            headers={
                                **self.headers,
                                "Tus-Resumable": TUS_VERSION,
                                "Upload-Offset": str(offset),
                                "Content-Type": "application/offset+octet-stream",
                            },
                            content=chunk,
                        )
                    except httpx.HTTPError:
                        if attempt == 4:
                            raise
                        offset = self._tus_offset(location)
                        break
                    if patched.status_code == 204:
                        try:
                            next_offset = int(patched.headers["Upload-Offset"])
                        except (KeyError, ValueError) as error:
                            raise RuntimeError("TUS offset response is invalid") from error
                        if next_offset != offset + len(chunk):
                            raise RuntimeError("TUS upload advanced by an unexpected amount")
                        offset = next_offset
                        break
                    if patched.status_code not in TRANSIENT_STATUS or attempt == 4:
                        raise RuntimeError(
                            f"TUS patch returned HTTP {patched.status_code}: "
                            f"{patched.text[:300]}"
                        )
                    offset = self._tus_offset(location)
                    break
                else:
                    raise RuntimeError("TUS retry loop ended unexpectedly")
        if offset != size:
            raise RuntimeError("TUS archive upload did not reach the expected size")
        if not self.verify(object_path, size, digest):
            raise RuntimeError("uploaded archive is missing")

    def _tus_offset(self, location: str) -> int:
        response = self.client.head(
            location,
            headers={**self.headers, "Tus-Resumable": TUS_VERSION},
        )
        if response.status_code != 200:
            raise RuntimeError(f"TUS offset query returned HTTP {response.status_code}")
        try:
            return int(response.headers["Upload-Offset"])
        except (KeyError, ValueError) as error:
            raise RuntimeError("TUS offset query response is invalid") from error
