# Implementation Plan: SDR, Receive-Only & Operator Tags Schema

Created: 2026-02-11
Status: PENDING APPROVAL

## Summary

Extend the Propulse equipment and profile schema to support the full spectrum of radio hobbyists — not just licensed HF transceivers operators, but SDR enthusiasts, shortwave listeners, scanner hobbyists, WebSDR-only users, and computer-based tinkerers who may never own physical radio hardware. This includes new equipment types, operator capability tags, interest/activity tags, and a "frequency interests" system for monitoring-focused operators.

## Scope

### In Scope

1. **New equipment category: SDR** — software-defined radio hardware with associated software
2. **New equipment category: Receiver** — scanners, wideband receivers, dedicated SWL radios
3. **Operator capability model** — transmit, receive-only, both, or computer-only (WebSDR/KiwiSDR)
4. **Operator interest tags** — curated + custom tags for what someone is "into"
5. **Frequency interests** — bands/services monitored, modes decoded (for listeners)
6. **"Where I hang out"** — favorite frequencies, nets, WebSDR instances
7. **VHF/UHF vs HF** distinction surfaced in equipment and interests
8. **Schema design document** — comprehensive markdown reference in `docs/`

### Out of Scope

- UI implementation (separate follow-up)
- Supabase migration scripts (separate follow-up)
- Profile page redesign (separate brainstorm already in progress)
- Changes to the signal prediction engine
- Changes to the contest system

## Implementation Phases

### Phase 1: Schema Design Document

**Objective**: Write the comprehensive design doc covering all schema additions.

**Single Task**: Write `docs/designs/sdr-receive-only-schema.md`

**Deliverable**: One markdown file documenting every type addition, every new field, migration notes, and rationale.

---

## Schema Design — Full Specification

### 1. Operator Capability Model

**Problem**: The system currently assumes every user is a licensed transmitting amateur. There is no way to represent:

- A shortwave listener (SWL) who only receives
- A scanner hobbyist monitoring public safety
- Someone who exclusively uses WebSDR/KiwiSDR from their browser
- A tinkerer who builds SDR projects but doesn't transmit

**Solution**: Add an `operatorType` field to the profile identity model.

#### New type: `OperatorType`

```typescript
export type OperatorType =
  | "transceiver" // Licensed, transmits and receives (current default)
  | "receive_only" // Has physical receive hardware but no TX capability
  | "computer_only" // WebSDR, KiwiSDR, remote SDR — no local hardware
  | "both"; // Transmits AND does significant SWL/monitoring
```

**Where it lives**: `UserStation` in `src/types/user.ts`

```typescript
export interface UserStation {
  // ... existing fields ...
  operatorType?: OperatorType; // defaults to "transceiver" for existing users
}
```

**Supabase**: New column `operator_type: text` on `profiles` table, nullable, defaults to `"transceiver"`.

**Impact on existing features**:

- Signal prediction: `operatorType === "receive_only" | "computer_only"` skips TX power calculations
- Regulatory checks: receive-only operators bypass TX privilege validation
- Equipment forms: receive-only hides TX-specific fields (max power, TX IMD, etc.)
- Profile display: shows "SWL" or "Monitoring Station" badge instead of license class when receive-only

#### New `LicenseClass` values

Add to the existing `LicenseClass` union:

```typescript
| "SWL"           // Shortwave listener (no TX privileges)
| "UNLICENSED"    // No license — monitoring/scanning only
```

These already work with the `(string & {})` escape hatch but should be explicit first-class values.

---

### 2. SDR Equipment Type

**Problem**: `RadioEquipment` is modeled as a transceiver with `maxPower`, `minPower`, `transmit` performance, and `RadioTier` values that assume traditional rigs. An RTL-SDR dongle, Airspy HF+, or KiwiSDR doesn't fit this model.

**Solution**: New `UserSDR` equipment type, stored alongside `UserRadio` in the shack store.

#### New type: `SDRType`

```typescript
export type SDRType =
  | "usb_dongle" // RTL-SDR, NooElec, etc.
  | "desktop_sdr" // Airspy, SDRplay RSPdx, Flex Radio
  | "network_sdr" // KiwiSDR, WebSDR, remote SDR
  | "transceiver_sdr" // IC-7300, Flex 6000 — radios with SDR architecture
  | "homebrew" // Custom/DIY SDR builds
  | "other";
```

