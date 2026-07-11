"""Download CEDAR Madrigal Amateur Radio Signal Report (inst 8308) daily HDF5.

Usage:
  madrigal_pull.py 2026 3 1 1     # just March 1
  madrigal_pull.py 2026 3 1 31    # full month
Skips files already on disk. Sequential — be polite to the archive.
"""

import os
import sys
import time

import madrigalWeb.madrigalWeb as mw

SITE = "https://cedar.openmadrigal.org"
USER = "Propulse ML"
EMAIL = "aboveearthproductions@gmail.com"
AFFIL = "Propulse"
DEST = "ml/data/raw/madrigal"

year, month, d0, d1 = (int(a) for a in sys.argv[1:5])
os.makedirs(DEST, exist_ok=True)
t0 = time.time()

md = mw.MadrigalData(SITE)
exps = md.getExperiments(8308, year, month, d0, 0, 0, 0, year, month, d1, 23, 59, 59)
exps.sort(key=lambda e: (e.startyear, e.startmonth, e.startday))
print(f"[{time.time()-t0:5.0f}s] {len(exps)} experiments", flush=True)

for e in exps:
    day = f"{e.startyear}-{e.startmonth:02d}-{e.startday:02d}"
    out = f"{DEST}/rsd{day}.hdf5"
    if os.path.exists(out) and os.path.getsize(out) > 0:
        print(f"[{time.time()-t0:5.0f}s] {day} already present, skipping", flush=True)
        continue
    files = [f for f in md.getExperimentFiles(e.id) if f.category == 1]
    if not files:
        print(f"[{time.time()-t0:5.0f}s] {day}: NO default file", flush=True)
        continue
    try:
        md.downloadFile(files[0].name, out, USER, EMAIL, AFFIL, "hdf5")
        mb = os.path.getsize(out) / 1e6
        print(f"[{time.time()-t0:5.0f}s] {day}: {mb:,.0f} MB", flush=True)
    except Exception as ex:
        print(f"[{time.time()-t0:5.0f}s] {day}: FAILED {ex}", flush=True)

print("done", flush=True)
