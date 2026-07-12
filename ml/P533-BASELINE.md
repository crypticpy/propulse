# ITU-R P.533 Baseline

V4 uses the official ITU-R Study Group 3 implementation as an external,
reproducible baseline. The source is pinned to tag `v14.3`, commit
`cd172be56dc04b154e5d2fa91cbaa6ecf5284305`, and is not vendored into this
repository.

```bash
ml/.venv/bin/python ml/src/archive_v4/install_p533.py
```

On Apple Silicon the installer rebuilds the P.533 and P.372 libraries as
Mach-O dynamic libraries with Clang while retaining the upstream `.so` names
expected by `dlopen`. It then runs a four-hour Austin-to-London 20m fixture and
records binary hashes and outputs in
`ml/results/propagation_v4/p533_build_manifest.json`.

The official `v14.3` tag currently self-reports `P533 Version: 14.2`, and some
upstream example input/output files contain unresolved merge markers. V4 does
not alter or conceal those facts: it records both tag and self-reported version
and uses a clean Propulse-owned smoke input instead of treating the bundled
examples as golden fixtures.

For model evaluation, P.533 outputs are mapped to WSPR decode probability using
2024 calibration data only. Because WSPR opportunities are not identical to
monthly circuit reliability, raw P.533 reliability is reported separately from
the calibrated B1 baseline. Large evaluations cache results by coarse path,
month, UTC hour, band, solar regime, power, bandwidth, and noise environment.
The official executable accepts a minimum of 1 W (`-30 dB(kW)`); lower-power
WSPR cases use the 1 W circuit output plus an explicit power-offset feature in
the validation-only probability mapping rather than silently passing an
out-of-range value.