#### New type: `SDRSoftware`

Common SDR applications (curated list + freeform):

```typescript
export type SDRSoftware =
  | "sdr_sharp" // SDR# (Windows)
  | "sdr_plus_plus" // SDR++ (cross-platform)
  | "gqrx" // GQRX (Linux/Mac)
  | "cubic_sdr" // CubicSDR
  | "hdsdr" // HDSDR
  | "sdr_console" // SDR Console
  | "gnu_radio" // GNU Radio
  | "wsjt_x" // WSJT-X (FT8/FT4 decoding)
  | "js8call" // JS8Call
  | "fldigi" // Fldigi
  | "dream" // DRM decoder
  | "dump1090" // ADS-B aircraft tracking
  | "rtl_433" // ISM band device decoding
  | "trunk_recorder" // Trunked radio recording
  | "unitrunker" // Trunked radio decoding
  | "dsd_plus" // Digital voice decoding (P25, DMR)
  | "multimon_ng" // Multi-protocol decoder
  | "websdr" // WebSDR browser client
  | "kiwisdr" // KiwiSDR browser client
  | "openwebrx" // OpenWebRX
  | (string & {}); // Custom/other software
```

#### New interface: `UserSDR`

```typescript
export interface UserSDR {
  id: string;
  name: string; // User-given name, e.g. "My RTL-SDR v3"
  sdrType: SDRType;
  manufacturer?: string; // e.g. "RTL-SDR Blog", "Airspy", "SDRplay"
  model?: string; // e.g. "RTL-SDR V3", "HF+ Discovery", "RSPdx"
  chipset?: string; // e.g. "RTL2832U", "R820T2", "MSi2500"

  // Frequency coverage
  frequencyRangeMHz?: {
    min: number; // e.g. 0.5 (500 kHz)
    max: number; // e.g. 1766 (1.766 GHz)
  };
  bandwidthMHz?: number; // Instantaneous bandwidth, e.g. 2.4, 10
  sampleRateMsps?: number; // Max sample rate in Msps

  // Receiver performance (reuse existing ReceiverPerformance where applicable)
  sensitivity?: number; // In microvolts or dBm
  dynamicRangeDb?: number; // Overall dynamic range
  bitsResolution?: number; // ADC bits (8, 12, 14, 16)
  noiseFloorDbm?: number; // Typical noise floor

  // TX capability (some SDRs like HackRF, Flex can transmit)
  canTransmit: boolean; // false for most SDRs
  maxTxPowerWatts?: number; // Only if canTransmit

  // Software ecosystem
  software: SDRSoftware[]; // Software used with this SDR
  customSoftware?: string[]; // Additional unlisted software

  // Connection
  interface?: "usb" | "ethernet" | "wifi" | "pcie" | "browser" | "other";
  requiresUpconverter?: boolean; // e.g. RTL-SDR needs upconverter for HF
  upconverterModel?: string; // e.g. "Ham It Up v1.3"

  // Metadata (same pattern as other equipment)
  notes?: string;
  imageId?: string;
  galleryImageIds?: string[];
  addedAt: string;
  retiredAt?: string;
}
```

#### SDR in the equipment card system

New `EquipmentType` value:

```typescript
export type EquipmentType =
  | "radio"
  | "antenna"
  | "feedline"
  | "accessory"
  | "inline"
  | "sdr";
```

New accent color: `sdr: "#8B5CF6"` (violet — distinct from all existing colors)

SDR tier mapping:

```typescript
export type SDRTier = "starter" | "enthusiast" | "prosumer" | "laboratory";
// starter: RTL-SDR, NooElec
// enthusiast: Airspy Mini, SDRplay RSP1
// prosumer: Airspy HF+ Discovery, RSPdx, Flex SmartSDR
// laboratory: Ettus USRP, custom builds
```

Card stats for SDR:

