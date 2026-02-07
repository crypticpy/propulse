# PRD: Shack Builder — Station Modeling & Equipment Management

Status: Draft
Owner: Product/Engineering
Audience: Frontend, Backend/Supabase, Propagation Engine, Visualization, QA
Date: 2026-02-07

Related docs:

- `src/types/radio.ts` — RadioEquipment, UserRadio, ReceiverPerformance types
- `src/lib/data/antennas.ts` — Antenna pattern library (gain functions per type)
- `src/lib/utils/signal.ts` — Signal prediction engine (ITU-R P.533 path loss)
- `src/components/settings/RadioManager.tsx` — Current radio management (1687 lines)
- `src/stores/userStore.ts` — Current radio state in Zustand (preferences.radios, customRadios, activeRadioId)
- `src/pages/DXWizard.tsx` — Consumes antenna gain + TX power for propagation predictions

---

## 1. Executive Summary

Propulse currently treats station equipment as a secondary concern buried in a settings modal tab. The RadioManager component (1687 lines) handles radio inventory with Sherwood Engineering database integration, but antennas are a single dropdown (`antennaType: "dipole" | "vertical" | "yagi_3el" | ...`), feedlines do not exist in the system, and there is no concept of a complete signal chain from transceiver to radiator.

Shack Builder introduces a dedicated `/shack` route that transforms equipment management from a configuration chore into a first-class station modeling experience. Operators will define their complete signal chains — radio, amplifier, tuner, feedline, antenna — and the system will compute real performance numbers (effective radiated power, system noise figure, per-band capability) that feed directly into the DX Wizard propagation engine, Band Planner, and contest tooling.

The core differentiator: every other ham radio application treats equipment as metadata labels. Propulse treats equipment as an engineering model. When you tell Propulse you have 100 feet of RG-213 feeding a 3-element Yagi at 45 feet, it knows you lose 1.9 dB on 20m and 3.4 dB on 10m, and it adjusts every propagation prediction accordingly.

This feature is part of the broader migration from IndexedDB-only local storage to Supabase as the cloud backend. Equipment data will be the first major dataset to live in Supabase with real-time sync, enabling cross-device access, shareable shack profiles, and community features.

---

## 2. Problem Statement

### What exists today

The current RadioManager supports:

- Searching/filtering the Sherwood Engineering database (200+ radios with independently tested receiver metrics: RMDR, IMDR3, blocking gain, sensitivity, IP3, phase noise)
- Adding radios to a user collection as `UserRadio` instances with metadata (nickname, purchase date, serial number, firmware revision, wiring notes)
- Creating custom radio definitions with full spec entry (receiver and transmit performance)
- Selecting an active radio that feeds TX power and receiver specs into propagation calculations
- A single `antennaType` preference (`"dipole" | "vertical" | "yagi_3el" | "yagi_5el" | "hex_beam" | "wire_inverted_v" | "nvis_dipole" | "isotropic"`) stored in `userStore.preferences.antennaType`

### What is missing

1. **Antenna inventory**: Operators cannot define specific antenna installations with real-world parameters (height, heading, feedpoint impedance, SWR data per band). The system uses a generic antenna type with hardcoded NEC-2-derived gain curves.

2. **Feedline modeling**: Zero support. The 100-foot run of RG-58 between your radio and antenna silently eats 6 dB on 10m, but Propulse has no way to know this. Every propagation prediction is optimistic by whatever the feedline loss actually is.

3. **Signal chain composition**: No way to represent amplifiers, tuners, filters, switches, or other equipment in the path between radio and antenna. A station running an AL-1500 at 1500W through LMR-400 to a SteppIR is treated identically to a barefoot IC-7300 through RG-58 to a random-wire.

4. **Station presets**: Operators with multiple configurations (home contest station, portable POTA kit, VHF mobile setup) must mentally track which equipment set applies and manually adjust settings each time.

5. **Performance visibility**: No computed view showing per-band capability, system noise figure, or signal chain gain/loss budget. Operators cannot answer "what band am I best equipped for?" or "which upgrade would improve me most?"

6. **Sharing and documentation**: No way to share station configuration publicly, export equipment lists for insurance, or visualize station evolution over time.

### Why this matters for propagation predictions

The DX Wizard currently computes signal predictions using `predictSignalStrength()` from `src/lib/utils/signal.ts`. The function accepts `txPowerWatts` and `antennaGainDbi` as inputs. Today, `antennaGainDbi` comes from `getAntennaGainForPath()` which returns a gain value from a generic pattern function — it knows nothing about the operator's actual antenna installation height, heading, or feedline losses.

With Shack Builder, the propagation engine gains access to:

- Actual TX power at the antenna (after feedline loss, amplifier gain)
- Actual antenna gain for the specific installation (height-adjusted pattern, heading-dependent gain for directional antennas)
- System noise figure (receiver NF + feedline NF contribution)
- Per-band equipment availability (which bands the active station preset actually covers)

This transforms propagation predictions from "generic estimate for a theoretical station" to "prediction calibrated to your actual equipment."

### Competitive landscape

Every major ham radio logging tool — N1MM+, Logger32, DXKeeper, MacLoggerDX, Cloudlog — treats station equipment as freeform text fields: "Rig: IC-7300, Ant: 20m 3el Yagi." None compute feedline loss. None adjust propagation predictions based on equipment. None model the complete signal chain.

VOACAP and ITURHFPROP accept antenna and power parameters but require manual entry for each prediction run and do not maintain an equipment inventory.

Propulse Shack Builder is the first system to combine equipment inventory, signal chain modeling, computed performance metrics, and live propagation prediction integration in a single interface.

---

## 3. Goals / Success Criteria

### Operator outcomes

- An operator can define their complete station in under 10 minutes: radio(s), antenna(s), feedline(s), accessories, assembled into named station presets.
- Switching between station configurations (home contest to portable POTA) is a single click that updates all propagation predictions system-wide.
- An operator can answer "what is my effective radiated power on 20m?" and "how much signal am I losing in my feedline on 10m?" without leaving Propulse.
- DX Wizard predictions improve measurably in accuracy because they account for actual station equipment rather than generic assumptions.
- Operators can share their station setup with others via a public URL or a social media card.

### System outcomes

- Equipment data is stored in Supabase with real-time sync across devices.
- The propagation engine (`signal.ts`, `antennas.ts`) consumes station preset data through a clean interface, replacing the current `antennaType` and flat `txPowerWatts` inputs.
- No regression in existing RadioManager functionality — all current radio management features are preserved and enhanced.
- Equipment data migration from IndexedDB (`userStore.preferences.radios`, `.customRadios`, `.activeRadioId`) to Supabase is seamless and non-destructive.

### Measurable criteria

- Feedline loss calculations are within 0.5 dB of published manufacturer specifications across all supported coax types and HF frequencies.
- Station preset switching propagates to all consuming components (DX Wizard, Band Planner, contest Cabrillo export) within a single React render cycle.
- Shack page loads in under 2 seconds on a median mobile connection (including equipment data fetch from Supabase).
- Photo gallery supports images up to 10 MB with client-side compression to 1 MB before upload.

---

## 4. Non-Goals (Explicitly Out of Scope)

- **Real-time SWR monitoring**: While the system accepts user-entered SWR data per band, it does not implement live SWR analysis via bridge/tuner integration. That is a future bridge protocol extension.
- **Antenna simulation/design**: Propulse is not an antenna modeling tool. It uses simplified gain patterns calibrated against NEC-2 simulations, not full electromagnetic simulation. Operators who need NEC-4 analysis should use EZNEC or 4NEC2.
- **Equipment marketplace**: No buying, selling, or pricing features. The insurance export is a documentation tool, not a valuation engine.
- **Tower/structural engineering**: Antenna mounting metadata (tower height, mast specs) is informational. Propulse does not compute wind load, structural requirements, or zoning compliance.
- **Automated firmware update checking**: Equipment health indicators are user-managed reminders, not vendor API integrations.
- **Multi-operator shared equipment pools**: Each Supabase user has their own equipment inventory. Shared club station equipment is out of scope for this release.
- **VHF/UHF propagation modeling**: While equipment can be tagged with VHF/UHF bands, the performance dashboard and feedline loss engine focus on HF (1.8-54 MHz). VHF/UHF feedline loss tables and propagation models are a future extension.

---

## 5. Feature Specification

### 5.1 Shack Overview / Dashboard

The `/shack` route opens to a dashboard view that provides an at-a-glance picture of the operator's station.

#### 5.1.1 Visual Station Diagram

An SVG-based block diagram renders the active station preset as a left-to-right signal chain:

```
[Radio] → [Amplifier] → [Tuner] → [Feedline] → [Antenna]
          (optional)     (optional)
```

Each block is a rounded rectangle with:

- Equipment icon (radio silhouette, amplifier icon, coax line, antenna glyph)
- Model name truncated to fit
- Key metric displayed beneath (e.g., "100W" for radio, "1500W" for amplifier, "1.9 dB loss @14 MHz" for feedline, "+8.0 dBi" for antenna)

Connections between blocks are drawn as lines with directional indicators (small arrows or signal flow markers). The line color reflects signal health: `signal-green` for low loss, `caution-amber` for moderate loss, `alert-red` for high loss (thresholds: <3 dB green, 3-6 dB amber, >6 dB red, calculated per the frequency of the currently selected band or the most commonly used band in the preset).

Clicking any block navigates to that equipment's detail view.

If no station preset is active, the diagram shows a ghost/placeholder state with "Configure your first station preset" and a call-to-action button.

#### 5.1.2 Active Preset Header

Above the diagram:

- Active preset name displayed prominently (e.g., "Home Contest Station") in `text-xl font-bold text-plasma-orange`
- Preset description (one line, `text-sm text-gray-400`)
- Quick-switch dropdown to change active preset (appears on hover/click, lists all presets with radio + antenna summary)
- "Edit Preset" button linking to the preset builder

#### 5.1.3 Band Capability Summary

Below the diagram, a horizontal strip of band pills (160m through 6m) shows per-band status for the active preset:

| Band | TX Power at Antenna | Feedline Loss | Antenna Gain | Status |
| ---- | ------------------- | ------------- | ------------ | ------ |
| 20m  | 95W (100W - 0.2 dB) | 1.9 dB        | +8.0 dBi     | Green  |
| 10m  | 87W (100W - 0.6 dB) | 3.4 dB        | +8.0 dBi     | Amber  |

Each pill is color-coded: `signal-green` if the antenna covers that band and feedline loss is under 3 dB, `caution-amber` if feedline loss is 3-6 dB or the antenna is marginal on that band, `alert-red` if feedline loss exceeds 6 dB or the antenna does not cover that band, `gray-600` if the radio does not transmit on that band.

Clicking a band pill expands a detail row showing the complete gain/loss budget for that band through the signal chain.

#### 5.1.4 Equipment Health Indicators

A small section below the band summary shows:

- Radios with firmware revision notes older than 1 year: "IC-7300 firmware noted as v1.30 — check for updates"
- Antennas with SWR > 3:1 on any covered band: "20m dipole shows 3.5:1 SWR on 15m"
- Feedlines with condition rating below "good": "50ft RG-58 rated 'fair' — consider replacement"

These are informational prompts based on user-entered data, not automated diagnostics.

### 5.2 Radio Fleet Management

Graduate the existing RadioManager from a settings tab into a dedicated section of the Shack page.

#### 5.2.1 Card Grid Layout

Radios display as a responsive card grid (3 columns desktop, 2 tablet, 1 mobile). Each card shows:

