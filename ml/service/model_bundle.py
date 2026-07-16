"""Streaming package, download, and safe activation of serving bundles."""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import tarfile
import tempfile
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx
import zstandard as zstd

from serving_manifest import (
    resolve_bundle_artifact,
    sha256_file,
    validate_serving_manifest,
)


ARCHIVE_MANIFEST_NAME = "serving_manifest.json"
DEFAULT_MAX_ARCHIVE_BYTES = 512 * 1024 * 1024
MAX_MEMBER_BYTES = 512 * 1024 * 1024
MAX_MANIFEST_BYTES = 1024 * 1024
DOWNLOAD_CHUNK_BYTES = 1024 * 1024


def bundle_member_records(
    manifest_path: Path,
    manifest: dict[str, Any],
) -> list[dict[str, Any]]:
    validate_serving_manifest(manifest)
    records: list[dict[str, Any]] = []
    seen: set[str] = set()
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
                name = component[path_field]
                if name in seen:
                    raise RuntimeError(f"duplicate model bundle member: {name}")
                seen.add(name)
                path = resolve_bundle_artifact(manifest_path, name)
                expected_sha = component[sha_field]
                actual_sha = sha256_file(path)
                if actual_sha != expected_sha:
                    raise RuntimeError(f"model bundle member checksum mismatch: {name}")
                records.append({
                    "name": name,
                    "path": path,
                    "bytes": path.stat().st_size,
                    "sha256": actual_sha,
                })
    return sorted(records, key=lambda item: item["name"])


def _tar_info(name: str, size: int) -> tarfile.TarInfo:
    info = tarfile.TarInfo(name)
    info.size = size
    info.mode = 0o444
    info.uid = 0
    info.gid = 0
    info.uname = ""
    info.gname = ""
    info.mtime = 0
    return info


def create_bundle_archive(
    manifest_path: Path,
    output_path: Path,
    *,
    compression_threads: int,
) -> dict[str, Any]:
    if compression_threads < 1 or compression_threads > 32:
        raise ValueError("compression threads must be between 1 and 32")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if not isinstance(manifest, dict):
        raise RuntimeError("serving manifest must be an object")
    members = bundle_member_records(manifest_path, manifest)
    manifest_bytes = json.dumps(
        manifest,
        ensure_ascii=True,
        indent=2,
    ).encode("ascii") + b"\n"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with output_path.open("xb") as raw:
            compressor = zstd.ZstdCompressor(
                level=10,
                threads=compression_threads,
                write_checksum=True,
            )
            with compressor.stream_writer(raw, closefd=False) as compressed:
                with tarfile.open(fileobj=compressed, mode="w|") as archive:
                    archive.addfile(
                        _tar_info(ARCHIVE_MANIFEST_NAME, len(manifest_bytes)),
                        _BytesReader(manifest_bytes),
                    )
                    for member in members:
                        with member["path"].open("rb") as handle:
                            archive.addfile(
                                _tar_info(member["name"], member["bytes"]),
                                handle,
                            )
            raw.flush()
            os.fsync(raw.fileno())
    except Exception:
        output_path.unlink(missing_ok=True)
        raise
    return {
        "archive_path": output_path,
        "bytes": output_path.stat().st_size,
        "sha256": sha256_file(output_path),
        "members": [
            {
                "name": ARCHIVE_MANIFEST_NAME,
                "bytes": len(manifest_bytes),
                "sha256": hashlib.sha256(manifest_bytes).hexdigest(),
            },
            *[
                {key: member[key] for key in ("name", "bytes", "sha256")}
                for member in members
            ],
        ],
    }


class _BytesReader:
    def __init__(self, value: bytes) -> None:
        self.value = value
        self.offset = 0

    def read(self, size: int = -1) -> bytes:
        if size < 0:
            size = len(self.value) - self.offset
        chunk = self.value[self.offset:self.offset + size]
        self.offset += len(chunk)
        return chunk


def _read_member_bytes(
    archive: tarfile.TarFile,
    member: tarfile.TarInfo,
    limit: int,
) -> bytes:
    if not member.isfile() or member.size < 1 or member.size > limit:
        raise RuntimeError(f"unsafe model bundle member: {member.name}")
    handle = archive.extractfile(member)
    if handle is None:
        raise RuntimeError(f"unreadable model bundle member: {member.name}")
    value = handle.read(limit + 1)
    if len(value) != member.size or len(value) > limit:
        raise RuntimeError(f"model bundle member size differs: {member.name}")
    return value


def _copy_member(
    archive: tarfile.TarFile,
    member: tarfile.TarInfo,
    destination: Path,
    expected_sha256: str,
) -> None:
    if (
        not member.isfile()
        or Path(member.name).name != member.name
        or member.size < 1
        or member.size > MAX_MEMBER_BYTES
    ):
        raise RuntimeError(f"unsafe model bundle member: {member.name}")
    source = archive.extractfile(member)
    if source is None:
        raise RuntimeError(f"unreadable model bundle member: {member.name}")
    digest = hashlib.sha256()
    copied = 0
    with destination.open("xb") as output:
        while True:
            chunk = source.read(DOWNLOAD_CHUNK_BYTES)
            if not chunk:
                break
            copied += len(chunk)
            if copied > member.size:
                raise RuntimeError(f"model bundle member size differs: {member.name}")
            digest.update(chunk)
            output.write(chunk)
        output.flush()
        os.fsync(output.fileno())
    if copied != member.size or digest.hexdigest() != expected_sha256:
        raise RuntimeError(f"model bundle member checksum mismatch: {member.name}")