| Stat            | Icon        | Example          |
| --------------- | ----------- | ---------------- |
| Frequency range | `frequency` | "0.5 - 1766 MHz" |
| Bandwidth       | `bands`     | "10 MHz"         |
| ADC bits        | `score`     | "14-bit"         |
| Sample rate     | `power`     | "10 Msps"        |

---

### 3. Receiver Equipment Type

**Problem**: Some receive-only hardware isn't an SDR — scanners (Uniden, Whistler), wideband receivers (Icom IC-R8600, AOR AR-DV1), dedicated SWL radios (Tecsun, Sangean), weather radio receivers.

**Solution**: New `UserReceiver` type for non-SDR receive-only equipment.

#### New type: `ReceiverCategory`

```typescript
export type ReceiverCategory =
  | "scanner" // Uniden SDS100, Whistler TRX-1
  | "wideband_receiver" // Icom IC-R8600, AOR AR-DV1
  | "swl_radio" // Tecsun PL-880, Sangean ATS-909X2
  | "weather_radio" // Dedicated NOAA weather receivers
  | "ais_receiver" // Marine AIS receivers
  | "adsb_receiver" // Dedicated ADS-B (FlightAware, etc.)
  | "aprs_receiver" // APRS receive-only iGate
  | "other";
```

#### New interface: `UserReceiver`

```typescript
export interface UserReceiver {
  id: string;
  name: string;
  category: ReceiverCategory;
  manufacturer?: string;
  model?: string;

  // Coverage
  frequencyRangeMHz?: {
    min: number;
    max: number;
  };
  bands?: string[]; // Amateur bands covered (BandId[])
  services?: MonitoredService[]; // What services they monitor

  // Capabilities
  modes?: ReceiverMode[]; // Demodulation modes
  digitalProtocols?: DigitalProtocol[]; // Digital voice/data protocols supported
  hasRecording?: boolean; // Can record audio/IQ
  hasProgrammableScan?: boolean; // Programmable scan lists
  channels?: number; // Memory channel count

  // Metadata
  notes?: string;
  imageId?: string;
  galleryImageIds?: string[];
  addedAt: string;
  retiredAt?: string;
}
```

#### Supporting types

```typescript
export type ReceiverMode =
  | "AM"
  | "FM"
  | "WFM"
  | "SSB"
  | "CW"
  | "NFM"
  | "USB"
  | "LSB"
  | "DRM"
  | "DAB"
  | "other";

export type DigitalProtocol =
  | "P25"
  | "DMR"
  | "NXDN"
  | "dstar"
  | "fusion"
  | "tetra"
  | "provoice"
  | "opensky"
  | "other";

export type MonitoredService =
  | "amateur" // Ham radio bands
  | "public_safety" // Police, fire, EMS
  | "aviation" // Airband
  | "marine" // Marine VHF
  | "weather" // NOAA weather
  | "railroad" // Railroad comms
  | "military" // Military frequencies
  | "shortwave" // International broadcast SW
  | "utility" // Utility stations (VOLMET, etc.)
  | "ism" // ISM band devices (433MHz, 915MHz)
  | "satellite" // Satellite downlinks
  | "adsb" // ADS-B aircraft
  | "ais" // Marine AIS
  | "aprs" // APRS
  | "time_signal" // WWV, CHU, DCF77
  | "numbers" // Numbers stations
  | "other";
```

New `EquipmentType` value:

```typescript
export type EquipmentType =
  | "radio"
  | "antenna"
  | "feedline"
  | "accessory"
  | "inline"
  | "sdr"
  | "receiver";
```

New accent color: `receiver: "#06B6D4"` (cyan)

---

### 4. Monitoring Antenna Extensions

**Problem**: The existing `UserAntennaType` has 41 values but they're all amateur TX/RX types. Monitoring operators use different antennas: discones, wideband verticals, scanner antennas, loop antennas for MW/LW, satellite tracking antennas.

**Solution**: Add monitoring-focused antenna types to the existing union.

#### New `UserAntennaType` values