- **Header**: Radio icon (silhouette SVG based on form factor: desktop transceiver, portable, handheld, mobile) + manufacturer logo text
- **Title**: Model name (e.g., "IC-7300") with nickname subtitle if set (e.g., "The Workhorse")
- **Key specs row**: Max power | Bands count | Tier badge (color from `getTierColor()`)
- **Receiver score**: Circular progress indicator showing `calculateReceiverScore()` result (0-100), color-graded
- **Status indicator**: Green dot if this is the active radio in the current preset, bridge icon if connected via Hamlib CAT
- **Action menu**: Edit, Compare, Remove, Set as Active

The "Add Radio" card is always last in the grid with a `+` icon and "Add from Database" / "Create Custom" split action.

#### 5.2.2 Sherwood Database Browser

Retains existing search, sort, and filter functionality from RadioManager but in a full-page modal with improved UX:

- **Search**: Debounced text search across manufacturer + model (existing `searchRadios()`)
- **Filters sidebar**: Manufacturer checkboxes, tier radio buttons, band multiselect, mode multiselect
- **Sort options**: Overall score (default), RMDR, IMDR3, blocking gain, sensitivity, max power, release year, Sherwood rank
- **Results**: Table view with sortable columns showing key metrics, or card view toggle
- **Detail expansion**: Click a row to expand inline showing full specs, Sherwood test notes, and "Add to My Radios" button
- **Comparison mode**: Checkbox on each row; when 2-4 radios are checked, a "Compare Selected" button opens a side-by-side spec table

#### 5.2.3 Custom Radio Creation

The existing custom radio form is preserved and enhanced:

- Step-by-step wizard: Basic Info (name, manufacturer, model, tier, year) > Power & Bands > Receiver Specs > Transmit Specs > Review
- Tooltips on every field explaining what the spec means and typical values (e.g., "RMDR: 80 dB is entry-level, 100+ dB is flagship")
- "Copy from existing" button to pre-fill from a database radio, then modify
- Validation: max power must be >= min power, at least one band required, receiver specs must be positive numbers

#### 5.2.4 Radio Detail View

Full-screen view for a single radio showing:

- All RadioEquipment specs in a structured layout
- ReceiverPerformance metrics with visual gauges (bar chart showing each metric relative to database min/max)
- TransmitPerformance metrics if available
- Sherwood tested specs vs factory specs comparison (when `testedSpecs` exists) with clear labeling of which is being used
- User instance metadata: nickname, purchase date, serial number, firmware revision, wiring notes
- Operating tips: auto-generated notes based on specs (e.g., "Strong receiver — suitable for contesting in crowded band conditions" for high RMDR/IMDR3)
- "Connected via Bridge" status if Hamlib CAT is active for this radio

#### 5.2.5 Radio Comparison Mode

Side-by-side comparison table for 2-4 radios:

- Rows: every ReceiverPerformance and TransmitPerformance field, plus max power, bands, modes, tier, release year
- Cell highlighting: green background on the best value in each row, red on the worst
- Radar chart overlay showing normalized scores for the key receiver metrics (RMDR, IMDR3, blocking, sensitivity)
- Export comparison as PNG for sharing

### 5.3 Antenna Inventory

The largest new subsystem. Operators define their actual antenna installations with real-world parameters.

#### 5.3.1 Supported Antenna Types

Each antenna type has a predefined gain pattern model (extending the existing `AntennaDefinition` system) plus type-specific metadata fields:

| Type                  | Model Key      | Description                                      | Pattern Model                                           |
| --------------------- | -------------- | ------------------------------------------------ | ------------------------------------------------------- |
| Half-Wave Dipole      | `dipole`       | Fundamental resonant antenna                     | Existing `dipoleGain()`                                 |
| Inverted V            | `inverted_v`   | Center-fed dipole with drooping ends             | Existing `invertedVGain()`                              |
| Quarter-Wave Vertical | `vertical`     | Ground-mounted or elevated with radials          | Existing `verticalGain()`                               |
| Ground Plane          | `ground_plane` | Elevated vertical with radial skirt              | Modified vertical pattern with height factor            |
| 3-Element Yagi        | `yagi_3el`     | Reflector + driven + director                    | Existing `yagi3Gain()`                                  |
| 5-Element Yagi        | `yagi_5el`     | High-gain directional beam                       | Existing `yagi5Gain()`                                  |
| Quad                  | `quad`         | Full-wave loop elements on a boom                | Similar to Yagi with ~1 dB additional gain              |
| Magnetic Loop         | `mag_loop`     | Small resonant loop (typically < 0.1 wavelength) | Low-gain omnidirectional, narrow bandwidth              |
| Full-Wave Loop        | `full_loop`    | Horizontally or vertically oriented loop         | Bidirectional, gain depends on orientation              |
| EFHW                  | `efhw`         | End-Fed Half Wave with 49:1 transformer          | Similar to dipole with asymmetric current distribution  |
| OCF Dipole            | `ocf_dipole`   | Off-center-fed for multi-band operation          | Modified dipole pattern, multiple harmonic resonances   |
| Beverage              | `beverage`     | Long receiving-only wire antenna                 | Very low gain, excellent F/B ratio, low angle           |
| Rhombic               | `rhombic`      | Diamond-shaped long-wire array                   | High gain (14-18 dBi), very directional                 |
| Fan Dipole            | `fan_dipole`   | Multiple dipoles sharing a feedpoint             | Dipole pattern per band, independent resonances         |
| Trap Dipole           | `trap_dipole`  | Single dipole with band traps                    | Dipole pattern with reduced efficiency from trap losses |
| Hex Beam              | `hex_beam`     | Lightweight broadband directional                | Existing `hexBeamGain()`                                |
| SteppIR               | `steppir`      | Motorized element adjustment                     | Yagi-class pattern, optimized per frequency             |
| Moxon                 | `moxon`        | Compact 2-element directional                    | ~6 dBi gain, excellent F/B, compact                     |
| Wire Antenna          | `wire_random`  | Random-length wire with tuner                    | Low-gain omnidirectional, highly variable               |
| Log Periodic          | `lpda`         | Broadband directional array                      | 6-8 dBi gain across wide frequency range                |
| Dish/Parabolic        | `dish`         | Parabolic reflector (VHF/UHF/microwave)          | High gain, narrow beamwidth, frequency-dependent        |
| NVIS Dipole           | `nvis_dipole`  | Low-height dipole for near-vertical skywave      | Existing `nvisDipoleGain()`                             |
| Isotropic             | `isotropic`    | Theoretical reference                            | Existing `isotropicGain()` (0 dBi all angles)           |

#### 5.3.2 Per-Antenna Metadata

Every antenna in the inventory carries the following fields:

| Field                | Type                                                                                     | Required    | Description                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------- |
| `id`                 | `string` (UUID)                                                                          | Yes         | Unique identifier                                                                   |
| `name`               | `string`                                                                                 | Yes         | User-defined name (e.g., "20m Yagi on tower", "Portable EFHW")                      |
| `type`               | `AntennaType`                                                                            | Yes         | From the supported types enum                                                       |
| `manufacturer`       | `string`                                                                                 | No          | e.g., "SteppIR", "Cushcraft", "homebrew"                                            |
| `modelNumber`        | `string`                                                                                 | No          | Manufacturer model number                                                           |
| `bands`              | `BandId[]`                                                                               | Yes         | Which bands this antenna covers                                                     |
| `heightAgl`          | `{ value: number, unit: "ft" \| "m" }`                                                   | Yes         | Height above ground level at feedpoint                                              |
| `azimuth`            | `number \| null`                                                                         | Conditional | Fixed heading in degrees (0-360) for directional antennas; null for omnidirectional |
| `isRotatable`        | `boolean`                                                                                | No          | Whether the antenna can be rotated (azimuth becomes current heading, not fixed)     |
| `gainDbi`            | `Record<BandId, number>`                                                                 | No          | User-override gain per band in dBi. When absent, the system uses the pattern model. |
| `frontToBackDb`      | `number \| null`                                                                         | No          | Front-to-back ratio in dB for directional antennas                                  |
| `beamwidthDeg`       | `number \| null`                                                                         | No          | 3 dB beamwidth in degrees for directional antennas                                  |
| `polarization`       | `"horizontal" \| "vertical" \| "circular" \| "mixed"`                                    | Yes         | Antenna polarization                                                                |
| `mounting`           | `"tower" \| "mast" \| "roof" \| "ground" \| "tree" \| "portable" \| "mobile" \| "other"` | Yes         | How the antenna is installed                                                        |
| `feedpointImpedance` | `number`                                                                                 | No          | Nominal feedpoint impedance in ohms (typically 50 or 75)                            |
| `swrByBand`          | `Record<BandId, number>`                                                                 | No          | User-measured SWR per band (1.0 to infinity)                                        |
| `installationDate`   | `string \| null`                                                                         | No          | ISO-8601 date                                                                       |
| `isPortable`         | `boolean`                                                                                | No          | Flag for POTA/SOTA/field use                                                        |
| `radialCount`        | `number \| null`                                                                         | No          | For verticals and ground planes: number of ground radials                           |
| `radialLength`       | `{ value: number, unit: "ft" \| "m" } \| null`                                           | No          | Average radial length                                                               |
| `notes`              | `string`                                                                                 | No          | Freeform notes (installation details, tuning notes, etc.)                           |

#### 5.3.3 Antenna Pattern Visualization

Each antenna detail view includes a 2D polar plot rendered on an HTML `<canvas>` element showing:

- **Elevation pattern**: Gain in dBi (radial axis) vs elevation angle 0-90 degrees (angular axis)
- **Band selector**: Dropdown to choose which band's pattern to display (relevant because antenna height in wavelengths changes with frequency, altering the pattern)
- **Pattern source indicator**: "Modeled (NEC-2 calibrated)" when using the built-in pattern functions, or "User-specified gain" when the operator has entered a `gainDbi` override

The pattern is computed by calling the antenna type's `getGain(elevationDeg)` function from `src/lib/data/antennas.ts`, extended to accept height-in-wavelengths as a modifier. For antenna types not in the current library, new gain functions will be implemented following the same NEC-2-calibrated analytical model approach.

For directional antennas, an additional azimuthal pattern plot shows gain vs azimuth at the antenna's optimal elevation angle, using the front-to-back ratio and beamwidth to generate a cosine-power approximation of the horizontal pattern.

#### 5.3.4 Multi-Band Antenna Handling

Antennas that cover multiple bands (e.g., a trap dipole covering 20m/15m/10m, or a fan dipole covering 80m/40m/20m) store band-specific data:

- `gainDbi`: per-band gain override (trap dipoles typically lose 0.5-1.5 dB per trap)
- `swrByBand`: per-band SWR
- The pattern visualization allows band-by-band comparison

The performance dashboard computes metrics per band using the band-specific gain value, falling back to the generic pattern model gain if no override is set.

#### 5.3.5 Portable Antenna Kit

Antennas flagged `isPortable: true` are:

- Visually tagged with a portable icon (backpack/hiking glyph) in the card grid
- Filterable in the antenna list ("Show portable only" toggle)
- Available for selection in station presets tagged as portable/POTA/SOTA
- Displayed with a note about typical deployment height (from `heightAgl`) and setup requirements (from `notes`)

### 5.4 Feedline & Transmission Line Inventory

#### 5.4.1 Supported Feedline Types

Each feedline type has published loss characteristics stored as a lookup table:

