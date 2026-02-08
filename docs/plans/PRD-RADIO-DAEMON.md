# PRD: Propulse Radio Daemon — Unified SDR & Rig Control

**Version:** 1.0  
**Author:** Chris / Claude  
**Date:** 2026-02-07  
**Status:** Draft  
**Target Repo Path:** `propulse/daemon/`

---

## 1. Executive Summary

The Propulse Radio Daemon is a cross-platform, zero-dependency companion binary that connects any amateur radio — SDR receivers, traditional transceivers, and hybrid rigs — to the Propulse web interface through a unified WebSocket API. It replaces the existing Node.js bridge server (`bridge/`) and eliminates the multi-app workflow (SDRuno + virtual audio cables + Hamlib + WSJT-X glue) with a single downloadable binary.

The daemon runs wherever the radio hardware is physically connected — a Windows desktop, a macOS laptop, a Linux tower, or a Raspberry Pi in a remote shack — and exposes a standardized radio control and streaming API that the Propulse web UI consumes over WebSocket.

### Goals

- **One binary, any radio:** Support SDRplay, RTL-SDR, Airspy, HackRF, LimeSDR, PlutoSDR via SoapySDR; support any CAT-capable transceiver via Hamlib; support FlexRadio SmartSDR natively.
- **Cross-platform:** Windows x64, macOS (Intel + Apple Silicon universal), Linux x64, Linux ARM64 (Raspberry Pi 4/5).
- **Zero external dependencies:** No Node.js, Python, Java, or separate driver installations beyond the hardware vendor's USB driver.
- **Network-transparent:** Run locally alongside the browser, or remotely on a shack computer with mDNS/Bonjour auto-discovery.
- **Backward-compatible migration:** The WebSocket protocol is a superset of the existing `bridge/` protocol, enabling incremental migration.
- **Real-time DSP:** FFT spectrum/waterfall data, USB/LSB/AM/FM/CW demodulation, spectral noise reduction, and audio streaming — all inside the daemon.
- **Integration hub:** WSJT-X UDP, DX Cluster telnet, N1MM+ UDP, and virtual CAT port server — all consolidated.

### Non-Goals (v1)

- Transmit DSP (modulation/encoding) — transmit is handled by the physical transceiver via PTT/CAT.
- Built-in digital mode decoding (FT8/FT4/CW) — defer to WSJT-X integration; daemon provides the audio pipe.
- Cloud/internet relay — remote access is via VPN (Tailscale/WireGuard), not a cloud proxy.
- GUI on the daemon itself — the daemon is headless; all UI is in the Propulse web app.
- Mobile builds (iOS/Android) — daemon targets desktop/SBC platforms only.

---

## 2. Background & Motivation

### Current Pain Points

1. **Multi-app workflow:** Operating FT8 with an SDRplay today requires: SDRuno → VB-Audio Virtual Cable → WSJT-X → separate logging app. Each has its own config, and if one breaks, the whole chain fails.
2. **SDRuno UX:** Floating multi-window design, unreliable layout persistence, glitchy on Windows 11 high-DPI displays, thin plugin ecosystem.
3. **No unified interface:** Propagation data (Propulse) lives in one app, rig control (Hamlib/OmniRig) in another, logging in a third, contesting in a fourth. No single pane of glass.
4. **Platform lock-in:** Most SDR software is Windows-only. macOS and Linux users have fewer options, especially for SDRplay hardware.
5. **No remote operation story:** Running a remote station requires cobbling together VNC + virtual audio + network CAT forwarding.

### Why Now

- Propulse already has the ProPulse Bridge (`bridge/`) with WebSocket protocol, WSJT-X UDP, DX Cluster telnet, and Hamlib CAT — proving the architecture works.
- The SoapySDR ecosystem has matured with stable drivers for all major SDR hardware.
- Rust's cross-compilation toolchain (via `cross`) makes single-binary multi-platform builds practical.
- The Propulse frontend already has Three.js/WebGL rendering for PropSphere — the same pipeline powers a high-performance waterfall.

---

## 3. Repository Structure — Monorepo Companion

The daemon lives inside the existing `propulse` repository as a Cargo workspace member. This keeps CI, issues, PRDs, and releases unified while maintaining clean separation.

```
propulse/
├── daemon/                          ★ NEW — Rust workspace
│   ├── Cargo.toml                   Workspace root
│   ├── Cargo.lock
│   ├── README.md                    Daemon-specific docs
│   ├── config.example.toml          Example configuration
│   │
│   ├── propulse-daemon/             Main binary crate
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── main.rs              CLI entry, config, server bootstrap
│   │       ├── config.rs            TOML config parsing, defaults
│   │       ├── server.rs            WebSocket server (tokio + tungstenite)
│   │       └── protocol.rs          Message types, serialization
│   │
│   ├── propulse-radio/              Core radio abstraction crate (library)
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs               Public API
│   │       ├── traits.rs            Radio trait, RadioCapabilities, types
│   │       ├── manager.rs           Multi-radio lifecycle management
│   │       ├── soapy.rs             SoapySDR backend (SDRplay, RTL-SDR, etc.)
│   │       ├── hamlib.rs            Hamlib backend (rigctld TCP protocol)
│   │       ├── flex.rs              FlexRadio SmartSDR API (future)
│   │       └── dummy.rs             Mock radio for testing & demos
│   │
│   ├── propulse-dsp/                Signal processing crate (library)
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── pipeline.rs          Composable DSP chain builder
│   │       ├── fft.rs               Real-time FFT (rustfft)
│   │       ├── demod.rs             USB/LSB/AM/FM/CW demodulators
│   │       ├── filter.rs            FIR bandpass, notch, DC removal
│   │       ├── nr.rs                Spectral noise reduction
│   │       ├── nb.rs                Noise blanker (pulse detection)
│   │       ├── agc.rs               Multi-speed AGC
│   │       └── resample.rs          Sample rate conversion
│   │
│   ├── propulse-integrations/       External protocol crate (library)
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── wsjtx.rs             WSJT-X UDP protocol
│   │       ├── cluster.rs           DX Cluster telnet client
│   │       ├── n1mm.rs              N1MM+ UDP broadcast interop
│   │       └── cat_server.rs        Virtual CAT port (expose daemon as rig)
│   │
│   ├── propulse-discovery/          Network discovery crate (library)
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── mdns.rs              mDNS/Bonjour advertisement & browsing
│   │       ├── serial.rs            Serial port enumeration
│   │       └── soapy_enum.rs        SoapySDR device enumeration
│   │
│   ├── propulse-audio/              Platform audio I/O crate (library)
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── output.rs            Local speaker output (cpal)
│   │       └── virtual_cable.rs     Virtual audio pipe for WSJT-X
│   │
│   └── tests/                       Integration tests
│       ├── protocol_test.rs         WebSocket protocol conformance
│       ├── dsp_test.rs              DSP pipeline correctness
│       ├── dummy_radio_test.rs      End-to-end with mock radio
│       └── migration_test.rs        Bridge protocol backward compat
│
├── bridge/                          Existing Node.js bridge (deprecated after migration)
├── src/                             Existing React frontend
│   ├── components/
│   │   ├── sdr/                     ★ NEW — SDR console UI components
│   │   │   ├── SdrConsole.tsx       Main SDR console page/panel
│   │   │   ├── Waterfall.tsx        WebGL waterfall display
│   │   │   ├── SpectrumScope.tsx    FFT spectrum analyzer
│   │   │   ├── RadioControls.tsx    Unified radio control panel
│   │   │   ├── GainPanel.tsx        Multi-stage gain control
│   │   │   ├── DspControls.tsx      NR/NB/AGC/Filter controls
│   │   │   ├── AntennaSelector.tsx  Antenna port switcher
│   │   │   ├── DevicePicker.tsx     Radio/daemon connection manager
│   │   │   └── BandScope.tsx        Contest-integrated band scope
│   │   └── ...
│   ├── hooks/
│   │   ├── useRadioDaemon.ts        ★ NEW — WebSocket client for daemon
│   │   ├── useWaterfall.ts          ★ NEW — WebGL waterfall rendering
│   │   ├── useRadioState.ts         ★ NEW — Radio state management
│   │   └── ...
│   ├── stores/
│   │   ├── radioStore.ts            ★ NEW — Zustand store for radio state
│   │   ├── sdrStore.ts              ★ NEW — SDR-specific state (FFT, waterfall)
│   │   └── ...
│   └── lib/
│       ├── radio/                   ★ NEW — Radio protocol client
│       │   ├── protocol.ts          TypeScript types matching daemon protocol
│       │   ├── client.ts            WebSocket client with reconnection
│       │   └── discovery.ts         Daemon discovery (mDNS via bridge fallback)
│       └── ...
│
├── .github/
│   └── workflows/
│       ├── ci.yml                   Existing frontend CI
│       └── daemon-release.yml       ★ NEW — Cross-compile & release daemon binaries
│
├── PRD-RADIO-DAEMON.md              ★ This document
└── ...
```

