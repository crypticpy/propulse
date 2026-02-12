# Schema Design: SDR, Receive-Only Equipment & Operator Tags

**Status:** Draft
**Owner:** Product / Engineering
**Audience:** Frontend, Backend (Supabase), UX
**Version:** 1.0
**Date:** 2026-02-11

**Related docs:**

- `docs/requirements/PRD-SHACK-BUILDER.md` -- Equipment management, station modeling
- `docs/requirements/phase-2/PRD-OPERATOR-PROFILE-V2.md` -- Operator profile V2
- `docs/requirements/phase-2/PRD-SHACK-BUILDER-V2.md` -- Shack builder V2
- `docs/plans/PRD-RADIO-DAEMON.md` -- Radio daemon (SDR + rig control)

**Key source files (current implementation):**

- `src/types/shack.ts` -- Antenna, feedline, inline component, accessory types
- `src/types/radio.ts` -- RadioEquipment, UserRadio, ReceiverPerformance
- `src/types/user.ts` -- UserStation, LicenseClass, BandId, OperatingLocation
- `src/types/social.ts` -- PublicProfile, VisibilitySettings, ActivityEvent
- `src/types/stationChain.ts` -- ChainNode, StationChain
- `src/stores/shackStore.ts` -- Equipment persistence (Zustand, localStorage)
- `src/stores/profileStore.ts` -- Operator identity persistence
- `src/components/shack/equipmentCardTypes.ts` -- Card display system types
- `src/lib/sync/modules/shackSync.ts` -- Supabase sync definitions

---

## Table of Contents