| Type            | Impedance | Velocity Factor | Description                                                          |
| --------------- | --------- | --------------- | -------------------------------------------------------------------- |
| RG-58           | 50 ohm    | 0.66            | Lightweight, high loss. Common for short runs and portable use.      |
| RG-8X           | 50 ohm    | 0.82            | Mini-8, moderate loss. Popular compromise of weight and performance. |
| RG-213          | 50 ohm    | 0.66            | Standard mil-spec coax. Workhorse for HF stations.                   |
| LMR-400         | 50 ohm    | 0.85            | Low-loss flexible coax. Preferred for longer runs.                   |
| LMR-600         | 50 ohm    | 0.87            | Ultra-low-loss. For long runs or VHF/UHF.                            |
| Hardline 7/8"   | 50 ohm    | 0.88            | Semi-rigid, very low loss. Commercial/contest stations.              |
| Ladder Line 450 | 450 ohm   | 0.95            | Open-wire transmission line. Extremely low loss. Requires tuner.     |
| Window Line 300 | 300 ohm   | 0.82            | TV-style twinlead with windows. Low loss balanced line.              |

#### 5.4.2 Feedline Loss Tables (dB per 100 feet)

Published manufacturer specifications for matched-line loss. Values are dB loss per 100 feet at the specified frequency.

##### RG-58 (Belden 8259)

| Frequency (MHz) | Loss (dB/100ft) |
| --------------- | --------------- |
| 1.8             | 1.2             |
| 3.5             | 1.6             |
| 7.0             | 2.4             |
| 10.1            | 2.9             |
| 14.0            | 3.3             |
| 18.1            | 3.8             |
| 21.0            | 4.1             |
| 24.9            | 4.5             |
| 28.0            | 4.9             |
| 50.0            | 6.6             |

##### RG-8X (Belden 9258)

| Frequency (MHz) | Loss (dB/100ft) |
| --------------- | --------------- |
| 1.8             | 0.8             |
| 3.5             | 1.1             |
| 7.0             | 1.6             |
| 10.1            | 1.9             |
| 14.0            | 2.2             |
| 18.1            | 2.5             |
| 21.0            | 2.8             |
| 24.9            | 3.0             |
| 28.0            | 3.2             |
| 50.0            | 4.5             |

##### RG-213 (Belden 8267)

| Frequency (MHz) | Loss (dB/100ft) |
| --------------- | --------------- |
| 1.8             | 0.6             |
| 3.5             | 0.9             |
| 7.0             | 1.3             |
| 10.1            | 1.5             |
| 14.0            | 1.8             |
| 18.1            | 2.0             |
| 21.0            | 2.2             |
| 24.9            | 2.4             |
| 28.0            | 2.5             |
| 50.0            | 3.7             |

##### LMR-400 (Times Microwave)

| Frequency (MHz) | Loss (dB/100ft) |
| --------------- | --------------- |
| 1.8             | 0.4             |
| 3.5             | 0.5             |
| 7.0             | 0.7             |
| 10.1            | 0.9             |
| 14.0            | 1.0             |
| 18.1            | 1.2             |
| 21.0            | 1.3             |
| 24.9            | 1.4             |
| 28.0            | 1.5             |
| 50.0            | 2.0             |

##### LMR-600 (Times Microwave)

| Frequency (MHz) | Loss (dB/100ft) |
| --------------- | --------------- |
| 1.8             | 0.2             |
| 3.5             | 0.3             |
| 7.0             | 0.5             |
| 10.1            | 0.6             |
| 14.0            | 0.7             |
| 18.1            | 0.8             |
| 21.0            | 0.9             |
| 24.9            | 0.9             |
| 28.0            | 1.0             |
| 50.0            | 1.4             |

##### Hardline 7/8" (Andrew LDF5-50A)

| Frequency (MHz) | Loss (dB/100ft) |
| --------------- | --------------- |
| 1.8             | 0.07            |
| 3.5             | 0.10            |
| 7.0             | 0.14            |
| 10.1            | 0.17            |
| 14.0            | 0.20            |
| 18.1            | 0.23            |
| 21.0            | 0.25            |
| 24.9            | 0.27            |
| 28.0            | 0.29            |
| 50.0            | 0.39            |

##### Ladder Line 450 ohm (Wireman 553)

Ladder line loss is specified in dB per 100 feet for matched conditions (450 ohm load). Actual loss increases with SWR mismatch but remains far lower than coaxial cable under the same mismatch.

| Frequency (MHz) | Loss (dB/100ft) |
| --------------- | --------------- |
| 1.8             | 0.03            |
| 3.5             | 0.05            |
| 7.0             | 0.07            |
| 10.1            | 0.09            |
| 14.0            | 0.10            |
| 18.1            | 0.12            |
| 21.0            | 0.13            |
| 24.9            | 0.14            |
| 28.0            | 0.15            |
| 50.0            | 0.22            |

##### Window Line 300 ohm

| Frequency (MHz) | Loss (dB/100ft) |
| --------------- | --------------- |
| 1.8             | 0.08            |
| 3.5             | 0.12            |
| 7.0             | 0.18            |
| 10.1            | 0.22            |
| 14.0            | 0.25            |
| 18.1            | 0.29            |
| 21.0            | 0.32            |
| 24.9            | 0.35            |
| 28.0            | 0.37            |
| 50.0            | 0.52            |

#### 5.4.3 Loss Calculation Engine

The feedline loss engine computes loss at any frequency by interpolating between the tabulated values. The interpolation uses the square-root-of-frequency model that characterizes coaxial cable loss:

```
loss(f) = A * sqrt(f) + B * f
```

Where A (conductor loss coefficient) and B (dielectric loss coefficient) are derived from a least-squares fit to the tabulated data for each cable type. This allows accurate loss computation at any frequency, not just the tabulated points.

For a given feedline inventory entry:

```
totalFeedlineLoss(frequencyMHz) = lossPerHundredFeet(frequencyMHz) * (lengthFeet / 100)
```

Where `lengthFeet` is the feedline's stored length (converted from meters if stored in metric).

#### 5.4.4 Additional Loss Factors

Beyond pure feedline loss, the engine accounts for:

- **Connector loss**: Each connector pair (PL-259, N-type, BNC, SMA) adds a small fixed loss. Default values:
  - PL-259: 0.1 dB per connector pair at HF, 0.3 dB at 50 MHz
  - N-type: 0.05 dB per connector pair at HF, 0.1 dB at 50 MHz
  - BNC: 0.1 dB per connector pair at HF, 0.2 dB at 50 MHz
  - SMA: 0.05 dB per connector pair at HF, 0.1 dB at 50 MHz

- **SWR-induced additional loss**: When the antenna SWR on a given band is known, the additional loss from standing waves is computed as:
  ```
  additionalLoss = matchedLoss * (SWR - 1) / (SWR + 1) * correction
  ```
  This is a simplified model; the actual formula uses the reflection coefficient and matched-line loss. The full computation is:
  ```
  reflectionCoeff = (SWR - 1) / (SWR + 1)
  matchedLossLinear = 10^(matchedLossDb / 10)
  totalLossLinear = matchedLossLinear * (1 - reflectionCoeff^2) / (1 - (reflectionCoeff * matchedLossLinear)^2)... (truncated for readability; see implementation)
  ```
  When SWR data is not available, the engine assumes SWR = 1.5:1 as a reasonable default.

#### 5.4.5 Per-Feedline Metadata

| Field              | Type                                          | Required | Description                                                                                 |
| ------------------ | --------------------------------------------- | -------- | ------------------------------------------------------------------------------------------- |
| `id`               | `string` (UUID)                               | Yes      | Unique identifier                                                                           |
| `name`             | `string`                                      | Yes      | User-defined name (e.g., "Main tower run", "Portable coax")                                 |
| `type`             | `FeedlineType`                                | Yes      | From supported types enum                                                                   |
| `lengthValue`      | `number`                                      | Yes      | Length value                                                                                |
| `lengthUnit`       | `"ft" \| "m"`                                 | Yes      | Length unit                                                                                 |
| `connectorType`    | `"PL259" \| "N" \| "BNC" \| "SMA" \| "other"` | Yes      | Connector type at each end                                                                  |
| `connectorCount`   | `number`                                      | Yes      | Number of connector pairs in the run (minimum 1, typically 1-3 including barrel connectors) |
| `manufacturer`     | `string`                                      | No       | Cable manufacturer                                                                          |
| `installationDate` | `string \| null`                              | No       | ISO-8601 date                                                                               |
| `conditionRating`  | `"excellent" \| "good" \| "fair" \| "poor"`   | No       | User assessment of cable condition                                                          |
| `isPortable`       | `boolean`                                     | No       | Flag for field use                                                                          |
| `notes`            | `string`                                      | No       | Freeform notes                                                                              |

#### 5.4.6 Total System Loss Computation

The complete signal chain loss from radio output to antenna feedpoint is:

```
totalSystemLoss = feedlineLoss + connectorLoss + balunLoss + switchLoss + additionalMismatchLoss
```

Where:

- `feedlineLoss`: from the loss calculation engine for the specific cable type and length
- `connectorLoss`: connector count \* loss per connector pair
- `balunLoss`: if a balun is in the signal chain (from accessories), typically 0.1-0.5 dB
- `switchLoss`: if an antenna switch is in the chain, typically 0.05-0.2 dB per switch
- `additionalMismatchLoss`: SWR-induced additional loss computed from antenna SWR data

This total is displayed in the signal chain diagram and subtracted from the radio's TX power to compute effective power at the antenna.

### 5.5 Accessories & Signal Path

Track auxiliary equipment that sits in the signal chain between the radio and antenna.

#### 5.5.1 Accessory Categories

**Amplifiers**

| Field            | Type                                         | Required | Description                                                                 |
| ---------------- | -------------------------------------------- | -------- | --------------------------------------------------------------------------- |
| `id`             | `string` (UUID)                              | Yes      | Unique identifier                                                           |
| `category`       | `"amplifier"`                                | Yes      | Fixed discriminator                                                         |
| `name`           | `string`                                     | Yes      | User name (e.g., "Alpha 91B")                                               |
| `manufacturer`   | `string`                                     | No       | Equipment manufacturer                                                      |
| `modelNumber`    | `string`                                     | No       | Model number                                                                |
| `maxPowerOutput` | `number`                                     | Yes      | Maximum power output in watts                                               |
| `bands`          | `BandId[]`                                   | Yes      | Supported bands                                                             |
| `drivePowerMin`  | `number`                                     | No       | Minimum drive power in watts                                                |
| `drivePowerMax`  | `number`                                     | No       | Maximum drive power in watts                                                |
| `gainDb`         | `number`                                     | No       | Nominal gain in dB (computed from drive/output if not specified)            |
| `dutyCycle`      | `Record<"ssb" \| "cw" \| "digital", number>` | No       | Max duty cycle percentage per mode (e.g., SSB: 100%, CW: 50%, Digital: 25%) |
| `tubeType`       | `string`                                     | No       | Tube model for tube amplifiers (e.g., "3CX1500A7")                          |
| `isSolidState`   | `boolean`                                    | No       | Solid-state vs tube                                                         |
| `inputImpedance` | `number`                                     | No       | Input impedance in ohms                                                     |
| `notes`          | `string`                                     | No       | Freeform                                                                    |

**Antenna Tuners**

| Field           | Type                                                             | Required | Description                                                        |
| --------------- | ---------------------------------------------------------------- | -------- | ------------------------------------------------------------------ |
| `id`            | `string` (UUID)                                                  | Yes      | Unique identifier                                                  |
| `category`      | `"tuner"`                                                        | Yes      | Fixed discriminator                                                |
| `name`          | `string`                                                         | Yes      | User name                                                          |
| `manufacturer`  | `string`                                                         | No       | Equipment manufacturer                                             |
| `modelNumber`   | `string`                                                         | No       | Model number                                                       |
| `tunerType`     | `"L" \| "T" \| "balanced" \| "autotuner" \| "manual" \| "other"` | Yes      | Tuner topology                                                     |
| `maxPower`      | `number`                                                         | No       | Maximum power handling in watts                                    |
| `bands`         | `BandId[]`                                                       | No       | Supported bands                                                    |
| `insertionLoss` | `number`                                                         | No       | Typical insertion loss in dB (default: 0.3 dB for a quality tuner) |
| `notes`         | `string`                                                         | No       | Freeform                                                           |

