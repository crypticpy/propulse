from __future__ import annotations

import hashlib
import unittest
from datetime import datetime, timezone

import httpx

from wspr_finalizer import HF_BANDS
from wspr_scheduler import (
    CompletionManifest,
    PostgrestPruner,
    completion_signature,
    run_completed_hour,
)


TARGET = datetime(2026, 7, 15, 20, tzinfo=timezone.utc)
SECRET = "fixture-completion-secret-value"


def manifest_payload() -> dict:
    payload = {
        "schema_version": 2,
        "provider": "approved-fixture",
        "target_hour": TARGET.isoformat(),
        "source_watermark": TARGET.replace(hour=21).isoformat(),
        "available_at": TARGET.replace(hour=21, minute=5).isoformat(),
        "source_complete": True,
        "source_checkpoint_sha256": hashlib.sha256(b"fixture").hexdigest(),
        "source_record_count": 100,
        "source_records_by_band": {band: 10 for band in sorted(HF_BANDS)},
        "bands": sorted(HF_BANDS),
        "quality_flags": [],
    }
    payload["manifest_hmac_sha256"] = completion_signature(payload, SECRET)
    return payload


class FakePruner:
    def __init__(self):
        self.calls = []

    def prune(self, *, older_than_hours):
        self.calls.append(older_than_hours)
        return 7


class WsprSchedulerTests(unittest.TestCase):
    def test_manifest_requires_all_hf_bands_and_exact_watermark(self) -> None:
        payload = manifest_payload()
        payload["bands"] = payload["bands"][:-1]
        payload["manifest_hmac_sha256"] = completion_signature(payload, SECRET)
        with self.assertRaisesRegex(ValueError, "each HF band"):
            CompletionManifest.from_json(payload, signing_secret=SECRET)

        payload = manifest_payload()
        payload["source_watermark"] = TARGET.replace(hour=20, minute=59).isoformat()
        payload["manifest_hmac_sha256"] = completion_signature(payload, SECRET)
        with self.assertRaisesRegex(ValueError, "full target hour"):
            CompletionManifest.from_json(payload, signing_secret=SECRET)

    def test_manifest_rejects_tampering(self) -> None:
        payload = manifest_payload()
        payload["source_record_count"] = 101
        with self.assertRaisesRegex(ValueError, "signature"):
            CompletionManifest.from_json(payload, signing_secret=SECRET)

    def test_manifest_requires_exact_band_counts(self) -> None:
        payload = manifest_payload()
        payload["source_records_by_band"]["20m"] = 9
        payload["manifest_hmac_sha256"] = completion_signature(payload, SECRET)
        with self.assertRaisesRegex(ValueError, "do not match"):
            CompletionManifest.from_json(payload, signing_secret=SECRET)

    def test_all_bands_complete_before_pruning(self) -> None:
        manifest = CompletionManifest.from_json(
            manifest_payload(), signing_secret=SECRET
        )
        finalized = []
        pruner = FakePruner()

        def finalizer(item, band, threads):
            finalized.append((band, threads))
            return {
                "band": band,
                "status": "complete",
                "provider": item.provider,
                "feature_cell_count": 3,
                "observation_count": item.source_records_by_band[band],
            }

        result = run_completed_hour(
            manifest,
            finalizer=finalizer,
            pruner=pruner,
            workers=2,
            threads_per_band=2,
        )

        self.assertEqual({band for band, _ in finalized}, HF_BANDS)
        self.assertEqual(pruner.calls, [30])
        self.assertEqual(result["bands_finalized"], 10)
        self.assertEqual(result["feature_cells"], 30)
        self.assertEqual(result["maximum_compute_threads"], 4)

    def test_band_count_mismatch_prevents_pruning(self) -> None:
        manifest = CompletionManifest.from_json(
            manifest_payload(), signing_secret=SECRET
        )
        pruner = FakePruner()

        def finalizer(item, band, _threads):
            return {
                "band": band,
                "status": "complete",
                "provider": item.provider,
                "observation_count": 9 if band == "20m" else 10,
            }

        with self.assertRaisesRegex(RuntimeError, "inconsistent watermark"):
            run_completed_hour(
                manifest,
                finalizer=finalizer,
                pruner=pruner,
                workers=2,
                threads_per_band=2,
            )
        self.assertEqual(pruner.calls, [])

    def test_failure_prevents_pruning(self) -> None:
        manifest = CompletionManifest.from_json(
            manifest_payload(), signing_secret=SECRET
        )
        pruner = FakePruner()

        def finalizer(_item, band, _threads):
            if band == "20m":
                raise RuntimeError("fixture failure")
            return {"band": band, "status": "complete", "provider": "approved-fixture"}

        with self.assertRaisesRegex(RuntimeError, "fixture failure"):
            run_completed_hour(
                manifest,
                finalizer=finalizer,
                pruner=pruner,
                workers=2,
                threads_per_band=2,
            )
        self.assertEqual(pruner.calls, [])

    def test_scheduler_rejects_cpu_oversubscription(self) -> None:
        manifest = CompletionManifest.from_json(
            manifest_payload(), signing_secret=SECRET
        )
        with self.assertRaisesRegex(ValueError, "oversubscribe"):
            run_completed_hour(
                manifest,
                finalizer=lambda *_args: {},
                pruner=FakePruner(),
                workers=100,
                threads_per_band=100,
            )

    def test_postgrest_pruner_retries_a_transient_server_error(self) -> None:
        requests = []
        sleeps = []

        def handler(request):
            requests.append(request)
            if len(requests) == 1:
                return httpx.Response(
                    500,
                    json={
                        "code": "57014",
                        "message": "canceling statement due to statement timeout",
                    },
                )
            return httpx.Response(200, json=42)

        pruner = PostgrestPruner(
            base_url="https://feature-store.test",
            service_key="secret",
            retry_base_seconds=0.25,
            sleep=sleeps.append,
            client=httpx.Client(transport=httpx.MockTransport(handler)),
        )

        self.assertEqual(pruner.prune(older_than_hours=30), 42)
        self.assertEqual(len(requests), 2)
        self.assertEqual(sleeps, [0.25])

    def test_postgrest_pruner_does_not_retry_a_contract_error(self) -> None:
        requests = []

        def handler(request):
            requests.append(request)
            return httpx.Response(400, json={"message": "bad interval"})

        pruner = PostgrestPruner(
            base_url="https://feature-store.test",
            service_key="secret",
            sleep=lambda _: self.fail("contract errors must not retry"),
            client=httpx.Client(transport=httpx.MockTransport(handler)),
        )

        with self.assertRaisesRegex(RuntimeError, "rolling WSPR prune failed"):
            pruner.prune(older_than_hours=30)

        self.assertEqual(len(requests), 1)


if __name__ == "__main__":
    unittest.main()