def extract_bundle_archive(
    archive_path: Path,
    expected_archive_sha256: str,
    destination: Path,
) -> Path:
    actual_archive_sha = sha256_file(archive_path)
    if actual_archive_sha != expected_archive_sha256:
        raise RuntimeError("outer model bundle checksum mismatch")
    destination.parent.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix=".bundle-", dir=destination.parent))
    try:
        with archive_path.open("rb") as raw:
            with zstd.ZstdDecompressor().stream_reader(raw) as decompressed:
                with tarfile.open(fileobj=decompressed, mode="r|") as archive:
                    first = archive.next()
                    if first is None or first.name != ARCHIVE_MANIFEST_NAME:
                        raise RuntimeError("model bundle manifest must be first")
                    manifest_bytes = _read_member_bytes(
                        archive,
                        first,
                        MAX_MANIFEST_BYTES,
                    )
                    manifest = json.loads(manifest_bytes.decode("ascii"))
                    if not isinstance(manifest, dict):
                        raise RuntimeError("model bundle manifest must be an object")
                    validate_serving_manifest(manifest)
                    expected: dict[str, str] = {}
                    for profile in manifest["profiles"].values():
                        components = (
                            profile["components"]
                            if profile["kind"] == "weighted_ensemble"
                            else [profile]
                        )
                        for component in components:
                            expected[component["model_path"]] = component["model_sha256"]
                            expected[component["calibrator_path"]] = component[
                                "calibrator_sha256"
                            ]
                    seen: set[str] = set()
                    while True:
                        member = archive.next()
                        if member is None:
                            break
                        if member.name not in expected or member.name in seen:
                            raise RuntimeError(
                                f"unexpected model bundle member: {member.name}"
                            )
                        _copy_member(
                            archive,
                            member,
                            stage / member.name,
                            expected[member.name],
                        )
                        seen.add(member.name)
                    missing = sorted(set(expected) - seen)
                    if missing:
                        raise RuntimeError(
                            "model bundle members are missing: " + ",".join(missing)
                        )
                    manifest_path = stage / ARCHIVE_MANIFEST_NAME
                    with manifest_path.open("xb") as handle:
                        handle.write(manifest_bytes)
                        handle.flush()
                        os.fsync(handle.fileno())
        if destination.exists():
            raise RuntimeError(f"model bundle destination already exists: {destination}")
        os.replace(stage, destination)
        return destination / ARCHIVE_MANIFEST_NAME
    except Exception:
        shutil.rmtree(stage, ignore_errors=True)
        raise


def verify_bundle_directory(manifest_path: Path) -> None:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if not isinstance(manifest, dict):
        raise RuntimeError("serving manifest must be an object")
    bundle_member_records(manifest_path, manifest)


def download_bundle(
    url: str,
    destination: Path,
    *,
    bearer_token: str,
    max_bytes: int = DEFAULT_MAX_ARCHIVE_BYTES,
) -> None:
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.netloc:
        raise RuntimeError("model bundle URL must be absolute HTTPS")
    if max_bytes < 1 or max_bytes > 1024 * 1024 * 1024:
        raise RuntimeError("model bundle byte limit is invalid")
    headers = {"User-Agent": "propulse-inference/1"}
    if bearer_token:
        headers["Authorization"] = f"Bearer {bearer_token}"
    destination.parent.mkdir(parents=True, exist_ok=True)
    try:
        with httpx.Client(
            follow_redirects=False,
            timeout=httpx.Timeout(120, connect=15),
        ) as client:
            with client.stream("GET", url, headers=headers) as response:
                if response.status_code != 200:
                    raise RuntimeError(
                        f"model bundle download returned HTTP {response.status_code}"
                    )
                content_length = response.headers.get("content-length")
                if content_length and int(content_length) > max_bytes:
                    raise RuntimeError("model bundle exceeds configured byte limit")
                copied = 0
                with destination.open("xb") as output:
                    for chunk in response.iter_bytes(DOWNLOAD_CHUNK_BYTES):
                        copied += len(chunk)
                        if copied > max_bytes:
                            raise RuntimeError(
                                "model bundle exceeds configured byte limit"
                            )
                        output.write(chunk)
                    output.flush()
                    os.fsync(output.fileno())
    except Exception:
        destination.unlink(missing_ok=True)
        raise


def prepare_model_bundle(
    *,
    url: str,
    expected_sha256: str,
    bearer_token: str,
    cache_root: Path,
    max_bytes: int = DEFAULT_MAX_ARCHIVE_BYTES,
) -> Path:
    if (
        len(expected_sha256) != 64
        or any(character not in "0123456789abcdef" for character in expected_sha256)
    ):
        raise RuntimeError("model bundle SHA-256 must contain 64 hex characters")
    bundle_dir = cache_root / expected_sha256
    manifest_path = bundle_dir / ARCHIVE_MANIFEST_NAME
    if manifest_path.is_file():
        verify_bundle_directory(manifest_path)
        return manifest_path
    cache_root.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(
        prefix=".download-",
        suffix=".tar.zst",
        dir=cache_root,
    )
    os.close(descriptor)
    archive_path = Path(temporary)
    archive_path.unlink()
    try:
        download_bundle(
            url,
            archive_path,
            bearer_token=bearer_token,
            max_bytes=max_bytes,
        )
        return extract_bundle_archive(
            archive_path,
            expected_sha256,
            bundle_dir,
        )
    finally:
        archive_path.unlink(missing_ok=True)
