# FT8 Integration Strategy
## Supplemental to SDR Product Vision Document

**Prepared:** February 2026
**Classification:** Internal Strategy Document
**Scope:** FT8 ecosystem analysis, integration architecture, contesting features, and user delight opportunities — informing built-in FT8 decode capability in the SDR platform

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [The FT8 Landscape Today](#2-the-ft8-landscape-today)
3. [Competitive Tool Profiles](#3-competitive-tool-profiles)
4. [The Integration Pain Map](#4-the-integration-pain-map)
5. [User Segment Analysis: What Each Operator Wants from FT8](#5-user-segment-analysis)
6. [Contesting Deep-Dive](#6-contesting-deep-dive)
7. [The Casual User Delight Opportunity](#7-the-casual-user-delight-opportunity)
8. [Architecture: How FT8 Should Live Inside an SDR](#8-architecture-how-ft8-should-live-inside-an-sdr)
9. [Feature Prioritization (Kano Model)](#9-feature-prioritization-kano-model)
10. [Proposed FT8 Roadmap](#10-proposed-ft8-roadmap)
11. [Sources](#11-sources)

---

## 1. Executive Summary

FT8 has fundamentally reshaped amateur radio. Since its June 2017 release, it has become the dominant digital mode on HF, accounting for a majority of logged QSOs on platforms like Club Log and PSK Reporter. Its ability to decode signals at -21 dB SNR in a 2500 Hz bandwidth has democratized DX — operators with modest antennas and low power can now work stations that would be impossible on SSB or CW.

Yet the FT8 user experience remains fractured. **The typical FT8 setup requires 5–10 separate applications**, connected by virtual audio cables, serial port splitters, UDP message forwarding, and prayer. This "plumbing problem" is the single largest barrier to adoption and the single largest source of frustration across every user segment — from the novice who abandons after an hour of audio routing to the contester running three WSJT-X instances at 80% CPU.

**Our platform already has FT8 decode capability built in.** This is a strategic advantage that most SDR clients lack. The question is not whether to support FT8, but how deeply to integrate it — and how to make that integration so seamless that it redefines what operators expect from FT8 software.

This document maps the competitive landscape, dissects pain points by user segment, details contesting requirements, and proposes an integration architecture that collapses the multi-app FT8 stack into a unified experience. The goal: **an operator should be able to tune to an FT8 frequency and watch decoded callsigns appear on a map within 30 seconds of launch, with zero configuration.**

---

## 2. The FT8 Landscape Today

### 2.1 Protocol Fundamentals

FT8 is an 8-GFSK modulation scheme designed for weak-signal communication. Understanding its constraints is essential for integration design:

| Parameter | Value | Design Implication |
|-----------|-------|--------------------|
| Modulation | 8-GFSK (8-level Gaussian FSK) | 50 Hz signal bandwidth; dense packing on waterfall |
| TX/RX Cycle | 15 seconds (12.64s TX, 2.36s decode) | All UI timing must respect this cadence |
| Message Payload | 77 bits (≈13 text characters) | Callsign + grid + report is the typical exchange |
| Decode Sensitivity | -21 dB SNR in 2500 Hz BW | Signals invisible on the waterfall are decodable |
| Frequency Stability | Requires ±1 second time sync | Clock drift is a critical failure mode |
| Passband | Full 2500 Hz monitored simultaneously | Multi-signal decode is inherent to the protocol |
| Tone Spacing | 6.25 Hz | High-resolution FFT required for clean separation |

The 15-second cycle is the heartbeat of FT8. Every UI element, every animation, every notification must be phase-locked to this rhythm. A standard QSO completes in 4–6 cycles (60–90 seconds): CQ → call → report → R+report → RR73 → 73.

### 2.2 The Multi-App Reality

Today's FT8 operator typically runs this software stack:

```
┌─────────────────────────────────────────────────────┐
│  WSJT-X / JTDX          (decode + encode + CAT)    │
│       ↕ Virtual Audio Cable                          │
│  SDR Client / Radio Control Software                 │
│       ↕ UDP Port 2237                                │
│  JTAlert                 (middleware + alerts)       │
│       ↕ UDP Forwarding                               │
│  GridTracker             (map visualization)         │
│       ↕ ADIF                                         │
│  Logger (N1MM+ / Log4OM) (logging + QSL)            │
│       ↕ API                                          │
│  LoTW / QRZ / ClubLog   (confirmation services)     │
│       ↕ NTP                                          │
│  Time Sync Client        (Meinberg / BktTimeSync)   │
└─────────────────────────────────────────────────────┘
```

That's **7 applications** for a full FT8 experience. Each junction is a failure point. Each requires independent configuration. The cognitive overhead alone discourages casual adoption.

### 2.3 Market Size and Growth

FT8 adoption metrics (sourced from Club Log, PSK Reporter, and ARRL reporting):

- By the end of 2017 (six months after launch), 15% of all Club Log QSOs were FT8 (4.8M of 32M)
- FT8 became the most-used digital mode within two years of release
- On 6 meters, FT8 accounts for approximately 85% of all activity
- PSK Reporter processes millions of FT8 reception reports daily, making it the largest real-time propagation monitoring network in amateur radio
- FT8's rise correlates with measured declines in CW, SSB, and RTTY activity on HF

The mode is not a fad. It is the new baseline for digital amateur radio.

---

## 3. Competitive Tool Profiles

### 3.1 WSJT-X (The Reference Implementation)

**Developer:** Joe Taylor K1JT et al. | **Version:** 2.7.0 (stable release Feb 2025)
**Modes:** FT8, FT4, JT9, JT65, Q65, FST4, FST4W, MSK144, WSPR, Echo (11 total)

WSJT-X is the gravitational center of the FT8 universe. Every other tool either extends it, forks it, or consumes its output. Key characteristics:

**Strengths:** Reference-grade decoding algorithms (Belief Propagation + Ordered Statistics Decoding). Contest-specific modes for ARRL Field Day, FT Roundup, CQ WW. Fox/Hound and new SuperFox mode for DXpeditions. UDP broadcast protocol (port 2237) enables ecosystem integration. Free, open-source.

**Weaknesses:** No built-in map visualization. No integrated logging beyond local ADIF. Requires virtual audio cables for SDR integration. Multi-instance operation requires CLI parameters and manual port management. UI is functional but dated (Qt-based, not modernized since initial release). Time synchronization is external.

**SuperFox Mode (New in 2.7):** Constant-envelope waveform replacing the 5-signal Fox mode. Transmits to up to 9 Hounds simultaneously with +10 dB system gain. Includes digital signature verification. First deployed at the N5J Jarvis Island DXpedition (2024). Requires 2.7.0-rc5+ on both ends.

**Strategic insight:** WSJT-X's UDP protocol is the de facto API standard. Any integrated FT8 solution should either consume this protocol (for interoperability) or provide a superset.

### 3.2 JTDX (The DXer's Fork)

**Developer:** Igor UA3DJY / Arvo ES1JA | **Status:** Active

JTDX is optimized for weak-signal DXing. Its decoder uses enhanced passband filtering and caller prioritization that can outperform WSJT-X in crowded conditions, particularly on JT65.

**Key differentiator:** Caller prioritization by distance or SNR. In a pileup, JTDX can automatically prioritize the weakest or most distant stations — exactly what a DXer wants.

**Limitation:** Does not support FT4 or the contest exchange modes that WSJT-X offers. This makes it a DX tool, not a contest tool.

### 3.3 JS8Call (The Messaging Extension)

**Developer:** Jordan Sherer KN4CRD | **Status:** Active

JS8Call transforms the FT8 modulation scheme into a keyboard-to-keyboard messaging system. Uses JS8 (not standard FT8) with 22-character frames at ~15 WPM. Features message relay, stored inbox, and cross-band capabilities. Represents what FT8 could become if freed from the 77-bit message constraint.

**Relevance to our platform:** JS8Call demonstrates user appetite for FT8-adjacent messaging that goes beyond the standard QSO exchange. A "chat mode" built on FT8 modulation could be a differentiator.

### 3.4 MSHV (Multi-Stream for DXpeditions)

**Developer:** LZ2HV | **Status:** Active

MSHV enables parallel FT8 QSOs from a DX station, transmitting multiple simultaneous signals across a wider passband. Designed for DXpeditions and semi-rare activations where QSO rate matters. Also strong for EME (Earth-Moon-Earth) work.

**Relevance:** Multi-stream transmit is a feature power users want. If our platform supports transmit-capable hardware, MSHV's approach to parallel QSOs is worth studying.

### 3.5 Spark SDR (The Integrated Pioneer)

**Developer:** M0NNB | **Platforms:** Windows, Linux, Mac, Raspberry Pi
**Hardware:** Hermes Lite 2, Red Pitaya, Apache Labs, SDRplay

Spark SDR is the closest existing product to what we're building. It integrates FT8, FT4, WSPR, JT65, JT9, PSK31, FST4, and FST4W decode directly into the SDR client — no virtual audio cables required. Audio flows internally. Additionally features neural-network noise reduction.

**What Spark SDR gets right:** Zero-configuration digital mode decoding. The signal path stays inside one application. Time correction uses NTP internally.

**What Spark SDR gets wrong:** Limited hardware support (no RTL-SDR, no Airspy, no HackRF). No map visualization. No contest integration. Small user community. No DX Cluster overlay. Essentially proves the concept without delivering the full vision.

**Strategic insight:** Spark SDR validates our thesis. Built-in decode without virtual audio cables is a genuine differentiator. But Spark SDR stopped at decode — it didn't build the visualization, logging, or contesting layers on top. That's our opportunity.

### 3.6 GridTracker (The Visualization Layer)

**Platforms:** Windows, Mac, Linux, Raspberry Pi | **Pricing:** Free / donation

GridTracker consumes WSJT-X UDP broadcasts and renders decoded contacts on an interactive map with greyline overlay, moon position, PSK Reporter data (24-hour history), award tracking, and solar condition display. It's the "fun layer" that transforms FT8 from a text log into a visual experience.

**Community sentiment:** "Making FT8 Fun Again with GridTracker" — the title of a widely-shared blog post that captures GridTracker's role. Operators who discover GridTracker often say it reignited their interest in FT8.

**Strategic insight:** GridTracker's map is the feature casual users want most. Building equivalent (or superior) map visualization natively into our SDR client would be a major delight factor. The fact that GridTracker requires a separate application, separate configuration, and separate UDP setup is pure friction we can eliminate.

### 3.7 PSK Reporter (The Global Network)

PSK Reporter is the backbone of FT8 propagation awareness. Operators worldwide run reporting clients that automatically upload every decoded callsign, creating a real-time map of who-hears-whom across the globe. The data is freely accessible and visualizable.

**Integration opportunity:** Our platform should report to PSK Reporter automatically (with user consent) and consume PSK Reporter data to show real-time propagation overlays. This creates a feedback loop: "I can see where my signal is being heard" and "I can see what's propagating right now."

### 3.8 Competitive Comparison Matrix

| Capability | WSJT-X | JTDX | Spark SDR | Our Platform (Target) |
|-----------|:------:|:----:|:---------:|:--------------------:|
| FT8 Decode | ● | ● | ● | ● |
| FT4 Decode | ● | ○ | ● | ● |
| No Virtual Audio Required | ○ | ○ | ● | ● |
| Built-in Map Visualization | ○ | ○ | ○ | ● |
| DX Cluster Overlay | ○ | ○ | ○ | ● |
| Contest Exchange Modes | ● | ○ | ○ | ● |
| SuperFox/Fox-Hound | ● | ○ | ○ | ● |
| Integrated Logging | ◐ | ◐ | ○ | ● |
| PSK Reporter Integration | ◐ | ◐ | ○ | ● |
| Multi-Band Simultaneous | ◐ | ◐ | ● | ● |
| Time Sync Built-in | ○ | ○ | ● | ● |
| Cross-Platform | ● | ● | ● | ● |
| RTL-SDR Support | ○ | ○ | ○ | ● |
| Broad Hardware Support | ○ | ○ | ◐ | ● |

● = Full | ◐ = Partial | ○ = None

---

## 4. The Integration Pain Map

The FT8 user experience is defined by its pain points. Understanding these in detail — and by segment — reveals exactly where integration creates value.

### 4.1 The Setup Wall (Affects All Users, Devastating for Novices)

**Virtual Audio Cable Hell:** The #1 cited frustration across all forums. Connecting WSJT-X to an SDR client requires:
- Installing a virtual audio cable driver (Virtual Audio Cable at $30, or free VB-Cable)
- Configuring sample rates to match (48 kHz) on both ends
- Setting the correct input/output device in both applications
- Avoiding feedback loops (same cable used for both directions)
- Debugging when Windows silently switches the default audio device after plugging in a USB headset

On Mac, the situation is worse: SoundFlower is deprecated, Loopback costs $100+, and the configuration is trial-and-error. On Linux, no paid software is needed, but loopback device configuration requires command-line knowledge.

**Our advantage:** With FT8 decode built into the SDR client, virtual audio cables are eliminated entirely. The IQ data flows from the SDR hardware through our DSP pipeline directly to the FT8 decoder. This alone removes the most-cited pain point in the entire FT8 ecosystem.

**CAT Control Collision:** When an SDR client and WSJT-X both need to control the radio, they fight over the serial port. Solutions (virtual serial port splitters like com0com) add yet another layer of complexity. With integrated decode, the SDR client owns CAT control and the FT8 decoder accesses frequency data internally.

**Time Synchronization:** FT8 requires clock accuracy within ±1 second. At ±1.5 seconds, decode rates drop sharply; at ±2 seconds, operation is essentially impossible. Users must run external NTP clients (Meinberg, BktTimeSync) or GPS-disciplined clocks. NTP is described as "hit or miss" by community members, with 1–3 second errors reported. Our platform should validate time sync at startup and warn (or auto-correct) if drift exceeds tolerance.

### 4.2 The Fragmentation Tax (Affects Intermediate and Advanced Users)

**Multi-App Cascading Failures:** Each application in the FT8 stack is a potential failure point. When one component crashes or misconfigures, the cascade is unpredictable:
- DAX audio driver crash takes down WSJT-X decode
- UDP port conflict prevents GridTracker from receiving data
- Logging software loses connection, contacts aren't recorded
- NTP drift accumulates during a long session, causing gradual decode degradation

**Multi-Instance CPU Saturation:** Running two WSJT-X instances (for multi-band operation) pushes CPU utilization to 80–100%. At 100%, decode display doesn't complete. Adding GridTracker and a logger pushes the system over the edge. Users describe this as "too much stress to operate."

**Our advantage:** A single-process architecture where FT8 decode, visualization, and logging share memory and CPU cycles eliminates inter-process communication overhead and the multi-app failure cascade.

### 4.3 The Logging Labyrinth (Affects Everyone Who Wants QSO Confirmation)

After making an FT8 contact, the operator must:
1. Export the QSO from WSJT-X (ADIF file)
2. Import into a logging program (Log4OM, Logger32, Cloudlog)
3. Upload to LoTW (ARRL's Logbook of the World)
4. Upload to QRZ.com logbook
5. Upload to eQSL
6. Upload to Club Log
7. Optionally upload to POTA/SOTA databases

Each platform has its own authentication, format requirements, and failure modes. Users report power fields showing 0W on QRZ despite correct logging. LoTW is described as "unwilling to accept change requests for design." There is no single authoritative QSO confirmation database.

**Our opportunity:** Integrated logging with one-click upload to all major platforms. The operator works a station; the contact appears in the log; confirmation uploads happen in the background.

---

## 5. User Segment Analysis

### 5.1 The Curious Newcomer (SWL / Novice)

**Who they are:** Just got an RTL-SDR dongle. Saw a YouTube video about decoding signals. Wants to see FT8 messages appearing on their screen. May not have a license yet. Definitely not transmitting.

**What they want:**
- Tune to 14.074 MHz and see decoded callsigns appear — immediately
- Understand what they're seeing (who is calling whom, where are they, how strong)
- See contacts plotted on a world map in real-time
- Feel the "magic" of pulling signals out of noise
- Zero configuration: no audio routing, no external apps, no command-line parameters

**What they get today:** A 45-minute setup process involving WSJT-X, virtual audio cables, sample rate configuration, and a blank waterfall that produces no decodes because their clock is 3 seconds off.

**Delight opportunity:** The "wow moment" is seeing a callsign from Japan or Australia decoded and plotted on a map, from a $25 dongle and a piece of wire. If that happens within 60 seconds of launching the software, we've created a lifelong radio enthusiast. If it takes 45 minutes and three forum posts, we've lost them.

**Key features for this segment:**
- One-click FT8 decode: select band, see decodes
- Built-in world map with decoded stations plotted in real-time
- Callsign info popups (country, grid square, distance from listener)
- Color-coded signal strength on the map
- "What is FT8?" inline tutorial explaining the protocol as decodes appear
- Automatic time sync validation at startup
- Band presets with one-click tuning to FT8 frequencies

### 5.2 The Casual Operator (Licensed, Occasional FT8)

**Who they are:** General or Extra class licensee who operates FT8 a few times a week. Enjoys watching the bands, working new grids, and occasionally chasing a rare DX spot. Not a contester. Values simplicity and reliability.

**What they want:**
- Quick startup: launch the app, start operating within a minute
- Session continuity: "remember where I was" — last frequency, last mode, last filter settings
- Visual feedback on their progress: grids worked, countries confirmed, band activity
- Background monitoring with alerts: "notify me when a new DXCC appears on the waterfall"
- Clean audio and reliable decode without fiddling
- Easy logging that syncs to LoTW and QRZ without manual export/import

**What frustrates them today:**
- "Every time I sit down to operate FT8, something has broken since last time" — audio routing, COM port, time sync
- GridTracker requires separate setup and occasionally loses UDP connection
- Logging is a multi-step process across multiple applications
- Settings don't persist reliably across sessions (HDSDR's bug, but a universal concern)

**Delight opportunity:** Session persistence that truly works. The operator closes the application on Tuesday; when they open it Friday, everything is exactly as they left it — frequency, decoded stations, log, map view. One new thing: a notification badge saying "3 new DXCCs active on 20m since your last session." That's the kind of contextual awareness that creates loyalty.

**Key features for this segment:**
- Full session state persistence
- Award tracking dashboard (DXCC, WAS, VUCC grids) with progress visualization
- Background monitoring mode: decode FT8 in the background, alert on configurable triggers (new DXCC, new grid, specific callsign)
- One-click logging with automatic upload to LoTW, QRZ, ClubLog, eQSL
- Band condition indicator drawn from live FT8 decode data
- "New entity" and "needed grid" highlighting on waterfall and map

### 5.3 The DXer (Serious, Active, Competitive)

**Who they are:** Chases DXCC entities, works DXpeditions, monitors DX Cluster spots. May run a remote station. Has deep RF knowledge and opinions about decoder performance. Will switch software for a 1 dB decode advantage.

**What they want:**
- Superior decode sensitivity — every marginal signal matters
- DX Cluster integration with spots rendered on the waterfall and map simultaneously
- Fox/Hound and SuperFox mode support for DXpeditions
- One-click "work the spot" workflow: see a DX Cluster spot, click it, auto-tune, auto-log
- Multi-band monitoring: watch 20m and 40m simultaneously for band openings
- Propagation overlay: grayline, MUF prediction, solar data integrated with the spectrum display
- Fast QSO confirmation: LoTW upload within seconds of logging
- QSO B4 ("before") checking: instant indication if a station is a dupe or a new entity

**What frustrates them today:**
- Fox/Hound mode has frequency range limitations; Fox transmits at 300–900 Hz, but many radios have passband cutoff issues at low frequencies
- SuperFox requires everyone on 2.7.0-rc5+; version fragmentation causes failed QSOs
- Multi-instance WSJT-X for multi-band pushes CPU to 100%
- No single application integrates DX Cluster + FT8 decode + map + logging
- The "plumbing" between WSJT-X and logging software fails at the worst moment — during a DXpedition pileup

**Delight opportunity:** A single screen showing the waterfall with FT8 decodes, DX Cluster spots overlaid, a real-time map, propagation data, and a log — all integrated, all live, all in one application. The DXer sees a spot, clicks it, works the station, and the QSO flows into LoTW before the next 15-second cycle begins.

### 5.4 The Contester (Optimized for Rate and Score)

**Who they are:** Competes in ARRL Field Day, FT Roundup, CQ WW DIGI, and the WW DIGI Contest. Thinks in QSOs-per-hour and multiplier grids. May run multi-band or multi-operator setups. Values speed, automation, and score awareness.

**What they want:** See Section 6 (Contesting Deep-Dive) for the full analysis.

### 5.5 The Elmer (Veteran Who Mentors)

**Who they are:** Been in radio for decades. Uses FT8 but has mixed feelings about it. Values it as a tool for helping newcomers experience DX. May use it for propagation analysis as much as for QSOs.

**What they want:**
- A platform they can recommend to newcomers that "just works"
- Propagation analysis tools powered by FT8 decode data (the Elmer sees FT8 as a propagation sensor network)
- A/B comparison of decode algorithms (the empiricist mindset: "show me which decoder is better")
- The ability to script or customize the FT8 workflow
- Integration with their existing logging ecosystem without disrupting it

**Delight opportunity:** A "Propagation Radar" view that aggregates FT8 decodes into a real-time propagation map — showing which bands are open, to where, with what signal strengths. This transforms FT8 from "making contacts" into "understanding the ionosphere." For an Elmer, that's more compelling than another QSO.

---

## 6. Contesting Deep-Dive

### 6.1 FT8 Contest Landscape

FT8 contesting is a growing but constrained domain. The 15-second cycle creates an inherent rate ceiling that traditional mode contesters find frustrating, but the mode's weak-signal capability makes it invaluable for low-power and compromise-antenna stations.

**Major contests supporting FT8/FT4:**
- ARRL Field Day (June) — FT8/FT4 on 80, 40, 20, 15, 10, 6 meters
- FT Roundup / FT Challenge — dedicated FT8/FT4 contest
- CQ WW DIGI — FT8 with grid-based scoring
- ARRL International Digital Contest — distance-based scoring
- WW DIGI Contest — grid exchange, QSO points × grid multipliers
- European FT8 Club contests — growing calendar of FT8-specific events

### 6.2 Rate Economics

The fundamental contesting tension:

| Mode | Typical QSO Duration | Theoretical Max Rate/Hr | Practical Rate/Hr |
|------|----------------------|------------------------|-------------------|
| CW (expert) | 15–30 seconds | 200+ | 100–150 |
| SSB (expert) | 20–45 seconds | 120+ | 60–100 |
| FT8 | 60–90 seconds | 40 | ~7.4 (measured) |
| FT4 | 30–45 seconds | 80 | ~20–30 |

FT8's 7.4 QSO/hour measured rate vs. CW's 100+ is a 13× disadvantage. FT4 narrows the gap significantly but remains slower than voice or CW. The tradeoff: FT8/FT4 contacts work at signal levels where SSB and CW are impossible.

**Implication for our platform:** Contest mode must emphasize efficiency. Every second saved in the UI — faster spot clicking, auto-logging, auto-frequency selection — compounds over a contest weekend. The goal is to approach the theoretical maximum rate by eliminating all human-UI latency.

### 6.3 Contest Exchange Formats

FT8 contest exchanges are constrained by the 77-bit message format:

- **Standard QSO:** Callsign + grid (4-character Maidenhead) + signal report
- **Field Day:** Callsign + class + ARRL section (e.g., "1A ENY")
- **RTTY Roundup style:** Callsign + state/province or serial number
- **WW DIGI:** Grid(4) exchange with distance-based scoring

WSJT-X handles these by switching to contest-specific exchange templates. Our platform must support the same templates and make contest mode selection obvious and easy to configure.

### 6.4 Scoring Mechanics

Typical FT8 contest scoring (WW DIGI example):
- **QSO Points:** 1 + 1 point per 3,000 km between grid squares
- **Multipliers:** Sum of unique 2-character grid fields contacted per band
- **Final Score:** Σ(QSO points) × Σ(grid multipliers)

**Feature requirement:** A real-time score display that updates after each QSO, showing: current score, QSO count, multiplier count, rate meter (QSOs/hour, rolling 10-minute and 60-minute windows), and multiplier map showing needed vs. worked grids.

### 6.5 SuperFox and DXpedition Modes

SuperFox (WSJT-X 2.7) is the latest evolution in high-rate FT8 operation:
- Constant-envelope waveform (no inter-modulation from multi-tone)
- Up to 9 simultaneous Hound responses (+10 dB system gain vs. old Fox mode)
- Digital signature verification (callsign authenticity)
- 26-character free text to up to 4 Hounds simultaneously
- Hounds can call anywhere in 0–1000 Hz range (expanded from previous restriction)

**Community frustration with old Fox/Hound:** "Four streams, not completing QSOs, over and over — very disappointing and frustrating." SuperFox addresses the power-distribution problem of the old mode but requires both sides on 2.7.0-rc5+, creating version-compatibility friction.

**Our platform should support:** SuperFox protocol (as it becomes the standard for DXpeditions), with clear UI indication of mode and automatic version negotiation.

### 6.6 Contester Feature Requirements

Based on community analysis, the contest-optimized FT8 experience requires:

**Pre-Contest:**
- Contest template selection (ARRL Field Day, WW DIGI, FT Roundup, etc.)
- Exchange configuration (grid, serial number, section)
- Band plan overlay showing contest frequencies
- Logging software integration setup (N1MM+, Logger32, or built-in)

**During Contest:**
- Real-time score dashboard (current score, rate meters, multiplier map)
- "Needed multiplier" highlighting on waterfall and map
- Auto-sequence with manual override
- Multi-band monitoring with automatic band-switching suggestions based on propagation
- Dupe checking against contest log (instant visual indicator)
- QSO timer showing time remaining in 15-second cycle
- Pass/fail indicator for each exchange (did the other station receive your report?)

**Post-Contest:**
- Cabrillo file generation (standard contest submission format)
- Score summary with breakdown by band and hour
- Multiplier map showing geographic coverage
- Log export in ADIF for permanent record

---

## 7. The Casual User Delight Opportunity

This section addresses what may be the largest untapped audience: people who want to experience FT8 without becoming FT8 experts. They want the "wow" without the "how."

### 7.1 The 30-Second FT8 Experience

**Vision:** An operator (or even a non-licensed SWL) launches the application, selects a band, and within 30 seconds sees:

1. The waterfall populating with FT8 signals (narrow vertical traces at 6.25 Hz spacing)
2. Decoded callsigns appearing in a decode panel, each tagged with: callsign, grid square, country flag, distance, signal strength (dB)
3. A world map with dots appearing in real-time — each dot a decoded station, colored by signal strength, labeled with callsign
4. Connecting lines showing who is calling whom (CQ stations highlighted differently from QSO-in-progress)
5. A propagation heat map emerging as more decodes accumulate, showing which directions are open

No configuration. No virtual audio cables. No time sync (handled automatically). No WSJT-X. Just tune and watch.

This experience does not exist in any product today. GridTracker approximates it, but requires a separate WSJT-X installation, UDP configuration, and audio routing. Our platform can deliver it natively.

### 7.2 Progressive Engagement

The casual experience should naturally deepen based on operator interest:

**Level 1 — Watch (SWL / Newcomer):**
- Decode and display only (receive-only, no transmit)
- World map with decoded stations
- Band activity indicator
- "What is this?" tooltips on every element

**Level 2 — Explore (Curious Operator):**
- Award tracking: "You've decoded stations in 47 countries today!"
- Historical decode logging: "Your best DX this week was 12,340 km to ZL land"
- PSK Reporter integration: see where your RTL-SDR is hearing stations
- Band comparison: "40m has 3× more activity than 20m right now"

**Level 3 — Operate (Licensed, Transmit-Capable):**
- Full FT8 QSO capability
- Auto-sequence with CQ calling
- Logging with one-click upload
- QSL management

**Level 4 — Compete (Contester):**
- Contest mode with scoring
- Multi-band operation
- Rate optimization tools
- SuperFox/DXpedition support

Each level unlocks naturally. The UI surface area grows only when the operator demonstrates readiness (by enabling features or entering setup for the first time).

### 7.3 The Map as the Primary Interface

A radical design proposition: **what if the map IS the primary FT8 interface, not the waterfall?**

Traditional FT8 software centers the waterfall. But for casual users, the waterfall is opaque — a field of colored lines with no obvious meaning. The map, by contrast, is immediately legible: dots on a globe, each representing a station, each telling a story of propagation, distance, and RF magic.

**Map-first FT8 design:**
- Globe or Mercator projection as the main view
- Decoded stations appear as animated dots (pulse on decode, fade over time)
- CQ stations are highlighted (larger, brighter) — "these stations are calling, right now"
- Grayline overlay shows the terminator (dawn/dusk line)
- Click a station dot to see decode details, historical contacts, QSL status
- The waterfall becomes a secondary panel (expandable for power users)
- Band switcher shows activity heatmaps per band on the map before you tune

This inversion of the traditional SDR UI hierarchy would be genuinely novel. No FT8 tool puts the map first. Everyone starts with the waterfall or the decode list. For casual users, the map tells a story that the waterfall can't.

### 7.4 Social and Gamification Elements

FT8's data-rich nature enables social and gamification features that other modes can't support:

- **Daily/Weekly Decode Stats:** "You decoded 1,247 stations across 63 countries today"
- **Achievement System:** "First decode from Antarctica!" / "Decoded all 6 continents in one session"
- **Propagation Challenges:** "40m just opened to Japan — tune in and decode a JA station"
- **Leaderboards:** Opt-in decode count rankings (receive-only, so accessible to unlicensed users)
- **Decode Sharing:** Share a screenshot/link of your decode map ("look what my $25 dongle heard today")

These features cost nothing to implement once the decode and map infrastructure exist, but they create stickiness and community engagement that no current FT8 tool offers.

---

## 8. Architecture: How FT8 Should Live Inside an SDR

### 8.1 Signal Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     SDR PLATFORM                             │
│                                                              │
│  SDR Hardware → IQ Stream → DSP Pipeline → Audio Output      │
│                      ↓                                       │
│              FT8 Decoder Engine                               │
│                      ↓                                       │
│         ┌────────────┼────────────────┐                      │
│         ↓            ↓                ↓                      │
│    Decode Panel   Map Engine    Contest Engine                │
│         ↓            ↓                ↓                      │
│    Log Manager   PSK Reporter   Score Tracker                │
│         ↓                                                    │
│    LoTW / QRZ / ClubLog / eQSL (background sync)            │
│                                                              │
│  Optional: WSJT-X UDP Compatibility Layer (port 2237)        │
│            ↓                                                 │
│    External apps (GridTracker, JTAlert, N1MM+)               │
└─────────────────────────────────────────────────────────────┘
```

**Key architectural decisions:**

1. **Internal audio path:** IQ data from the SDR hardware feeds the FT8 decoder directly. No virtual audio cables. No external audio routing. The decoder receives baseband audio from the same DSP pipeline that feeds the speaker output.

2. **WSJT-X UDP compatibility:** Even with built-in decode, we should emit WSJT-X-compatible UDP messages on port 2237. This preserves interoperability with the existing ecosystem (GridTracker, JTAlert, N1MM+, etc.) for operators who want it. It also makes migration frictionless — operators can try our built-in FT8 without losing their existing workflow.

3. **Time sync validation:** At startup, check system clock against NTP. If drift exceeds ±0.5 seconds, warn the user and offer auto-correction. During operation, monitor drift using FT8 decode timing (the same technique JTSync uses).

4. **Multi-band decode:** If the SDR hardware supports sufficient bandwidth (e.g., 50 MHz on a HackRF or RSP), decode FT8 on multiple bands simultaneously from a single IQ stream. This eliminates the multi-instance CPU problem entirely — one decoder, multiple bands, one process.

### 8.2 Decoder Implementation Options

Three paths for FT8 decode integration:

**Option A: WSJT-X Library Integration**
- Use the WSJT-X Fortran/C decode library (ft8_decode, specifically the pack/unpack and LDPC routines)
- Licensed under GPL v3 — compatible with open-source distribution
- Proven, reference-grade algorithms
- Fortran dependency adds build complexity

**Option B: Independent Implementation**
- Implement FT8 decode from the published protocol specification (FT4_FT8_QEX.pdf)
- More control over optimization (GPU acceleration, SIMD, etc.)
- Risk of decode quality regression vs. reference implementation
- Freedom from GPL if needed for commercial licensing

**Option C: Hybrid**
- Use WSJT-X decode algorithms for the core LDPC/BP decoder
- Build custom signal detection, FFT, and UI integration layers
- Best of both worlds: proven decode quality with custom integration

**Recommendation:** Option C. The WSJT-X decode algorithms represent years of refinement by Joe Taylor (Nobel laureate in physics) and team. Reimplementing them risks subtle regressions. But the surrounding infrastructure (signal detection, waterfall integration, auto-sequencing) should be custom-built for tight SDR integration.

### 8.3 Transmit Architecture (For Transmit-Capable Hardware)

If the platform supports transmit-capable SDR hardware (FlexRadio, Hermes Lite 2, Apache Labs, PlutoSDR):

- FT8 message encoding → baseband audio generation → IQ modulation → SDR transmit path
- Auto-sequence engine with CQ, call, report, RR73 state machine
- TX frequency selection with collision avoidance (don't transmit on an occupied frequency)
- ALC/power level management through hardware API
- PTT control through CAT or hardware GPIO
- Contest exchange template engine (swap standard report for contest exchange)

### 8.4 Data Layer

All FT8 data should flow into a unified data layer:

- **Decode database:** Every decoded message stored with timestamp, frequency, SNR, callsign, grid, band. Queryable for historical analysis, propagation research, and statistics.
- **Contact log:** ADIF-compatible internal log with fields for all major award programs.
- **QSL tracking:** Per-contact status for LoTW, QRZ, eQSL, ClubLog, paper QSL.
- **Contest log:** Contest-specific fields (serial number, section, multiplier status) with Cabrillo export.
- **PSK Reporter feed:** Automatic upload of decode data (with user consent) and consumption of global decode data for propagation display.

---

## 9. Feature Prioritization (Kano Model)

### 9.1 Must-Haves (Table Stakes for FT8 Integration)

These are non-negotiable. Without them, the FT8 integration is incomplete and users will continue using WSJT-X externally.

| Feature | Rationale |
|---------|-----------|
| FT8 and FT4 decode from internal IQ stream | The core value proposition — no virtual audio cables |
| Multi-signal simultaneous decode (full 2500 Hz passband) | Standard WSJT-X capability; anything less is a regression |
| Decode panel with callsign, grid, SNR, country, distance | Matches WSJT-X decode output with enrichment |
| Standard FT8 frequencies pre-loaded per band | Users shouldn't have to know that 14.074 is the 20m FT8 frequency |
| Time sync validation and warning | Prevents the #1 "why aren't my decodes working" failure |
| WSJT-X UDP compatibility output (port 2237) | Preserves interoperability with existing ecosystem tools |
| ADIF log export | Standard logging format; required for LoTW, contest submission |
| Basic waterfall integration (FT8 decode markers on waterfall) | Visual feedback showing which signals decoded successfully |

### 9.2 Performance Features (Linear Satisfaction Drivers)

More investment = proportionally more user satisfaction.

| Feature | Primary Segments | Satisfaction Driver |
|---------|-----------------|-------------------|
| Decode sensitivity matching WSJT-X reference | DXers, Contesters | Every dB of decode margin = more stations worked |
| Built-in world map with decoded stations | All | Transforms FT8 from text to visual experience |
| Auto-sequence (CQ, call, report, RR73) | Operators, Contesters | Enables FT8 QSOs without external software |
| Contact logging with one-click platform upload | Casual, DXers | Eliminates the logging labyrinth |
| Session state persistence | Casual, Rag-chewers | "It remembers where I was" |
| Award tracking (DXCC, WAS, VUCC) | Casual, DXers | Progress visualization drives engagement |
| Multi-band simultaneous decode | DXers, Contesters | Watch multiple bands without switching |
| Contest mode with scoring | Contesters | Purpose-built contest experience |
| PSK Reporter automatic reporting | All | Participation in the global propagation network |
| Needed-entity/grid highlighting | DXers, Contesters | Instant visual priority of high-value contacts |

### 9.3 Delighters (Unexpected Satisfaction Creators)

| Feature | Segment | Why It Delights |
|---------|---------|-----------------|
| 30-second first decode (zero config) | Novices | Eliminates the setup wall entirely |
| Map-first FT8 interface option | Casual, Novices | Tells a story the waterfall can't |
| Propagation radar (live band conditions from decode data) | Elmers, DXers | FT8 as a propagation sensor network |
| "Work the spot" one-click (DX Cluster → tune → call → log) | DXers | Shaves seconds off DXpedition pileups |
| Decode achievement system | Novices, Casual | Gamification without transmitting |
| Background monitoring with smart alerts | Casual, DXers | "Your SDR tells you when something interesting happens" |
| Real-time grayline + MUF overlay on map | DXers, Elmers | Propagation awareness integrated with decode data |
| SuperFox support with status indicators | DXers | Future-proofing for DXpedition evolution |
| Historical decode replay (time-machine) | Elmers, Researchers | "What was propagating last Tuesday at 1400Z?" |
| AI signal identification on waterfall (FT8 vs. FT4 vs. CW vs. unknown) | All | The radio that understands what it hears |
| Decode sharing (screenshot/link to your live map) | Novices, Casual | Social proof and community engagement |
| Multi-SDR wideband decode (aggregate dongles for all-band FT8) | Power users | Simultaneous all-band monitoring from cheap hardware |

---

## 10. Proposed FT8 Roadmap

### Phase 1: Receive & Visualize (Aligns with SDR Platform Months 1–6)

**Goal:** Deliver the "30-second wow" — tune to FT8, see decodes, see the map. Receive-only.

- FT8 and FT4 decode engine integrated with internal IQ path (no virtual audio)
- Decode panel: callsign, grid, country (flag), distance, SNR, time
- World map view with decoded stations plotted in real-time
- Grayline overlay on map
- FT8 frequency presets for all HF bands
- Time sync validation at startup (NTP check, warning if >500ms drift)
- WSJT-X UDP output compatibility (port 2237)
- Waterfall decode markers (highlight signals that decoded successfully)
- Basic decode statistics (stations decoded, countries, grids, best DX)
- PSK Reporter automatic upload (opt-in)

**Success metric:** A new user with an RTL-SDR dongle sees FT8 decodes on a map within 60 seconds of first launch.

### Phase 2: Operate & Log (Aligns with SDR Platform Months 7–12)

**Goal:** Full FT8 QSO capability with integrated logging. Replace WSJT-X for daily operation.

- FT8/FT4 transmit capability (for transmit-capable hardware)
- Auto-sequence engine (CQ, call, report, RR73 state machine)
- TX frequency selection with collision avoidance
- Internal contact log (ADIF-compatible)
- One-click upload to LoTW, QRZ, ClubLog, eQSL
- Award tracking dashboard (DXCC, WAS, VUCC with progress bars)
- Needed-entity highlighting on waterfall and map
- DX Cluster integration: spots overlaid on waterfall and map
- QSO B4 (dupe) checking against log
- Session state persistence (full restore on relaunch)
- Background monitoring mode with configurable alerts
- Fox/Hound mode support

### Phase 3: Compete & Analyze (Aligns with SDR Platform Months 13–18)

**Goal:** Contest-grade FT8 and propagation intelligence.

- Contest mode: template selection, serial exchange, scoring dashboard
- Real-time score display: QSO count, multiplier count, rate meters (10-min, 60-min rolling)
- Multiplier map: needed vs. worked grids with band breakdown
- Multi-band simultaneous decode (hardware permitting)
- Cabrillo file generation for contest submission
- SuperFox mode support
- Propagation radar: real-time band condition analysis from aggregate decode data
- Historical decode database with query/replay capability
- Decode sensitivity optimization (GPU-accelerated decode for high-density bands)
- JS8Call protocol support (extended messaging)
- Multi-instance elimination: single app, multiple bands, one process

### Phase 4: Ecosystem & Intelligence (Aligns with SDR Platform Months 19–24)

**Goal:** Platform-level FT8 features that no standalone tool can match.

- AI-assisted decode improvement (ML model trained on marginal signals)
- Propagation prediction from historical decode data (ML model)
- Community decode network (anonymized aggregate decode data for global propagation map)
- WSPR integration (transmit/receive) for beacon-style propagation monitoring
- Q65 and FST4 mode support (VHF/UHF weak-signal)
- Remote FT8 operation (operate your home station FT8 from a browser)
- Decode achievement and gamification system
- Social sharing (decode map screenshots, session summaries)
- Multi-SDR wideband decode (aggregate multiple dongles)
- Third-party plugin API for custom FT8 extensions

---

## 11. Sources

### Protocol & Technical Documentation
- WSJT-X User Guide — wsjt.sourceforge.io/wsjtx-doc/wsjtx-main-2.6.0.pdf
- FT4 and FT8 Protocol Specification (QEX paper) — wsjt.sourceforge.io/FT4_FT8_QEX.pdf
- SuperFox User Guide — wsjt.sourceforge.io/SuperFox_User_Guide.pdf
- FT8 DXpedition Mode Guide — wsjt.sourceforge.io/FT8_DXpedition_Mode.pdf
- Signal Identification Wiki: FT8 — sigidwiki.com/wiki/FT8

### Software Platforms
- WSJT-X Official — wsjt.sourceforge.io
- JTDX — jtdx.tech
- JS8Call — js8call.com
- MSHV — lz2hv.org/mshv
- Spark SDR — sparksdr.com
- GridTracker — gridtracker.org
- PSK Reporter — pskreporter.info
- FT8CN (Android) — github.com/N0BOY/FT8CN
- WSJT-X Improved — wsjt-x-improved.sourceforge.io

### Community Sentiment
- r/amateurradio — reddit.com/r/amateurradio
- r/RTLSDR — reddit.com/r/RTLSDR
- QRZ Forums (FT8 tag) — forums.qrz.com/index.php?tags/ft8
- RadioReference Forums — forums.radioreference.com
- WSJT-X Groups.io — wsjtx.groups.io/g/main
- FT8 Digital Mode Groups.io — groups.io/g/FT8-Digital-Mode
- HamApps Groups.io (JTAlert) — hamapps.groups.io/g/Support

### Contest Resources
- ARRL Field Day FT8 Setup — onallbands.com/give-ft8-a-try-on-arrl-field-day
- WW DIGI Contest Rules — ww-digi.com/rules
- European FT8 Club — europeanft8club.wordpress.com
- FT8/FT4 Contester's Perspective (VA7ST) — va7st.ca/2020/10/ft8-ft4-from-a-contesters-perspective

### Industry Analysis
- ARRL Mode Usage Evaluation — arrl.org/news/mode-usage-evaluation-2017-was-the-year-when-digital-modes-changed-forever
- "Making FT8 Fun Again with GridTracker" (KE2YK) — ke2yk.com/2024/04/22/making-ft8-fun-again-with-gridtracker
- FT8 Software Decode Comparison (OH7GGX) — oh7ggx.fi/2025/03/09/comparing-ft8-softwares-what-decodes-best

---

*This document is a companion to the SDR Product Vision Document. Together, they define the competitive landscape, user needs, and feature roadmap for a world-class SDR platform with best-in-class FT8 integration.*