**Filters**

| Field           | Type                                               | Required | Description                       |
| --------------- | -------------------------------------------------- | -------- | --------------------------------- |
| `id`            | `string` (UUID)                                    | Yes      | Unique identifier                 |
| `category`      | `"filter"`                                         | Yes      | Fixed discriminator               |
| `name`          | `string`                                           | Yes      | User name (e.g., "W3NQN 20m BPF") |
| `manufacturer`  | `string`                                           | No       | Equipment manufacturer            |
| `modelNumber`   | `string`                                           | No       | Model number                      |
| `filterType`    | `"bandpass" \| "lowpass" \| "highpass" \| "notch"` | Yes      | Filter type                       |
| `bands`         | `BandId[]`                                         | No       | Applicable bands                  |
| `insertionLoss` | `number`                                           | No       | Passband insertion loss in dB     |
| `notes`         | `string`                                           | No       | Freeform                          |

**Switches**

| Field           | Type            | Required | Description                               |
| --------------- | --------------- | -------- | ----------------------------------------- |
| `id`            | `string` (UUID) | Yes      | Unique identifier                         |
| `category`      | `"switch"`      | Yes      | Fixed discriminator                       |
| `name`          | `string`        | Yes      | User name (e.g., "DX Engineering 4-way")  |
| `manufacturer`  | `string`        | No       | Equipment manufacturer                    |
| `modelNumber`   | `string`        | No       | Model number                              |
| `portCount`     | `number`        | No       | Number of antenna ports                   |
| `insertionLoss` | `number`        | No       | Insertion loss in dB (typically 0.05-0.2) |
| `notes`         | `string`        | No       | Freeform                                  |

**Power Supplies**

| Field             | Type             | Required | Description             |
| ----------------- | ---------------- | -------- | ----------------------- |
| `id`              | `string` (UUID)  | Yes      | Unique identifier       |
| `category`        | `"power_supply"` | Yes      | Fixed discriminator     |
| `name`            | `string`         | Yes      | User name               |
| `manufacturer`    | `string`         | No       | Equipment manufacturer  |
| `modelNumber`     | `string`         | No       | Model number            |
| `voltage`         | `number`         | No       | Output voltage          |
| `maxCurrent`      | `number`         | No       | Maximum current in amps |
| `isBatteryBackup` | `boolean`        | No       | Has battery backup      |
| `notes`           | `string`         | No       | Freeform                |

**Grounding System**

| Field             | Type                                   | Required | Description                              |
| ----------------- | -------------------------------------- | -------- | ---------------------------------------- |
| `id`              | `string` (UUID)                        | Yes      | Unique identifier                        |
| `category`        | `"grounding"`                          | Yes      | Fixed discriminator                      |
| `name`            | `string`                               | Yes      | Description (e.g., "Station ground bus") |
| `groundRodCount`  | `number`                               | No       | Number of ground rods                    |
| `groundRodLength` | `{ value: number, unit: "ft" \| "m" }` | No       | Rod length                               |
| `notes`           | `string`                               | No       | Description of grounding setup           |

#### 5.5.2 Signal Chain Position

Each accessory in a station preset has a `position` value (integer, 0-based) defining its order in the signal chain. The chain is always:

```
Radio (position 0) → [accessories in position order] → Feedline → Antenna
```

The feedline and antenna are always at the end of the chain. Accessories between the radio and feedline are ordered by their `position` value. The station preset builder (section 5.6) provides drag-and-drop reordering.

### 5.6 Station Presets

Named equipment configurations that define a complete signal chain from radio to antenna.

#### 5.6.1 Preset Data Model

| Field                 | Type                                 | Required | Description                                                                                                                                         |
| --------------------- | ------------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                  | `string` (UUID)                      | Yes      | Unique identifier                                                                                                                                   |
| `name`                | `string`                             | Yes      | Preset name (e.g., "Home Contest Station")                                                                                                          |
| `description`         | `string`                             | No       | One-line description                                                                                                                                |
| `radioId`             | `string`                             | Yes      | Reference to user radio instance                                                                                                                    |
| `antennaId`           | `string`                             | Yes      | Reference to antenna inventory item                                                                                                                 |
| `feedlineId`          | `string`                             | Yes      | Reference to feedline inventory item                                                                                                                |
| `accessoryIds`        | `{ id: string, position: number }[]` | No       | Ordered list of accessories in the signal chain                                                                                                     |
| `amplifierId`         | `string \| null`                     | No       | Shortcut reference to the amplifier (also in accessoryIds, but called out for quick access)                                                         |
| `operatingPowerWatts` | `number \| null`                     | No       | Override TX power for this preset (e.g., QRP contest at 5W even though radio can do 100W). When null, use radio's `customPowerLimit` or `maxPower`. |
| `locationId`          | `string \| null`                     | No       | Link to an `OperatingLocation` — auto-activate when this location is selected                                                                       |
| `isPortable`          | `boolean`                            | No       | Mark as portable/field preset                                                                                                                       |
| `icon`                | `string`                             | No       | Emoji or icon identifier for visual distinction                                                                                                     |
| `createdAt`           | `string`                             | Yes      | ISO-8601 creation timestamp                                                                                                                         |
| `updatedAt`           | `string`                             | Yes      | ISO-8601 last modification timestamp                                                                                                                |

#### 5.6.2 Preset Examples

**"Home Contest Station"**

```
Radio: Elecraft K3 (#my-k3)
  → Amplifier: Alpha 91B (1500W out, ~13 dB gain)
  → Tuner: Palstar AT2K (0.3 dB insertion loss)
  → Feedline: 100ft LMR-400 (1.0 dB @ 14 MHz)
  → Antenna: SteppIR 3-element Yagi at 60ft (+8.0 dBi)

Operating power: 1500W
Location: Home (EM12kr)
```

**"Portable POTA Kit"**

```
Radio: Icom IC-705 (#pota-rig)
  → Feedline: 25ft RG-8X (0.55 dB @ 14 MHz)
  → Antenna: EFHW with 49:1 transformer at 30ft in trees (+1.8 dBi)

Operating power: 10W (QRP)
Location: null (varies per activation)
Portable: true
```

**"FT8 Setup"**

```
Radio: Icom IC-7300 (#main-rig)
  → Filter: W3NQN 20m bandpass filter (0.2 dB insertion loss)
  → Feedline: 50ft RG-213 (0.9 dB @ 14 MHz)
  → Antenna: OCF Dipole at 35ft (+1.5 dBi)

Operating power: 50W
Location: Home (EM12kr)
```

**"VHF/UHF Mobile"**

```
Radio: Yaesu FT-991A (#mobile-rig)
  → Feedline: 3ft RG-8X (0.07 dB @ 146 MHz)
  → Antenna: Diamond NR770H on mag mount (+2.15 dBi @ 2m)

Operating power: 50W
Location: null (mobile)
```

#### 5.6.3 Preset Builder UI

A dedicated builder view with:

1. **Equipment selection panels**: Left sidebar with collapsible sections for Radios, Antennas, Feedlines, Accessories. Each section shows the user's inventory items as selectable cards.

2. **Signal chain workspace**: Center area where selected equipment appears as connected blocks. Drag-and-drop to reorder accessories in the chain. Drop zones between blocks show "Add accessory here" on hover.

3. **Live performance preview**: Right sidebar showing per-band computed metrics updating in real time as equipment is added/removed/reordered:
   - TX power at antenna per band
   - Total system loss per band
   - Antenna gain per band
   - Effective radiated power (ERP) per band

4. **Preset metadata**: Top bar with name input, description input, location selector, portable toggle, icon picker.

5. **Validation**: The builder prevents saving incomplete presets (must have at minimum a radio, feedline, and antenna). Warning indicators show if equipment bands do not overlap (e.g., a 2m-only antenna with an HF-only feedline) or if amplifier drive power requirements exceed radio output.

#### 5.6.4 One-Click Activation

The active station preset is stored in Zustand (and synced to Supabase). Changing the active preset:

1. Updates `activePresetId` in the shack store
2. Propagates to all consuming components via Zustand selectors:
   - DX Wizard reads effective TX power and antenna gain from the active preset
   - Band Planner reads per-band capability
   - Contest Cabrillo header reads station info
3. Triggers a re-render of the Shack dashboard signal chain diagram
4. Optionally updates the active location if the preset has a `locationId` (with confirmation dialog if the current location differs)

#### 5.6.5 Location-Linked Auto-Activation

When an operator selects an operating location (e.g., switches to a POTA park reference in the location manager), the system checks if any station preset has a matching `locationId`. If found:

- A toast notification appears: "Switch to [Preset Name]?" with Accept/Dismiss buttons
- Accepting activates the preset
- The toast auto-dismisses after 10 seconds without changing anything

### 5.7 Performance Dashboard

Computed analytics derived from the active station preset's equipment chain.

#### 5.7.1 Per-Band Capability Matrix

A table covering every HF band (160m through 6m) with the following columns, computed from the active preset:

| Column                 | Computation                                                                                               | Unit           |
| ---------------------- | --------------------------------------------------------------------------------------------------------- | -------------- |
| Band                   | Band identifier                                                                                           | -              |
| Radio TX Power         | Radio `maxPower` or preset `operatingPowerWatts`                                                          | W              |
| Amplifier Gain         | `10 * log10(ampOutputW / ampDriveW)` if amplifier present, else 0                                         | dB             |
| Feedline Loss          | From loss calculation engine for this band's center frequency                                             | dB             |
| Accessory Loss         | Sum of insertion losses from tuner, filter, switch                                                        | dB             |
| Connector Loss         | From connector count and type                                                                             | dB             |
| Total System Loss      | Sum of all losses                                                                                         | dB             |
| TX Power at Antenna    | `radioOutputW * 10^(-totalSystemLoss/10)` or `ampOutputW * 10^(-postAmpLoss/10)`                          | W              |
| Antenna Gain           | From antenna definition or user override for this band                                                    | dBi            |
| ERP                    | `txPowerAtAntenna(dBm) + antennaGain(dBi)`                                                                | dBm / W        |
| RX Sensitivity Impact  | `feedlineLoss + accessoryLoss` added to radio's base NF                                                   | dB degradation |
| Estimated Noise Figure | `radioNF + (feedlineLoss / 10)` (simplified)                                                              | dB             |
| Coverage               | "Full" if antenna covers band + radio covers band, "RX only" if radio covers but antenna does not, "None" | -              |

Rows are color-coded by coverage status: full coverage in normal text, RX-only in `text-gray-400`, none in `text-gray-600` with strikethrough.

#### 5.7.2 Signal Chain Waterfall

A horizontal bar chart showing the dB gain/loss at each stage of the signal chain for a selected band:

```
Radio Output:    +50.0 dBm (100W)  ████████████████████████████████████████
Amplifier:       +13.0 dB          ████████████████████████████████████████████████████▒▒
Tuner Loss:       -0.3 dB          ████████████████████████████████████████████████████▒
Feedline Loss:    -1.0 dB          ██████████████████████████████████████████████████▒
Connector Loss:   -0.1 dB          ██████████████████████████████████████████████████
Antenna Gain:    +8.0 dBi          ████████████████████████████████████████████████████████████
─────────────────────────────────────────────────────────────────
Net ERP:         +69.6 dBm (9120W ERP)
```

Green bars for gain stages, red bars for loss stages. The running total is shown as a dotted line overlay.

#### 5.7.3 Preset Comparison

