"""The frozen golden-case set for the pinned ITU-R HF reference.

Changing any value here changes `golden-v1.json` and therefore requires a new
golden revision (`golden-v2.json`), not an in-place edit. The set deliberately
spans short/NVIS to antipodal distances, both hemispheres, auroral, mid and
equatorial latitudes, all four seasons, the full 0-23 UTC range, quiet to very
active solar conditions and 3-30 MHz, plus explicit long-path and
low-power/narrow-bandwidth variants.
"""

from __future__ import annotations

from .runner import Case

GOLDEN_REVISION = "golden-v1"

# (case_id, label, tx_lat, tx_lon, rx_lat, rx_lon, year, month, hour_utc,
#  ssn, freq_mhz, power_w, bw_hz, req_snr_db, noise, direction)
GOLDEN_CASES: tuple[Case, ...] = (
    Case("G01", "Austin-Dallas NVIS 80m night", 30.2672, -97.7431,
         32.7767, -96.7970, 2024, 1, 6, 100, 3.6, 100.0, 3000.0, 10.0,
         "RESIDENTIAL"),
    Case("G02", "Austin-Dallas NVIS 40m day", 30.2672, -97.7431,
         32.7767, -96.7970, 2024, 7, 18, 100, 7.1, 100.0, 3000.0, 10.0,
         "RESIDENTIAL"),
    Case("G03", "Austin-Chicago 80m regional night", 30.2672, -97.7431,
         41.8781, -87.6298, 2024, 12, 8, 50, 3.6, 100.0, 3000.0, 10.0,
         "RURAL"),
    Case("G04", "Austin-Denver 40m one-hop", 30.2672, -97.7431,
         39.7392, -104.9903, 2024, 4, 3, 100, 7.1, 100.0, 3000.0, 10.0,
         "RURAL"),
    Case("G05", "Austin-New York 20m day", 30.2672, -97.7431,
         40.7128, -74.0060, 2024, 4, 18, 100, 14.1, 100.0, 3000.0, 10.0,
         "CITY"),
    Case("G06", "Honolulu-Los Angeles 17m", 21.3069, -157.8583,
         34.0522, -118.2437, 2024, 10, 22, 130, 18.1, 100.0, 3000.0, 10.0,
         "RESIDENTIAL"),
    Case("G07", "Reykjavik-Fairbanks auroral 30m", 64.1466, -21.9426,
         64.8378, -147.7164, 2024, 3, 15, 100, 10.1, 100.0, 3000.0, 10.0,
         "QUIETRURAL"),
    Case("G08", "London-Moscow 40m winter night", 51.5074, -0.1278,
         55.7558, 37.6173, 2024, 1, 2, 50, 7.1, 100.0, 3000.0, 10.0,
         "CITY"),
    Case("G09", "Delhi-Berlin 20m mid-latitude", 28.6139, 77.2090,
         52.5200, 13.4050, 2024, 10, 14, 100, 14.1, 100.0, 3000.0, 10.0,
         "RESIDENTIAL"),
    Case("G10", "Cairo-Johannesburg 15m trans-equatorial", 30.0444, 31.2357,
         -26.2041, 28.0473, 2024, 3, 12, 160, 21.2, 100.0, 3000.0, 10.0,
         "RURAL"),
    Case("G11", "Helsinki-Beijing 30m polar-ish", 60.1699, 24.9384,
         39.9042, 116.4074, 2024, 12, 5, 100, 10.1, 100.0, 3000.0, 10.0,
         "QUIETRURAL"),
    Case("G12", "Anchorage-Oslo polar 20m", 61.2181, -149.9003,
         59.9139, 10.7522, 2024, 7, 20, 100, 14.1, 100.0, 3000.0, 10.0,
         "QUIETRURAL"),
    Case("G13", "Toronto-Lima 20m north-south", 43.6532, -79.3832,
         -12.0464, -77.0428, 2024, 4, 1, 100, 14.1, 100.0, 3000.0, 10.0,
         "RESIDENTIAL"),
    Case("G14", "Singapore-Nairobi 15m equatorial", 1.3521, 103.8198,
         -1.2921, 36.8219, 2024, 4, 11, 160, 21.2, 100.0, 3000.0, 10.0,
         "RURAL"),
    Case("G15", "Austin-Sao Paulo 15m", 30.2672, -97.7431,
         -23.5505, -46.6333, 2024, 10, 23, 130, 21.2, 100.0, 3000.0, 10.0,
         "RESIDENTIAL"),
    Case("G16", "Austin-London 20m transatlantic", 30.2672, -97.7431,
         51.5074, -0.1278, 2024, 4, 12, 100, 14.1, 100.0, 3000.0, 10.0,
         "RESIDENTIAL"),
    Case("G17", "Tokyo-Sydney 15m", 35.6762, 139.6503,
         -33.8688, 151.2093, 2024, 7, 4, 130, 21.2, 100.0, 3000.0, 10.0,
         "CITY"),
    Case("G18", "Wellington-Honolulu 20m", -41.2865, 174.7762,
         21.3069, -157.8583, 2024, 1, 9, 100, 14.1, 100.0, 3000.0, 10.0,
         "QUIET"),
    Case("G19", "Perth-Cape Town 17m southern", -31.9505, 115.8605,
         -33.9249, 18.4241, 2024, 12, 16, 130, 18.1, 100.0, 3000.0, 10.0,
         "RURAL"),
    Case("G20", "London-Cape Town 17m long north-south", 51.5074, -0.1278,
         -33.9249, 18.4241, 2024, 3, 19, 130, 18.1, 100.0, 3000.0, 10.0,
         "CITY"),
    Case("G21", "Santiago-Auckland 20m south Pacific", -33.4489, -70.6693,
         -36.8485, 174.7633, 2024, 7, 7, 100, 14.1, 100.0, 3000.0, 10.0,
         "QUIETRURAL"),
    Case("G22", "Buenos Aires-Madrid 15m solar max", -34.6037, -58.3816,
         40.4168, -3.7038, 2024, 10, 13, 250, 21.2, 100.0, 3000.0, 10.0,
         "RESIDENTIAL"),
    Case("G23", "Austin-Tokyo 12m solar max", 30.2672, -97.7431,
         35.6762, 139.6503, 2024, 4, 21, 250, 24.9, 100.0, 3000.0, 10.0,
         "RESIDENTIAL"),
    Case("G24", "Austin-Sydney 20m near-antipodal", 30.2672, -97.7431,
         -33.8688, 151.2093, 2024, 12, 10, 160, 14.1, 100.0, 3000.0, 10.0,
         "RESIDENTIAL"),
    Case("G25", "Austin-Sydney 20m LONGPATH", 30.2672, -97.7431,
         -33.8688, 151.2093, 2024, 12, 10, 160, 14.1, 100.0, 3000.0, 10.0,
         "RESIDENTIAL", "LONGPATH"),
    Case("G26", "Austin-London 10m solar min closed", 30.2672, -97.7431,
         51.5074, -0.1278, 2024, 1, 0, 10, 28.5, 100.0, 3000.0, 10.0,
         "RESIDENTIAL"),
    Case("G27", "Austin-London 30m 1 W narrow-band", 30.2672, -97.7431,
         51.5074, -0.1278, 2024, 4, 12, 100, 10.1, 1.0, 50.0, -21.0,
         "RESIDENTIAL"),
    Case("G28", "Austin-Denver 40m 1 kW digital", 30.2672, -97.7431,
         39.7392, -104.9903, 2024, 4, 3, 100, 7.1, 1000.0, 2400.0, 6.0,
         "CITY", "SHORTPATH", "DIGITAL",
         required_sir_db=6.0, amplitude_ratio_db=3.0, time_window_ms=10.0,
         frequency_window_hz=100.0, t0_ms=10.0, f0_hz=100.0),
    Case("G29", "Delhi-Santiago 20m digital long haul", 28.6139, 77.2090,
         -33.4489, -70.6693, 2024, 4, 17, 130, 14.1, 1000.0, 2400.0, 6.0,
         "RESIDENTIAL", "SHORTPATH", "DIGITAL",
         required_sir_db=6.0, amplitude_ratio_db=3.0, time_window_ms=10.0,
         frequency_window_hz=100.0, t0_ms=10.0, f0_hz=100.0),
    Case("G30", "Austin-Johannesburg 15m 14 Mm", 30.2672, -97.7431,
         -26.2041, 28.0473, 2024, 10, 20, 160, 21.2, 100.0, 3000.0, 10.0,
         "RESIDENTIAL"),
)


def case_by_id(case_id: str) -> Case:
    for case in GOLDEN_CASES:
        if case.case_id == case_id:
            return case
    raise KeyError(case_id)
