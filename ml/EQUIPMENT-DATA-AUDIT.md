# Equipment Data Audit for StationCast

> Status: Phase 0 working audit, 2026-07-12.

## Current authoritative paths

- radio catalog and Sherwood merge: `src/lib/data/radios.ts`;
- generated Sherwood measurements: `src/lib/data/sherwood.generated.ts`;
- tracked import checksum/counts: `ml/results/equipment/sherwood-import-summary.json`;
- raw source-cell audit: `ml/data/audits/equipment/` (ignored, never bundled);
- importer and parser: `scripts/import-sherwood.mjs` and
  `scripts/sherwood-parser.mjs`;
- antenna inventory and pattern mapping: `src/types/shack.ts` and
  `src/lib/data/antennas.ts`;
- feedline loss tables: `src/lib/data/feedlines.ts`;
- canonical station calculation: `src/lib/station/stationChainEngine.ts`.

## Findings and disposition

| Finding | Risk | Disposition |
|---|---|---|
| Sherwood footnote digits were concatenated into values such as `-14510` dBm | Impossible receiver features could dominate personalization | Fixed: structural footnote removal, physical ranges, ignored raw source audit, tracked checksum/count summary, and whole-catalog test |
| Source-cell notes included receiver serial numbers | Unnecessary source detail in the client bundle | Fixed: raw cells exist only in the ignored local audit; generated client data contains normalized model names and bounded measurements |
| Three hooks implemented overlapping station math | UI and inference could disagree | Fixed: hooks now adapt the pure canonical engine |
| Amplifier gain was unconstrained | Unrealistic multi-kilowatt EIRP | Fixed: supported-band and max-output enforcement with warnings |
| Radio requested power ignored model/user limits in performance calculations | Overstated station capability | Fixed: model max and user power cap enforced |
| dBi-derived power was labeled ERP | 2.15 dB unit error | Fixed: engine returns distinct EIRP and ERP |
| Directional antennas defaulted silently to peak gain | Overstated off-axis paths | Fixed: optional bearing derating and explicit peak/rotor/azimuth assumptions |
| Receiver noise floor is test-condition/bandwidth dependent | False absolute local-noise precision | Open: treat as relative evidence until mode bandwidth and measured local noise are available |
| Feedline tables cite manufacturer/ARRL generically | Weak per-value provenance | Open: add source URL/document revision per cable family before research publication |
| Manufacturer radio specs lack per-field citations | Cannot distinguish claims from measurements reliably | Open: add source URL/revision and measured-vs-claimed flag per field |
| Sherwood redistribution terms are not explicit | Open-source release risk | Open release gate: obtain written permission/legal review or publish the importer without generated measurements; do not treat public web access as a redistribution license |

## Physical validation ranges

The importer rejects, rather than repairs, values outside these ranges:

| Field | Range |
|---|---:|
| Receiver noise floor | -180 to -70 dBm |
| Sensitivity | 0.001 to 100 microvolts |
| Blocking/dynamic range | 0 to 200 dB |
| Measurement spacing | 0.01 to 1,000 kHz |

These are corruption guards, not quality thresholds. A value inside the range
still requires source/test-context review before it becomes an absolute
StationCast feature.

## Release gate

StationCast may use equipment features publicly only when all values used by the
adapter have units, source class, provenance, bounds, missing-data behavior, and
tests. Fields without that evidence remain user-visible inventory metadata but
do not silently affect probability.
