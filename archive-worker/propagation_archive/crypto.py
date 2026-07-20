"""Signing helpers shared by archive verification workflows."""

from __future__ import annotations


def receipt_hmac_key_bytes(secret: str) -> bytes:
    """Return a validated receipt-signing key."""
    key = secret.encode()
    if len(key) < 32:
        raise RuntimeError("ARCHIVE_RECEIPT_HMAC_KEY must contain at least 32 bytes")
    return key