### Why Monorepo

- **Shared protocol types:** The WebSocket message schema is defined once and consumed by both the Rust daemon (via `serde`) and the TypeScript frontend (via generated types or manual mirror).
- **Unified CI:** A single GitHub Actions workflow builds the web app AND cross-compiles daemon binaries for all platforms on every release tag.
- **Coordinated releases:** When a protocol change ships, both sides update in the same PR.
- **Single issue tracker:** Bug reports reference both frontend and daemon code.
- **Existing precedent:** The `bridge/` directory already establishes this pattern.

### Cargo Workspace Configuration

```toml
# daemon/Cargo.toml
[workspace]
members = [
    "propulse-daemon",
    "propulse-radio",
    "propulse-dsp",
    "propulse-integrations",
    "propulse-discovery",
    "propulse-audio",
]
resolver = "2"

[workspace.package]
version = "0.1.0"
edition = "2021"
license = "MIT OR Apache-2.0"
repository = "https://github.com/crypticpy/propulse"

[workspace.dependencies]
tokio = { version = "1", features = ["full"] }
tokio-tungstenite = "0.24"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tracing = "0.1"
tracing-subscriber = "0.3"
anyhow = "1"
thiserror = "1"
```

---

## 4. Architecture

### 4.1 System Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Propulse Web UI (any browser, any device)                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐  │
│  │PropSphere│ │Contest   │ │SDR       │ │Logbook / DX   │  │
│  │Globe/Map │ │Engine    │ │Console   │ │Wizard / Solar │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └───────┬───────┘  │
│       └─────────────┴────────────┴───────────────┘          │
│                          │                                   │
│              WebSocket Client (useRadioDaemon hook)          │
└──────────────────────────┬──────────────────────────────────┘
                           │ ws://host:9867 (or wss:// with TLS)
                           │
┌──────────────────────────┴──────────────────────────────────┐
│  Propulse Radio Daemon (single Rust binary)                  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  WebSocket Server (tokio-tungstenite)                  │  │
│  │  • Multi-client support                                │  │
│  │  • JSON command/event protocol                         │  │
│  │  • Binary frames for FFT & audio streaming             │  │
│  │  • Connection auth (optional token)                    │  │
│  └──────┬────────────┬─────────────┬──────────────────────┘  │
│         │            │             │                          │
│  ┌──────┴──────┐ ┌───┴────┐ ┌─────┴──────┐                  │
│  │Radio Manager│ │  DSP   │ │Integrations│                  │
│  │             │ │Pipeline│ │            │                  │
│  │ ┌─────────┐ │ │        │ │ WSJT-X UDP │                  │
│  │ │SoapySDR │ │ │ FFT    │ │ DX Cluster │                  │
│  │ │ RSPdx   │ │ │ Demod  │ │ N1MM+ UDP  │                  │
│  │ │ RTL-SDR │ │ │ Filter │ │ CAT Server │                  │
│  │ │ Airspy  │ │ │ NR/NB  │ │            │                  │
│  │ │ HackRF  │ │ │ AGC    │ └────────────┘                  │
│  │ │ Lime    │ │ │        │                                  │
│  │ │ Pluto   │ │ └────────┘  ┌────────────┐                 │
│  │ ├─────────┤ │             │ Discovery  │                 │
│  │ │ Hamlib  │ │             │            │                 │
│  │ │ IC-7300 │ │             │ mDNS/Bonjr │                 │
│  │ │ FT-991A │ │             │ Serial Enum│                 │
│  │ │ TS-890  │ │             │ SoapyEnum  │                 │
│  │ │ Any CAT │ │             └────────────┘                 │
│  │ ├─────────┤ │                                             │
│  │ │FlexRadio│ │  ┌────────────┐                             │
│  │ │SmartSDR │ │  │   Audio    │                             │
│  │ ├─────────┤ │  │ Local Out  │                             │
│  │ │ Dummy   │ │  │ Virt Cable │                             │
│  │ │ (test)  │ │  └────────────┘                             │
│  │ └─────────┘ │                                             │
│  └─────────────┘                                             │
│                                                              │
│  Platform: Windows │ macOS │ Linux x64 │ Linux ARM64 (Pi)    │
└──────────────────────────────────────────────────────────────┘
```

### 4.2 Radio Tiers

The daemon supports three tiers of radio capability. The frontend adapts its UI based on the capabilities reported by each connected radio.

| Tier | Radio Type | Examples | FFT/Waterfall | Audio | Freq/Mode | TX/PTT | Gain Stages |
|------|-----------|----------|---------------|-------|-----------|--------|-------------|
| **Tier 1** | SDR Receiver | RSPdx, RTL-SDR, Airspy, HackRF, LimeSDR | ✅ Full (from IQ) | ✅ Demodulated | ✅ SoapySDR | ❌ RX only | ✅ Per-stage |
| **Tier 2** | Modern Transceiver | IC-7300, IC-7610, FT-DX101, TS-890, K4 | ⚠️ Partial (CI-V/CAT spectrum) | ✅ USB audio | ✅ Hamlib CAT | ✅ | ⚠️ RF/AF via CAT |
| **Tier 3** | Basic Transceiver | FT-891, IC-706, TS-480, older rigs | ❌ | ⚠️ Optional | ✅ Hamlib CAT | ✅ | ⚠️ Limited |
| **Tier H** | Hybrid SDR Transceiver | FlexRadio 6x00, IC-7610, Anan | ✅ Full | ✅ Both | ✅ Native API | ✅ | ✅ |

**Frontend adaptation rules:**
- `canStreamFFT == true` → Show waterfall/spectrum scope
- `canStreamFFT == false` → Show cluster-based band scope (DX spots as frequency markers)
- `canTransmit == true` → Show PTT button, TX indicator, power controls
- `canTransmit == false` → Hide TX controls, show "RX Only" badge
- `gainStages.length > 0` → Show per-stage gain sliders
- `antennas.length > 1` → Show antenna selector

### 4.3 DSP Pipeline

For Tier 1 (SDR) radios, the daemon runs a real-time DSP pipeline on the IQ sample stream:

```
SoapySDR IQ Samples (I/Q interleaved float32)
  │
  ├──→ DC Offset Removal (moving average subtraction)
  │
  ├──→ FFT Branch (parallel, non-blocking)
  │      │
  │      ├── Windowed FFT (Blackman-Harris, configurable 1024–8192 bins)
  │      ├── Power Spectrum (magnitude squared, dB scale)
  │      ├── Averaging (configurable: none, 2x, 4x, 8x)
  │      └── Compression (peak-hold + decimation for WebSocket bandwidth)
  │             │
  │             └──→ WebSocket: binary FFT frame (~15-30 fps)
  │
  └──→ Audio Branch (serial)
         │
         ├── Digital Down Converter (frequency shift to baseband)
         ├── Decimation (sample rate reduction to audio range)
         ├── FIR Bandpass Filter (configurable passband)
         │     ├── USB: 300–2700 Hz (default)
         │     ├── LSB: 300–2700 Hz (inverted)
         │     ├── CW: centered on pitch ±250 Hz
         │     ├── AM: 0–5000 Hz (envelope detection)
         │     └── FM: 0–15000 Hz (FM discriminator)
         ├── Noise Blanker (optional, pulse detection + interpolation)
         ├── Spectral Noise Reduction (optional, spectral subtraction)
         ├── Notch Filter (optional, auto-notch via spectral peak detection)
         ├── AGC (multi-speed: fast/medium/slow/off)
         └── Output
               ├──→ WebSocket: binary audio frame (PCM int16, 48kHz)
               ├──→ Local audio output (cpal)
               └──→ Virtual audio cable (for WSJT-X / other apps)