```typescript
// Wideband monitoring antennas
| "discone"            // Classic wideband scanner antenna
| "wideband_vertical"  // Wideband vertical (Diamond D130, Comet DS150)
| "scanner_whip"       // Simple wideband whip/rubber duck
| "log_periodic_vhf"   // VHF/UHF log periodic (directional monitoring)

// MW/LW receive antennas
| "mw_loop"            // Medium wave loop antenna
| "ferrite_bar"        // Ferrite bar antenna (AM broadcast)
| "longwire"           // Simple longwire for SWL

// Satellite/specialized
| "turnstile"          // Crossed dipole for satellite
| "qfh"               // Quadrifilar helix (weather satellite, NOAA APT)
| "patch"              // Patch antenna (GPS, satellite)
| "parabolic"          // Parabolic dish (EME, satellite TV, radio astronomy)

// ADS-B / specific
| "adsb_collinear"     // 1090 MHz collinear for ADS-B
```

Add corresponding entries to `ANTENNA_TYPE_TO_PATTERN` mapping these to the closest existing gain pattern.

---

### 5. Operator Interest Tags

**Problem**: There's no way for operators to express what they're "into." The `BuiltinProfileId` presets (dx-hunter, contest, vhf, emergency, listener) are UI layout presets, not identity tags.

**Solution**: A tag system on the operator profile — curated tags plus custom freeform tags.

#### New type: `OperatorInterestTag`

```typescript
export type OperatorInterestTag =
  // Operating styles
  | "dxing"
  | "contesting"
  | "ragchewing"
  | "net_control"
  | "elmering"

  // Modes
  | "cw"
  | "digital_modes"
  | "ft8"
  | "ssb"
  | "am_broadcast"
  | "sstv"
  | "rtty"

  // Activities
  | "pota" // Parks on the Air
  | "sota" // Summits on the Air
  | "iota" // Islands on the Air
  | "field_day"
  | "fox_hunting" // Radio direction finding
  | "emcomm" // Emergency communications
  | "skywarn"

  // Equipment / tinkering
  | "qrp" // Low power
  | "homebrew" // Kit building / DIY
  | "sdr_tinkering" // SDR projects and experimentation
  | "antenna_experimenting"
  | "3d_printing" // 3D-printed radio accessories

  // Monitoring / SWL
  | "swl" // Shortwave listening
  | "scanning" // Scanner hobbyist
  | "adsb_tracking" // ADS-B plane tracking
  | "satellite_rx" // Satellite reception (NOAA, Meteor, etc.)
  | "weather_monitoring" // Weather station / NOAA
  | "numbers_stations" // Numbers station monitoring
  | "utility_monitoring" // Utility station DXing
  | "websdr" // WebSDR / KiwiSDR enthusiast
  | "radio_astronomy" // Radio astronomy

  // VHF/UHF specific
  | "vhf_uhf"
  | "repeaters"
  | "dmr"
  | "dstar"
  | "fusion"
  | "aprs"
  | "satellite_ops" // Working amateur satellites (TX)
  | "eme" // Earth-Moon-Earth
  | "meteor_scatter"

  // Digital / computer
  | "winlink"
  | "js8call"
  | "vara"
  | "packet_radio"
  | "mesh_networking" // AREDN, Meshtastic

  // Other
  | (string & {}); // Custom tags
```

#### Profile fields

```typescript
// In UserStation or a new OperatorProfile type:
export interface OperatorInterests {
  tags: OperatorInterestTag[]; // Max 15 tags
  customTags?: string[]; // Max 5 custom freeform tags
  primaryInterest?: OperatorInterestTag; // "What I'm most into"
}
```

**Where it lives**: New field on `ProfileStore`:

```typescript
interests: OperatorInterests; // defaults to { tags: [], customTags: [] }
```

**Supabase**: New column `interests: jsonb` on `profiles` table.

---

### 6. Frequency Interests (for Monitoring Operators)

**Problem**: A transmitting operator's frequencies are defined by their license class and band plan. But a monitoring operator's identity is defined by _what they listen to_ — and there's no way to express that.

**Solution**: A `FrequencyInterest` system for operators to list what they monitor.

#### New interface: `FrequencyInterest`