1. [Motivation](#1-motivation)
2. [Operator Capability Model](#2-operator-capability-model)
3. [SDR Equipment Type](#3-sdr-equipment-type)
4. [Receiver Equipment Type](#4-receiver-equipment-type)
5. [Monitoring Antenna Extensions](#5-monitoring-antenna-extensions)
6. [Operator Interest Tags](#6-operator-interest-tags)
7. [Frequency Interests](#7-frequency-interests)
8. [Operating Habits ("Where I Hang Out")](#8-operating-habits-where-i-hang-out)
9. [Shack Store Extensions](#9-shack-store-extensions)
10. [Equipment Card Rendering](#10-equipment-card-rendering)
11. [Store Migrations](#11-store-migrations)
12. [Supabase Schema Changes](#12-supabase-schema-changes)
13. [Impact on Existing Features](#13-impact-on-existing-features)
14. [Files to Modify](#14-files-to-modify)

---

## 1. Motivation

Propulse currently models every operator as a licensed amateur with physical transceiver hardware. The equipment schema (`RadioEquipment`, `UserRadio`) assumes TX capability with fields like `maxPower`, `minPower`, and `TransmitPerformance`. The license system (`LicenseClass`) lists only licensed service tiers with no representation for unlicensed listeners.

This excludes a significant portion of the radio hobby community:

- **Shortwave listeners (SWL)** who enjoy monitoring international broadcasts, utility stations, and amateur bands without transmitting
- **Scanner hobbyists** who monitor public safety, aviation, marine, and railroad communications
- **SDR enthusiasts** who tinker with software-defined radios for signal processing, ADS-B tracking, weather satellite reception, or ISM band decoding
- **Computer-only operators** who explore radio through WebSDR, KiwiSDR, and OpenWebRX without owning any physical hardware
- **Tinkerers and makers** who build SDR projects, decode digital protocols, and experiment with RF — often without ever keying up a transmitter

These operators have interesting setups, favorite frequencies, monitoring habits, and community interests that deserve first-class representation in their profile and shack.

---

## 2. Operator Capability Model

### Problem

The system assumes every user transmits. There is no `operatorType` field, no `SWL` or `UNLICENSED` license class, and no way to express "I only listen" or "I do everything through a browser."

### Solution

Add an explicit operator capability declaration to the profile identity model.

### `OperatorType`

```typescript
export type OperatorType =
  | "transceiver" // Licensed, transmits and receives (default for existing users)
  | "receive_only" // Has physical receive hardware but no TX capability
  | "computer_only" // WebSDR, KiwiSDR, remote SDR — no local hardware at all
  | "both"; // Licensed transmitter who also does significant SWL/monitoring
```

**Location:** `UserStation` in `src/types/user.ts`

```typescript
export interface UserStation {
  // ... existing fields ...
  operatorType?: OperatorType; // Defaults to "transceiver" for existing users
}
```

### New `LicenseClass` Values

Add to the existing `LicenseClass` union in `src/types/user.ts`:

```typescript
export type LicenseClass =
  // ... existing US, UK, DE, CA classes ...
  | "SWL" // Shortwave listener — no TX privileges
  | "UNLICENSED" // No license — monitoring/scanning only
  | (string & {}); // Extensibility escape hatch (already exists)
```

While `(string & {})` allows arbitrary strings today, making `SWL` and `UNLICENSED` explicit ensures they appear in autocomplete, documentation, and validation logic.

### Behavioral Impact

| System                  | `transceiver` / `both`       | `receive_only`                                  | `computer_only`                                             |
| ----------------------- | ---------------------------- | ----------------------------------------------- | ----------------------------------------------------------- |
| Signal prediction       | Full TX+RX path              | RX path only, skip TX power                     | Disabled (no local antenna)                                 |
| Regulatory checks       | Full TX privilege validation | Bypassed — all frequencies are legal to receive | Bypassed                                                    |
| Equipment forms         | All fields shown             | TX fields hidden (max power, TX IMD)            | Equipment section shows SDR/receiver or "no hardware" state |
| Profile badge           | License class badge          | "SWL" or "Monitoring Station"                   | "WebSDR Listener" or custom                                 |
| Profile completeness    | Radio = required equipment   | SDR or Receiver = required equipment            | No equipment required                                       |
| Rank points (equipment) | Radios count                 | SDRs + receivers count                          | WebSDR favorites count (future)                             |

---

## 3. SDR Equipment Type

### Problem

`RadioEquipment` is a transceiver model: `maxPower`, `minPower`, `modes: RadioMode[]`, `tier: RadioTier`. None of these fields make sense for an RTL-SDR dongle or a KiwiSDR browser session. SDR hardware has a fundamentally different spec sheet: frequency range, instantaneous bandwidth, ADC resolution, sample rate, and a software ecosystem rather than built-in modes.

### Solution

New `UserSDR` equipment type, stored in a separate array in the shack store.

### `SDRType`

Classifies the physical form factor and connectivity of the SDR hardware:

```typescript
export type SDRType =
  | "usb_dongle" // RTL-SDR, NooElec NESDR, Airspy Mini
  | "desktop_sdr" // Airspy HF+ Discovery, SDRplay RSPdx, Flex 6600
  | "network_sdr" // KiwiSDR, WebSDR, Red Pitaya, remote SDR servers
  | "transceiver_sdr" // IC-7300, Flex 6000 series — conventional radios with SDR architecture
  | "homebrew" // Custom/DIY SDR builds, FPGA projects
  | "other";
```

### `SDRSoftware`

Curated list of common SDR applications, with a freeform escape hatch:

```typescript
export type SDRSoftware =
  // General-purpose SDR applications
  | "sdr_sharp" // SDR# (Windows, most popular)
  | "sdr_plus_plus" // SDR++ (cross-platform, modern)
  | "gqrx" // GQRX (Linux/Mac)
  | "cubic_sdr" // CubicSDR (cross-platform)
  | "hdsdr" // HDSDR (Windows)
  | "sdr_console" // SDR Console (Windows)
  | "gnu_radio" // GNU Radio (signal processing framework)

  // Amateur digital modes
  | "wsjt_x" // WSJT-X — FT8, FT4, JT65, JT9, WSPR decoding
  | "js8call" // JS8Call — keyboard-to-keyboard HF messaging
  | "fldigi" // Fldigi — multi-mode digital modem

  // Broadcast / specialized decoders
  | "dream" // DRM (Digital Radio Mondiale) decoder
  | "dump1090" // ADS-B aircraft tracking (1090 MHz)
  | "rtl_433" // ISM band device decoding (433/915 MHz)

  // Trunked radio / public safety
  | "trunk_recorder" // Trunked radio system recorder
  | "unitrunker" // Trunked radio control channel decoder
  | "dsd_plus" // Digital voice decoding (P25, DMR, NXDN)
  | "multimon_ng" // Multi-protocol decoder (POCSAG, FLEX, EAS, etc.)

  // Web-based SDR clients
  | "websdr" // WebSDR browser client (websdr.org)
  | "kiwisdr" // KiwiSDR browser client
  | "openwebrx" // OpenWebRX (self-hosted web SDR)

  // Escape hatch
  | (string & {}); // Custom/other software
```

### `UserSDR`

Full interface for a user-owned SDR device:

```typescript
export interface UserSDR {
  id: string;
  name: string; // User-given name, e.g. "My RTL-SDR v3"
  sdrType: SDRType;
  manufacturer?: string; // e.g. "RTL-SDR Blog", "Airspy", "SDRplay"
  model?: string; // e.g. "RTL-SDR V3", "HF+ Discovery", "RSPdx"
  chipset?: string; // e.g. "RTL2832U", "R820T2", "MSi2500"

  // ── Frequency coverage ──────────────────────────────────────────────
  frequencyRangeMHz?: {
    min: number; // e.g. 0.5 (500 kHz)
    max: number; // e.g. 1766 (1.766 GHz)
  };
  bandwidthMHz?: number; // Instantaneous bandwidth, e.g. 2.4, 10
  sampleRateMsps?: number; // Max sample rate in Msps

  // ── Receiver performance ────────────────────────────────────────────
  sensitivity?: number; // In microvolts or dBm
  dynamicRangeDb?: number; // Overall dynamic range in dB
  bitsResolution?: number; // ADC resolution (8, 12, 14, 16)
  noiseFloorDbm?: number; // Typical noise floor in dBm

  // ── TX capability ───────────────────────────────────────────────────
  // Some SDRs (HackRF, Flex, LimeSDR) can transmit.
  canTransmit: boolean; // false for the vast majority of SDRs
  maxTxPowerWatts?: number; // Only relevant when canTransmit === true

  // ── Software ecosystem ──────────────────────────────────────────────
  software: SDRSoftware[]; // Software applications used with this SDR
  customSoftware?: string[]; // Unlisted software (max 10)

  // ── Connection & accessories ────────────────────────────────────────
  interface?: "usb" | "ethernet" | "wifi" | "pcie" | "browser" | "other";
  requiresUpconverter?: boolean; // e.g. RTL-SDR needs upconverter for HF
  upconverterModel?: string; // e.g. "Ham It Up v1.3", "SpyVerter R2"

  // ── Metadata (same pattern as all other equipment) ──────────────────
  notes?: string;
  imageId?: string; // UUID for hero image in IndexedDB
  galleryImageIds?: string[]; // Up to 5 additional gallery images
  addedAt: string; // ISO-8601 timestamp
  retiredAt?: string; // ISO-8601 retirement timestamp
}
```

### `SDRTier`

Tier system for SDR equipment cards, analogous to `RadioTier` for transceivers:

```typescript
export type SDRTier = "starter" | "enthusiast" | "prosumer" | "laboratory";
```

| Tier           | Examples                                           | Price Range |
| -------------- | -------------------------------------------------- | ----------- |
| **starter**    | RTL-SDR V3, NooElec NESDR Mini                     | $10-30      |
| **enthusiast** | Airspy Mini, SDRplay RSP1A, RTL-SDR V4             | $30-150     |
| **prosumer**   | Airspy HF+ Discovery, SDRplay RSPdx, Flex SmartSDR | $150-1000   |
| **laboratory** | Ettus USRP B210, LimeSDR, custom FPGA builds       | $1000+      |

---

## 4. Receiver Equipment Type

### Problem

Not all receive-only hardware is an SDR. Many monitoring hobbyists use traditional receivers and scanners that don't expose IQ data or require companion software. These devices have their own spec sheets (memory channels, digital protocol decoders, scan speed) that don't fit the SDR model.

### Solution

New `UserReceiver` equipment type for non-SDR receive-only hardware.

### `ReceiverCategory`

```typescript
export type ReceiverCategory =
  | "scanner" // Uniden SDS100, Whistler TRX-1, Bearcat
  | "wideband_receiver" // Icom IC-R8600, AOR AR-DV1, Yaesu VR-5000
  | "swl_radio" // Tecsun PL-880, Sangean ATS-909X2, Sony ICF-SW7600GR
  | "weather_radio" // Dedicated NOAA weather receivers (Midland, Kaito)
  | "ais_receiver" // Marine AIS receivers (dAISy, Vesper)
  | "adsb_receiver" // Dedicated ADS-B hardware (FlightAware Pro Stick)
  | "aprs_receiver" // APRS receive-only iGate hardware
  | "other";
```

### Supporting Demodulation & Protocol Types

```typescript
// Demodulation modes available on the receiver
export type ReceiverMode =
  | "AM"
  | "FM"
  | "WFM"
  | "NFM" // Analog
  | "SSB"
  | "USB"
  | "LSB" // Single sideband
  | "CW" // Continuous wave
  | "DRM"
  | "DAB" // Digital broadcast
  | "other";

// Digital voice/data protocols the receiver can decode natively
export type DigitalProtocol =
  | "P25" // APCO Project 25 (public safety)
  | "DMR" // Digital Mobile Radio (Motorola TRBO, Hytera)
  | "NXDN" // Kenwood/Icom narrowband digital
  | "dstar" // Icom D-STAR
  | "fusion" // Yaesu System Fusion (C4FM)
  | "tetra" // TETRA (European trunked radio)
  | "provoice" // EDACS ProVoice
  | "opensky" // OpenSky (deprecated trunked)
  | "other";

// Services/bands the receiver is used to monitor
export type MonitoredService =
  | "amateur" // Ham radio bands
  | "public_safety" // Police, fire, EMS
  | "aviation" // Airband (118-137 MHz)
  | "marine" // Marine VHF (156-162 MHz)
  | "weather" // NOAA weather radio (162.4-162.55 MHz)
  | "railroad" // Railroad AAR frequencies
  | "military" // Military VHF/UHF
  | "shortwave" // International broadcast shortwave
  | "utility" // Utility stations (VOLMET, HFDL, etc.)
  | "ism" // ISM band devices (433 MHz, 868 MHz, 915 MHz)
  | "satellite" // Satellite downlinks (NOAA APT, Meteor M2, etc.)
  | "adsb" // ADS-B aircraft (1090 MHz)
  | "ais" // Marine AIS (161.975/162.025 MHz)
  | "aprs" // APRS (144.390 MHz US, 144.800 MHz EU)
  | "time_signal" // Time signal stations (WWV, CHU, DCF77, JJY)
  | "numbers" // Numbers stations
  | "other";
```

### `UserReceiver`

```typescript
export interface UserReceiver {
  id: string;
  name: string; // User-given name
  category: ReceiverCategory;
  manufacturer?: string; // e.g. "Uniden", "Icom", "Tecsun"
  model?: string; // e.g. "SDS100", "IC-R8600", "PL-880"

  // ── Coverage ────────────────────────────────────────────────────────
  frequencyRangeMHz?: {
    min: number; // e.g. 0.1 (100 kHz)
    max: number; // e.g. 1300 (1.3 GHz)
  };
  bands?: string[]; // Amateur bands covered (BandId[])
  services?: MonitoredService[]; // What services this receiver is used for

  // ── Capabilities ───────────────────────────────────────────────────
  modes?: ReceiverMode[]; // Analog/digital demodulation modes
  digitalProtocols?: DigitalProtocol[]; // Native digital voice protocol support
  hasRecording?: boolean; // Built-in audio/IQ recording
  hasProgrammableScan?: boolean; // Programmable scan lists/banks
  channels?: number; // Memory channel capacity

  // ── Metadata ───────────────────────────────────────────────────────
  notes?: string;
  imageId?: string;
  galleryImageIds?: string[];
  addedAt: string;
  retiredAt?: string;
}
```

---

## 5. Monitoring Antenna Extensions

### Problem

The existing `UserAntennaType` union has 41 values, all oriented toward amateur TX/RX operation. Monitoring operators use different antennas: wideband discones for scanner use, QFH antennas for weather satellite reception, parabolic dishes for radio astronomy, and simple longwires for SWL.

### Solution

Add 12 new monitoring-focused values to the `UserAntennaType` union in `src/types/shack.ts`.

### New Values

```typescript
export type UserAntennaType =
  // ... existing 41 values ...

  // ── Wideband monitoring antennas ────────────────────────────────────
  | "discone" // Classic wideband scanner antenna (25 MHz - 1.3 GHz)
  | "wideband_vertical" // Wideband vertical (Diamond D130, Comet DS150)
  | "scanner_whip" // Simple wideband whip or rubber duck
  | "log_periodic_vhf" // VHF/UHF log periodic (directional monitoring)

  // ── MW/LW receive antennas ──────────────────────────────────────────
  | "mw_loop" // Medium wave loop antenna (AM broadcast DXing)
  | "ferrite_bar" // Ferrite bar antenna (AM broadcast, portable)
  | "longwire" // Simple longwire for shortwave listening

  // ── Satellite / specialized ─────────────────────────────────────────
  | "turnstile" // Crossed dipole for satellite (circular polarization)
  | "qfh" // Quadrifilar helix (NOAA APT, Meteor M2 satellite)
  | "patch" // Patch antenna (GPS, satellite, ADS-B)
  | "parabolic" // Parabolic dish (EME, satellite, radio astronomy)

  // ── Purpose-built monitoring ────────────────────────────────────────
  | "adsb_collinear"; // 1090 MHz collinear for ADS-B tracking
```

### Gain Pattern Mapping

Add entries to the `ANTENNA_TYPE_TO_PATTERN` map in `src/types/shack.ts`:

| New Antenna Type    | Maps To (Gain Pattern) | Rationale                            |
| ------------------- | ---------------------- | ------------------------------------ |
| `discone`           | `"vertical"`           | Omnidirectional, vertically oriented |
| `wideband_vertical` | `"vertical"`           | Omnidirectional vertical             |
| `scanner_whip`      | `"vertical"`           | Simple vertical element              |
| `log_periodic_vhf`  | `"yagi_3el"`           | Directional, moderate gain           |
| `mw_loop`           | `"isotropic"`          | Near-isotropic at MW frequencies     |
| `ferrite_bar`       | `"isotropic"`          | Figure-8 pattern, approximated       |
| `longwire`          | `"wire_inverted_v"`    | Wire antenna, similar pattern        |
| `turnstile`         | `"dipole"`             | Crossed dipoles                      |
| `qfh`               | `"dipole"`             | Circular polarization, hemispherical |
| `patch`             | `"isotropic"`          | Hemispherical, narrow beam           |
| `parabolic`         | `"yagi_5el"`           | High gain, narrow beam               |
| `adsb_collinear`    | `"vertical"`           | Omnidirectional collinear            |

---

## 6. Operator Interest Tags

### Problem

There's no way for operators to express their identity beyond their callsign and license class. The `BuiltinProfileId` presets (`dx-hunter`, `contest`, `vhf`, `emergency`, `listener`) are UI layout presets — they configure which panels are visible, not who the operator is.

An operator's interests are a core part of their identity: "I'm into DXing and QRP" or "I'm a scanner hobbyist who tracks ADS-B and decodes P25 trunking." These interests help other operators find like-minded community members and understand what a profile is about at a glance.

### Solution

A curated tag system with room for custom freeform tags.

### `OperatorInterestTag`

```typescript
export type OperatorInterestTag =
  // ── Operating styles ────────────────────────────────────────────────
  | "dxing" // Chasing distant contacts
  | "contesting" // Contest participation
  | "ragchewing" // Long casual conversations
  | "net_control" // Running nets
  | "elmering" // Mentoring new operators

  // ── Modes ───────────────────────────────────────────────────────────
  | "cw" // Morse code enthusiast
  | "digital_modes" // General digital modes
  | "ft8" // FT8 / WSJT-X specifically
  | "ssb" // Voice (SSB) operation
  | "am_broadcast" // AM broadcast band DXing
  | "sstv" // Slow-scan television
  | "rtty" // Radioteletype

  // ── Activities ──────────────────────────────────────────────────────
  | "pota" // Parks on the Air
  | "sota" // Summits on the Air
  | "iota" // Islands on the Air
  | "field_day" // ARRL Field Day / portable ops
  | "fox_hunting" // Radio direction finding (T-hunting)
  | "emcomm" // Emergency communications / ARES / RACES
  | "skywarn" // SKYWARN storm spotting

  // ── Equipment & tinkering ───────────────────────────────────────────
  | "qrp" // Low power operation (5W or less)
  | "homebrew" // Kit building, DIY radio construction
  | "sdr_tinkering" // SDR projects, signal processing, GNURadio
  | "antenna_experimenting" // Antenna design, modeling, testing
  | "3d_printing" // 3D-printed radio accessories and enclosures

  // ── Monitoring / SWL ────────────────────────────────────────────────
  | "swl" // Shortwave listening
  | "scanning" // Scanner hobbyist (public safety, aviation, etc.)
  | "adsb_tracking" // ADS-B aircraft tracking
  | "satellite_rx" // Satellite reception (NOAA APT, Meteor M2, GOES)
  | "weather_monitoring" // Weather station / NOAA radio
  | "numbers_stations" // Numbers station monitoring and logging
  | "utility_monitoring" // Utility station DXing (VOLMET, HFDL, etc.)
  | "websdr" // WebSDR / KiwiSDR enthusiast (computer-only)
  | "radio_astronomy" // Radio astronomy and hydrogen line observation

  // ── VHF/UHF specific ───────────────────────────────────────────────
  | "vhf_uhf" // General VHF/UHF activity
  | "repeaters" // Repeater operation
  | "dmr" // Digital Mobile Radio
  | "dstar" // D-STAR digital voice
  | "fusion" // Yaesu System Fusion / C4FM
  | "aprs" // Automatic Packet Reporting System
  | "satellite_ops" // Working amateur satellites (TX, not just RX)
  | "eme" // Earth-Moon-Earth (moonbounce)
  | "meteor_scatter" // Meteor scatter propagation

  // ── Digital / computer networking ───────────────────────────────────
  | "winlink" // Winlink email over radio
  | "js8call" // JS8Call keyboard-to-keyboard messaging
  | "vara" // VARA HF/FM modem
  | "packet_radio" // AX.25 packet radio
  | "mesh_networking" // AREDN, Meshtastic, LoRa mesh

  // ── Extensibility ──────────────────────────────────────────────────
  | (string & {}); // Custom tags beyond this curated list
```

### `OperatorInterests`

```typescript
export interface OperatorInterests {
  tags: OperatorInterestTag[]; // Max 15 curated tags
  customTags?: string[]; // Max 5 freeform custom tags
  primaryInterest?: OperatorInterestTag; // "What I'm most into" — highlighted on profile
}
```

### Tag Display Categories

For UI rendering, tags should be grouped into visual categories:

| Category              | Tags                                                                                                                          | Pill Color |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Operating Styles      | dxing, contesting, ragchewing, net_control, elmering                                                                          | Blue       |
| Modes                 | cw, digital_modes, ft8, ssb, am_broadcast, sstv, rtty                                                                         | Violet     |
| Activities            | pota, sota, iota, field_day, fox_hunting, emcomm, skywarn                                                                     | Green      |
| Equipment & Tinkering | qrp, homebrew, sdr_tinkering, antenna_experimenting, 3d_printing                                                              | Amber      |
| Monitoring / SWL      | swl, scanning, adsb_tracking, satellite_rx, weather_monitoring, numbers_stations, utility_monitoring, websdr, radio_astronomy | Cyan       |
| VHF/UHF               | vhf_uhf, repeaters, dmr, dstar, fusion, aprs, satellite_ops, eme, meteor_scatter                                              | Emerald    |
| Digital / Computer    | winlink, js8call, vara, packet_radio, mesh_networking                                                                         | Rose       |
| Custom                | User-defined tags                                                                                                             | Gray       |

### Profile Store Location

New field on `ProfileStore` in `src/stores/profileStore.ts`:

```typescript
interests: OperatorInterests;
// Default: { tags: [], customTags: [] }
```

### Supabase

New column on `profiles` table:

```sql
ALTER TABLE profiles ADD COLUMN interests jsonb DEFAULT '{"tags":[]}'::jsonb;
```

### Social Feature: Shared Interest Discovery

When viewing another operator's profile, highlight tags you have in common:

```
"You're both into: DXing, QRP, POTA"
```

This can be computed client-side by intersecting `viewer.interests.tags` with `profile.interests.tags`.

---

## 7. Frequency Interests

### Problem

A transmitting operator's frequencies are defined by their license class and band plan — the system already knows what they're allowed to do. But a monitoring operator's identity is defined by _what they listen to_, and there's no way to express that.

A scanner hobbyist monitoring Chicago Fire/EMS, a weather satellite enthusiast capturing NOAA APT passes, and a utility DXer logging HFDL messages all have fundamentally different monitoring setups — but the profile can't distinguish between them.

### Solution

A `FrequencyInterest` list that lets operators describe what they monitor, with enough structure to be queryable and displayable.

### `FrequencyInterest`

```typescript
export interface FrequencyInterest {
  id: string;
  label: string; // User-friendly name
  // e.g. "Chicago Fire/EMS", "20m FT8 Spots",
  //      "NOAA APT 137.1 MHz", "Numbers Station E11"
  service: MonitoredService; // Service category (see Section 4)
  frequencyMHz?: number; // Specific frequency if applicable
  bandOrRange?: string; // Band or range description
  // e.g. "20m", "VHF High Band", "800 MHz trunking"
  mode?: string; // Demodulation mode
  // e.g. "NFM", "P25", "USB", "FT8", "AM"
  notes?: string; // e.g. "Best on weekday evenings",
  //      "Active during severe weather"
  isActive: boolean; // Currently monitoring this
}
```

### Examples

| Label                         | Service         | Frequency | Band/Range | Mode  |
| ----------------------------- | --------------- | --------- | ---------- | ----- |
| "Chicago Fire Zone 1"         | `public_safety` | 460.575   | "UHF"      | "P25" |
| "20m FT8 Spots"               | `amateur`       | 14.074    | "20m"      | "FT8" |
| "NOAA 15 APT"                 | `satellite`     | 137.62    | "VHF"      | "FM"  |
| "Shannon VOLMET"              | `utility`       | 5.505     | "HF"       | "USB" |
| "Boston Center (Air Traffic)" | `aviation`      | 128.75    | "Airband"  | "AM"  |
| "ISM 433 MHz devices"         | `ism`           | —         | "433 MHz"  | —     |
| "WWV Time Signal"             | `time_signal`   | 10.0      | "HF"       | "AM"  |

### Profile Store Location

```typescript
frequencyInterests: FrequencyInterest[];  // Max 20 entries
// Default: []
```

### Supabase

```sql
ALTER TABLE profiles ADD COLUMN frequency_interests jsonb DEFAULT '[]'::jsonb;
```

---

## 8. Operating Habits ("Where I Hang Out")

### Problem

There's no way to tell other operators where to find you — which frequencies you hang out on, which nets you check into, which WebSDR instances you use, or when you're typically active. This information is essential for a social ham radio platform.

### Solution

Structured "operating habits" on the profile.

### `FavoriteFrequency`

```typescript
export interface FavoriteFrequency {
  id: string;
  frequencyMHz: number; // e.g. 14.300, 146.520
  mode?: string; // e.g. "USB", "FM", "FT8"
  label?: string; // e.g. "Maritime Mobile Net", "2m Calling"
  notes?: string; // e.g. "Most evenings after 0200 UTC"
}
```

### `FavoriteNet`

```typescript
export interface FavoriteNet {
  id: string;
  name: string; // e.g. "OMISS Net", "Ten-Ten International"
  frequencyMHz?: number; // e.g. 14.300
  band?: string; // e.g. "20m"
  schedule?: string; // e.g. "Mon/Wed/Fri 0100 UTC"
  url?: string; // Net's website
}
```

### `FavoriteWebSDR`

For computer-only operators and anyone who browses WebSDRs:

```typescript
export interface FavoriteWebSDR {
  id: string;
  name: string; // e.g. "University of Twente WebSDR"
  url: string; // Direct URL to the WebSDR
  location?: string; // e.g. "Enschede, Netherlands"
  notes?: string; // e.g. "Great for 40m EU stations at night"
}
```

### `OperatingHabits`

```typescript
export interface OperatingHabits {
  favoriteFrequencies: FavoriteFrequency[]; // Max 10
  favoriteNets: FavoriteNet[]; // Max 10
  favoriteWebSDRs: FavoriteWebSDR[]; // Max 5
  typicalHoursUtc?: {
    // "When I'm usually active"
    start: number; // 0-23 (UTC hour)
    end: number; // 0-23 (UTC hour)
  };
  openToSkeds: boolean; // "I'm open to scheduling contacts"
}
```

### Relationship to Existing Data

- `typicalHoursUtc` is operator-declared. It complements the computed `qsosByHourUtc` (24-element array from `computeAdvancedStats`) which is derived from actual log data. The profile can show both: "Usually active 0200-0500 UTC" (declared) alongside a heatmap of actual operating times (computed).
- `openToSkeds` connects to the existing `skeds` table in Supabase. When viewing another operator's profile and they have `openToSkeds: true`, show a "Schedule a QSO" button.

### Profile Store Location

```typescript
operatingHabits: OperatingHabits;
// Default: { favoriteFrequencies: [], favoriteNets: [], favoriteWebSDRs: [], openToSkeds: false }
```

### Supabase

```sql
ALTER TABLE profiles ADD COLUMN operating_habits jsonb
  DEFAULT '{"favoriteFrequencies":[],"favoriteNets":[],"favoriteWebSDRs":[],"openToSkeds":false}'::jsonb;
```

---

## 9. Shack Store Extensions

### New Store Fields

Add to `ShackStore` in `src/stores/shackStore.ts`:

```typescript
export interface ShackStore {
  // ... existing fields ...

  // ── New equipment types ─────────────────────────────────────────────
  sdrs: UserSDR[]; // Max 10
  receivers: UserReceiver[]; // Max 10

  // ── New CRUD actions ────────────────────────────────────────────────
  addSDR: (sdr: UserSDR) => void;
  updateSDR: (id: string, updates: Partial<UserSDR>) => void;
  removeSDR: (id: string) => void;

  addReceiver: (receiver: UserReceiver) => void;
  updateReceiver: (id: string, updates: Partial<UserReceiver>) => void;
  removeReceiver: (id: string) => void;
}
```

### New Inventory Limits

Add to `src/types/shack.ts`:

```typescript
export const MAX_SDRS = 10;
export const MAX_RECEIVERS = 10;
```

### Equipment History Extension

Extend the `equipmentType` field on `EquipmentHistoryEntry`:

```typescript
// Current:
equipmentType: "radio" |
  "antenna" |
  "feedline" |
  "inline_component" |
  "accessory" |
  "preset" |
  "chain";

// Extended:
equipmentType: "radio" |
  "antenna" |
  "feedline" |
  "inline_component" |
  "accessory" |
  "preset" |
  "chain" |
  "sdr" |
  "receiver";
```

### Station Chain Extension

Add SDR and receiver as valid chain start nodes in `src/types/stationChain.ts`:

```typescript
// New node types
export interface SDRNode {
  type: "sdr";
  sdrId: string;
}

export interface ReceiverNode {
  type: "receiver";
  receiverId: string;
}

// Extended union
export type ChainNode =
  | RadioNode
  | AccessoryNode
  | FeedlineRunNode
  | AntennaNode
  | SDRNode
  | ReceiverNode;
```

A typical receive-only signal chain:

```
[Antenna] → [Feedline] → [LNA (accessory)] → [SDR] → [Computer/Software]
```

vs. a traditional transceiver chain:

```
[Radio] → [Tuner (accessory)] → [Feedline] → [Antenna]
```

---

## 10. Equipment Card Rendering

### SDR Cards

| Property        | Value                                                                                                    |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| `equipmentType` | `"sdr"`                                                                                                  |
| Accent color    | `#8B5CF6` (violet)                                                                                       |
| `typeLabel`     | SDRType display name: "USB Dongle", "Desktop SDR", "Network SDR", "Transceiver SDR", "Homebrew", "Other" |
| Symbol          | Radio wave + chip/circuit icon                                                                           |
| Primary stats   | Frequency range, instantaneous bandwidth, ADC bits, sample rate                                          |
| Capabilities    | Software list as pills (e.g., "SDR#", "GNU Radio", "WSJT-X")                                             |
| Badges          | "TX Capable" (green, if `canTransmit`), "HF" (if upconverter noted), chipset                             |
| Tier badge      | `SDRTier` value: "starter", "enthusiast", "prosumer", "laboratory"                                       |

### Receiver Cards

| Property        | Value                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `equipmentType` | `"receiver"`                                                                                                                                            |
| Accent color    | `#06B6D4` (cyan)                                                                                                                                        |
| `typeLabel`     | ReceiverCategory display name: "Scanner", "Wideband Receiver", "SWL Radio", "Weather Radio", "AIS Receiver", "ADS-B Receiver", "APRS Receiver", "Other" |
| Symbol          | Headphones + antenna icon                                                                                                                               |
| Primary stats   | Frequency range, memory channels, protocol count                                                                                                        |
| Capabilities    | Modes + digital protocols as pills (e.g., "P25", "DMR", "NFM", "AM")                                                                                    |
| Badges          | Protocol support badges, "Recording" (if `hasRecording`), "Programmable Scan"                                                                           |

### Updated `EquipmentType` Union

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

### Updated `ACCENT_HEX` Map

```typescript
export const ACCENT_HEX: Record<EquipmentType, string> = {
  radio: "#F97316", // orange (existing)
  antenna: "#22C55E", // green (existing)
  feedline: "#14B8A6", // teal (existing)
  accessory: "#F59E0B", // amber (existing)
  inline: "#6B7280", // gray (existing)
  sdr: "#8B5CF6", // violet (new)
  receiver: "#06B6D4", // cyan (new)
};
```

---

## 11. Store Migrations

### Profile Store: Version 9 → 10

All new fields have sensible defaults. Existing users continue to work without any action.

```typescript
if (version < 10) {
  // Operator type: all existing users are transceivers
  if (!state.station?.operatorType) {
    state.station = { ...state.station, operatorType: "transceiver" };
  }

  // Interest tags: empty by default
  if (!state.interests) {
    state.interests = { tags: [], customTags: [] };
  }

  // Frequency interests: empty by default
  if (!state.frequencyInterests) {
    state.frequencyInterests = [];
  }

  // Operating habits: empty by default
  if (!state.operatingHabits) {
    state.operatingHabits = {
      favoriteFrequencies: [],
      favoriteNets: [],
      favoriteWebSDRs: [],
      openToSkeds: false,
    };
  }
}
```

### Shack Store: Version 5 → 6

```typescript
if (version < 6) {
  if (!state.sdrs) state.sdrs = [];
  if (!state.receivers) state.receivers = [];
}
```

All migrations are purely additive — no data loss, no breaking changes, no field renames.

---

## 12. Supabase Schema Changes

### New Tables

| Table            | Purpose                          | Conflict Key  |
| ---------------- | -------------------------------- | ------------- |
| `user_sdrs`      | SDR hardware instances           | `user_id, id` |
| `user_receivers` | Receive-only equipment instances | `user_id, id` |

Both tables follow the established `_snapshot` JSON blob pattern used by all existing equipment tables (`user_radios`, `antennas`, `feedlines`, `accessories`). Indexed columns are extracted for queryability; the full object is stored as `_snapshot: jsonb` for lossless round-trip.

### `user_sdrs` Columns

```sql
CREATE TABLE user_sdrs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name        text NOT NULL,
  sdr_type    text NOT NULL,
  manufacturer text,
  model       text,
  chipset     text,
  can_transmit boolean NOT NULL DEFAULT false,
  interface   text,
  _snapshot   jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, id)
);
```

### `user_receivers` Columns

```sql
CREATE TABLE user_receivers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name        text NOT NULL,
  category    text NOT NULL,
  manufacturer text,
  model       text,
  _snapshot   jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, id)
);
```

### Profile Table Alterations

```sql
ALTER TABLE profiles
  ADD COLUMN operator_type text DEFAULT 'transceiver',
  ADD COLUMN interests jsonb DEFAULT '{"tags":[]}'::jsonb,
  ADD COLUMN frequency_interests jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN operating_habits jsonb DEFAULT '{"favoriteFrequencies":[],"favoriteNets":[],"favoriteWebSDRs":[],"openToSkeds":false}'::jsonb;
```

### Sync Module Updates

Add to `src/lib/sync/modules/shackSync.ts`:

```typescript
// Table definition for user_sdrs
{
  table: "user_sdrs",
  conflictKey: ["user_id", "id"],
  toRow: (sdr: UserSDR, userId: string) => ({
    id: sdr.id,
    user_id: userId,
    name: sdr.name,
    sdr_type: sdr.sdrType,
    manufacturer: sdr.manufacturer ?? null,
    model: sdr.model ?? null,
    chipset: sdr.chipset ?? null,
    can_transmit: sdr.canTransmit,
    interface: sdr.interface ?? null,
    _snapshot: sdr,
  }),
  fromRow: (row: any): UserSDR => row._snapshot,
}

// Table definition for user_receivers
{
  table: "user_receivers",
  conflictKey: ["user_id", "id"],
  toRow: (receiver: UserReceiver, userId: string) => ({
    id: receiver.id,
    user_id: userId,
    name: receiver.name,
    category: receiver.category,
    manufacturer: receiver.manufacturer ?? null,
    model: receiver.model ?? null,
    _snapshot: receiver,
  }),
  fromRow: (row: any): UserReceiver => row._snapshot,
}
```

---

## 13. Impact on Existing Features

| Feature                           | Current Behavior                                                    | After This Change                                                                |
| --------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Profile completeness**          | Requires a radio for equipment credit                               | SDR or receiver counts as equipment for `receive_only`/`computer_only` operators |
| **Rank points**                   | `equipmentCount` counts radios + antennas + feedlines + accessories | Includes SDRs and receivers in the count — no formula change needed              |
| **Equipment summary (profile)**   | Shows active radio, first antenna, first feedline                   | Also shows first SDR and/or first receiver                                       |
| **EquipmentSection (shack page)** | 5 managers: Radio, Antenna, Feedline, Accessory, Inline             | 7 managers: adds SDR Manager and Receiver Manager                                |
| **Signal chain builder**          | Radio as chain start node                                           | SDR or receiver as alternative chain start nodes                                 |
| **Band capability strip**         | Derives coverage from radio bands + antenna bands                   | Includes SDR frequency range and receiver bands                                  |
| **Operating profiles**            | "listener" preset is UI-only                                        | Auto-selects for `operatorType === "receive_only"` or `"computer_only"`          |
| **Share card**                    | Shows callsign, grid, rank, QSO stats                               | Can include interest tag pills and operator type badge                           |
| **Public profile**                | Shows license class badge                                           | Shows "SWL", "Monitoring Station", or "WebSDR Listener" badge when appropriate   |
| **Equipment visibility**          | `equipment: VisibilityLevel`                                        | Same setting covers SDRs and receivers — no new privacy controls needed          |
| **Profile search** (future)       | Search by callsign, grid                                            | Can also search/filter by interest tags, operator type, monitored services       |

---

## 14. Files to Modify

### Type Definitions

| File                        | Changes                                                                                                                                                                                                                                                                                                   |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/types/shack.ts`        | Add `UserSDR`, `UserReceiver`, `SDRType`, `SDRSoftware`, `SDRTier`, `ReceiverCategory`, `ReceiverMode`, `DigitalProtocol`, `MonitoredService`. Add 12 new `UserAntennaType` values. Add `ANTENNA_TYPE_TO_PATTERN` entries. Add `MAX_SDRS`, `MAX_RECEIVERS`. Extend `EquipmentHistoryEntry.equipmentType`. |
| `src/types/radio.ts`        | No changes needed — SDR types live in `shack.ts` since they're a different equipment category                                                                                                                                                                                                             |
| `src/types/user.ts`         | Add `OperatorType`. Add `"SWL"`, `"UNLICENSED"` to `LicenseClass`. Add `OperatorInterestTag`, `OperatorInterests`. Add `operatorType` to `UserStation`.                                                                                                                                                   |
| `src/types/social.ts`       | Add `FrequencyInterest`, `FavoriteFrequency`, `FavoriteNet`, `FavoriteWebSDR`, `OperatingHabits`.                                                                                                                                                                                                         |
| `src/types/stationChain.ts` | Add `SDRNode`, `ReceiverNode` to `ChainNode` union.                                                                                                                                                                                                                                                       |
| `src/types/supabase.ts`     | Add row types for `user_sdrs` and `user_receivers` tables. Add new columns to `profiles` row type.                                                                                                                                                                                                        |

### Stores

| File                         | Changes                                                                                                                                                                     |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/stores/shackStore.ts`   | Add `sdrs: UserSDR[]`, `receivers: UserReceiver[]` to state. Add CRUD actions. Version 5 → 6 migration.                                                                     |
| `src/stores/profileStore.ts` | Add `interests: OperatorInterests`, `frequencyInterests: FrequencyInterest[]`, `operatingHabits: OperatingHabits`. Add `operatorType` to station. Version 9 → 10 migration. |

### Equipment Card System

| File                                         | Changes                                                          |
| -------------------------------------------- | ---------------------------------------------------------------- |
| `src/components/shack/equipmentCardTypes.ts` | Add `"sdr"`, `"receiver"` to `EquipmentType`. Add accent colors. |

### Sync

| File                                | Changes                                                      |
| ----------------------------------- | ------------------------------------------------------------ |
| `src/lib/sync/modules/shackSync.ts` | Add `user_sdrs` and `user_receivers` table sync definitions. |

---

_This document specifies the schema design only. UI implementation, Supabase migration scripts, and profile page redesign are separate follow-up work._