```

**Performance targets:**
- FFT latency: < 33ms (30 fps) for 4096-point FFT at 2.048 Msps
- Audio latency: < 50ms from antenna to speaker
- CPU usage: < 15% of a single core on modern x64 (Ryzen 5 / i5 class)
- CPU usage: < 40% of a single core on Raspberry Pi 4

### 4.4 WebSocket Protocol

The daemon communicates over WebSocket using JSON for commands/events and binary frames for streaming data (FFT, audio). The protocol is versioned to support backward compatibility.

#### Connection Handshake

```
Client → Server: HTTP Upgrade to WebSocket
Server → Client: { "type": "hello", "version": "1.0.0", "daemon_id": "uuid" }
Client → Server: { "type": "hello", "client": "propulse-web", "version": "0.13.0" }
```

#### Message Schema — Commands (Client → Daemon)

```jsonc
// Discover available radios
{ "id": "msg-1", "type": "devices:enumerate" }

// Connect to a specific radio
{ "id": "msg-2", "type": "radio:connect", "device_id": "soapy:0", "config": {
    "sample_rate": 2048000,
    "antenna": "Antenna A"
}}

// Disconnect from a radio
{ "id": "msg-3", "type": "radio:disconnect", "device_id": "soapy:0" }

// Tune frequency (Hz)
{ "id": "msg-4", "type": "radio:tune", "device_id": "soapy:0", "freq": 14074000 }

// Set mode
{ "id": "msg-5", "type": "radio:mode", "device_id": "soapy:0", "mode": "USB" }

// Set gain stage
{ "id": "msg-6", "type": "radio:gain", "device_id": "soapy:0",
  "stage": "LNA", "value": 5 }

// Toggle AGC
{ "id": "msg-7", "type": "radio:agc", "device_id": "soapy:0", "enabled": false }

// Set antenna port
{ "id": "msg-8", "type": "radio:antenna", "device_id": "soapy:0", "port": "Antenna B" }

// Set PTT (transceiver only)
{ "id": "msg-9", "type": "radio:ptt", "device_id": "hamlib:0", "active": true }

// Set filter passband
{ "id": "msg-10", "type": "radio:filter", "device_id": "soapy:0",
  "low": 300, "high": 2700 }

// Set noise reduction
{ "id": "msg-11", "type": "radio:nr", "device_id": "soapy:0",
  "enabled": true, "level": 3 }

// Set noise blanker
{ "id": "msg-12", "type": "radio:nb", "device_id": "soapy:0",
  "enabled": true, "threshold": 50 }

// Set squelch
{ "id": "msg-13", "type": "radio:squelch", "device_id": "soapy:0", "level": -120 }

// Start FFT stream
{ "id": "msg-14", "type": "stream:fft:start", "device_id": "soapy:0",
  "fft_size": 4096, "fps": 20, "averaging": 4 }

// Stop FFT stream
{ "id": "msg-15", "type": "stream:fft:stop", "device_id": "soapy:0" }

// Start audio stream
{ "id": "msg-16", "type": "stream:audio:start", "device_id": "soapy:0",
  "sample_rate": 48000, "format": "pcm_i16" }

// Stop audio stream
{ "id": "msg-17", "type": "stream:audio:stop", "device_id": "soapy:0" }

// DX Cluster connect
{ "id": "msg-18", "type": "cluster:connect",
  "host": "dxc.nc7j.com", "port": 7300, "callsign": "W5ABC" }

// WSJT-X listen
{ "id": "msg-19", "type": "wsjtx:start", "port": 2237 }

// Get daemon status
{ "id": "msg-20", "type": "daemon:status" }

// Daemon configuration update
{ "id": "msg-21", "type": "daemon:config", "audio_output": "default",
  "virtual_cable": true }
```

#### Message Schema — Events (Daemon → Client)

```jsonc
// Response to any command
{ "id": "msg-1", "type": "response", "success": true }
{ "id": "msg-2", "type": "response", "success": false,
  "error": "Device not found" }

// Device enumeration result
{ "type": "devices:list", "devices": [
    {
      "device_id": "soapy:0",
      "name": "SDRplay RSPdx v2",
      "driver": "sdrplay",
      "type": "sdr",
      "serial": "ABC123",
      "available": true,
      "capabilities": {
        "can_transmit": false,
        "can_stream_iq": true,
        "can_stream_fft": true,
        "can_stream_audio": true,
        "antennas": ["Antenna A", "Antenna B", "Antenna C"],
        "modes": ["USB", "LSB", "CW", "AM", "FM"],
        "frequency_range": [1000, 2000000000],
        "sample_rates": [2048000, 4096000, 6144000, 8192000],
        "gain_stages": [
          { "name": "LNA", "min": 0, "max": 9, "step": 1 },
          { "name": "IF", "min": -59, "max": 0, "step": 1 }
        ]
      }
    },
    {
      "device_id": "hamlib:0",
      "name": "Icom IC-7300",
      "driver": "hamlib",
      "type": "transceiver",
      "port": "COM3",
      "available": true,
      "capabilities": {
        "can_transmit": true,
        "can_stream_iq": false,
        "can_stream_fft": true,
        "can_stream_audio": false,
        "antennas": ["ANT1", "ANT2"],
        "modes": ["USB", "LSB", "CW", "CW-R", "AM", "FM", "RTTY", "RTTY-R"],
        "frequency_range": [30000, 74800000],
        "sample_rates": [],
        "gain_stages": [
          { "name": "RF", "min": 0, "max": 100, "step": 1 },
          { "name": "AF", "min": 0, "max": 100, "step": 1 }
        ]
      }
    }
]}

// Radio state change
{ "type": "radio:state", "device_id": "soapy:0", "state": {
    "connected": true,
    "freq": 14074000,
    "mode": "USB",
    "antenna": "Antenna A",
    "gains": { "LNA": 5, "IF": -30 },
    "agc": false,
    "filter": { "low": 300, "high": 2700 },
    "nr": { "enabled": true, "level": 3 },
    "nb": { "enabled": false },
    "squelch": -120,
    "signal_dbm": -85.3
}}

// S-meter update (periodic, ~10 Hz)
{ "type": "radio:smeter", "device_id": "soapy:0", "dbm": -85.3 }

// WSJT-X decode
{ "type": "wsjtx:decode", "mode": "FT8", "time": "2026-02-07T14:30:00Z",
  "snr": -12, "dt": 0.3, "freq": 1245, "message": "CQ W5ABC EM10",
  "callsign": "W5ABC", "grid": "EM10", "new_dxcc": true, "new_grid": false }

// DX Cluster spot
{ "type": "cluster:spot", "spotter": "K1ABC", "dx": "JA7XYZ",
  "freq": 14025.0, "comment": "CQ JA", "time": "2026-02-07T14:32:15Z" }

// Device hot-plug
{ "type": "devices:added", "device_id": "soapy:1", "name": "RTL-SDR Blog V4" }
{ "type": "devices:removed", "device_id": "soapy:1" }

// Daemon status
{ "type": "daemon:status", "version": "0.1.0", "uptime_secs": 3600,
  "platform": "windows-x64", "connected_radios": 2, "active_streams": 1,
  "cpu_percent": 8.5, "memory_mb": 45 }
