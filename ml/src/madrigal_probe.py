"""Probe CEDAR Madrigal for the Amateur Radio Signal Report instrument:
confirm instrument code, list March 2026 experiments/files and sizes.
"""

import madrigalWeb.madrigalWeb as mw

SITE = "https://cedar.openmadrigal.org"
USER = "Propulse ML"
EMAIL = "aboveearthproductions@gmail.com"
AFFIL = "Propulse"

md = mw.MadrigalData(SITE)

print("--- instruments matching 'amateur' or code 8308 ---", flush=True)
for inst in md.getAllInstruments():
    if "amateur" in inst.name.lower() or inst.code == 8308:
        print(f"  code={inst.code} name={inst.name!r} category={inst.category}",
              flush=True)

print("\n--- experiments for 8308, Mar 1-31 2026 ---", flush=True)
exps = md.getExperiments(8308, 2026, 3, 1, 0, 0, 0, 2026, 3, 31, 23, 59, 59)
print(f"  {len(exps)} experiments", flush=True)
for e in exps[:5]:
    print(f"  id={e.id} name={e.name!r} {e.startyear}-{e.startmonth:02d}-{e.startday:02d}",
          flush=True)

if exps:
    files = md.getExperimentFiles(exps[0].id)
    for f in files:
        print(f"  file: {f.name} kindat={f.kindat} status={f.status!r} "
              f"category={f.category}", flush=True)
