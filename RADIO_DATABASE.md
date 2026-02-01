# Radio Database & Sources

The built-in radio database lives in `src/lib/data/radios.ts` and is modeled by `RadioEquipment` in `src/types/radio.ts`.

## What We Store
- **Core TX capability**: `maxPower`, `minPower`, supported `bands` and `modes`.
- **Receiver metrics (Sherwood-style)**: `receiver.rmdr`, `receiver.imdr3`, `receiver.blockingGain`, `receiver.sensitivity`, plus optional fields like `noiseFloorDbm`, `phaseNoiseDbcHz`, `ip3Dbm`.
- **Optional transmit metrics**: `transmit.imd3Db`, `transmit.spuriousDbc`, and setup notes.
- **Attribution**: each record should include `sources[]` describing where numbers came from (and when).

## Recommended Measurement Sources
Receiver performance (gold standard):
- **Sherwood Engineering Receiver Test Data**: http://www.sherweng.com/table.html

Transmit performance (when available):
- **ARRL Lab / QST Product Reviews** (TX IMD, spurs, spectral plots)
- **RSGB RadCom Equipment Reviews** (similar lab measurements)
- Manufacturer engineering specs (use carefully; note test conditions)

## Adding/Updating Radios
1. Update `src/lib/data/radios.ts` and include `sources` with names + URLs.
2. Prefer measured data over marketing specs; when using estimates, say so in `sources[].notes`.
3. If a metric is unknown, omit it (don’t guess) and add a source note about what’s missing.

## Importing Sherwood
This repo includes an importer for the Sherwood receiver table and commits a generated snapshot in `src/lib/data/sherwood.generated.ts`.

- Refresh the snapshot: `npm run import:sherwood`
- Source: http://www.sherweng.com/table.html
- Notes: Sherwood entries primarily provide RX lab metrics; TX capability in `RADIO_DATABASE` is defaulted unless explicitly measured elsewhere.

## User-Created Custom Radios
Users can create/edit custom radios in Settings → Radio Equipment. Custom radios are stored in `preferences.customRadios` (persisted locally) and are selectable from the “Custom” tab in the radio picker. Custom radio names (`displayName`) are case-insensitive unique.