```

#### Binary Frames

For high-throughput streaming, the daemon sends binary WebSocket frames with a minimal header:

```
FFT Frame (binary):
┌──────────┬──────────┬──────────┬──────────┬─────────────────┐
│ Type (1B)│DevIdx(1B)│Center(8B)│ Span(8B) │ Bins (N×f32)    │
│  0x01    │  0x00    │ float64  │ float64  │ float32 array   │
└──────────┴──────────┴──────────┴──────────┴─────────────────┘

Audio Frame (binary):
┌──────────┬──────────┬──────────┬─────────────────────────────┐
│ Type (1B)│DevIdx(1B)│SmpRate(4)│ Samples (N×i16)             │
│  0x02    │  0x00    │ uint32   │ int16 array                 │
└──────────┴──────────┴──────────┴─────────────────────────────┘
```

This avoids JSON parsing overhead for data that arrives at 20-30 fps. The frontend reads these with `DataView` on the `ArrayBuffer`.

### 4.5 Bridge Migration Path

The existing `bridge/` Node.js server defines a WebSocket protocol for rig control, WSJT-X, and DX cluster. The daemon protocol is a **superset** — it supports all existing message types plus the new radio/SDR/streaming messages.

**Migration phases:**
1. Daemon ships with `--compat-bridge` flag that accepts existing bridge protocol messages and translates them internally.
2. Frontend adds `useRadioDaemon` hook alongside existing `useBridge` hook, with feature detection.
3. Once daemon reaches parity, frontend switches default to daemon; bridge enters maintenance mode.
4. Bridge directory archived after one major version.

---

## 5. Detailed Feature Specifications

### 5.1 Radio Management

#### F-RM-01: Device Enumeration

The daemon periodically scans for available radio hardware and reports changes to connected clients.

**Behavior:**
- On startup, enumerate all SoapySDR devices and configured Hamlib serial ports
- Re-scan every 5 seconds for USB hot-plug detection
- Emit `devices:added` / `devices:removed` events on change
- Each device gets a stable `device_id` based on driver + serial number (persists across restarts)

**Acceptance Criteria:**
- [ ] AC-RM-01a: Daemon detects RSPdx connected via USB within 5 seconds of plug-in
- [ ] AC-RM-01b: Daemon detects RTL-SDR Blog V4 connected via USB within 5 seconds
- [ ] AC-RM-01c: Daemon reports device removal within 5 seconds of USB disconnect
- [ ] AC-RM-01d: `devices:list` response includes correct capabilities for each device type
- [ ] AC-RM-01e: Device IDs are stable across daemon restarts for the same physical hardware
- [ ] AC-RM-01f: Serial port enumeration finds configured Hamlib rigs on COM ports (Windows) and `/dev/tty*` (Unix)
- [ ] AC-RM-01g: Concurrent enumeration of SoapySDR and serial devices does not block

#### F-RM-02: Radio Connection Lifecycle

**Behavior:**
- Client sends `radio:connect` with device_id and optional config overrides
- Daemon initializes the hardware (SoapySDR stream setup or Hamlib rigctld connection)
- Daemon sends `radio:state` with full initial state
- On disconnect (client or hardware), daemon cleanly releases resources
- Multiple clients can observe the same radio (one controller, others read-only)

**Acceptance Criteria:**
- [ ] AC-RM-02a: Connecting to an SDRplay RSPdx succeeds and returns correct capabilities
- [ ] AC-RM-02b: Connecting to a Hamlib-compatible rig via serial succeeds
- [ ] AC-RM-02c: Attempting to connect to an already-connected device returns an error with clear message
- [ ] AC-RM-02d: USB disconnect during active session triggers cleanup and `devices:removed` event
- [ ] AC-RM-02e: Second WebSocket client connecting to daemon can observe radio state (read-only)
- [ ] AC-RM-02f: Daemon releases SoapySDR stream on disconnect (no resource leaks)

#### F-RM-03: Frequency, Mode, and Antenna Control

**Behavior:**
- `radio:tune` sets center frequency in Hz. For SDRs, this adjusts the SoapySDR center frequency. For Hamlib, this sends the CAT command.
- `radio:mode` sets the demodulation mode. For SDRs, this configures the DSP pipeline. For Hamlib, this sends the mode CAT command.
- `radio:antenna` selects the antenna port. For RSPdx, maps to Antenna A/B/C. For transceivers, maps to ANT1/ANT2.
- All commands return acknowledgment and trigger a `radio:state` event with updated values.
- Frequency change from the physical radio (e.g., user turns the VFO knob) is detected via Hamlib polling and emitted as `radio:state`.

**Acceptance Criteria:**
- [ ] AC-RM-03a: Tuning RSPdx to 14.074 MHz sets SoapySDR center frequency correctly
- [ ] AC-RM-03b: Tuning Hamlib rig to 14.074 MHz sends correct CAT command and confirms
- [ ] AC-RM-03c: Switching RSPdx from Antenna A to Antenna B succeeds, RF path changes
- [ ] AC-RM-03d: Setting mode to USB configures DSP pipeline with 300–2700 Hz passband
- [ ] AC-RM-03e: VFO knob turn on physical transceiver is detected within 200ms and emitted
- [ ] AC-RM-03f: Tuning out of a device's frequency range returns a clear error

#### F-RM-04: Gain Control

**Behavior:**
- `radio:gain` sets a named gain stage to a value within its declared range
- `radio:agc` enables/disables automatic gain control
- Each radio type declares its gain stages in capabilities (e.g., RSPdx: LNA 0–9, IF -59–0; IC-7300: RF 0–100, AF 0–100)
- Frontend renders a slider for each gain stage, labeled appropriately

**Acceptance Criteria:**
- [ ] AC-RM-04a: Setting RSPdx LNA gain to 5 applies the correct SoapySDR gain setting
- [ ] AC-RM-04b: Setting RSPdx IF gain to -30 applies correctly
- [ ] AC-RM-04c: Disabling AGC on RSPdx prevents automatic gain changes
- [ ] AC-RM-04d: Setting Hamlib rig RF gain to 50 sends correct CAT command
- [ ] AC-RM-04e: Setting gain outside declared range returns error
- [ ] AC-RM-04f: Gain stage names and ranges in capabilities match actual hardware behavior

### 5.2 DSP Pipeline

#### F-DSP-01: FFT Spectrum Generation

**Behavior:**
- When `stream:fft:start` is received, daemon begins computing FFT on the IQ stream
- Configurable FFT size (1024, 2048, 4096, 8192), frame rate (5–30 fps), and averaging (1x–8x)
- Output is power spectrum in dBFS, transmitted as binary WebSocket frame
- Peak-hold option: daemon tracks and sends both current and peak values

**Acceptance Criteria:**
- [ ] AC-DSP-01a: 4096-point FFT at 2.048 Msps produces correct frequency resolution (~500 Hz/bin)
- [ ] AC-DSP-01b: FFT frame rate of 20 fps is sustained without dropping frames on x64
- [ ] AC-DSP-01c: FFT frame rate of 15 fps is sustained on Raspberry Pi 4
- [ ] AC-DSP-01d: 4x averaging reduces noise floor by ~6 dB compared to no averaging
- [ ] AC-DSP-01e: Binary frame format is correctly parsed by the frontend TypeScript client
- [ ] AC-DSP-01f: Stopping FFT stream stops binary frame transmission within 100ms
- [ ] AC-DSP-01g: FFT computation does not block the audio demodulation pipeline

#### F-DSP-02: Demodulation

**Behavior:**
- USB: Frequency shift + low-pass filter + real component extraction (Weaver or phasing method)
- LSB: Same as USB with inverted sideband
- CW: Narrow bandpass centered on CW pitch (default 700 Hz) ± configurable width
- AM: Envelope detection (magnitude of analytic signal)
- FM: Frequency discriminator (phase difference between consecutive samples)
- Output sample rate: 48000 Hz (standard audio)
- Demodulated audio is streamed to WebSocket, local output, and virtual audio cable simultaneously

**Acceptance Criteria:**
- [ ] AC-DSP-02a: USB demodulation of a 14.074 MHz SSB signal produces intelligible audio
- [ ] AC-DSP-02b: LSB demodulation of a 7.074 MHz signal produces intelligible audio
- [ ] AC-DSP-02c: CW demodulation with 500 Hz bandwidth resolves individual CW signals
- [ ] AC-DSP-02d: AM demodulation of a broadcast AM signal produces intelligible audio
- [ ] AC-DSP-02e: FM demodulation of a 2m FM signal produces intelligible audio
- [ ] AC-DSP-02f: Audio output sample rate is 48000 Hz ± 0 (exact)
- [ ] AC-DSP-02g: Audio latency from antenna to WebSocket is < 50ms
- [ ] AC-DSP-02h: Simultaneous WebSocket + local output + virtual cable delivery works without glitches

#### F-DSP-03: Noise Reduction

**Behavior:**
- Spectral noise reduction using spectral subtraction algorithm
- Configurable level (0–5, where 0 is off)
- Noise profile is estimated during quiet periods (no signal) or from the lowest spectral bins
- Noise blanker using threshold-based pulse detection with interpolation across blanked samples

**Acceptance Criteria:**
- [ ] AC-DSP-03a: NR level 3 reduces broadband noise floor by ≥ 10 dB without noticeable signal distortion
- [ ] AC-DSP-03b: NR does not introduce "musical" artifacts (tones) on steady noise
- [ ] AC-DSP-03c: Noise blanker removes pulse noise (e.g., simulated power line interference) while preserving signal
- [ ] AC-DSP-03d: NR and NB can be enabled simultaneously without pipeline errors
- [ ] AC-DSP-03e: NR/NB settings can be changed in real-time without audio glitches

#### F-DSP-04: Automatic Gain Control

**Behavior:**
- Multi-speed AGC with selectable time constants: fast (100ms attack, 500ms decay), medium (300ms, 2s), slow (1s, 5s), off
- Target output level: -12 dBFS
- AGC operates after demodulation, before output

**Acceptance Criteria:**
- [ ] AC-DSP-04a: Fast AGC recovers from a +40 dB signal onset within 200ms
- [ ] AC-DSP-04b: Slow AGC does not pump on CW keying
- [ ] AC-DSP-04c: AGC off mode passes audio through with fixed gain
- [ ] AC-DSP-04d: AGC mode can be changed in real-time without audio dropout

#### F-DSP-05: Bandpass Filter

**Behavior:**
- Configurable low and high cutoff frequencies (e.g., 300–2700 Hz for SSB)
- Implemented as FIR filter with configurable order (128–512 taps)
- Preset filter widths for each mode, user-adjustable

**Acceptance Criteria:**
- [ ] AC-DSP-05a: 300–2700 Hz filter attenuates signals at 200 Hz and 3000 Hz by ≥ 40 dB
- [ ] AC-DSP-05b: Filter cutoffs can be adjusted in real-time (smooth transition, no clicks)
- [ ] AC-DSP-05c: CW narrow filter (500 Hz BW) resolves signals spaced 300 Hz apart
- [ ] AC-DSP-05d: Filter shape factor (6 dB/60 dB) is ≤ 1.5:1

### 5.3 Integrations

#### F-INT-01: WSJT-X UDP Protocol

**Behavior:**
- Daemon listens on configurable UDP port (default 2237) for WSJT-X messages
- Parses heartbeat, status, decode, clear, QSO logged, and ADIF messages
- Forwards relevant events to WebSocket clients as `wsjtx:*` messages
- Bidirectional: daemon can send tune and reply commands back to WSJT-X

**Acceptance Criteria:**
- [ ] AC-INT-01a: Daemon receives and parses WSJT-X decode messages for FT8
- [ ] AC-INT-01b: Decoded callsign, SNR, grid, frequency, and time are correctly extracted
- [ ] AC-INT-01c: WSJT-X QSO logged event is forwarded and can trigger logbook entry in Propulse
- [ ] AC-INT-01d: Daemon can command WSJT-X to tune to a specific frequency
- [ ] AC-INT-01e: WSJT-X heartbeat timeout (10s) triggers status warning

#### F-INT-02: DX Cluster Telnet

**Behavior:**
- Daemon connects to a DX cluster node via TCP telnet
- Authenticates with operator callsign
- Parses spot lines and forwards as `cluster:spot` events
- Supports reconnection on disconnect

**Acceptance Criteria:**
- [ ] AC-INT-02a: Connects to a DX cluster node (e.g., dxc.nc7j.com:7300) and authenticates
- [ ] AC-INT-02b: Spot lines are parsed into structured JSON with spotter, DX call, frequency, and comment
- [ ] AC-INT-02c: Network disconnect triggers automatic reconnection attempt every 10 seconds
- [ ] AC-INT-02d: Multiple cluster connections can be active simultaneously

#### F-INT-03: N1MM+ UDP Interop

**Behavior:**
- Daemon broadcasts contest QSO data in N1MM+ UDP format for interoperability
- Listens for N1MM+ contact info and score broadcasts

**Acceptance Criteria:**
- [ ] AC-INT-03a: Logged QSOs are broadcast in N1MM+ UDP XML format
- [ ] AC-INT-03b: N1MM+ running on the same network can receive and display contacts
- [ ] AC-INT-03c: Score updates from N1MM+ are received and forwarded to Propulse

#### F-INT-04: Virtual CAT Server

**Behavior:**
- Daemon exposes itself as a CAT-controllable radio (Hamlib net rigctl protocol) on a configurable TCP port
- Allows other apps (N1MM+, Logger32, etc.) to control the SDR's frequency/mode via standard CAT
- Translates incoming CAT commands to the appropriate SoapySDR/Hamlib calls

**Acceptance Criteria:**
- [ ] AC-INT-04a: rigctld client connecting to daemon port can read frequency
- [ ] AC-INT-04b: rigctld client can set frequency and mode
- [ ] AC-INT-04c: N1MM+ configured with "Hamlib NET rigctl" connects successfully
- [ ] AC-INT-04d: Frequency changes from CAT client are reflected in Propulse UI

### 5.4 Network & Discovery

#### F-NET-01: mDNS/Bonjour Service Advertisement

**Behavior:**
- Daemon advertises itself as `_propulse._tcp` on the local network
- Service record includes daemon version, connected radio names, and port
- Frontend discovers daemons via mDNS browsing (or manual IP entry as fallback)

**Acceptance Criteria:**
- [ ] AC-NET-01a: Daemon appears in mDNS browser (e.g., `dns-sd -B _propulse._tcp`) within 5 seconds of startup
- [ ] AC-NET-01b: Service TXT record includes version and radio list
- [ ] AC-NET-01c: Frontend on the same LAN auto-discovers daemon without manual IP entry
- [ ] AC-NET-01d: Multiple daemons on the same network are individually discoverable
- [ ] AC-NET-01e: mDNS works on Windows (via built-in mDNS), macOS (Bonjour), and Linux (Avahi)

#### F-NET-02: WebSocket Server

**Behavior:**
- Listens on configurable port (default 9867) on all interfaces or localhost-only
- Supports multiple concurrent WebSocket clients
- Optional token-based authentication for remote access
- Binary frame support for FFT and audio streaming
- Graceful shutdown with client notification

**Acceptance Criteria:**
- [ ] AC-NET-02a: Server accepts WebSocket connections on port 9867
- [ ] AC-NET-02b: Multiple clients (up to 10) can connect simultaneously
- [ ] AC-NET-02c: Binary FFT frames are delivered to all subscribed clients
- [ ] AC-NET-02d: `--localhost-only` flag restricts connections to 127.0.0.1
- [ ] AC-NET-02e: `--auth-token` flag requires token in initial handshake
- [ ] AC-NET-02f: Server shutdown sends close frame to all clients before terminating

### 5.5 Frontend Components

#### F-UI-01: SDR Console Page

**Behavior:**
- New route `/sdr` (or integrated panel on existing pages)
- Layout: left sidebar with radio controls, main area with spectrum + waterfall, bottom area with decode list
- Responsive: on mobile, controls collapse into a drawer

**Acceptance Criteria:**
- [ ] AC-UI-01a: SDR Console renders with waterfall when connected to an SDR
- [ ] AC-UI-01b: SDR Console shows cluster-based band scope when connected to a Tier 3 radio
- [ ] AC-UI-01c: SDR Console shows "No Radio Connected" with daemon connection instructions when disconnected
- [ ] AC-UI-01d: Mobile layout collapses controls into bottom drawer with 44px touch targets
- [ ] AC-UI-01e: Page loads in < 1 second and does not import Three.js (waterfall uses standalone WebGL)

#### F-UI-02: WebGL Waterfall

**Behavior:**
- Renders FFT data as a scrolling waterfall spectrogram using WebGL
- Color palette: configurable (default: black-blue-cyan-yellow-red)
- Frequency axis with labels (kHz/MHz)
- Time axis (vertical, scrolling downward)
- Mouse/touch interaction: click to tune, drag to select bandwidth, scroll to zoom frequency span
- DX cluster spots rendered as horizontal frequency markers on the waterfall
- WSJT-X decodes rendered as callsign labels at their audio frequencies

**Acceptance Criteria:**
- [ ] AC-UI-02a: Waterfall renders at 20+ fps without dropped frames on desktop
- [ ] AC-UI-02b: Waterfall renders at 15+ fps on mobile
- [ ] AC-UI-02c: Clicking a frequency on the waterfall sends `radio:tune` command
- [ ] AC-UI-02d: DX cluster spots appear as colored markers at correct frequencies
- [ ] AC-UI-02e: WSJT-X decodes appear as callsign labels in the decode frequency range
- [ ] AC-UI-02f: Color palette is configurable from Settings
- [ ] AC-UI-02g: Pinch-to-zoom works on touch devices for frequency span adjustment
- [ ] AC-UI-02h: Waterfall resizes correctly when browser window is resized

#### F-UI-03: Device Picker / Connection Manager

**Behavior:**
- Modal or panel showing discovered daemons and their available radios
- Shows daemon hostname, IP, connected radios with type badges
- Click to connect to a radio; shows connection status
- Supports manual IP:port entry for remote daemons
- Remembers last successful connection

**Acceptance Criteria:**
- [ ] AC-UI-03a: Discovered daemons appear within 5 seconds of opening the picker
- [ ] AC-UI-03b: Each daemon shows its list of available radios with type icons (SDR, transceiver)
- [ ] AC-UI-03c: Clicking a radio connects and closes the picker
- [ ] AC-UI-03d: Manual IP entry works for remote daemons
- [ ] AC-UI-03e: Last connection is remembered and auto-reconnects on page load

#### F-UI-04: Unified Radio Controls Panel

**Behavior:**
- Adapts to connected radio's capabilities
- Shows frequency display (editable, with MHz/kHz stepping)
- Mode selector (only shows modes the radio supports)
- Gain sliders (one per gain stage, labeled per radio)
- Antenna selector (if multiple ports)
- DSP controls: NR level, NB toggle, AGC speed, filter bandwidth sliders
- S-meter (bar or analog gauge)
- PTT button (only if `canTransmit`)

**Acceptance Criteria:**
- [ ] AC-UI-04a: Controls reflect actual radio capabilities (no disabled "phantom" controls)
- [ ] AC-UI-04b: Frequency can be entered via keyboard with MHz/kHz toggle
- [ ] AC-UI-04c: Gain slider changes are debounced (50ms) and sent to daemon
- [ ] AC-UI-04d: S-meter updates at 10 Hz from daemon smeter events
- [ ] AC-UI-04e: PTT button is hidden when radio cannot transmit
- [ ] AC-UI-04f: All controls work via keyboard (Tab, arrow keys, Enter)

#### F-UI-05: PropSphere Integration

**Behavior:**
- Clicking a DX spot on the 3D globe / 2D map sends `radio:tune` to the connected radio
- Current radio frequency is shown on the map's band conditions panel
- Active transmit indicator on the map when PTT is engaged

**Acceptance Criteria:**
- [ ] AC-UI-05a: Clicking a 20m DX spot on PropSphere tunes the radio to the spot's frequency
- [ ] AC-UI-05b: Mode is set automatically based on the spot's band and type (SSB/CW/FT8)
- [ ] AC-UI-05c: Current VFO frequency is displayed in the band conditions panel
- [ ] AC-UI-05d: Spot click behavior is disabled when no radio is connected (shows tooltip)

#### F-UI-06: Contest Engine Integration

**Behavior:**
- Contest band map shows live signals from SDR waterfall (if available)
- DX cluster spots are overlaid on band map at correct frequencies
- Clicking a spot in the band map tunes the radio
- QSO logging auto-fills frequency and mode from radio state

**Acceptance Criteria:**
- [ ] AC-UI-06a: Band map renders SDR waterfall data as a vertical band scope
- [ ] AC-UI-06b: Cluster spots appear at correct positions on band scope
- [ ] AC-UI-06c: Clicking a band scope spot tunes the radio
- [ ] AC-UI-06d: New QSO entry auto-fills frequency and mode from connected radio
- [ ] AC-UI-06e: Band map works in cluster-only mode when no SDR FFT is available

### 5.6 Cross-Platform & Distribution

#### F-DIST-01: Build Matrix

**Behavior:**
- GitHub Actions workflow cross-compiles the daemon for all target platforms on every tagged release
- Produces downloadable binaries attached to the GitHub Release

**Target platforms:**

| Target | Triple | Notes |
|--------|--------|-------|
| Windows x64 | `x86_64-pc-windows-msvc` | Primary development target |
| macOS Universal | `x86_64-apple-darwin` + `aarch64-apple-darwin` | Lipo'd universal binary |
| Linux x64 | `x86_64-unknown-linux-gnu` | Ubuntu 22.04+ compatible |
| Linux ARM64 | `aarch64-unknown-linux-gnu` | Raspberry Pi 4/5 (64-bit OS) |

**Acceptance Criteria:**
- [ ] AC-DIST-01a: `cargo build --release` succeeds on all four target platforms
- [ ] AC-DIST-01b: GitHub Actions workflow produces downloadable binaries for all platforms on tag push
- [ ] AC-DIST-01c: Windows binary runs without Visual C++ Redistributable requirement
- [ ] AC-DIST-01d: macOS universal binary runs on both Intel and Apple Silicon
- [ ] AC-DIST-01e: Linux binary runs on Ubuntu 22.04 without additional package installation
- [ ] AC-DIST-01f: ARM64 binary runs on Raspberry Pi 4 with 64-bit Raspberry Pi OS
- [ ] AC-DIST-01g: Binary size is < 15 MB per platform

#### F-DIST-02: Configuration

**Behavior:**
- TOML configuration file at `~/.propulse/daemon.toml` (or `%APPDATA%\propulse\daemon.toml` on Windows)
- Auto-created with sensible defaults on first run
- CLI flags override config file values
- Environment variables override both (for Docker/container deployment)

**Configuration schema:**
```toml
[server]
port = 9867
bind = "0.0.0.0"        # "127.0.0.1" for localhost-only
auth_token = ""           # empty = no auth