Select two station presets for side-by-side comparison. The comparison view shows:

- Parallel signal chain diagrams
- Per-band capability matrix for both presets with differential highlighting (green where preset A is better, blue where preset B is better)
- Total ERP comparison per band as overlapping bar charts

#### 5.7.4 Upgrade Advisor

An analysis engine that identifies the single equipment change that would produce the largest performance improvement. The algorithm:

1. For each band in the active preset, compute current ERP
2. Simulate replacing the feedline with the next-lower-loss option (e.g., RG-213 to LMR-400) and compute the dB improvement
3. Simulate adding a 3-element Yagi if the current antenna is a dipole/vertical/wire and compute the dBi improvement
4. Simulate adding an amplifier if none present and compute the dB improvement
5. Rank all simulated improvements by dB gain and present the top 3 as actionable suggestions:
   - "Replace 100ft RG-58 with LMR-400 on 10m: saves 3.4 dB (55% more power at antenna)"
   - "Add a 3-element Yagi for 20m: adds 5.85 dB gain over your dipole"
   - "Add an amplifier: 10 dB gain brings you from 100W to 1000W at antenna"

Each suggestion includes a "What if?" button that opens a temporary comparison view showing current vs suggested configuration.

### 5.8 Shack Photo Gallery

#### 5.8.1 Photo Upload

- Upload from device camera or file picker
- Client-side image compression: resize to max 2048px on longest edge, JPEG quality 85%, targeting under 1 MB
- Upload to Supabase Storage bucket `shack-photos/{userId}/{photoId}.jpg`
- Maximum 20 photos per user in initial release

#### 5.8.2 Gallery Display

- Grid layout: 3 columns desktop, 2 columns tablet, 1 column mobile
- Lightbox view on click with swipe navigation (mobile) and arrow key navigation (desktop)
- Each photo has:
  - Caption field (editable, max 200 characters)
  - Date taken (from EXIF or user-entered)
  - Equipment tags: multi-select from user's equipment inventory (e.g., tag "IC-7300", "20m Yagi")
  - Reorder via drag-and-drop
  - Delete with confirmation

#### 5.8.3 Before/After Comparison

When two photos are tagged with the same equipment, a "Compare" action becomes available. This opens a side-by-side or slider comparison view, useful for showing station evolution (e.g., before and after tower installation).

#### 5.8.4 Privacy Controls

- Photos are private by default (visible only to the authenticated user)
- "Share on profile" toggle per photo or for the entire gallery
- Public gallery is visible at `/shack/{callsign}` when the user enables sharing

### 5.9 Equipment Timeline

#### 5.9.1 Timeline View

A vertical timeline showing equipment acquisition and installation events, ordered by date:

```
2025-12-15  Added IC-7300 ("The Workhorse")
2025-11-20  Installed 3-element Yagi at 45ft on tower
2025-11-15  Ran 100ft LMR-400 to tower
2025-09-01  Added Elecraft K3 ("Contest Machine")
2025-06-10  Started with dipole at 25ft
```

Each timeline entry shows:

- Date
- Equipment icon and name
- Event type: "Added", "Installed", "Retired", "Upgraded firmware", "Replaced" (based on available date fields: `addedAt`, `purchaseDate`, `installationDate`)
- Optional photo from the gallery if tagged with that equipment and dated within 7 days of the event

#### 5.9.2 Station Evolution Summary

A computed summary showing:

- Total time as a licensed operator (from license grant date)
- Number of equipment changes
- Current station "generation" (count of major configuration changes)
- Total investment tracking (optional: user can enter purchase prices, shown only to them, never shared)

### 5.10 Sharing Features

#### 5.10.1 Public Shack Page

When sharing is enabled, `/shack/{callsign}` renders a read-only view showing:

- Callsign and operator name
- Active station preset with signal chain diagram
- Equipment list (radios, antennas, feedlines)
- Per-band capability summary (performance dashboard in read-only mode)
- Public photos from the gallery
- Equipment timeline

The page uses Propulse's standard dark theme and is optimized for sharing (no authentication required to view).

#### 5.10.2 QR Code

A generated QR code linking to the public shack page. The QR code:

- Uses the Propulse plasma-orange color scheme
- Includes the operator's callsign text below the code
- Is downloadable as a PNG (300x300px for print, 150x150px for screen)
- Can be displayed full-screen on a phone for easy scanning at hamfest swap meets

#### 5.10.3 Equipment List Export

Export the complete equipment inventory as:

- **CSV**: All equipment with full metadata, suitable for spreadsheet import. Columns include category, name, manufacturer, model, bands, purchase date, purchase price (if entered), serial number.
- **PDF**: Formatted document with equipment grouped by category, including photos (if any), suitable for insurance documentation. Includes a cover page with callsign, date generated, and total equipment count.

#### 5.10.4 Share Card

A generated PNG image (1200x630px for social media preview) showing:

- Propulse branding (logo, dark background)
- Operator callsign in large text
- Active preset name and signal chain summary (text-based, e.g., "K3 → AL-1500 → LMR-400 → 3el Yagi")
- Key stats: total bands covered, max ERP, receiver quality score
- QR code linking to the public shack page

Generated client-side using HTML Canvas, downloadable as PNG.

#### 5.10.5 Shack Comparison

When viewing another operator's public shack page, a "Compare with my station" button opens a split view showing both stations' per-band capability matrices side by side. This requires the viewing operator to be authenticated with their own equipment configured.

---

## 6. Data Model

### 6.1 Supabase Tables

All tables include standard audit fields: `created_at` (timestamptz, default `now()`), `updated_at` (timestamptz, default `now()`, auto-updated via trigger), `user_id` (uuid, FK to `auth.users`, RLS-enforced).

#### `radio_equipment` (Reference Database)

Stores the Sherwood Engineering and community radio database. Shared across all users (no `user_id`).

| Column         | Type      | Constraints                     | Description                           |
| -------------- | --------- | ------------------------------- | ------------------------------------- |
| `id`           | `uuid`    | PK, default `gen_random_uuid()` | Unique identifier                     |
| `manufacturer` | `text`    | NOT NULL                        | Manufacturer name                     |
| `model`        | `text`    | NOT NULL                        | Model number/name                     |
| `display_name` | `text`    |                                 | Optional display label                |
| `receiver`     | `jsonb`   | NOT NULL                        | ReceiverPerformance object            |
| `transmit`     | `jsonb`   |                                 | TransmitPerformance object            |
| `tested_specs` | `jsonb`   |                                 | Independent lab-tested receiver specs |
| `sources`      | `jsonb`   |                                 | Data source attribution array         |
| `max_power`    | `integer` | NOT NULL                        | Max TX power in watts                 |
| `min_power`    | `integer` | NOT NULL, default 0             | Min TX power in watts                 |
| `modes`        | `text[]`  | NOT NULL                        | Supported operating modes             |
| `bands`        | `text[]`  | NOT NULL                        | Supported bands                       |
| `tier`         | `text`    | NOT NULL                        | Radio tier classification             |
| `release_year` | `integer` |                                 | Year of release                       |

Indexes: `(manufacturer, model)` unique, `(tier)`, full-text search on `manufacturer || ' ' || model`.

RLS: read access for all authenticated users, write access for admin role only.

#### `user_radios`

User-owned radio instances. References `radio_equipment` for database radios, or stores custom equipment inline.

| Column                 | Type            | Constraints                     | Description                                   |
| ---------------------- | --------------- | ------------------------------- | --------------------------------------------- |
| `id`                   | `uuid`          | PK, default `gen_random_uuid()` | Instance identifier                           |
| `user_id`              | `uuid`          | FK `auth.users`, NOT NULL       | Owner                                         |
| `equipment_id`         | `uuid`          | FK `radio_equipment`, nullable  | Reference to database radio (null for custom) |
| `custom_equipment`     | `jsonb`         |                                 | Full RadioEquipment object for custom radios  |
| `nickname`             | `text`          |                                 | User nickname                                 |
| `custom_power_limit`   | `integer`       |                                 | Power limit override                          |
| `purchase_date`        | `date`          |                                 | Purchase date                                 |
| `purchase_location`    | `text`          |                                 | Purchase location                             |
| `purchase_price`       | `numeric(10,2)` |                                 | Purchase price (private, never shared)        |
| `serial_number`        | `text`          |                                 | Serial number                                 |
| `firmware_revision`    | `text`          |                                 | Firmware version                              |
| `wiring_configuration` | `text`          |                                 | Wiring/interface notes                        |
| `spec_preference`      | `text`          | default `'global'`              | "global", "factory", or "tested"              |
| `notes`                | `text`          |                                 | Freeform notes                                |

RLS: users can only read/write their own rows.

#### `antennas`

| Column                | Type           | Constraints                      | Description             |
| --------------------- | -------------- | -------------------------------- | ----------------------- |
| `id`                  | `uuid`         | PK                               | Unique identifier       |
| `user_id`             | `uuid`         | FK `auth.users`, NOT NULL        | Owner                   |
| `name`                | `text`         | NOT NULL                         | User-defined name       |
| `antenna_type`        | `text`         | NOT NULL                         | From AntennaType enum   |
| `manufacturer`        | `text`         |                                  | Manufacturer            |
| `model_number`        | `text`         |                                  | Model number            |
| `bands`               | `text[]`       | NOT NULL                         | Covered bands           |
| `height_agl_value`    | `numeric(8,2)` | NOT NULL                         | Height above ground     |
| `height_agl_unit`     | `text`         | NOT NULL, default `'ft'`         | "ft" or "m"             |
| `azimuth`             | `numeric(5,1)` |                                  | Fixed heading degrees   |
| `is_rotatable`        | `boolean`      | default `false`                  | Can be rotated          |
| `gain_dbi_by_band`    | `jsonb`        |                                  | Per-band gain overrides |
| `front_to_back_db`    | `numeric(5,1)` |                                  | F/B ratio               |
| `beamwidth_deg`       | `numeric(5,1)` |                                  | 3 dB beamwidth          |
| `polarization`        | `text`         | NOT NULL, default `'horizontal'` | Polarization type       |
| `mounting`            | `text`         | NOT NULL, default `'mast'`       | Mounting type           |
| `feedpoint_impedance` | `integer`      | default 50                       | Impedance in ohms       |
| `swr_by_band`         | `jsonb`        |                                  | Per-band SWR readings   |
| `installation_date`   | `date`         |                                  | Installation date       |
| `is_portable`         | `boolean`      | default `false`                  | Portable flag           |
| `radial_count`        | `integer`      |                                  | Number of radials       |
| `radial_length_value` | `numeric(8,2)` |                                  | Radial length           |
| `radial_length_unit`  | `text`         |                                  | "ft" or "m"             |
| `notes`               | `text`         |                                  | Freeform notes          |

RLS: users can only read/write their own rows. Public read access when user has sharing enabled (checked via `user_profiles.sharing_enabled`).

#### `feedlines`

| Column              | Type           | Constraints                 | Description               |
| ------------------- | -------------- | --------------------------- | ------------------------- |
| `id`                | `uuid`         | PK                          | Unique identifier         |
| `user_id`           | `uuid`         | FK `auth.users`, NOT NULL   | Owner                     |
| `name`              | `text`         | NOT NULL                    | User-defined name         |
| `feedline_type`     | `text`         | NOT NULL                    | From FeedlineType enum    |
| `length_value`      | `numeric(8,2)` | NOT NULL                    | Length                    |
| `length_unit`       | `text`         | NOT NULL, default `'ft'`    | "ft" or "m"               |
| `connector_type`    | `text`         | NOT NULL, default `'PL259'` | Connector type            |
| `connector_count`   | `integer`      | NOT NULL, default 1         | Number of connector pairs |
| `manufacturer`      | `text`         |                             | Cable manufacturer        |
| `installation_date` | `date`         |                             | Installation date         |
| `condition_rating`  | `text`         | default `'good'`            | Condition assessment      |
| `is_portable`       | `boolean`      | default `false`             | Portable flag             |
| `notes`             | `text`         |                             | Freeform notes            |