```typescript
export interface FrequencyInterest {
  id: string;
  label: string; // e.g. "Chicago Fire/EMS", "20m FT8", "NOAA APT"
  service: MonitoredService; // From the MonitoredService type above
  frequencyMHz?: number; // Specific frequency if applicable
  bandOrRange?: string; // e.g. "20m", "VHF High Band", "800 MHz"
  mode?: string; // e.g. "NFM", "P25", "USB", "FT8"
  notes?: string; // e.g. "Best on weekday evenings"
  isActive: boolean; // Currently monitoring this
}
```

#### Profile field

```typescript
// In ProfileStore:
frequencyInterests: FrequencyInterest[];  // Max 20 entries
```

**Supabase**: New column `frequency_interests: jsonb` on `profiles` table.

---

### 7. "Where I Hang Out" (Operating Habits)

**Problem**: There's no way to tell other operators where to find you on the air or online.

**Solution**: Structured fields for favorite frequencies, nets, and WebSDR instances.

#### New interface: `OperatingHabit`

```typescript
export interface FavoriteFrequency {
  id: string;
  frequencyMHz: number; // e.g. 14.300
  mode?: string; // e.g. "USB", "FT8"
  label?: string; // e.g. "Maritime Mobile Net"
  notes?: string; // e.g. "Most evenings after 0200 UTC"
}

export interface FavoriteNet {
  id: string;
  name: string; // e.g. "OMISS Net", "Ten-Ten"
  frequencyMHz?: number;
  band?: string;
  schedule?: string; // e.g. "Mon/Wed/Fri 0100 UTC"
  url?: string; // Net's website
}

export interface FavoriteWebSDR {
  id: string;
  name: string; // e.g. "University of Twente WebSDR"
  url: string; // Direct URL
  location?: string; // e.g. "Enschede, Netherlands"
  notes?: string;
}

export interface OperatingHabits {
  favoriteFrequencies: FavoriteFrequency[]; // Max 10
  favoriteNets: FavoriteNet[]; // Max 10
  favoriteWebSDRs: FavoriteWebSDR[]; // Max 5
  typicalHoursUtc?: {
    // "When I'm usually active"
    start: number; // 0-23
    end: number; // 0-23
  };
  openToSkeds: boolean; // "I'm open to scheduling contacts"
}
```

**Where it lives**: New field on `ProfileStore`:

```typescript
operatingHabits: OperatingHabits;
```

**Supabase**: New column `operating_habits: jsonb` on `profiles` table.

---

### 8. Shack Store Extensions

#### New store fields

```typescript
// In ShackStore:
sdrs: UserSDR[];                    // Max 10
receivers: UserReceiver[];          // Max 10
```

#### New inventory limits

```typescript
export const MAX_SDRS = 10;
export const MAX_RECEIVERS = 10;
```

#### New Supabase tables

| Table            | Conflict Key  | Content                |
| ---------------- | ------------- | ---------------------- |
| `user_sdrs`      | `user_id, id` | SDR hardware           |
| `user_receivers` | `user_id, id` | Receive-only equipment |

Same `_snapshot` JSON blob pattern as other equipment tables.

#### Equipment history

Add to `EquipmentHistoryEntry.equipmentType`:

```typescript
export type EquipmentHistoryType =
  | "radio"
  | "antenna"
  | "feedline"
  | "inline_component"
  | "accessory"
  | "preset"
  | "chain"
  | "sdr"
  | "receiver"; // NEW
```

#### Station chain support

SDR and receiver nodes in the signal chain builder:

```typescript
export type ChainNodeType =
  | "radio"
  | "accessory"
  | "feedline_run"
  | "antenna"
  | "sdr"
  | "receiver"; // NEW

export interface SDRNode {
  type: "sdr";
  sdrId: string;
}

export interface ReceiverNode {
  type: "receiver";
  receiverId: string;
}
```

---

### 9. Store Migration

#### Profile store (version 9 → 10)

```typescript
// Migration: add defaults for new fields
if (version < 10) {
  state.operatorType = "transceiver"; // existing users default to transceiver
  state.interests = { tags: [], customTags: [] };
  state.frequencyInterests = [];
  state.operatingHabits = {
    favoriteFrequencies: [],
    favoriteNets: [],
    favoriteWebSDRs: [],
    openToSkeds: false,
  };
}
```

#### Shack store (version 5 → 6)