[radio.soapy]
enabled = true
scan_interval_secs = 5

[radio.hamlib]
enabled = true
# List of configured Hamlib rigs
[[radio.hamlib.rigs]]
name = "IC-7300"
model = 3073              # Hamlib model number
port = "COM3"             # or "/dev/ttyUSB0"
baud = 19200
poll_interval_ms = 200

[dsp]
default_fft_size = 4096
default_fft_fps = 20
default_audio_rate = 48000

[integrations.wsjtx]
enabled = true
port = 2237

[integrations.cluster]
enabled = false
host = "dxc.nc7j.com"
port = 7300
callsign = ""

[integrations.n1mm]
enabled = false
broadcast_port = 12060

[audio]
output_device = "default"
virtual_cable = false

[discovery]
mdns_enabled = true
service_name = "My Shack"
```

**Acceptance Criteria:**
- [ ] AC-DIST-02a: Daemon creates default config file on first run
- [ ] AC-DIST-02b: `--port 9999` CLI flag overrides config file port
- [ ] AC-DIST-02c: `PROPULSE_PORT=9999` environment variable overrides config file
- [ ] AC-DIST-02d: Invalid config file produces clear error message pointing to the problem
- [ ] AC-DIST-02e: Config file changes are hot-reloaded on SIGHUP (Unix) or file watch (Windows)

#### F-DIST-03: Logging & Diagnostics

**Behavior:**
- Structured logging using `tracing` crate with configurable level (error/warn/info/debug/trace)
- Log output to stdout (for terminal use) and optionally to file
- `daemon:status` WebSocket message returns health diagnostics

**Acceptance Criteria:**
- [ ] AC-DIST-03a: Default log level is `info`, shows startup, connections, and errors
- [ ] AC-DIST-03b: `--log-level debug` shows DSP pipeline details and message routing
- [ ] AC-DIST-03c: `--log-file /path/to/log` writes structured JSON logs to file
- [ ] AC-DIST-03d: `daemon:status` returns version, uptime, CPU%, memory, connected radios, active streams

---

## 6. Testing Strategy

### 6.1 Unit Tests

Located alongside source in each crate. Run with `cargo test`.

| Module | Test Focus | Key Tests |
|--------|-----------|-----------|
| `propulse-dsp::fft` | FFT correctness | Known sinusoid → verify peak bin and magnitude |
| `propulse-dsp::demod` | Demodulation | Synthetic USB/LSB/AM/FM signals → verify audio output |
| `propulse-dsp::filter` | Filter response | Verify passband, stopband, and shape factor |
| `propulse-dsp::nr` | Noise reduction | Noise + signal → verify SNR improvement |
| `propulse-dsp::agc` | AGC behavior | Step input → verify attack/decay timing |
| `propulse-radio::traits` | Type system | Capability reporting, command validation |
| `propulse-daemon::protocol` | Serialization | Round-trip JSON serialization of all message types |
| `propulse-daemon::protocol` | Binary frames | Round-trip binary serialization of FFT/audio frames |

### 6.2 Integration Tests

Located in `daemon/tests/`. Require the `dummy` radio backend.

| Test | Description |
|------|-------------|
| `protocol_test.rs` | Full WebSocket lifecycle: connect → enumerate → connect radio → tune → stream FFT → disconnect |
| `dsp_test.rs` | End-to-end DSP: synthetic IQ → FFT output verification → audio output verification |
| `dummy_radio_test.rs` | Dummy radio generates known signals; verify waterfall and audio content |
| `multi_client_test.rs` | Multiple WebSocket clients; verify state sync and stream delivery |
| `migration_test.rs` | Send existing bridge protocol messages; verify backward-compatible handling |
| `reconnection_test.rs` | Simulate network disconnect; verify client reconnection and state recovery |

### 6.3 Hardware Tests (Manual, CI-excluded)

These require physical hardware and are run manually before releases.

| Test | Hardware | Verification |
|------|----------|-------------|
| RSPdx smoke test | SDRplay RSPdx v2 | Connect, tune 14.074, verify FT8 signals on waterfall |
| RTL-SDR smoke test | RTL-SDR Blog V4 | Connect, tune FM broadcast, verify audio |
| Hamlib CAT test | IC-7300 (or simulator) | Connect, tune, mode change, read S-meter |
| Dual antenna test | RSPdx with 2 HF antennas | Switch between Antenna A/B, verify signal change |
| Cross-platform test | Each target platform | Binary starts, finds hardware, streams data |
| Raspberry Pi test | Pi 4/5 + RTL-SDR | CPU < 40%, FFT at 15 fps, audio without glitches |
| Remote test | Daemon on Pi, UI on laptop | Connect over LAN, full operation |

### 6.4 Frontend Tests

| Test | Type | Description |
|------|------|-------------|
| `useRadioDaemon.test.ts` | Unit | WebSocket mock → verify state updates |
| `Waterfall.test.tsx` | Component | Feed synthetic FFT data → verify canvas renders |
| `RadioControls.test.tsx` | Component | Verify controls adapt to different RadioCapabilities |
| `DevicePicker.test.tsx` | Component | Verify daemon list rendering and connection flow |
| `protocol.test.ts` | Unit | Verify TypeScript types match daemon JSON schema |

### 6.5 Performance Benchmarks

Run with `cargo bench` using `criterion`:

| Benchmark | Target | Hardware |
|-----------|--------|----------|
| FFT 4096-point | < 0.5ms per frame | x64 |
| FFT 4096-point | < 2ms per frame | ARM64 |
| USB demodulation | < 1ms per 1024 samples | x64 |
| Spectral NR | < 2ms per frame | x64 |
| FIR filter 256-tap | < 0.3ms per 1024 samples | x64 |
| JSON serialization | < 0.1ms per message | x64 |
| Binary frame serialization | < 0.01ms per frame | x64 |

---

## 7. Implementation Roadmap

### Phase 1: Foundation (Weeks 1–3)

**Goal:** Rust daemon scaffold, SoapySDR connection to RSPdx, FFT streaming to a basic web waterfall.

- [ ] Initialize Cargo workspace with all crates
- [ ] Implement WebSocket server with JSON protocol
- [ ] Implement `DummyRadio` backend (generates synthetic signals)
- [ ] Implement SoapySDR device enumeration
- [ ] Implement SoapySDR IQ stream reading for RSPdx
- [ ] Implement basic FFT (rustfft, 4096-point, no averaging)
- [ ] Implement binary FFT frame encoding
- [ ] Frontend: `useRadioDaemon` hook with WebSocket client
- [ ] Frontend: Basic Canvas2D waterfall (proof of concept)
- [ ] Integration test: dummy radio end-to-end
- [ ] Build: `cargo build --release` on Windows and macOS

**Exit criteria:** RSPdx connected, waterfall showing live signals in Propulse browser UI.

### Phase 2: DSP & Audio (Weeks 4–6)

**Goal:** Full demodulation pipeline, audio output, noise reduction.

- [ ] Implement USB/LSB demodulator
- [ ] Implement CW/AM/FM demodulators
- [ ] Implement FIR bandpass filter with real-time adjustment
- [ ] Implement spectral noise reduction
- [ ] Implement noise blanker
- [ ] Implement multi-speed AGC
- [ ] Implement audio streaming via WebSocket (PCM int16)
- [ ] Implement local audio output via cpal
- [ ] Implement virtual audio cable output (for WSJT-X)
- [ ] Frontend: Web Audio API playback from WebSocket audio stream
- [ ] Frontend: DSP controls panel (NR, NB, AGC, filter)
- [ ] DSP unit tests for all demodulators
- [ ] Performance benchmarks

**Exit criteria:** Listen to SSB and FT8 signals through browser, WSJT-X decodes via virtual audio cable.

### Phase 3: Hamlib & Multi-Radio (Weeks 7–9)

**Goal:** Support traditional transceivers, multi-radio management, antenna switching.

- [ ] Implement Hamlib backend (rigctld TCP protocol)
- [ ] Implement serial port enumeration
- [ ] Implement IC-7300 CI-V spectrum scope (if feasible) for Tier 2 waterfall
- [ ] Implement multi-radio manager (concurrent SDR + transceiver)
- [ ] Implement RSPdx antenna port switching
- [ ] Implement transceiver antenna switching via CAT
- [ ] Implement VFO polling for physical knob tracking
- [ ] Frontend: Device Picker component
- [ ] Frontend: Unified RadioControls with capability adaptation
- [ ] Frontend: S-meter component
- [ ] Integration tests: Hamlib backend, multi-radio

**Exit criteria:** RSPdx + IC-7300 connected simultaneously, both controllable from Propulse.

### Phase 4: Frontend Integration (Weeks 10–12)

**Goal:** WebGL waterfall, PropSphere click-to-tune, contest band map, full UI polish.

- [ ] Frontend: WebGL waterfall (scrolling texture, GPU-accelerated)
- [ ] Frontend: Spectrum scope overlay
- [ ] Frontend: Click-to-tune from waterfall
- [ ] Frontend: PropSphere click-to-tune (DX spot → radio tune)
- [ ] Frontend: Contest band map with SDR waterfall data
- [ ] Frontend: QSO auto-fill from radio state
- [ ] Frontend: DX cluster spot overlay on waterfall
- [ ] Frontend: WSJT-X decode overlay on waterfall
- [ ] Frontend: Color palette configuration
- [ ] Frontend: Mobile responsive SDR console
- [ ] Frontend component tests

**Exit criteria:** Complete operating workflow: see spot on globe → click → radio tunes → waterfall shows signal → log QSO.

### Phase 5: Integrations & Remote (Weeks 13–15)

**Goal:** WSJT-X, DX Cluster, N1MM+, mDNS, and cross-platform builds.

- [ ] Port WSJT-X UDP integration from bridge to Rust
- [ ] Port DX Cluster telnet from bridge to Rust
- [ ] Implement N1MM+ UDP interop
- [ ] Implement virtual CAT server
- [ ] Implement mDNS/Bonjour advertisement
- [ ] Frontend: Daemon auto-discovery
- [ ] Implement TOML configuration with hot-reload
- [ ] GitHub Actions: cross-compile workflow for all platforms
- [ ] Raspberry Pi testing and optimization
- [ ] Remote operation testing (daemon on Pi, UI on laptop over LAN)
- [ ] `--compat-bridge` backward compatibility mode
- [ ] Documentation: daemon README, setup guide, protocol reference

**Exit criteria:** Full release-candidate binary for all platforms, remote operation working.

### Phase 6: RTL-SDR, Airspy & Community Beta (Weeks 16–18)

**Goal:** Expand SDR hardware support, community testing, polish.

- [ ] Verify RTL-SDR Blog V4 via SoapySDR
- [ ] Verify Airspy HF+ Discovery via SoapySDR
- [ ] Verify HackRF via SoapySDR
- [ ] Add FlexRadio SmartSDR backend (stretch goal)
- [ ] Add Elecraft K4 extended CAT support (stretch goal)
- [ ] Community beta testing program
- [ ] Bug fixes and performance optimization
- [ ] Bridge deprecation plan and migration guide

**Exit criteria:** v1.0 release with support for ≥ 3 SDR platforms, ≥ 5 transceiver models, all target OS platforms.

---

## 8. Dependencies (Rust Crates)

| Crate | Purpose | Notes |
|-------|---------|-------|
| `tokio` | Async runtime | Full features (net, time, sync, fs) |
| `tokio-tungstenite` | WebSocket server | Async WebSocket with binary frame support |
| `serde` + `serde_json` | Serialization | JSON protocol messages |
| `rustfft` | FFT computation | Pure Rust, no FFTW dependency |
| `cpal` | Cross-platform audio | Local speaker output |
| `serialport` | Serial port I/O | Hamlib CAT communication |
| `mdns-sd` | mDNS/Bonjour | Service advertisement and discovery |
| `toml` | Config parsing | TOML configuration file |
| `tracing` + `tracing-subscriber` | Structured logging | With JSON and stdout formatters |
| `anyhow` + `thiserror` | Error handling | Application vs. library errors |
| `clap` | CLI argument parsing | Derive-based |
| `criterion` | Benchmarking | DSP performance benchmarks |
| `soapysdr` (Rust bindings) | SDR hardware access | Wraps SoapySDR C library via FFI |

**Note on SoapySDR:** The Rust daemon links against the SoapySDR shared library. Users must install SoapySDR and the appropriate hardware module (e.g., SoapySDRPlay) for their SDR. This is the one external dependency. The daemon checks for SoapySDR at startup and operates in Hamlib-only mode if not found.

---

## 9. Security Considerations

- **Localhost default:** Daemon binds to `127.0.0.1` by default. Remote access requires explicit `bind = "0.0.0.0"` in config.
- **Token auth:** Optional `auth_token` in config; if set, clients must present it in the WebSocket handshake.
- **No secrets in protocol:** Audio and FFT streams contain radio signal data only. No credentials traverse the WebSocket.
- **Config file permissions:** Daemon warns if config file (which may contain auth token) is world-readable.
- **USB safety:** Daemon only accesses USB devices via SoapySDR and serialport crates. No raw USB control.
- **No internet access:** Daemon does not phone home, check for updates, or connect to any external service. All network traffic is local (mDNS) or to configured cluster nodes.

---

## 10. Open Questions

1. **SoapySDR Rust bindings maturity:** The `soapysdr` crate exists but may need patches. Fallback: C FFI wrapper via `bindgen`.
2. **Windows virtual audio cable:** VB-Audio Cable requires separate install. Should we bundle a lightweight virtual audio driver, or document the VB-Audio setup? (Recommendation: document it for v1, investigate bundling for v2.)
3. **IC-7300 spectrum scope via CI-V:** Feasible but undocumented. Need to reverse-engineer the CI-V commands or use `hamlib` extensions. May punt to Phase 3 stretch goal.
4. **FlexRadio SmartSDR API:** Well-documented but proprietary. Need to assess licensing before implementing.
5. **WebSocket compression:** Should we enable per-message deflate for FFT data, or is binary frame + decimation sufficient? (Recommendation: benchmark both.)
6. **Concurrent TX/RX with SDR + Transceiver:** When an SDR (RX) and transceiver (TX) are both connected, should the daemon automatically route TX control to the transceiver when PTT is pressed in the UI? (Recommendation: yes, with explicit "TX Radio" selection in UI.)

---

## 11. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Time to first waterfall | < 30 seconds from daemon start | Manual test on each platform |
| FFT frame rate | ≥ 20 fps on x64, ≥ 15 fps on ARM64 | Performance benchmark |
| Audio latency | < 50ms antenna to speaker | Measured with tone generator |
| Binary size | < 15 MB per platform | CI build artifact size |
| Supported SDR platforms | ≥ 3 (RSPdx, RTL-SDR, Airspy) | Hardware test matrix |
| Supported transceivers | ≥ 5 models via Hamlib | Hardware test matrix |
| Platform coverage | Windows, macOS, Linux x64, Linux ARM64 | CI build matrix |
| Protocol backward compat | 100% of existing bridge messages handled | Migration test suite |

---

## 12. Glossary

| Term | Definition |
|------|-----------|
| **CAT** | Computer Aided Transceiver — serial protocol for rig control |
| **CI-V** | Icom's CAT protocol variant |
| **cpal** | Cross-Platform Audio Library (Rust crate) |
| **DDC** | Digital Down Converter — frequency shift IQ to baseband |
| **DSP** | Digital Signal Processing |
| **FFT** | Fast Fourier Transform — converts time-domain IQ to frequency-domain spectrum |
| **FIR** | Finite Impulse Response — a type of digital filter |
| **Hamlib** | Open-source radio control library supporting 200+ transceiver models |
| **IQ** | In-phase / Quadrature — the raw complex sample format from SDR hardware |
| **mDNS** | Multicast DNS — zero-configuration networking for local service discovery |
| **NB** | Noise Blanker — removes impulse noise |
| **NR** | Noise Reduction — reduces broadband noise via spectral processing |
| **rigctld** | Hamlib's TCP server daemon for network-accessible rig control |
| **SoapySDR** | Vendor-neutral SDR hardware abstraction library |
| **WSJT-X** | Weak Signal Joe Taylor — software for FT8/FT4/JT65 digital modes |