#### `accessories`

Polymorphic table using a `category` discriminator column. Category-specific fields are stored in a `specs` JSONB column.

| Column         | Type     | Constraints               | Description                                                           |
| -------------- | -------- | ------------------------- | --------------------------------------------------------------------- |
| `id`           | `uuid`   | PK                        | Unique identifier                                                     |
| `user_id`      | `uuid`   | FK `auth.users`, NOT NULL | Owner                                                                 |
| `category`     | `text`   | NOT NULL                  | "amplifier", "tuner", "filter", "switch", "power_supply", "grounding" |
| `name`         | `text`   | NOT NULL                  | User-defined name                                                     |
| `manufacturer` | `text`   |                           | Manufacturer                                                          |
| `model_number` | `text`   |                           | Model number                                                          |
| `bands`        | `text[]` |                           | Supported bands (where applicable)                                    |
| `specs`        | `jsonb`  | NOT NULL, default `'{}'`  | Category-specific fields (see section 5.5)                            |
| `notes`        | `text`   |                           | Freeform notes                                                        |

Index: `(user_id, category)`.

The `specs` JSONB structure varies by category:

- **amplifier**: `{ maxPowerOutput, drivePowerMin, drivePowerMax, gainDb, dutyCycle, tubeType, isSolidState, inputImpedance }`
- **tuner**: `{ tunerType, maxPower, insertionLoss }`
- **filter**: `{ filterType, insertionLoss }`
- **switch**: `{ portCount, insertionLoss }`
- **power_supply**: `{ voltage, maxCurrent, isBatteryBackup }`
- **grounding**: `{ groundRodCount, groundRodLength }`

#### `station_presets`

| Column                  | Type      | Constraints                | Description                                  |
| ----------------------- | --------- | -------------------------- | -------------------------------------------- |
| `id`                    | `uuid`    | PK                         | Unique identifier                            |
| `user_id`               | `uuid`    | FK `auth.users`, NOT NULL  | Owner                                        |
| `name`                  | `text`    | NOT NULL                   | Preset name                                  |
| `description`           | `text`    |                            | One-line description                         |
| `radio_id`              | `uuid`    | FK `user_radios`, NOT NULL | Radio in this preset                         |
| `antenna_id`            | `uuid`    | FK `antennas`, NOT NULL    | Antenna in this preset                       |
| `feedline_id`           | `uuid`    | FK `feedlines`, NOT NULL   | Feedline in this preset                      |
| `accessory_chain`       | `jsonb`   | default `'[]'`             | Ordered array of `{ accessoryId, position }` |
| `operating_power_watts` | `integer` |                            | TX power override                            |
| `location_id`           | `text`    |                            | Reference to OperatingLocation ID            |
| `is_portable`           | `boolean` | default `false`            | Portable flag                                |
| `icon`                  | `text`    |                            | Emoji or icon identifier                     |
| `is_active`             | `boolean` | default `false`            | Whether this is the active preset            |
| `sort_order`            | `integer` | default 0                  | Display order                                |

Constraint: only one row per `user_id` can have `is_active = true` (enforced via partial unique index or application logic with a trigger).

Index: `(user_id, is_active)` where `is_active = true`.

#### `shack_photos`

| Column           | Type      | Constraints               | Description                             |
| ---------------- | --------- | ------------------------- | --------------------------------------- |
| `id`             | `uuid`    | PK                        | Unique identifier                       |
| `user_id`        | `uuid`    | FK `auth.users`, NOT NULL | Owner                                   |
| `storage_path`   | `text`    | NOT NULL                  | Path in Supabase Storage                |
| `caption`        | `text`    |                           | Photo caption                           |
| `date_taken`     | `date`    |                           | Date photo was taken                    |
| `equipment_tags` | `uuid[]`  |                           | Array of equipment IDs this photo shows |
| `is_public`      | `boolean` | default `false`           | Visible on public shack page            |
| `sort_order`     | `integer` | default 0                 | Display order in gallery                |

### 6.2 Supabase Storage

Bucket: `shack-photos`

- Path pattern: `{userId}/{photoId}.jpg`
- Maximum file size: 10 MB (pre-compression), 1 MB (post-compression, enforced client-side)
- Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`
- RLS: owner can read/write; public read when `shack_photos.is_public = true`

### 6.3 Real-Time Sync

Supabase Realtime subscriptions on:

- `user_radios`: sync radio collection changes across devices
- `antennas`: sync antenna inventory
- `feedlines`: sync feedline inventory
- `accessories`: sync accessory inventory
- `station_presets`: sync preset changes and active preset switching

The client maintains optimistic updates via Zustand with rollback on sync failure. The sync layer uses Supabase's `postgres_changes` channel with `INSERT`, `UPDATE`, `DELETE` event filters scoped to the authenticated user's ID.

### 6.4 Migration from IndexedDB

The migration from the current `userStore.preferences` to Supabase is performed as a one-time operation on first login after the Shack Builder feature ships:

1. Read existing data from Zustand/IndexedDB:
   - `preferences.radios` (array of `UserRadio`)
   - `preferences.customRadios` (array of `RadioEquipment`)
   - `preferences.activeRadioId`
   - `preferences.antennaType`

2. For each `UserRadio`, create a row in `user_radios`:
   - Map `equipmentId` to `radio_equipment.id` (Sherwood database IDs must be consistent between IndexedDB and Supabase)
   - For custom radios, store the full equipment object in `custom_equipment`
   - Copy all instance metadata (nickname, purchase date, firmware, etc.)

3. Create a default antenna entry based on the existing `antennaType` preference:
   - Type from the enum, name generated as "My [type name]"
   - Height defaulting to 35ft (reasonable default for a first-time setup)
   - Bands set to the active radio's bands

4. Create a default feedline entry:
   - RG-213, 50ft (reasonable default)
   - PL-259 connectors, 1 connector pair

5. Create a default station preset linking the active radio, default antenna, and default feedline

6. Mark the active radio's preset as active

7. Write a migration flag to prevent re-running

8. Remove the migrated data from IndexedDB preferences (or leave it as a fallback with a deprecation flag)

The migration runs in a background task after authentication. If the user is not authenticated (using Propulse in offline/local mode), the migration is deferred. The existing IndexedDB data continues to work with the current RadioManager until migration completes.

---

## 7. UI/UX Design

### 7.1 Layout Structure

The `/shack` route uses a tab-based layout within the standard `AppLayout`:

| Tab             | Content                                                                               |
| --------------- | ------------------------------------------------------------------------------------- |
| **Overview**    | Dashboard with signal chain diagram, band capability, health indicators (section 5.1) |
| **Radios**      | Card grid of radio fleet with database browser and comparison (section 5.2)           |
| **Antennas**    | Card grid of antenna inventory with pattern visualization (section 5.3)               |
| **Feedlines**   | Card grid of feedlines with loss calculator (section 5.4)                             |
| **Accessories** | Card grid of amplifiers, tuners, filters, etc. (section 5.5)                          |
| **Presets**     | Preset list with builder and comparison (section 5.6)                                 |
| **Performance** | Per-band matrix, waterfall, upgrade advisor (section 5.7)                             |
| **Photos**      | Photo gallery with upload, tagging, sharing (section 5.8)                             |
| **Timeline**    | Equipment acquisition timeline (section 5.9)                                          |

Tabs scroll horizontally on mobile. The Overview tab is the default landing.

### 7.2 Card Design System

All equipment cards follow a consistent design:

```
┌─────────────────────────────────┐
│ [Icon]  Equipment Name          │ ← Header row
│         Manufacturer Model      │
├─────────────────────────────────┤
│ Key Spec 1  │  Key Spec 2       │ ← Specs row (2-3 columns)
│ Key Spec 3  │  Key Spec 4       │
├─────────────────────────────────┤
│ Status indicators / badges      │ ← Footer row
│            [Actions ...]        │
└─────────────────────────────────┘
```

- Background: `bg-void-black` with `border border-gray-700/50`
- Hover: `hover:border-plasma-orange/50` transition
- Active/selected: `border-plasma-orange ring-1 ring-plasma-orange/30`
- Header text: `text-white font-semibold` for name, `text-gray-400 text-sm` for manufacturer
- Spec values: `text-gray-200 font-mono text-sm`
- Spec labels: `text-gray-500 text-xs uppercase tracking-wider`

### 7.3 Signal Chain Diagram

The SVG-based signal chain diagram follows Propulse's visual language:

- Equipment blocks: rounded rectangles with `fill: void-black`, `stroke: gray-700`, `rx: 8`
- Active block highlight: `stroke: plasma-orange`, `stroke-width: 2`
- Connection lines: `stroke: gray-500`, `stroke-width: 2`, with arrowhead markers
- Loss annotation on lines: red text showing dB loss
- Gain annotation on blocks: green text showing dB gain
- Block icons: simplified SVG glyphs in `fill: gray-400`, transitioning to `fill: plasma-orange` on hover

The diagram is rendered using React SVG components (not a canvas library) for accessibility and interaction handling. Each block is a clickable `<g>` element with appropriate ARIA labels.

### 7.4 Color Semantics

Consistent with the existing Propulse design system:

| Semantic              | Color         | Tailwind Class       | Usage                                          |
| --------------------- | ------------- | -------------------- | ---------------------------------------------- |
| Good/gain             | Signal green  | `text-signal-green`  | Positive dB gain, good SWR, healthy equipment  |
| Warning/moderate loss | Caution amber | `text-caution-amber` | 3-6 dB loss, SWR 2:1-3:1                       |
| Bad/high loss         | Alert red     | `text-alert-red`     | >6 dB loss, SWR >3:1, equipment issues         |
| Accent/active         | Plasma orange | `text-plasma-orange` | Active preset, selected equipment, CTA buttons |
| Neutral               | Gray-400      | `text-gray-400`      | Inactive equipment, labels, descriptions       |
| Background            | Void black    | `bg-void-black`      | Cards, panels, page background                 |
| Surface               | Panel         | `bg-panel`           | Elevated surfaces, modals                      |

### 7.5 Drag and Drop

The station preset builder uses drag-and-drop for:

- Reordering accessories in the signal chain
- Adding equipment from the sidebar to the chain workspace

Implementation uses `@dnd-kit/core` (already a common choice in React ecosystems, lightweight, accessible). Drag handles are visible grip icons on each equipment block. Drop zones highlight with a `border-dashed border-plasma-orange` indicator.

### 7.6 Form Design

Equipment entry forms follow a consistent pattern:

- Grouped fieldsets with clear section headers
- Required fields marked with `*` and orange left border
- Optional fields in collapsible "Advanced" sections
- Inline validation with error messages below fields in `text-alert-red text-xs`
- Number inputs with unit selectors (ft/m, dB, watts) as integrated suffix elements
- Multi-select for bands uses the existing band pill component from the app
- Save button disabled until all required fields are valid
- Cancel button with confirmation if form has unsaved changes

---

## 8. Mobile Experience

### 8.1 Responsive Layout

The Shack page adapts to mobile viewports (< 768px):

- **Tab bar**: Horizontal scrollable strip at the top, icons only on narrow screens with labels appearing on scroll-stop
- **Card grid**: Single column, full-width cards
- **Signal chain diagram**: Vertical layout (top to bottom instead of left to right) to fit narrow screens
- **Performance table**: Horizontal scroll with sticky first column (band names)
- **Forms**: Full-screen modal sheets sliding up from the bottom
- **Photo gallery**: Full-bleed single-column with edge-to-edge images

### 8.2 Quick Preset Switching

A floating action button (FAB) in the bottom-right corner of any Propulse page shows the active preset icon. Tapping it opens a bottom sheet listing all presets with one-tap switching. This provides fast preset switching during field operations without navigating to `/shack`.

### 8.3 Portable Mode

When a portable station preset is active, the Shack overview simplifies to show:

- Active preset name and signal chain summary (text, not diagram)
- Per-band quick reference: a compact pill strip showing TX power at antenna for each covered band
- One-tap access to change operating power (QRP/QRO toggle)
- Large "Switch Preset" button for easy transitions between field configurations

### 8.4 Camera Integration

The photo gallery upload button on mobile triggers the device camera picker (via standard `<input type="file" accept="image/*" capture="environment">`), allowing direct photo capture. EXIF data is read for date and GPS coordinates (GPS data is stripped before upload for privacy; only the date is retained).

### 8.5 Touch Interactions

- Card tap: opens detail view
- Card long-press: opens action menu (edit, delete, compare)
- Swipe left on card: reveals delete button
- Pull-to-refresh on equipment lists: triggers Supabase re-sync
- Pinch-to-zoom on antenna pattern plots and signal chain diagrams

---

## 9. Integration Points

### 9.1 DX Wizard Integration

The DX Wizard (`src/pages/DXWizard.tsx`) currently reads:

- `antennaType` from `useUserStore(s => s.preferences.antennaType ?? "isotropic")`
- Active radio for TX power reference
- Calls `getAntennaGainForPath(antennaType, distanceKm)` for propagation calculations

With Shack Builder, the DX Wizard will instead:

1. Read the active station preset from the shack store
2. Compute effective TX power at antenna: `presetTxPower - totalFeedlineLoss - accessoryLoss`
3. Use the preset's antenna type and height for gain calculation: `getAntennaGainForPath(preset.antenna.type, distanceKm, preset.antenna.heightAgl)`
4. For directional antennas, factor in the azimuth relative to the target bearing to compute actual gain in the direction of the DX target
5. Pass the system noise figure (including feedline contribution) to `calculateExpectedSNR()` as an additional noise term

The integration is via a new `useActiveStationPerformance(bandId)` hook that returns:

```typescript
{
  txPowerAtAntennaWatts: number;
  antennaGainDbi: number; // for the target direction/elevation
  systemNoiseFigureDb: number;
  feedlineLossDb: number;
  totalSystemLossDb: number;
  isDirectional: boolean;
  antennaAzimuth: number | null;
}
```

Fallback: if no station preset is configured, the hook returns values derived from the legacy `antennaType` and `activeRadioId` preferences, preserving backward compatibility.

### 9.2 Band Planner Integration

The Band Planner currently shows per-band propagation conditions. With Shack Builder integration:

- Each band row gains a "Station capability" indicator showing whether the active preset covers that band
- Bands not covered by the active antenna are visually dimmed
- The TX power column shows effective power at antenna (after losses) rather than raw radio power
- A "Change preset" link in the header allows quick switching without leaving the planner

### 9.3 Contest Engine Integration

- **Cabrillo header**: The contest export auto-fills station info from the active preset:
  - `CATEGORY-TRANSMITTER`: derived from preset (e.g., "ONE" for single radio)
  - `CATEGORY-POWER`: computed from effective radiated power or operating power setting
  - `SOAPBOX`: auto-generated station description (e.g., "K3 + AL-1500, 3el Yagi @ 60ft, LMR-400")
- **Contest class auto-detection**: If the preset has an amplifier, suggest "HIGH POWER"; if operating power is <= 100W without amplifier, suggest "LOW POWER"; if <= 5W, suggest "QRP"

### 9.4 Bridge / CAT Integration

When the Propulse Bridge is connected and controlling a radio via Hamlib:

- The connected radio's card in the Shack shows a live "Connected" status badge with a green pulsing dot
- Bridge frequency/mode data can be displayed on the radio detail view
- If the bridge-connected radio matches the active preset's radio, the Shack dashboard shows a "LIVE" indicator on the signal chain diagram
- Future: bridge-reported SWR data from the tuner could auto-populate the antenna's `swrByBand` field (marked as stretch goal, not in initial release)

### 9.5 Profile Page Integration

The user profile page gains a "Station" summary card showing:

- Active preset name and one-line signal chain summary
- Total bands covered
- Max ERP
- Receiver quality score
- Link to full Shack page

This card is visible on the public profile when sharing is enabled.

### 9.6 Logbook Integration

QSO entries in the logbook auto-tag with station information from the active preset at the time of logging:

- Radio model and nickname
- Antenna name and type
- Estimated TX power at antenna for that band
- This metadata is stored with the QSO record for historical reference (the station you used for each contact)

---

## 10. Supabase Requirements

### 10.1 Database Setup

**Tables**: `radio_equipment`, `user_radios`, `antennas`, `feedlines`, `accessories`, `station_presets`, `shack_photos` (as defined in section 6.1).

**Migrations**: Sequential migration files:

1. `001_create_radio_equipment.sql` — reference database table + seed data from Sherwood database
2. `002_create_user_radios.sql` — user radio instances
3. `003_create_antennas.sql` — antenna inventory
4. `004_create_feedlines.sql` — feedline inventory
5. `005_create_accessories.sql` — accessories (polymorphic)
6. `006_create_station_presets.sql` — named configurations
7. `007_create_shack_photos.sql` — photo metadata
8. `008_create_indexes.sql` — performance indexes
9. `009_create_rls_policies.sql` — row-level security policies

### 10.2 Row-Level Security Policies

Every user-owned table enforces:

```sql
-- Users can only see their own data
CREATE POLICY "Users can view own data" ON user_radios
  FOR SELECT USING (auth.uid() = user_id);

