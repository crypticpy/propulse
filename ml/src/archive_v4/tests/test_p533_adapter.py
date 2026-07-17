from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path


MODULE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MODULE))

from p533_adapter import Circuit, parse_report, render_input  # noqa: E402


class P533AdapterTests(unittest.TestCase):
    def test_renders_zero_based_utc_as_one_based_itur_hours(self) -> None:
        circuit = Circuit(
            tx_lat=30,
            tx_lon=-97,
            rx_lat=51,
            rx_lon=0,
            year=2024,
            month=4,
            utc_hours=(0, 23),
            sunspot_number=100,
            frequencies_mhz=(14.1,),
        )
        text = render_input(circuit, Path("/data"), Path("/tmp/report.csv"))
        self.assertIn("Path.hour 1,24", text)
        self.assertIn("Path.txpower -30.00000000", text)

    def test_parses_reliability_percentages_as_probabilities(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "report.csv"
            path.write_text(
                "month,hour,frequency,distance,BMUF,OPMUF,PR,SNR,BCR,OCR,OCRs,probocc\n"
                "4,1,14.10,7910.38,12.15,15.19,-139.63,-47.85,0.00,25.00,30.00,0.00\n",
                encoding="utf-8",
            )
            row = parse_report(path)[0]
            self.assertEqual(row["hour"], 0)
            self.assertEqual(row["overall_circuit_reliability"], 0.25)


if __name__ == "__main__":
    unittest.main()
