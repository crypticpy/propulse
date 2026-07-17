"""Pinned ITURHFProp command adapter for the P.533 validation baseline."""

from __future__ import annotations

import csv
import math
import os
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class Circuit:
    tx_lat: float
    tx_lon: float
    rx_lat: float
    rx_lon: float
    year: int
    month: int
    utc_hours: tuple[int, ...]
    sunspot_number: int
    frequencies_mhz: tuple[float, ...]
    tx_power_watts: float = 1.0
    bandwidth_hz: float = 50.0
    required_snr_db: float = -21.0
    man_made_noise: str = "RESIDENTIAL"


def validate_circuit(circuit: Circuit) -> None:
    for latitude in (circuit.tx_lat, circuit.rx_lat):
        if not -90 <= latitude <= 90:
            raise ValueError("latitude is outside [-90, 90]")
    for longitude in (circuit.tx_lon, circuit.rx_lon):
        if not -180 <= longitude <= 180:
            raise ValueError("longitude is outside [-180, 180]")
    if not 1900 <= circuit.year <= 2100 or not 1 <= circuit.month <= 12:
        raise ValueError("date is outside ITURHFProp bounds")
    if not circuit.utc_hours or any(hour not in range(24) for hour in circuit.utc_hours):
        raise ValueError("UTC hours must be in [0, 23]")
    if not circuit.frequencies_mhz or any(
        not 1.6 <= frequency <= 30 for frequency in circuit.frequencies_mhz
    ):
        raise ValueError("P.533 HF frequencies must be in [1.6, 30] MHz")
    if circuit.tx_power_watts < 1:
        raise ValueError("official ITURHFProp requires at least 1 W (-30 dB(kW))")


def render_input(circuit: Circuit, data_path: Path, report_path: Path) -> str:
    validate_circuit(circuit)
    hours = ",".join(str(hour + 1) for hour in circuit.utc_hours)
    frequencies = ",".join(f"{value:.6f}" for value in circuit.frequencies_mhz)
    power_db_kw = 10 * math.log10(circuit.tx_power_watts / 1000)
    return f'''PathName "Propulse P533 circuit"
PathTXName "TX"
Path.L_tx.lat {circuit.tx_lat}
Path.L_tx.lng {circuit.tx_lon}
TXAntFilePath "ISOTROPIC"
TXGOS 0.0
TXBearing 0.0
PathRXName "RX"
Path.L_rx.lat {circuit.rx_lat}
Path.L_rx.lng {circuit.rx_lon}
RXAntFilePath "ISOTROPIC"
RXGOS 0.0
RXBearing 0.0
AntennaOrientation "TX2RX"
Path.year {circuit.year}
Path.month {circuit.month}
Path.hour {hours}
Path.SSN {max(1, min(311, circuit.sunspot_number))}
Path.frequency {frequencies}
Path.txpower {power_db_kw:.8f}
Path.BW {circuit.bandwidth_hz}
Path.SNRr {circuit.required_snr_db}
Path.SNRXXp 50
Path.ManMadeNoise "{circuit.man_made_noise}"
Path.Modulation "DIGITAL"
Path.SIRr 0.0
Path.A 0.0
Path.TW 0.0
Path.FW 0.0
Path.T0 0.0
Path.F0 0.0
Path.SorL "SHORTPATH"
RptFilePath "{report_path.parent}/"
RptFileFormat "RPT_D | RPT_BMUF | RPT_OPMUF | RPT_PR | RPT_SNR | RPT_BCR | RPT_OCR | RPT_OCRS"
LL.lat {circuit.rx_lat}
LL.lng {circuit.rx_lon}
LR.lat {circuit.rx_lat}
LR.lng {circuit.rx_lon}
UL.lat {circuit.rx_lat}
UL.lng {circuit.rx_lon}
UR.lat {circuit.rx_lat}
UR.lng {circuit.rx_lon}
latinc 1.0
lnginc 1.0
DataFilePath "{data_path}/"
'''


def parse_report(path: Path) -> list[dict[str, Any]]:
    with path.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    output = []
    for row in rows:
        output.append(
            {
                "month": int(row["month"]),
                "hour": int(row["hour"]) - 1,
                "frequency_mhz": float(row["frequency"]),
                "distance_km": float(row["distance"]),
                "bmuf_mhz": float(row["BMUF"]),
                "operational_muf_mhz": float(row["OPMUF"]),
                "received_power_dbw": float(row["PR"]),
                "snr_db": float(row["SNR"]),
                "basic_circuit_reliability": float(row["BCR"]) / 100,
                "overall_circuit_reliability": float(row["OCR"]) / 100,
                "overall_scatter_reliability": float(row["OCRs"]) / 100,
            }
        )
    return output


class P533Runner:
    def __init__(self, source: Path) -> None:
        self.source = source.resolve()
        self.executable = self.source / "ITURHFProp/Linux/ITURHFProp"
        self.p533_library = self.source / "P533/Linux/libp533.so"
        self.p372_library = self.source / "P372/Linux/libp372.so"
        self.data_path = self.source / "P372/Data"
        for path in (
            self.executable,
            self.p533_library,
            self.p372_library,
            self.data_path,
        ):
            if not path.exists():
                raise FileNotFoundError(path)

    def environment(self) -> dict[str, str]:
        env = dict(os.environ)
        libraries = f"{self.p533_library.parent}:{self.p372_library.parent}"
        env["DYLD_LIBRARY_PATH"] = libraries
        env["LD_LIBRARY_PATH"] = libraries
        return env

    def version(self) -> str:
        result = subprocess.run(
            [str(self.executable), "-v", "unused"],
            env=self.environment(),
            check=True,
            capture_output=True,
            text=True,
        )
        return result.stdout.strip()

    def run(self, circuit: Circuit) -> list[dict[str, Any]]:
        with tempfile.TemporaryDirectory(prefix="propulse-p533-") as directory:
            root = Path(directory)
            input_path = root / "circuit.in"
            report_path = root / "circuit.csv"
            input_path.write_text(
                render_input(circuit, self.data_path, report_path), encoding="utf-8"
            )
            completed = subprocess.run(
                [
                    str(self.executable),
                    "-s",
                    "-c",
                    str(input_path),
                    str(report_path),
                ],
                env=self.environment(),
                capture_output=True,
                text=True,
            )
            if completed.returncode:
                raise RuntimeError(
                    f"ITURHFProp failed ({completed.returncode}): "
                    f"{completed.stdout.strip()} {completed.stderr.strip()}"
                )
            return parse_report(report_path)