-- Users can only insert their own data
CREATE POLICY "Users can insert own data" ON user_radios
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can only update their own data
CREATE POLICY "Users can update own data" ON user_radios
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can only delete their own data
CREATE POLICY "Users can delete own data" ON user_radios
  FOR DELETE USING (auth.uid() = user_id);
```

For public shack pages, `antennas` and `station_presets` have additional read policies:

```sql
-- Anyone can view equipment for users who have sharing enabled
CREATE POLICY "Public can view shared shacks" ON antennas
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = antennas.user_id
      AND user_profiles.shack_sharing_enabled = true
    )
  );
```

The `radio_equipment` reference table has public read access for all authenticated users.

### 10.3 Storage Bucket

```sql
-- Create storage bucket for shack photos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'shack-photos',
  'shack-photos',
  true,  -- publicly accessible for shared photos
  10485760,  -- 10 MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp']
);
```

Storage policies:

- Upload: authenticated users can upload to their own folder (`shack-photos/{userId}/*`)
- Read: public read for files belonging to users with sharing enabled; owner always has read access
- Delete: only the owner can delete their photos

### 10.4 Real-Time Configuration

Enable Realtime for the user-facing tables:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE user_radios;
ALTER PUBLICATION supabase_realtime ADD TABLE antennas;
ALTER PUBLICATION supabase_realtime ADD TABLE feedlines;
ALTER PUBLICATION supabase_realtime ADD TABLE accessories;
ALTER PUBLICATION supabase_realtime ADD TABLE station_presets;
```

The client subscribes to changes filtered by `user_id`:

```typescript
supabase
  .channel("shack-sync")
  .on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "user_radios",
      filter: `user_id=eq.${userId}`,
    },
    handleRadioChange,
  )
  .on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "station_presets",
      filter: `user_id=eq.${userId}`,
    },
    handlePresetChange,
  )
  // ... etc for all tables
  .subscribe();
```

### 10.5 Edge Functions

Feedline loss calculations run entirely client-side (no edge function needed — the loss tables and interpolation are lightweight computation). Edge functions are used for:

- **`generate-share-card`**: Server-side PNG generation for the share card (using `satori` + `resvg`). Accepts a preset ID, fetches equipment data, renders the card template, returns a PNG.
- **`export-equipment-pdf`**: Server-side PDF generation for insurance documentation (using `@react-pdf/renderer` or equivalent). Accepts a user ID, fetches all equipment, renders a formatted document, returns a PDF.

These edge functions are Vercel Edge Functions (consistent with the existing `/api/*` proxy pattern), not Supabase Edge Functions, to keep the deployment unified.

---

## 11. Feedline Loss Calculation — Implementation Details

### 11.1 Data Structure

```typescript
interface FeedlineLossSpec {
  /** Feedline type identifier */
  type: FeedlineType;
  /** Display name */
  name: string;
  /** Nominal impedance in ohms */
  impedanceOhms: number;
  /** Velocity factor (0-1) */
  velocityFactor: number;
  /** Loss data points: [frequencyMHz, dBPer100ft] */
  lossTable: [number, number][];
  /** Fitted coefficients for sqrt(f) model: loss = A*sqrt(f) + B*f */
  coeffA: number;
  coeffB: number;
}
```

### 11.2 Interpolation Model

Coaxial cable loss follows the relationship:

```
alpha(f) = alpha_c * sqrt(f) + alpha_d * f
```

Where `alpha_c` is the conductor loss coefficient (skin effect, proportional to sqrt(f)) and `alpha_d` is the dielectric loss coefficient (proportional to f).

For each feedline type, `coeffA` and `coeffB` are determined by least-squares regression on the tabulated loss data. This provides smooth interpolation at any frequency and reasonable extrapolation slightly beyond the tabulated range.

### 11.3 Computation Functions

```typescript
/**
 * Calculate matched-line loss for a feedline at a given frequency
 * @param type - Feedline type
 * @param frequencyMHz - Operating frequency
 * @param lengthFeet - Total feedline length in feet
 * @returns Loss in dB
 */
function calculateFeedlineLoss(
  type: FeedlineType,
  frequencyMHz: number,
  lengthFeet: number,
): number;

/**
 * Calculate additional loss due to SWR mismatch
 * Uses the exact formula accounting for standing waves on a lossy line
 * @param matchedLossDb - Matched-line loss in dB
 * @param swr - Standing wave ratio (>= 1.0)
 * @returns Additional loss in dB beyond matched-line loss
 */
function calculateMismatchLoss(matchedLossDb: number, swr: number): number;

/**
 * Calculate total feedline system loss including connectors and mismatch
 * @param feedline - Feedline inventory item
 * @param frequencyMHz - Operating frequency
 * @param swr - Antenna SWR at this frequency (default 1.5)
 * @returns Total loss in dB
 */
function calculateTotalFeedlineLoss(
  feedline: FeedlineInventoryItem,
  frequencyMHz: number,
  swr?: number,
): number;
```

### 11.4 Validation Against Published Data

The implementation must be validated against the tabulated manufacturer data. For each feedline type and each frequency in the loss table, the computed loss from the `coeffA * sqrt(f) + coeffB * f` model must be within 0.1 dB/100ft of the tabulated value. This is verified by an automated validation function that runs during the build or as a utility test.

### 11.5 Mismatch Loss Formula

The exact additional loss from SWR mismatch on a lossy transmission line is:

```
Let:
  rho = (SWR - 1) / (SWR + 1)          // reflection coefficient magnitude
  alpha_l = matchedLossDb * ln(10) / 20  // matched loss in nepers
  e2a = exp(2 * alpha_l)                 // round-trip attenuation factor

