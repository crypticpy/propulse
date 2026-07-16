from __future__ import annotations

import json
import stat
import tempfile
import unittest
from pathlib import Path

from install_m5_forecast_archive_launchd import launchd_payload
from summarize_forecast_archive import atomic_write, flatten_receipts


def product(product: str, digest_character: str) -> dict[str, object]:
    return {
        "source": "NOAA SWPC",
        "product": product,
        "issuedAt": "2026-07-16T00:00:00.000Z",
        "capturedAt": "2026-07-16T06:00:00.000Z",
        "payloadSha256": digest_character * 64,
        "valueCount": 90 if product == "noaa_45_day_ap_f107" else 54,
        "metrics": ["ap", "f107"],
        "validStart": "2026-07-16T00:00:00.000Z",
        "validEnd": "2026-08-29T00:00:00.000Z",
        "leadMinutesMin": 0,
        "leadMinutesMax": 63360,
        "horizonsCovered": [3, 6, 12, 24],
    }


class ForecastArchiveTests(unittest.TestCase):
    def test_flattens_two_products_without_private_fields(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "receipt.json"
            path.write_text(json.dumps({
                "schemaVersion": 1,
                "capturedAt": "2026-07-16T06:00:00.000Z",
                "products": [
                    product("noaa_45_day_ap_f107", "a"),
                    product("noaa_3_day_solar_geomagnetic", "b"),
                ],
                "valueCount": 144,
            }), encoding="utf-8")
            captures = flatten_receipts([path])
        self.assertEqual([row["source"] for row in captures], [
            "noaa_45_day",
            "noaa_3_day",
        ])
        self.assertTrue(all(row["horizons_covered"] == [3, 6, 12, 24] for row in captures))
        self.assertFalse(any("callsign" in row for row in captures))

    def test_atomic_output_is_owner_only(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "status.json"
            atomic_write(path, {"ok": True})
            mode = stat.S_IMODE(path.stat().st_mode)
        self.assertEqual(mode, 0o600)

    def test_launchd_payload_contains_paths_but_no_secrets(self) -> None:
        home = Path("/Users/test")
        payload = launchd_payload(
            artifact_root=home / "Library/Application Support/PropulseML",
            env_file=home / "propulse/.env.local",
            stdout_path=home / "Library/Logs/Propulse/forecast.stdout.log",
            stderr_path=home / "Library/Logs/Propulse/forecast.stderr.log",
        )
        self.assertEqual(payload["StartInterval"], 21600)
        self.assertTrue(payload["RunAtLoad"])
        self.assertEqual(payload["Umask"], 0o077)
        environment = payload["EnvironmentVariables"]
        self.assertEqual(set(environment), {
            "PROPULSE_ENV_FILE",
            "PROPULSE_ML_ARTIFACT_ROOT",
        })
        self.assertNotIn("SUPABASE_SERVICE_ROLE_KEY", json.dumps(payload))


if __name__ == "__main__":
    unittest.main()
