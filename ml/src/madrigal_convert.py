"""Convert Madrigal Amateur Radio Signal Report HDF5 -> slim per-day parquet
matching the spots_slim.parquet schema (hour_utc, band, mode_class, tx_field,
rx_field, snr, tx_callsign, rx_callsign) + ssrc for source diagnostics.

Fields come from tx/rx lat/lon directly (already geolocated — no grid
backfill needed). Rows without geolocation or outside our band/mode
vocabulary are dropped, with counts logged.

Usage: madrigal_convert.py [glob] [shard_id num_shards]
Skips days already converted, so it can run behind the downloader.
Shards partition files by day index so several workers can run in parallel.
"""

import glob
import os
import sys
import time

import h5py
import numpy as np
import pandas as pd

RAW_GLOB = sys.argv[1] if len(sys.argv) > 1 else "ml/data/raw/madrigal/rsd*.hdf5"
SHARD_ID = int(sys.argv[2]) if len(sys.argv) > 3 else 0
NUM_SHARDS = int(sys.argv[3]) if len(sys.argv) > 3 else 1
OUT_DIR = "ml/data/processed/madrigal"
CHUNK = 20_000_000

# kHz edges matching collector frequencyToBand + ML 6m extension
BAND_EDGES = [
    (1800, 2000, "160m"), (3500, 4000, "80m"), (5330, 5405, "60m"),
    (7000, 7300, "40m"), (10100, 10150, "30m"), (14000, 14350, "20m"),
    (18068, 18168, "17m"), (21000, 21450, "15m"), (24890, 24990, "12m"),
    (28000, 29700, "10m"), (50000, 54000, "6m"),
]
# v4 DIGITAL list + Madrigal's 'W' (WSPRNet-sourced WSPR rows)
DIGITAL = {b"FT8", b"FT4", b"FT2", b"JS8", b"VARAC", b"WSPR", b"W", b"RTTY",
           b"FREEDV", b"PKT", b"DATA", b"OLIVIA", b"JT65", b"JT9", b"MSK144",
           b"Q65", b"FST4", b"FST4W"}

os.makedirs(OUT_DIR, exist_ok=True)
t0 = time.time()


def log(msg):
    print(f"[{time.time() - t0:6.0f}s] {msg}", flush=True)


def to_field(lat, lon):
    """2-char Maidenhead field from lat/lon; '' where invalid."""
    lon = np.where(lon > 180, lon - 360, lon)
    ok = (np.abs(lat) <= 90) & (np.abs(lon) <= 180) & ~np.isnan(lat) & ~np.isnan(lon)
    fi = np.clip(((np.nan_to_num(lon) + 180) // 20).astype(int), 0, 17)
    fj = np.clip(((np.nan_to_num(lat) + 90) // 10).astype(int), 0, 17)
    codes = (fi + 65).astype(np.uint32) * 256 + (fj + 65).astype(np.uint32)
    letters = np.array([chr(c // 256) + chr(c % 256) for c in codes])
    return np.where(ok, letters, "")


paths = sorted(glob.glob(RAW_GLOB))
# The downloader writes sequentially to the final path — the newest file may
# be mid-download. Skip it unless it has been stable for 10+ minutes.
if len(paths) > 1 and time.time() - os.path.getmtime(paths[-1]) < 600:
    log(f"skipping possibly in-flight {paths[-1]}")
    paths = paths[:-1]

for idx, path in enumerate(paths):
    if idx % NUM_SHARDS != SHARD_ID:
        continue
    day = os.path.basename(path).replace("rsd", "").replace(".hdf5", "")
    out = f"{OUT_DIR}/{day}.parquet"
    if os.path.exists(out):
        continue
    with h5py.File(path, "r") as f:
        ds = f["Data/Table Layout"]
        n = len(ds)
        parts = []
        dropped_geo = dropped_band = dropped_mode = 0
        for lo in range(0, n, CHUNK):
            c = ds[lo:min(lo + CHUNK, n)]
            khz = c["tfreq"] / 1000.0
            band = np.full(len(c), "", dtype="U4")
            for b_lo, b_hi, name in BAND_EDGES:
                band[(khz >= b_lo) & (khz <= b_hi)] = name
            mode_class = np.full(len(c), "", dtype="U7")
            mode_class[np.isin(c["smode"], list(DIGITAL))] = "digital"
            mode_class[c["smode"] == b"CW"] = "cw"
            txf = to_field(c["txlat"], c["txlon"])
            rxf = to_field(c["rxlat"], c["rxlon"])
            geo_ok = (txf != "") & (rxf != "")
            keep = geo_ok & (band != "") & (mode_class != "")
            dropped_geo += int((~geo_ok).sum())
            dropped_band += int((geo_ok & (band == "")).sum())
            dropped_mode += int((geo_ok & (band != "") & (mode_class == "")).sum())
            parts.append(pd.DataFrame({
                "hour_utc": pd.to_datetime(
                    (c["ut1_unix"][keep] // 3600) * 3600, unit="s", utc=True),
                "band": band[keep],
                "mode_class": mode_class[keep],
                "tx_field": txf[keep],
                "rx_field": rxf[keep],
                "snr": c["sn"][keep].astype("float32"),
                "tx_callsign": np.char.decode(c["call_sign_tx"][keep], "ascii"),
                "rx_callsign": np.char.decode(c["call_sign_rx"][keep], "ascii"),
                "ssrc": np.char.decode(c["ssrc"][keep], "ascii"),
            }))
        df = pd.concat(parts, ignore_index=True)
        df.to_parquet(out, compression="zstd", index=False)
        log(f"{day}: {n:,} raw -> {len(df):,} kept "
            f"(geo-drop {dropped_geo:,}, band-drop {dropped_band:,}, "
            f"mode-drop {dropped_mode:,})")

log("done")