totalLossDb = matchedLossDb + 10 * log10((e2a - rho^2) / (e2a * (1 - rho^2)))
additionalLossDb = totalLossDb - matchedLossDb
```

This formula accounts for the interaction between standing waves and line loss — higher matched-line loss actually reduces the effect of SWR because the reflected wave is attenuated more. A low-loss line like ladder line with a high SWR may have less total additional loss than a lossy coax with a moderate SWR.

---

## 12. Accessibility, Security, and Performance

### 12.1 Accessibility (WCAG 2.1 AA)

**Forms and inputs**:

- All form fields have associated `<label>` elements with `htmlFor` binding
- Required fields are marked with both visual indicator (`*`) and `aria-required="true"`
- Error messages are linked to fields via `aria-describedby`
- Form validation errors are announced via `aria-live="polite"` region
- Number inputs include unit labels readable by screen readers (e.g., "Feedline length in feet")

**Signal chain diagram**:

- Each SVG block has `role="img"` and `aria-label` describing the equipment (e.g., "Radio: Icom IC-7300, 100 watts")
- Connection lines have `aria-hidden="true"` (decorative)
- A text-based alternative representation is available: an ordered list of equipment in the chain with gain/loss values, accessible via a "Text view" toggle

**Color and contrast**:

- All color-coded indicators (green/amber/red) also include text labels or icons (checkmark, warning triangle, X)
- Color contrast ratios meet 4.5:1 for normal text, 3:1 for large text against the `void-black` background
- The existing `colorBlindMode` preference from `UserPreferences` applies to Shack Builder color coding

**Keyboard navigation**:

- Card grids are navigable with arrow keys (managed focus)
- Tab key moves between interactive elements in logical order
- Equipment detail views can be opened with Enter and closed with Escape
- Drag-and-drop has a keyboard alternative: select with Space, move with arrow keys, drop with Space

**Screen reader announcements**:

- Preset activation announces the new preset name and key metrics
- Performance calculations announce results when updated
- Photo uploads announce progress and completion

### 12.2 Security

**Data privacy**:

- Purchase prices are never included in public shack pages, share cards, or export CSVs
- Serial numbers are never included in public views
- Photo EXIF GPS data is stripped client-side before upload
- Wiring configuration and firmware notes are private-only fields

**Storage security**:

- Supabase Storage bucket uses RLS policies; direct URL access to photos requires the photo to be marked public or the requester to be the owner
- Photo filenames are UUIDs, not user-identifiable
- Upload endpoint validates MIME type server-side in addition to client-side checks

**Input validation**:

- All text inputs are sanitized on display (React's default JSX escaping handles XSS)
- Number inputs are validated to prevent NaN, Infinity, and extreme values
- Band arrays are validated against the known `BandId` enum
- Equipment references (foreign keys) are validated server-side via Supabase constraints

**Rate limiting**:

- Photo uploads limited to 5 per minute per user (enforced via edge function middleware)
- Share card generation limited to 10 per hour per user
- PDF export limited to 5 per hour per user

### 12.3 Performance

**Data loading**:

- Equipment data is fetched on first visit to `/shack` and cached in Zustand
- Subsequent navigations use the Zustand cache with background refresh via Supabase Realtime
- The Sherwood database (radio_equipment table) is fetched with a 24-hour TanStack Query cache (it changes infrequently)
- Lazy load photo thumbnails using `loading="lazy"` on `<img>` tags

**Computation**:

- Feedline loss calculations are memoized per (feedline type, frequency, length) tuple using `useMemo`
- Per-band capability matrix is computed once when the preset or equipment changes, not on every render
- Antenna pattern plots use `requestAnimationFrame` for smooth rendering on canvas
- The upgrade advisor runs as a deferred computation (`requestIdleCallback`) since it simulates multiple scenarios

**Bundle size**:

- The Shack Builder route is code-split (`React.lazy`) so it does not affect initial page load
- The feedline loss table data (~2 KB) is included in the Shack Builder chunk
- Antenna pattern functions are already in the main bundle (existing `antennas.ts`); no additional size
- Photo compression library (browser-image-compression or similar) is loaded on demand when the gallery tab is visited

**Image optimization**:

- Client-side compression before upload (target: JPEG 85%, max 2048px)
- Supabase Storage serves images with caching headers (1 hour for public, no-cache for private)
- Gallery thumbnails use Supabase image transformation (resize to 400px width on-the-fly) if available, otherwise client-side resize on display

**Offline resilience**:

- Equipment data cached in Zustand persists across page reloads (existing IndexedDB persistence middleware)
- If Supabase is unreachable, the Shack page renders from the local cache with a "Sync pending" indicator
- New equipment additions while offline are queued and synced when connectivity returns (optimistic local-first pattern)

---

## 13. Phased Delivery Plan

No timelines. Each phase produces a shippable increment.

### Phase 0 — Data Model & Supabase Foundation

**Dependencies**: Supabase project configured with auth

**Deliverables**:

- Supabase migration files for all tables (section 6.1)
- RLS policies for all tables
- Storage bucket configuration
- TypeScript types for all new entities (`Antenna`, `Feedline`, `Accessory`, `StationPreset`, etc.)
- Feedline loss calculation engine with published spec data and validation
- `useShackStore` Zustand store with CRUD operations for all entity types
- Supabase client integration for data persistence
- Migration utility for IndexedDB-to-Supabase data transfer

**Done when**:

- All Supabase tables exist with correct schemas and RLS policies
- Feedline loss calculations match published specs within 0.1 dB tolerance
- Equipment types compile and match the Supabase schema
- CRUD operations work against Supabase from the client

### Phase 1 — Radio Fleet & Antenna Inventory UI

**Dependencies**: Phase 0

**Deliverables**:

- `/shack` route with tab navigation
- Radio fleet card grid (graduated from RadioManager)
- Sherwood database browser (improved UX)
- Antenna inventory card grid with creation form
- Antenna pattern visualization (canvas-based polar plot)
- Feedline inventory card grid with creation form

**Done when**:

- Users can browse, add, edit, and remove radios from the Shack page
- Users can create antenna entries with full metadata
- Antenna pattern plots render correctly for all supported types
- Users can create feedline entries with type and length
- All data persists to Supabase

### Phase 2 — Station Presets & Signal Chain

**Dependencies**: Phase 1

**Deliverables**:

- Accessory inventory (amplifiers, tuners, filters, switches)
- Station preset builder with drag-and-drop
- Signal chain diagram (SVG)
- Preset activation and one-click switching
- Per-band capability computation

**Done when**:

- Users can create complete station presets linking radio + antenna + feedline + accessories
- The signal chain diagram renders with correct gain/loss annotations
- Switching presets updates the active configuration across the app
- Per-band capability matrix shows accurate computed values

### Phase 3 — Performance Dashboard & DX Wizard Integration

**Dependencies**: Phase 2

**Deliverables**:

- Performance dashboard with per-band capability matrix
- Signal chain waterfall visualization
- Upgrade advisor engine
- `useActiveStationPerformance()` hook
- DX Wizard integration (replaces `antennaType` with preset-based calculations)
- Band Planner integration (capability indicators per band)

**Done when**:

- Performance dashboard shows accurate per-band metrics derived from the signal chain
- DX Wizard propagation predictions use actual station equipment data
- Upgrade advisor produces sensible suggestions based on the operator's equipment
- Switching presets updates DX Wizard and Band Planner in real time

### Phase 4 — Sharing, Photos & Polish

**Dependencies**: Phase 2

**Deliverables**:

- Photo gallery with upload, tagging, compression
- Equipment timeline view
- Public shack page (`/shack/{callsign}`)
- QR code generation
- Share card PNG generation
- Equipment list CSV/PDF export
- Shack comparison feature
- Contest Cabrillo integration
- Logbook QSO station tagging

**Done when**:

- Photos upload and display correctly with equipment tags
- Public shack pages are accessible by callsign
- Share cards generate correctly and are shareable
- Equipment exports produce usable CSV and PDF files
- Contest exports include station information from active preset

### Phase 5 — Mobile Optimization & Real-Time Sync

**Dependencies**: Phase 3

**Deliverables**:

- Mobile-responsive layout for all Shack tabs
- Portable mode simplified view
- FAB preset switcher
- Real-time Supabase sync across devices
- Offline resilience with sync queue
- Camera integration for photo upload
- Touch-optimized interactions

**Done when**:

- The Shack page is fully usable on a phone
- Changing equipment on one device reflects on another within seconds
- Offline equipment changes sync correctly when connectivity returns
- Portable mode provides a streamlined field operation view

---

## 14. Open Questions

1. **Height-dependent antenna patterns**: The current `getGain(elevationDeg)` functions in `antennas.ts` do not account for antenna height above ground (height affects the ground reflection component of the pattern). Should we extend the gain functions to accept height-in-wavelengths and compute the image antenna pattern, or rely on user-entered gain overrides for height correction?

2. **Directional antenna gain toward DX target**: For Yagi/hex beam antennas with known azimuth and beamwidth, the DX Wizard should compute the off-axis gain reduction toward the target. This requires a horizontal pattern model. Should we use a simple cosine-power approximation (`gain * cos^n(theta)` where n is derived from beamwidth), or implement more detailed horizontal patterns per antenna type?

3. **Balanced line loss under mismatch**: Ladder line and window line loss tables represent matched-line conditions. Under high SWR (common with multi-band use of balanced feedlines), the loss increases but remains lower than coax. Should we implement a balanced-line mismatch loss model, or note this as a known simplification?

4. **Sherwood database sync**: The Sherwood Engineering database is updated periodically. Should `radio_equipment` be seeded once and manually updated, or should we build an automated sync from the Sherwood data source?

5. **Bridge SWR auto-population**: The bridge protocol could potentially report SWR data from antenna tuners. Should this be a stretch goal within Phase 5, or deferred entirely to a future bridge protocol extension?

6. **Equipment de-duplication on migration**: If a user has the same radio in IndexedDB and then creates it again in the Supabase-backed interface (e.g., during the migration transition period), how do we handle deduplication? By equipment ID match, or by (manufacturer + model + serialNumber) uniqueness?

7. **Photo storage costs**: Supabase Storage is metered. Should we implement a photo count limit (20 suggested in section 5.8.1) or a total storage quota per user? What is the expected cost at scale?

---

## 15. Appendix: Antenna Gain Pattern Extension Plan

The existing `antennas.ts` file defines gain functions for 8 antenna types. Shack Builder requires patterns for approximately 15 additional types. The approach for each new type:

1. **Literature survey**: Find published NEC-2/NEC-4 simulation data for the antenna type at typical ham radio installation heights
2. **Analytical model**: Derive a parametric gain function `f(elevation, heightWavelengths)` that fits the simulation data within 1 dB
3. **Calibration**: Verify the analytical model against at least 3 independent sources (ARRL Antenna Book, antenna manufacturer specs, published NEC runs)
4. **Implementation**: Add the gain function to `antennas.ts` following the existing pattern (`clampElevation`, return dBi, maximum -30 dBi floor)

Priority order for new antenna patterns (based on popularity in the amateur radio community):

1. EFHW (extremely popular for portable and stealth installations)
2. OCF Dipole (popular multi-band wire antenna)
3. Magnetic Loop (popular for restricted spaces)
4. Moxon (popular compact directional)
5. Log Periodic (popular broadband directional)
6. Quad (popular contest antenna)
7. Ground Plane (common for VHF/UHF)
8. Fan Dipole (common multi-band wire)
9. Trap Dipole (common multi-band wire)
10. Beverage (specialized receiving antenna)
11. Rhombic (specialized high-gain)
12. SteppIR (modeled as a frequency-optimized Yagi)
13. Wire Antenna (generic low-gain omnidirectional)
14. Full-Wave Loop (common wire antenna)
15. Dish/Parabolic (VHF/UHF only)

Each pattern function follows the existing signature: `(elevationDeg: number) => number` returning gain in dBi. Height adjustment is handled by a wrapper function that modifies the ground reflection factor based on height in wavelengths.