```typescript
// Migration: add empty arrays for new equipment types
if (version < 6) {
  state.sdrs = [];
  state.receivers = [];
}
```

All migrations are additive — no data loss, no breaking changes.

---

### 10. Equipment Card Rendering

How new equipment types map to the card system:

#### SDR cards

| Property        | Value                                                    |
| --------------- | -------------------------------------------------------- |
| `equipmentType` | `"sdr"`                                                  |
| `accentColor`   | `#8B5CF6` (violet)                                       |
| `typeLabel`     | SDRType display name (e.g., "USB Dongle", "Network SDR") |
| `symbol`        | Radio wave + chip icon                                   |
| Primary stats   | Freq range, bandwidth, ADC bits                          |
| Capabilities    | Software list as pills                                   |
| Badges          | "TX Capable" if `canTransmit`, "HF" if upconverter noted |

#### Receiver cards

| Property        | Value                                                        |
| --------------- | ------------------------------------------------------------ |
| `equipmentType` | `"receiver"`                                                 |
| `accentColor`   | `#06B6D4` (cyan)                                             |
| `typeLabel`     | ReceiverCategory display name (e.g., "Scanner", "SWL Radio") |
| `symbol`        | Headphones + antenna icon                                    |
| Primary stats   | Freq range, channels, digital protocols                      |
| Capabilities    | Modes and protocols as pills                                 |
| Badges          | Protocol support badges (P25, DMR, etc.)                     |

---

### 11. Impact on Existing Features

| Feature                     | Impact                                            | Notes                                                    |
| --------------------------- | ------------------------------------------------- | -------------------------------------------------------- |
| Profile completeness        | Add SDR/receiver to scoring                       | Receive-only users get credit for SDRs instead of radios |
| Rank points                 | `equipmentCount` includes SDRs and receivers      | No formula change needed                                 |
| Equipment summary (profile) | Show SDR/receiver alongside radios                | New card types render naturally                          |
| Signal chain builder        | SDR/receiver as chain start nodes                 | Replaces radio node for receive-only chains              |
| Band capability strip       | Include SDR/receiver frequency coverage           | Wideband devices show broad coverage                     |
| Operating profiles          | "listener" preset auto-selects for `receive_only` | Existing preset works well                               |
| Share card                  | Interest tags shown on generated cards            | New canvas rendering needed                              |
| Public profile              | New fields respect visibility settings            | `equipment: VisibilityLevel` covers SDR/receivers        |

---

### 12. Files to Create

| File                                      | Purpose                                |
| ----------------------------------------- | -------------------------------------- |
| `docs/designs/sdr-receive-only-schema.md` | This design document (the deliverable) |

### 13. Files to Modify (Future Implementation)

| File                                         | Change                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `src/types/shack.ts`                         | Add `UserSDR`, `UserReceiver`, new antenna types, new history types                              |
| `src/types/radio.ts`                         | Add `SDRType`, `SDRSoftware`, `SDRTier`                                                          |
| `src/types/user.ts`                          | Add `OperatorType`, new `LicenseClass` values, `OperatorInterestTag`, `OperatorInterests`        |
| `src/types/social.ts`                        | Add `FrequencyInterest`, `OperatingHabits`, `FavoriteFrequency`, `FavoriteNet`, `FavoriteWebSDR` |
| `src/types/stationChain.ts`                  | Add `SDRNode`, `ReceiverNode` to chain node union                                                |
| `src/stores/shackStore.ts`                   | Add `sdrs`, `receivers` arrays, CRUD actions, v6 migration                                       |
| `src/stores/profileStore.ts`                 | Add `interests`, `frequencyInterests`, `operatingHabits`, `operatorType`, v10 migration          |
| `src/components/shack/equipmentCardTypes.ts` | Add `"sdr"`, `"receiver"` to `EquipmentType`, new accent colors                                  |
| `src/lib/sync/modules/shackSync.ts`          | Add `user_sdrs`, `user_receivers` table sync definitions                                         |
| `src/types/supabase.ts`                      | Add table row types for new tables                                                               |

---

**USER: Please review this plan. Edit any section directly, then confirm to proceed.**
