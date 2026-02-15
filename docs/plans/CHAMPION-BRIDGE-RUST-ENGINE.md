# Champion Bridge: Rust Engine for Propulse

**Version:** 1.0
**Author:** Chris / Claude
**Date:** 2026-02-14
**Status:** Draft
**Part:** 1 of 2 (Part 2: Neural Decoder — separate document)
**Target Path:** `propulse/engine/` (Cargo workspace in monorepo)

---

## 1. Executive Summary

### What We Are Building

A single Rust binary called `propulse-engine` that replaces four to six separate applications ham radio operators currently run alongside WSJT-X:

| Replaced Application       | Platform                 | RAM Usage | What `propulse-engine` Does Instead                                                     |
| -------------------------- | ------------------------ | --------- | --------------------------------------------------------------------------------------- |
| **JTAlert**                | Windows-only (.NET 8)    | ~200 MB   | `alerts/` module: rule engine, audio alerts, push notifications                         |
| **GridTracker**            | Electron (all platforms) | ~1.5 GB   | Propulse 3D globe already exists and is better; Call Roster is a new frontend component |
| **OmniRig / Flrig**        | Windows / cross-platform | ~50 MB    | `rig/` module: direct CAT for top 20 radios, rigctld/flrig passthrough                  |
| **DX Cluster client**      | Various                  | ~100 MB   | `net/cluster.rs`: telnet client with spot parsing (port from Node.js bridge)            |
| **Virtual audio cables**   | Platform-specific        | ~20 MB    | `audio/` module: direct audio capture, no virtual routing needed                        |
| **Separate waterfall app** | Various                  | ~200 MB   | `dsp/` module: FFT spectrum data streamed to Propulse frontend                          |

After installation, the operator's stack reduces to:

```
Before:  WSJT-X + JTAlert + GridTracker + Flrig + DX Client + Logger = 6 apps
After:   WSJT-X + Propulse = 2 apps
```

### Why Rust

1. **No GC pauses during audio callbacks.** Audio capture runs in a real-time thread with a lock-free ring buffer. Garbage collection pauses in Node.js or .NET cause audio dropouts. Rust's ownership model eliminates this class of bug entirely.

2. **Single binary distribution.** `propulse-engine` compiles to one executable file (10-20 MB) with zero runtime dependencies. No Node.js, no .NET, no JVM, no Electron. Download, double-click, done.

3. **Cross-platform from one codebase.** `cargo build` targets Windows (MSVC), macOS (universal binary for Intel + Apple Silicon), Linux x64, and Raspberry Pi ARM64. The `cross` tool handles ARM cross-compilation from x64 CI runners.

4. **WASM compilation possible.** Core decode and DSP modules can compile to WebAssembly for in-browser fallback when the native engine is not installed. This is a Phase 2+ capability.

5. **Memory safety without overhead.** The engine handles untrusted data from multiple sources (WSJT-X UDP, DX Cluster telnet, CAT serial, audio devices). Rust's type system prevents buffer overflows, use-after-free, and data races at compile time.

### The Two-App Promise

> "Install WSJT-X and Propulse. That's it."

This is the tagline. Every feature, architecture decision, and milestone in this document serves this goal. If the operator needs a third application for any part of their digital mode workflow, we have failed.

### Relationship to PRD-RADIO-DAEMON.md

The existing `docs/plans/PRD-RADIO-DAEMON.md` describes a broader "Radio Daemon" with full SDR IQ processing (SoapySDR, demodulation, WebGL waterfall). The Champion Bridge is a deliberately scoped **subset** that focuses on replacing the multi-app workflow first, without requiring SDR hardware support. The SDR capabilities from PRD-RADIO-DAEMON remain a future phase that builds on the Champion Bridge foundation.

Key differences:

- PRD-RADIO-DAEMON requires SoapySDR and hardware SDR drivers as a dependency
- Champion Bridge has **zero external dependencies** (just the compiled binary)
- Champion Bridge focuses on audio capture from standard sound cards, not IQ from SDRs
- Champion Bridge adds alert engine, training data collection, and native decoders
- SDR support (PRD-RADIO-DAEMON Phase 1-6) can be layered on top after M12

---

## 2. Architecture

### 2.1 Module Structure

```
propulse-engine/
├── Cargo.toml              # Workspace root
├── Cargo.lock
├── config.example.toml     # Default configuration
├── README.md
│
├── src/
│   ├── main.rs             # Entry point, CLI (clap), config loading, module startup
│   ├── config.rs           # TOML config parsing, defaults, validation
│   │
│   ├── audio/              # Audio capture + playback + ring buffer
│   │   ├── mod.rs
│   │   ├── capture.rs      # Cross-platform audio input (cpal)
│   │   │                   #   - USB radio codec (e.g. IC-7300 USB audio)
│   │   │                   #   - Sound card line-in
│   │   │                   #   - Virtual audio device
│   │   ├── playback.rs     # TX audio generation for digital modes
│   │   ├── devices.rs      # Device enumeration, hot-plug detection
│   │   └── ring_buffer.rs  # Lock-free SPSC ring buffer (audio thread → decode thread)
│   │                       #   - Single producer (cpal callback), single consumer (decoder)
│   │                       #   - Cache-line padded to prevent false sharing
│   │                       #   - Atomic head/tail pointers, no mutex
│   │
│   ├── decode/             # Native decoders for non-FT8 modes
│   │   ├── mod.rs
│   │   ├── cw.rs           # CW/Morse decoder
│   │   │                   #   - Goertzel tone detector (700 Hz default pitch)
│   │   │                   #   - Timing state machine (dit/dah/space classification)
│   │   │                   #   - Adaptive speed tracking (10-50 WPM)
│   │   │                   #   - Outputs decoded text + WPM estimate
│   │   ├── psk31.rs        # PSK31/63 decoder
│   │   │                   #   - BPSK demodulation (Costas loop PLL)
│   │   │                   #   - QPSK support for PSK63
│   │   │                   #   - Varicode lookup table
│   │   │                   #   - AFC (automatic frequency control)
│   │   ├── rtty.rs         # RTTY decoder
│   │   │                   #   - FSK demodulation (mark/space detection)
│   │   │                   #   - Baudot ITA2 character mapping
│   │   │                   #   - 45.45/50/75 baud support
│   │   │                   #   - USOS (unshift on space) handling
│   │   └── ft8_ffi.rs      # ft8_lib FFI wrapper (experimental)
│   │                       #   - Links against kgoba/ft8_lib C library via bindgen
│   │                       #   - Provides baseline FT8 decode for comparison
│   │                       #   - NOT a replacement for WSJT-X (yet — see Part 2)
│   │
│   ├── rig/                # CAT (Computer Aided Transceiver) control
│   │   ├── mod.rs
│   │   ├── hamlib.rs       # rigctld TCP client (port 4532)
│   │   │                   #   - Text protocol: f, m, t, F, M, T, etc.
│   │   │                   #   - Auto-detect on startup
│   │   │                   #   - Polling at configurable interval (default 200ms)
│   │   │                   #   - Exact port of existing bridge/src/rig.ts HamlibBackend
│   │   ├── flrig.rs        # Flrig XML-RPC client (port 12345)
│   │   │                   #   - HTTP POST to /RPC2 endpoint
│   │   │                   #   - Methods: rig.get_frequency, rig.set_frequency, etc.
│   │   │                   #   - Exact port of existing bridge/src/rig.ts FlrigBackend
│   │   ├── serial.rs       # Direct serial CAT for top 20 radios
│   │   │                   #   - Kenwood: ASCII text protocol (FA, MD, TX, etc.)
│   │   │                   #   - Icom CI-V: binary framed protocol (FE FE ... FD)
│   │   │                   #   - Yaesu: binary CAT commands
│   │   │                   #   - Elecraft: extended Kenwood ASCII
│   │   │                   #   - Serial port via `serialport` crate
│   │   └── ptt.rs          # PTT control abstraction
│   │                       #   - Serial RTS/DTR line toggling
│   │                       #   - CAT PTT command (T 1 / T 0)
│   │                       #   - VOX detection (audio level threshold)
│   │
│   ├── net/                # Network services
│   │   ├── mod.rs
│   │   ├── ws.rs           # WebSocket server (tokio-tungstenite)
│   │   │                   #   - Multi-client support
│   │   │                   #   - JSON text frames for commands/events
│   │   │                   #   - Binary frames for spectrum/audio data
│   │   │                   #   - Localhost-only bind (security default)
│   │   │                   #   - Graceful shutdown with client notification
│   │   ├── protocol.rs     # Message envelope and routing
│   │   │                   #   - { type, ts, id?, payload } envelope (matches bridge)
│   │   │                   #   - Route messages to appropriate module handlers
│   │   │                   #   - Backward compatible with Node.js bridge protocol
│   │   ├── wsjtx.rs        # WSJT-X UDP relay
│   │   │                   #   - QDataStream binary parser (big-endian)
│   │   │                   #   - Status, Decode, Clear, QSOLogged, LoggedADIF
│   │   │                   #   - Exact port of existing bridge/src/wsjtx.ts
│   │   │                   #   - Bidirectional: can send Reply/Tune to WSJT-X
│   │   ├── cluster.rs      # DX Cluster telnet client
│   │   │                   #   - TCP socket with login sequence
│   │   │                   #   - DX Spider spot line parsing
│   │   │                   #   - Deduplication (60s window)
│   │   │                   #   - Band/mode/SNR filtering
│   │   │                   #   - Reconnection with exponential backoff
│   │   │                   #   - Exact port of existing bridge/src/cluster.ts
│   │   └── static_files.rs # HTTP static file server (hyper)
│   │                       #   - Serves frontend dist/ for offline operation
│   │                       #   - SPA fallback (serves index.html for routes)
│   │                       #   - MIME types, cache headers
│   │                       #   - Port of existing bridge static server
│   │
│   ├── dsp/                # Signal processing
│   │   ├── mod.rs
│   │   ├── fft.rs          # RustFFT wrapper
│   │   │                   #   - Configurable FFT size (1024-8192)
│   │   │                   #   - Windowing (Blackman-Harris, Hann)
│   │   │                   #   - Power spectrum (magnitude squared, dB scale)
│   │   │                   #   - Averaging (1x-8x)
│   │   ├── waterfall.rs    # Spectrum data packaging for frontend
│   │   │                   #   - Decimation for WebSocket bandwidth
│   │   │                   #   - Peak-hold tracking
│   │   │                   #   - Binary frame encoding (Type 0x01)
│   │   ├── filters.rs      # Digital filters
│   │   │                   #   - FIR bandpass (configurable taps)
│   │   │                   #   - IIR lowpass (for audio smoothing)
│   │   │                   #   - DC removal
│   │   └── meter.rs        # Signal measurement
│   │                       #   - RMS audio level (for frontend meter)
│   │                       #   - S-meter from CAT (if rig supports)
│   │                       #   - SWR reading from CAT (if rig supports)
│   │
│   ├── training/           # Phase 2 data collection (silent, opt-in)
│   │   ├── mod.rs
│   │   ├── collector.rs    # Capture audio + WSJT-X decode pairs
│   │   │                   #   - Records 15-second FT8 windows from audio ring buffer
│   │   │                   #   - Pairs with WSJT-X decode results received via UDP
│   │   │                   #   - Creates labeled training examples:
│   │   │                   #     { audio_segment, decoded_messages[], snr[], freq_offsets[] }
│   │   │                   #   - Stores only when WSJT-X confirms decodes (no garbage data)
│   │   ├── storage.rs      # Write training data to disk
│   │   │                   #   - Directory: ~/.propulse/training/
│   │   │                   #   - Format: zstd-compressed MessagePack
│   │   │                   #   - File rotation: one file per hour, auto-prune after 30 days
│   │   │                   #   - Disk usage cap: configurable (default 10 GB)
│   │   └── upload.rs       # Optional: upload to cloud training pipeline
│   │                       #   - HTTPS POST to Propulse training API
│   │                       #   - Background upload during idle time
│   │                       #   - Resume support for interrupted uploads
│   │                       #   - Explicit opt-in via config + UI toggle
│   │
│   └── alerts/             # JTAlert replacement
│       ├── mod.rs
│       ├── engine.rs       # Rule evaluation engine
│       │                   #   - Evaluates every WSJT-X decode against alert rules
│       │                   #   - Evaluates every DX Cluster spot against alert rules
│       │                   #   - Priority system: critical > wanted_dxcc > wanted_grid > info
│       │                   #   - Cooldown: same callsign+band suppressed for 15 minutes
│       ├── rules.rs        # Alert rule definitions
│       │                   #   - Wanted DXCC entities (by band/mode)
│       │                   #   - Wanted grid squares (by band/mode)
│       │                   #   - Wanted callsigns (watchlist)
│       │                   #   - Wanted CQ zones, ITU zones, US states
│       │                   #   - New country on band/mode (band-slot tracking)
│       │                   #   - Contest multiplier alerts
│       │                   #   - Rules loaded from config, also settable via WebSocket
│       ├── audio.rs        # Alert sounds (rodio)
│       │                   #   - Configurable sound per alert type
│       │                   #   - Volume control, quiet hours support
│       │                   #   - Default: built-in embedded WAV tones
│       │                   #   - Custom: user-supplied sound files
│       └── push.rs         # Push notifications
│                           #   - Pushover API integration
│                           #   - FCM (Firebase Cloud Messaging) for mobile
│                           #   - Desktop notifications (notify-rust)
│                           #   - Rate limiting: max 1 push per callsign per 30 min
│
└── tests/
    ├── protocol_compat.rs  # Backward compatibility with Node.js bridge protocol
    ├── wsjtx_parser.rs     # WSJT-X QDataStream parser verification
    ├── cluster_parser.rs   # DX Spider spot line parser verification
    ├── ring_buffer.rs      # Lock-free ring buffer stress test
    ├── alert_engine.rs     # Alert rule evaluation correctness
    └── training_pairs.rs   # Audio + decode pairing logic
```

### 2.2 Thread Architecture

The engine uses a hybrid threading model: a small number of OS threads for real-time work, and a tokio async runtime for network I/O.

```
┌─────────────────────────────────────────────────────────────────┐
│                     propulse-engine Process                      │
│                                                                 │
│  Thread 1: Audio Capture (cpal callback)                        │
│  ├── Priority: REALTIME (SCHED_FIFO on Linux, THREAD_PRIORITY_  │
│  │   TIME_CRITICAL on Windows)                                  │
│  ├── Runs in cpal's callback thread (OS-managed)                │
│  ├── Copies audio samples into lock-free SPSC ring buffer       │
│  ├── ZERO allocations in this path (pre-allocated buffer)       │
│  └── Buffer size: 4096 samples × 4 buffers = ~340ms at 48kHz   │
│                                                                 │
│  Thread 2: Decoder                                              │
│  ├── Priority: HIGH                                             │
│  ├── Reads from ring buffer when data available                 │
│  ├── Runs active decoder(s): CW, PSK31, RTTY, or ft8_lib       │
│  ├── Outputs decoded text + metadata to async channel           │
│  └── Also copies audio windows to training collector channel    │
│                                                                 │
│  Thread 3: FFT / Waterfall                                      │
│  ├── Priority: NORMAL                                           │
│  ├── Reads from ring buffer (separate consumer view)            │
│  ├── Computes windowed FFT (RustFFT)                            │
│  ├── Produces spectrum data at 15-30 fps                        │
│  └── Outputs power spectrum to async channel for WebSocket      │
│                                                                 │
│  Thread 4: Tokio Async Runtime (multi-threaded, 2-4 workers)    │
│  ├── WebSocket server (accept, read, write)                     │
│  ├── CAT polling (rigctld TCP / flrig HTTP / serial)            │
│  ├── DX Cluster telnet client                                   │
│  ├── WSJT-X UDP listener                                        │
│  ├── Alert engine evaluation                                    │
│  ├── Static file HTTP server                                    │
│  └── Training data upload (background task)                     │
│                                                                 │
│  Thread 5: Training Data Writer (background, low priority)      │
│  ├── Priority: IDLE / BELOW_NORMAL                              │
│  ├── Receives (audio_window, decode_results) pairs via channel  │
│  ├── Compresses with zstd                                       │
│  ├── Writes to disk with rotation                               │
│  └── Manages disk usage cap                                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 Data Flow

```
                    Physical Radio
                         │
              ┌──────────┴──────────┐
              │                     │
         USB Audio              CAT/Serial
         (48 kHz)              (rigctld/flrig/CI-V)
              │                     │
    ┌─────────▼─────────┐    ┌─────▼──────┐
    │  Audio Capture     │    │   Rig      │
    │  (cpal callback)   │    │  Control   │
    └─────────┬──────────┘    └─────┬──────┘
              │                     │
    ┌─────────▼──────────┐         │
    │  SPSC Ring Buffer   │         │
    │  (lock-free)        │         │
    └──┬──────┬───────────┘         │
       │      │                     │
  ┌────▼──┐  ┌▼────────┐           │
  │Decoder│  │FFT/     │           │
  │Thread │  │Waterfall│           │
  └───┬───┘  └────┬────┘           │
      │           │                │
      ▼           ▼                ▼
  ┌──────────────────────────────────────┐
  │        Tokio Async Runtime            │
  │                                       │
  │  ┌──────────┐  ┌──────────────────┐  │     ┌──────────┐
  │  │ Alert    │  │  WebSocket       │◄─┼─────│ WSJT-X   │
  │  │ Engine   │  │  Server          │  │ UDP │ (decode)  │
  │  └──┬──┬───┘  └──┬────────┬──────┘  │     └──────────┘
  │     │  │         │        │          │
  │     │  │    ┌────▼────┐   │          │     ┌──────────┐
  │     │  └───►│Broadcast│   │          │◄────│DX Cluster│
  │     │       │to all   │   │          │ TCP │  Node    │
  │     │       │clients  │   │          │     └──────────┘
  │     │       └─────────┘   │          │
  │     ▼                     ▼          │
  │  ┌──────┐          ┌───────────┐     │
  │  │Rodio │          │ Frontend  │     │
  │  │Sound │          │ (browser) │     │
  │  └──────┘          └───────────┘     │
  └──────────────────────────────────────┘
              │
    ┌─────────▼──────────┐
    │  Training Writer    │
    │  (background thread)│
    │  audio + decode     │
    │  pairs → disk       │
    └─────────────────────┘
```

### 2.4 Configuration

Configuration uses TOML with layered overrides: defaults < config file < environment variables < CLI flags.

```toml
# ~/.propulse/engine.toml

[server]
ws_port = 9867                    # WebSocket port (same as current bridge)
static_port = 3173                # Static file server port
bind = "127.0.0.1"               # Localhost only (security default)

[rig]
backend = "auto"                  # "auto" | "hamlib" | "flrig" | "serial" | "none"
poll_interval_ms = 200

[rig.hamlib]
host = "127.0.0.1"
port = 4532

[rig.flrig]
host = "127.0.0.1"
port = 12345

[rig.serial]
port = ""                         # e.g. "COM3" or "/dev/ttyUSB0"
baud = 9600
protocol = "auto"                 # "kenwood" | "icom" | "yaesu" | "elecraft" | "auto"
radio_model = ""                  # e.g. "IC-7300", "TS-890S", "FT-DX10"

[audio]
input_device = "default"          # Audio input device name or "default"
sample_rate = 48000               # 48000 or 44100
buffer_size = 4096                # Ring buffer size in samples

[decode]
enabled = false                   # Enable native decoders
active_modes = ["cw"]             # Which decoders to activate
cw_pitch = 700                    # CW sidetone frequency (Hz)
cw_bandwidth = 200                # CW filter bandwidth (Hz)

[waterfall]
enabled = false                   # Stream FFT data to frontend
fft_size = 2048                   # FFT bin count
fps = 15                          # Target frames per second
averaging = 2                     # Spectral averaging factor

[wsjtx]
enabled = true                    # Listen for WSJT-X UDP
port = 2237                       # WSJT-X UDP port
multicast_group = ""              # Optional multicast address

[cluster]
enabled = false                   # Auto-connect to DX Cluster
host = "dxc.nc7j.com"
port = 7300
callsign = ""
password = ""

[alerts]
enabled = true
sound_volume = 0.5                # 0.0 to 1.0
quiet_hours_start = ""            # e.g. "22:00"
quiet_hours_end = ""              # e.g. "07:00"
cooldown_minutes = 15             # Suppress repeated alerts

[alerts.pushover]
enabled = false
api_token = ""
user_key = ""

[training]
enabled = false                   # Opt-in training data collection
storage_path = "~/.propulse/training"
max_disk_gb = 10
upload_enabled = false
upload_url = ""
```

---

## 3. Feature Parity Matrix

Every feature from replaced applications, mapped to how `propulse-engine` + Propulse frontend handles it.

### 3.1 JTAlert Replacement (Windows-only, .NET 8, ~200 MB)

| JTAlert Feature                        | Engine Module                          | Frontend Component        | Status        |
| -------------------------------------- | -------------------------------------- | ------------------------- | ------------- |
| Audio alert for wanted DXCC            | `alerts/engine.rs` + `alerts/audio.rs` | Alert settings panel      | New           |
| Audio alert for wanted grid            | `alerts/engine.rs` + `alerts/audio.rs` | Alert settings panel      | New           |
| Audio alert for wanted state (WAS)     | `alerts/engine.rs` + `alerts/rules.rs` | Alert settings panel      | New           |
| Audio alert for wanted CQ zone         | `alerts/engine.rs` + `alerts/rules.rs` | Alert settings panel      | New           |
| Audio alert for specific callsign      | `alerts/engine.rs` + `alerts/rules.rs` | Watchlist UI              | New           |
| Visual popup for new decode            | Not needed                             | Decode panel in frontend  | Already built |
| Per-band/mode "worked before" tracking | Not needed                             | `useAwardTracking` hook   | Already built |
| DXCC tracking per band-slot            | Not needed                             | Award system              | Already built |
| QSO upload to QRZ.com                  | Not needed                             | `logSync` module          | Already built |
| QSO upload to eQSL                     | Not needed                             | `logSync` module          | Already built |
| QSO upload to ClubLog                  | Not needed                             | `logSync` module          | Already built |
| QSO upload to LoTW                     | Not needed                             | `logSync` module          | Already built |
| Callsign database lookup (QRZ/HamQTH)  | Not needed                             | `useCallsignLookup` hook  | Already built |
| B4 (before) checking                   | Not needed                             | QSO logbook query         | Already built |
| Text-to-speech for callsigns           | `alerts/audio.rs` (OS TTS API)         | Settings toggle           | New           |
| Custom sound per alert type            | `alerts/audio.rs` (rodio)              | Sound picker in settings  | New           |
| Contest mode (multiplier alerts)       | `alerts/engine.rs` + `alerts/rules.rs` | Contest panel integration | New           |
| Log4OM integration                     | Not needed                             | Propulse IS the logger    | Already built |
| N1MM+ integration                      | Not needed (future)                    | Not needed                | Deferred      |

### 3.2 GridTracker Replacement (Electron, ~1.5 GB RAM)

| GridTracker Feature                          | Engine Module                 | Frontend Component             | Status                 |
| -------------------------------------------- | ----------------------------- | ------------------------------ | ---------------------- |
| Interactive world map                        | Not needed                    | 3D PropSphere globe (Three.js) | Already built (better) |
| Station callsign labels on map               | Not needed                    | Globe spot overlay             | Already built          |
| CQ/calling station highlighting              | Not needed                    | Globe decode overlay           | Already built          |
| Call Roster (decode list with click-to-call) | `net/wsjtx.rs` (decode relay) | New `CallRoster.tsx` component | New (frontend only)    |
| Wanted highlighting (color-coded)            | `alerts/engine.rs` (tagging)  | Call Roster + globe colors     | Partially built        |
| Award tracking overlay                       | Not needed                    | Award system overlay on globe  | Already built          |
| POTA integration                             | Not needed                    | Activation panel               | Already built          |
| SOTA integration                             | Not needed                    | Activation panel               | Already built          |
| Text-to-speech for alerts                    | `alerts/audio.rs`             | Settings toggle                | New                    |
| Push notifications                           | `alerts/push.rs`              | Notification permission UI     | New                    |
| Callsign lookup                              | Not needed                    | `useCallsignLookup`            | Already built          |
| Bearing/distance calculation                 | Not needed                    | Globe great-circle paths       | Already built          |
| Gray line display                            | Not needed                    | Globe day/night terminator     | Already built          |
| Band condition display                       | Not needed                    | Solar dashboard                | Already built          |
| Propagation prediction                       | Not needed                    | Solar/propagation panels       | Already built          |

### 3.3 CAT Broker Replacement (OmniRig / Flrig)

| Broker Feature                 | Engine Module                      | Notes                                                          |
| ------------------------------ | ---------------------------------- | -------------------------------------------------------------- |
| Hamlib rigctld connection      | `rig/hamlib.rs`                    | Direct port from Node.js bridge                                |
| Flrig XML-RPC connection       | `rig/flrig.rs`                     | Direct port from Node.js bridge                                |
| Multi-app radio sharing        | `rig/` (single source of truth)    | Engine owns the CAT connection; all WebSocket clients share it |
| Frequency read/set             | `rig/hamlib.rs` or `rig/serial.rs` | Polling + command interface                                    |
| Mode read/set                  | `rig/hamlib.rs` or `rig/serial.rs` | Polling + command interface                                    |
| PTT control                    | `rig/ptt.rs`                       | Serial RTS/DTR, CAT command, or VOX                            |
| VFO A/B switching              | `rig/hamlib.rs` or `rig/serial.rs` | CAT command                                                    |
| Split operation                | `rig/hamlib.rs` or `rig/serial.rs` | For satellite and DX pile-ups                                  |
| Direct serial CAT (no rigctld) | `rig/serial.rs`                    | Kenwood, Icom CI-V, Yaesu, Elecraft                            |

**Top 20 radios for direct serial CAT (M3 stretch / M9 target):**

| #   | Radio               | Protocol         | Baud   | Notes                      |
| --- | ------------------- | ---------------- | ------ | -------------------------- |
| 1   | Icom IC-7300        | CI-V (binary)    | 19200  | Most popular modern HF rig |
| 2   | Icom IC-7610        | CI-V (binary)    | 19200  | Dual-watch SDR transceiver |
| 3   | Yaesu FT-DX10       | Yaesu CAT        | 38400  | Mid-range HF               |
| 4   | Yaesu FT-DX101D     | Yaesu CAT        | 38400  | High-end HF                |
| 5   | Yaesu FT-991A       | Yaesu CAT        | 38400  | All-band all-mode          |
| 6   | Yaesu FT-710        | Yaesu CAT        | 38400  | Budget SDR HF              |
| 7   | Kenwood TS-890S     | Kenwood ASCII    | 115200 | High-end HF                |
| 8   | Kenwood TS-590SG    | Kenwood ASCII    | 115200 | Mid-range HF               |
| 9   | Elecraft K4         | Elecraft/Kenwood | 38400  | High-end SDR               |
| 10  | Elecraft KX3        | Elecraft/Kenwood | 38400  | Portable                   |
| 11  | Elecraft KX2        | Elecraft/Kenwood | 38400  | QRP portable               |
| 12  | Icom IC-705         | CI-V (binary)    | 19200  | Portable SDR               |
| 13  | Icom IC-7851        | CI-V (binary)    | 19200  | Flagship                   |
| 14  | Yaesu FT-891        | Yaesu CAT        | 38400  | Mobile/portable HF         |
| 15  | Kenwood TS-480      | Kenwood ASCII    | 57600  | Remote-head mobile         |
| 16  | Icom IC-9700        | CI-V (binary)    | 19200  | VHF/UHF/SHF                |
| 17  | FlexRadio 6400/6600 | SmartSDR API     | TCP    | Network SDR                |
| 18  | Xiegu G90           | Xiegu CAT        | 19200  | Budget portable            |
| 19  | Yaesu FT-450D       | Yaesu CAT        | 38400  | Budget HF                  |
| 20  | Icom IC-706MKIIG    | CI-V (binary)    | 9600   | Legacy classic             |

### 3.4 DX Cluster Client Replacement

| Feature                                          | Engine Module    | Notes                                    |
| ------------------------------------------------ | ---------------- | ---------------------------------------- |
| Telnet connection to DX Spider                   | `net/cluster.rs` | Direct port from `bridge/src/cluster.ts` |
| Spot parsing (DX de CALL: freq DX comment timeZ) | `net/cluster.rs` | Existing regex parser, ported to Rust    |
| Band derivation from frequency                   | `net/cluster.rs` | 160m through 2m lookup table             |
| Mode extraction from comment                     | `net/cluster.rs` | FT8, CW, SSB, RTTY, etc.                 |
| Deduplication                                    | `net/cluster.rs` | 60-second window, hash on DX+freq        |
| Band/mode/SNR filtering                          | `net/cluster.rs` | Configurable server-side filters         |
| Auto-reconnect with backoff                      | `net/cluster.rs` | Exponential backoff, max 30s             |
| Multiple cluster node support                    | `net/cluster.rs` | Failover between configured nodes        |

---

## 4. Migration Strategy

### Phase 1a: Parallel Operation (M1-M4)

```
                 ┌──────────────────┐
                 │  Propulse        │
                 │  Frontend        │
                 └──┬───────────┬───┘
                    │           │
              ws://9867    ws://9868
                    │           │
          ┌─────────▼─┐  ┌─────▼──────────┐
          │ Node.js    │  │ Rust Engine     │
          │ Bridge     │  │ (new features)  │
          │ (existing) │  │                 │
          └────────────┘  └────────────────┘
```

- Rust engine runs on port **9868** alongside the existing Node.js bridge on port 9867
- Frontend discovers both via `useBridge` (existing) and `useEngine` (new hook)
- New capabilities (audio, alerts, training) only available through Rust engine
- Existing users completely unaffected; Rust engine is opt-in
- Frontend shows "Engine available" badge when Rust engine is detected

### Phase 1b: Full Parity (M5)

```
                 ┌──────────────────┐
                 │  Propulse        │
                 │  Frontend        │
                 └───────┬──────────┘
                         │
                   ws://9867
                         │
               ┌─────────▼──────────┐
               │ Rust Engine         │
               │ (all features)      │
               │ port 9867           │
               └─────────────────────┘

          ┌────────────┐
          │ Node.js    │  ← deprecated, still available
          │ Bridge     │     for users who prefer it
          │ (port 9868)│
          └────────────┘
```

- Rust engine absorbs ALL Node.js bridge functionality
- Same WebSocket protocol, same message types, same port (9867)
- Node.js bridge moves to port 9868 as fallback
- Frontend's `useBridge` hook works unchanged (protocol is identical)
- Bridge README updated with deprecation notice

### Phase 1c: New Capabilities (M6-M12)

Once parity is achieved, the Rust engine adds capabilities that were never possible in Node.js:

1. **Audio capture** — cpal integration, device enumeration, ring buffer
2. **Waterfall display** — FFT spectrum data streamed to frontend via binary WebSocket frames
3. **Alert engine** — JTAlert-equivalent rule evaluation with audio and push notifications
4. **Native decoders** — CW, PSK31, RTTY (simple modes, not FT8)
5. **Training data collection** — Silent, opt-in pairing of audio with WSJT-X decode results
6. **Direct CAT** — Serial communication for top 20 radios without requiring rigctld/flrig

### Migration Checklist

Before declaring Node.js bridge deprecated:

- [ ] All 31 message types from `bridge/src/types.ts` MessageTypes handled
- [ ] `bridge.welcome` payload includes same fields (clientId, serverVersion, capabilities, etc.)
- [ ] `bridge.ping` / `bridge.pong` keepalive works identically
- [ ] DX Cluster connect/disconnect/spot/status cycle works
- [ ] WSJT-X configure/status/decode/qso_logged/clear cycle works
- [ ] Rig connect/disconnect/status/set/test cycle works (hamlib + flrig)
- [ ] Static file server serves frontend dist/ with SPA fallback
- [ ] Graceful shutdown sends `bridge.shutdown` to all clients
- [ ] `useBridge` hook connects without code changes
- [ ] All error codes and error message formats match

---

## 5. WebSocket Protocol

### 5.1 Existing Protocol (Unchanged)

The Rust engine implements the exact same message envelope and types as the Node.js bridge. Zero breaking changes.

**Envelope format:**

```json
{
  "type": "message.type",
  "id": "optional-correlation-id",
  "ts": "2026-02-14T12:00:00.000Z",
  "timestamp": 1739534400000,
  "payload": {}
}
```

**Existing message types (all supported):**

| Type                     | Direction        | Description                               |
| ------------------------ | ---------------- | ----------------------------------------- |
| `bridge.welcome`         | Server -> Client | Connection established, capabilities list |
| `bridge.shutdown`        | Server -> Client | Server shutting down gracefully           |
| `bridge.ping`            | Client -> Server | Keepalive request                         |
| `bridge.pong`            | Server -> Client | Keepalive response                        |
| `bridge.subscribe`       | Client -> Server | Subscribe to event category               |
| `bridge.unsubscribe`     | Client -> Server | Unsubscribe from event category           |
| `rig.status`             | Bidirectional    | Current rig frequency/mode/power          |
| `rig.update`             | Server -> Client | Rig status changed (alias for rig.status) |
| `rig.set`                | Client -> Server | Set frequency + mode in one command       |
| `rig.setFrequency`       | Client -> Server | Set frequency only                        |
| `rig.setMode`            | Client -> Server | Set mode only                             |
| `rig.setPTT`             | Client -> Server | Set PTT on/off                            |
| `rig.connect`            | Client -> Server | Connect to rig backend                    |
| `rig.disconnect`         | Client -> Server | Disconnect from rig                       |
| `rig.test`               | Client -> Server | Test rig connection (ephemeral)           |
| `cluster.spot`           | Server -> Client | DX cluster spot received                  |
| `cluster.status`         | Server -> Client | Cluster connection status                 |
| `cluster.connect`        | Client -> Server | Connect to cluster node                   |
| `cluster.disconnect`     | Client -> Server | Disconnect from cluster                   |
| `wsjtx.status`           | Server -> Client | WSJT-X application status                 |
| `wsjtx.decode`           | Server -> Client | WSJT-X decode received                    |
| `wsjtx.qso_logged`       | Server -> Client | WSJT-X logged a QSO                       |
| `wsjtx.clear`            | Server -> Client | WSJT-X cleared decode window              |
| `wsjtx.configure`        | Client -> Server | Configure WSJT-X listener                 |
| `contest.session.create` | Client -> Server | Create contest session                    |
| `contest.session.join`   | Client -> Server | Join contest session                      |
| `contest.session.event`  | Server -> Client | Contest event notification                |
| `contest.lock.set`       | Client -> Server | Request callsign/freq lock                |
| `contest.lock.state`     | Server -> Client | Current lock state                        |
| `contest.note.add`       | Client -> Server | Add note to contest log                   |

### 5.2 New Message Types (Additive)

New message types are added alongside existing ones. No existing types are modified or removed.

**Decode messages:**

```jsonc
// Native CW decode result
{
  "type": "decode.cw",
  "ts": "2026-02-14T12:00:15.000Z",
  "payload": {
    "text": "CQ CQ DE W5ABC W5ABC K",
    "wpm": 22,
    "confidence": 0.87,
    "frequency": 14025000,     // Hz (tuned frequency + audio offset)
    "audioOffset": 700,        // Hz offset within audio passband
    "snr": -8                  // dB estimated SNR
  }
}

// Native PSK31 decode result
{
  "type": "decode.psk31",
  "ts": "2026-02-14T12:00:15.000Z",
  "payload": {
    "text": "CQ CQ DE W5ABC W5ABC K",
    "mode": "BPSK31",          // BPSK31, BPSK63, QPSK31, QPSK63
    "frequency": 14070000,
    "audioOffset": 1200,
    "snr": -5,
    "imd": -22                 // Intermodulation distortion (dB)
  }
}

// Native RTTY decode result
{
  "type": "decode.rtty",
  "ts": "2026-02-14T12:00:15.000Z",
  "payload": {
    "text": "RYRYRY DE W5ABC W5ABC K",
    "shift": 170,              // Hz shift (170, 200, 425, 850)
    "baud": 45.45,
    "frequency": 14083000,
    "audioOffset": 2125,       // Mark frequency in audio passband
    "snr": -3
  }
}

// Experimental native FT8 decode (ft8_lib FFI)
{
  "type": "decode.ft8",
  "ts": "2026-02-14T12:00:15.000Z",
  "payload": {
    "message": "CQ W5ABC EM10",
    "snr": -12,
    "deltaTime": 0.3,
    "frequency": 14074000,
    "audioOffset": 1245,
    "callsign": "W5ABC",
    "grid": "EM10",
    "nativeEngine": true       // Distinguishes from WSJT-X relay
  }
}

// Configure active decoder(s)
{
  "type": "decode.configure",
  "ts": "2026-02-14T12:00:00.000Z",
  "payload": {
    "activeModes": ["cw", "psk31"],
    "audioDevice": "USB Audio CODEC",
    "cwPitch": 700,
    "cwBandwidth": 200
  }
}

// Decoder status report
{
  "type": "decode.status",
  "ts": "2026-02-14T12:00:00.000Z",
  "payload": {
    "running": true,
    "activeModes": ["cw"],
    "audioDevice": "USB Audio CODEC",
    "audioLevel": -24.5,       // dBFS RMS
    "decodesTotal": 142,
    "uptime": 3600
  }
}
```

**Audio messages:**

```jsonc
// Available audio devices
{
  "type": "audio.devices",
  "ts": "2026-02-14T12:00:00.000Z",
  "payload": {
    "inputs": [
      { "name": "USB Audio CODEC", "id": "usb-audio-0", "sampleRates": [44100, 48000], "channels": 1 },
      { "name": "Built-in Microphone", "id": "builtin-mic", "sampleRates": [44100, 48000], "channels": 1 }
    ],
    "outputs": [
      { "name": "Built-in Output", "id": "builtin-out", "sampleRates": [44100, 48000], "channels": 2 }
    ]
  }
}

// Spectrum data (binary WebSocket frame for efficiency)
// Text notification that spectrum streaming has started
{
  "type": "audio.spectrum.start",
  "ts": "2026-02-14T12:00:00.000Z",
  "payload": {
    "fftSize": 2048,
    "sampleRate": 48000,
    "fps": 15
  }
}

// Audio level meter (periodic, ~10 Hz)
{
  "type": "audio.level",
  "ts": "2026-02-14T12:00:00.000Z",
  "payload": {
    "rms": -24.5,              // dBFS
    "peak": -12.3,             // dBFS
    "clipping": false
  }
}
```

**Alert messages:**

```jsonc
// Alert triggered
{
  "type": "alert.fire",
  "ts": "2026-02-14T12:00:15.000Z",
  "payload": {
    "ruleId": "wanted-dxcc-20m-ft8",
    "priority": "high",        // "critical" | "high" | "normal" | "low"
    "title": "New DXCC on 20m FT8",
    "body": "VP8LP (Falkland Islands) calling CQ on 14.074 MHz",
    "callsign": "VP8LP",
    "frequency": 14074000,
    "mode": "FT8",
    "band": "20m",
    "source": "wsjtx",         // "wsjtx" | "cluster" | "decode"
    "soundPlayed": true,
    "pushSent": false
  }
}

// Configure alert rules (client -> server)
{
  "type": "alert.configure",
  "ts": "2026-02-14T12:00:00.000Z",
  "payload": {
    "rules": [
      {
        "id": "wanted-dxcc-any",
        "type": "wanted_dxcc",
        "entities": [100, 110, 339],  // DXCC entity numbers
        "bands": ["20m", "40m"],
        "modes": ["FT8", "CW"],
        "priority": "high"
      },
      {
        "id": "watchlist-vp8",
        "type": "callsign",
        "callsigns": ["VP8LP", "3B9FR"],
        "priority": "critical"
      }
    ]
  }
}
```

**Training data messages:**

```jsonc
// Training data collection status (periodic, every 60s when enabled)
{
  "type": "training.status",
  "ts": "2026-02-14T12:00:00.000Z",
  "payload": {
    "enabled": true,
    "totalPairs": 1247, // Audio+decode pairs collected
    "diskUsedMb": 842,
    "diskCapMb": 10240,
    "lastCapture": "2026-02-14T11:59:45.000Z",
    "uploadPending": 156,
    "uploadComplete": 1091,
  },
}
```

**Binary frame format for spectrum data:**

```
┌──────────┬──────────┬──────────┬──────────┬─────────────────┐
│ Type (1B)│ Flags(1B)│CenterHz  │ SpanHz   │ Bins (N x f32)  │
│  0x01    │  0x00    │ (8B f64) │ (8B f64) │ float32 array   │
└──────────┴──────────┴──────────┴──────────┴─────────────────┘

Type: 0x01 = spectrum, 0x02 = audio
Flags: bit 0 = peak-hold included (N*2 values: current + peak)
CenterHz: center frequency in Hz (float64)
SpanHz: total bandwidth in Hz (float64)
Bins: power values in dBFS (float32 array, length = fft_size)
```

---

## 6. Training Data Collection (Phase 2 Preparation)

This is the strategic foundation for Propulse's neural decoder (Part 2 of this plan). No other ham radio application has the architecture to collect this data.

### 6.1 How It Works

While an operator runs WSJT-X and Propulse together:

1. The Rust engine captures raw audio from the radio's USB audio output (48 kHz, 16-bit PCM)
2. Simultaneously, the engine receives WSJT-X decode results via UDP (the existing relay)
3. At each FT8 decode cycle boundary (every 15 seconds), the engine pairs:
   - The 15-second audio window (raw PCM)
   - All decode results from WSJT-X for that window
   - Metadata: frequency, band, mode, solar conditions (SFI, Kp if available), noise level, time of day
4. The pair is compressed (zstd) and written to disk
5. Optionally uploaded to the Propulse training pipeline

### 6.2 Data Format

Each training example is a MessagePack struct:

```rust
struct TrainingExample {
    // Audio
    audio_pcm: Vec<i16>,       // 15 seconds * 48000 Hz = 720,000 samples
    sample_rate: u32,          // 48000
    center_frequency: u64,     // Hz (e.g. 14074000)

    // Decoded messages (ground truth from WSJT-X)
    decodes: Vec<DecodeResult>,

    // Metadata
    timestamp: i64,            // Unix timestamp
    band: String,              // "20m", "40m", etc.
    mode: String,              // "FT8", "FT4"
    noise_floor_db: f32,       // Estimated noise floor
    solar_flux: Option<f32>,   // SFI if available
    kp_index: Option<f32>,     // Kp if available
    station_grid: Option<String>, // Operator's grid square
    engine_version: String,    // For data versioning
}

struct DecodeResult {
    message: String,           // "CQ W5ABC EM10"
    snr: i32,                  // dB
    delta_time: f64,           // seconds
    delta_frequency: u32,      // Hz offset in audio passband
    confidence: bool,          // !lowConfidence from WSJT-X
}
```

### 6.3 Why This Data Is Unique

No existing dataset contains paired (real-world HF audio, verified decode ground truth) at scale:

- **Real propagation conditions**: Fading, multipath, QRM, QRN, atmospheric noise
- **Diverse stations**: Thousands of operators with different radios, antennas, locations
- **All bands**: 160m through 6m, each with different propagation characteristics
- **All conditions**: Day/night, solar maximum/minimum, quiet/disturbed geomagnetic
- **All seasons**: Ionospheric behavior varies dramatically by month
- **Verified labels**: WSJT-X's decode engine provides ground truth (it does not hallucinate callsigns)

### 6.4 Privacy and Consent

- **Strictly opt-in**: Disabled by default. Requires explicit user action to enable.
- **No callsign-to-audio mapping exported**: Training examples are anonymized before upload. Operator's own callsign/grid is stripped.
- **Local storage only by default**: Data stays on the operator's machine unless they explicitly enable upload.
- **Data deletion**: Users can delete all collected data from the settings panel.
- **Transparency**: The `training.status` message shows exactly what is collected and how much disk space it uses.
- **Clear benefit**: Users understand their data helps build a decoder that will eventually eliminate the need for WSJT-X entirely.

### 6.5 Volume Projections

| Metric                      | Per Station Per Day              | With 1,000 Stations |
| --------------------------- | -------------------------------- | ------------------- |
| FT8 decode cycles           | ~5,760 (15s each, 24h)           | 5.76M               |
| Useful pairs (with decodes) | ~1,000-2,000                     | 1-2M                |
| Raw audio per pair          | 1.44 MB (720K samples x 2 bytes) | -                   |
| Compressed per pair         | ~200 KB (zstd level 3)           | -                   |
| Disk per station per day    | ~200-400 MB                      | -                   |
| Disk per station per month  | ~6-12 GB                         | -                   |
| Training examples per month | -                                | 30-60M              |

At 30-60 million labeled examples per month, this is orders of magnitude more training data than any existing HF audio dataset. The neural decoder (Part 2) will use this to train a model that exceeds WSJT-X decode performance.

---

## 7. Cross-Platform Distribution

### 7.1 Build Targets

| Platform              | Rust Target Triple                             | Build Tool                       | Artifact                         |
| --------------------- | ---------------------------------------------- | -------------------------------- | -------------------------------- |
| Windows x64           | `x86_64-pc-windows-msvc`                       | `cargo build --release`          | `propulse-engine.exe`            |
| Windows x64 Installer | -                                              | WiX Toolset (via `cargo-wix`)    | `propulse-engine-x.y.z-x64.msi`  |
| macOS Universal       | `x86_64-apple-darwin` + `aarch64-apple-darwin` | `cargo build --release` + `lipo` | `propulse-engine` (fat binary)   |
| macOS Installer       | -                                              | `create-dmg`                     | `Propulse-Engine-x.y.z.dmg`      |
| Linux x64             | `x86_64-unknown-linux-gnu`                     | `cargo build --release`          | `propulse-engine`                |
| Linux x64 Packages    | -                                              | `cargo-deb`, `cargo-rpm`         | `.deb`, `.rpm`                   |
| Linux AppImage        | `x86_64-unknown-linux-gnu`                     | `appimagetool`                   | `Propulse-Engine-x.y.z.AppImage` |
| Raspberry Pi (ARM64)  | `aarch64-unknown-linux-gnu`                    | `cross build --release`          | `propulse-engine`                |
| RPi Package           | -                                              | `cargo-deb` (cross)              | `.deb` (arm64)                   |

### 7.2 CI/CD Pipeline (GitHub Actions)

```yaml
# .github/workflows/engine-release.yml
name: Engine Release
on:
  push:
    tags: ["engine-v*"]

jobs:
  build:
    strategy:
      matrix:
        include:
          - os: windows-latest
            target: x86_64-pc-windows-msvc
            artifact: propulse-engine.exe
          - os: macos-latest
            target: x86_64-apple-darwin
            artifact: propulse-engine
          - os: macos-latest
            target: aarch64-apple-darwin
            artifact: propulse-engine
          - os: ubuntu-latest
            target: x86_64-unknown-linux-gnu
            artifact: propulse-engine
          - os: ubuntu-latest
            target: aarch64-unknown-linux-gnu
            artifact: propulse-engine
            use_cross: true

    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.target }}
      - name: Install cross
        if: matrix.use_cross
        run: cargo install cross
      - name: Build
        run: |
          cd engine
          ${{ matrix.use_cross && 'cross' || 'cargo' }} build --release --target ${{ matrix.target }}
      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: engine-${{ matrix.target }}
          path: engine/target/${{ matrix.target }}/release/${{ matrix.artifact }}

  macos-universal:
    needs: build
    runs-on: macos-latest
    steps:
      - name: Create universal binary
        run: lipo -create -output propulse-engine engine-x86_64 engine-aarch64

  release:
    needs: [build, macos-universal]
    runs-on: ubuntu-latest
    steps:
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: |
            propulse-engine-windows-x64.exe
            propulse-engine-macos-universal
            propulse-engine-linux-x64
            propulse-engine-linux-arm64
            propulse-engine-x.y.z-x64.msi
            Propulse-Engine-x.y.z.dmg
```

### 7.3 Installation Experience

**Windows:**

1. Download `propulse-engine-x.y.z-x64.msi` from GitHub Releases
2. Double-click installer. Default path: `C:\Program Files\Propulse\propulse-engine.exe`
3. Optional: install as Windows Service for auto-start
4. Portable option: download `.exe` directly, run from any directory

**macOS:**

1. Download `Propulse-Engine-x.y.z.dmg`
2. Drag to Applications
3. First launch: right-click > Open (Gatekeeper unsigned)
4. Optional: `brew install propulse-engine` (future, via custom tap)

**Linux:**

1. Download `.deb` or `.rpm` or AppImage
2. `sudo dpkg -i propulse-engine_x.y.z_amd64.deb` or `chmod +x *.AppImage && ./Propulse-Engine-*.AppImage`
3. Systemd unit installed automatically by `.deb`

**Raspberry Pi:**

1. Download ARM64 `.deb`
2. `sudo dpkg -i propulse-engine_x.y.z_arm64.deb`
3. `sudo systemctl enable propulse-engine`
4. Runs headless, accessible from any browser on the LAN

### 7.4 Auto-Update

The engine checks for updates via GitHub Releases API on startup (opt-in, configurable). Shows a notification in the WebSocket welcome message if a newer version is available. Does not auto-download or auto-install. The operator decides when to update.

---

## 8. Crate Dependencies

All dependencies must be MIT or Apache-2.0 licensed (or dual-licensed) for compatibility.

| Crate                | Version | Purpose                                   | Downloads | License        |
| -------------------- | ------- | ----------------------------------------- | --------- | -------------- |
| **Runtime**          |         |                                           |           |                |
| `tokio`              | 1.x     | Async runtime (net, time, sync, fs)       | 200M+     | MIT            |
| `tokio-tungstenite`  | 0.24    | Async WebSocket server                    | 30M+      | MIT            |
| **Serialization**    |         |                                           |           |                |
| `serde`              | 1.x     | Serialize/deserialize framework           | 300M+     | MIT/Apache-2.0 |
| `serde_json`         | 1.x     | JSON serialization for WebSocket protocol | 200M+     | MIT/Apache-2.0 |
| `rmp-serde`          | 1.x     | MessagePack for training data             | 10M+      | MIT            |
| `toml`               | 0.8     | TOML config file parsing                  | 50M+      | MIT/Apache-2.0 |
| **Audio**            |         |                                           |           |                |
| `cpal`               | 0.15    | Cross-platform audio capture/playback     | 5M+       | Apache-2.0     |
| `rodio`              | 0.19    | High-level audio playback (alert sounds)  | 5M+       | MIT/Apache-2.0 |
| **DSP**              |         |                                           |           |                |
| `rustfft`            | 6.x     | FFT computation (pure Rust, no FFTW)      | 5M+       | MIT/Apache-2.0 |
| **Networking**       |         |                                           |           |                |
| `hyper`              | 1.x     | HTTP server for static files              | 100M+     | MIT            |
| `hyper-util`         | 0.1     | Hyper utilities                           | 20M+      | MIT            |
| `http-body-util`     | 0.1     | HTTP body utilities                       | 20M+      | MIT            |
| **Serial**           |         |                                           |           |                |
| `serialport`         | 4.x     | Cross-platform serial port I/O            | 3M+       | MPL-2.0        |
| **Compression**      |         |                                           |           |                |
| `zstd`               | 0.13    | Zstandard compression (training data)     | 10M+      | MIT            |
| **Logging**          |         |                                           |           |                |
| `tracing`            | 0.1     | Structured logging framework              | 100M+     | MIT            |
| `tracing-subscriber` | 0.3     | Log output formatters                     | 50M+      | MIT            |
| **Error Handling**   |         |                                           |           |                |
| `anyhow`             | 1.x     | Application error handling                | 100M+     | MIT/Apache-2.0 |
| `thiserror`          | 1.x     | Library error type derivation             | 100M+     | MIT/Apache-2.0 |
| **CLI**              |         |                                           |           |                |
| `clap`               | 4.x     | CLI argument parsing (derive)             | 80M+      | MIT/Apache-2.0 |
| **Notifications**    |         |                                           |           |                |
| `notify-rust`        | 4.x     | Desktop notifications (Linux/macOS/Win)   | 2M+       | MIT/Apache-2.0 |
| `reqwest`            | 0.12    | HTTP client (Pushover API, upload)        | 80M+      | MIT/Apache-2.0 |
| **FFI (optional)**   |         |                                           |           |                |
| `bindgen`            | 0.70    | C header → Rust FFI (ft8_lib)             | 10M+      | BSD-3-Clause   |
| `cc`                 | 1.x     | C compiler invocation (ft8_lib build)     | 100M+     | MIT/Apache-2.0 |
| **Testing**          |         |                                           |           |                |
| `criterion`          | 0.5     | Benchmark framework                       | 10M+      | MIT/Apache-2.0 |

**Note on `serialport` license**: The `serialport` crate uses MPL-2.0 (Mozilla Public License 2.0), which is compatible with MIT/Apache-2.0 projects. MPL-2.0 is a weak copyleft license that only requires sharing modifications to the serialport crate itself, not the entire application. This is acceptable.

**Note on `bindgen` + ft8_lib**: The ft8_lib C library (kgoba/ft8_lib on GitHub) is MIT licensed. We use `bindgen` to generate Rust FFI bindings at build time, and `cc` to compile the C source into a static library. This is behind a `feature = "ft8"` flag and is optional.

---

## 9. Success Metrics

### 9.1 The Two-App Test

**Pass condition**: A ham radio operator installs WSJT-X and Propulse (with `propulse-engine`). They can:

1. See WSJT-X decodes appear in Propulse
2. See DX cluster spots on the globe
3. Get audio alerts for wanted DXCC entities
4. Log QSOs from Propulse
5. Control their radio (frequency, mode, PTT) from Propulse
6. View a waterfall display in Propulse
7. Track awards (DXCC, WAS, VUCC) in Propulse

All without installing any additional software.

### 9.2 Quantitative Metrics

| Metric                     | Target                                         | How Measured                                      |
| -------------------------- | ---------------------------------------------- | ------------------------------------------------- |
| **Resource usage**         | < 100 MB RAM at steady state                   | `top` / Task Manager during FT8 session           |
| **Resource comparison**    | < 10% of GridTracker's 1.5 GB                  | Direct comparison on same machine                 |
| **Startup time**           | < 2 seconds to WebSocket ready                 | Time from process start to first `bridge.welcome` |
| **Audio latency**          | < 50 ms from radio to waterfall display        | Measured with timestamped audio tone              |
| **WSJT-X decode relay**    | < 5 ms from UDP receive to WebSocket broadcast | Internal instrumentation                          |
| **CAT polling**            | 200 ms default, < 1 ms per poll cycle          | Internal instrumentation                          |
| **Binary size**            | < 20 MB per platform (stripped)                | CI build artifact size                            |
| **Cross-platform**         | Builds and runs on all 4 targets               | CI matrix + manual testing                        |
| **Protocol compatibility** | 100% of existing bridge messages handled       | `protocol_compat.rs` test suite                   |
| **Alert latency**          | < 100 ms from decode to alert sound            | Internal instrumentation                          |

### 9.3 Training Data Metrics

| Metric                           | Target                        | Timeframe                 |
| -------------------------------- | ----------------------------- | ------------------------- |
| **Labeled FT8 windows**          | 10,000+                       | First month of deployment |
| **Unique stations contributing** | 100+                          | First 3 months            |
| **Bands covered**                | All 9 HF bands (160m-10m)     | First 3 months            |
| **Conditions covered**           | SFI range 70-250, Kp 0-7      | First 6 months            |
| **Total training hours**         | 1,000+ hours of labeled audio | First 6 months            |

### 9.4 Feature Parity Metrics

| JTAlert Feature        | Propulse Equivalent                                             | Parity |
| ---------------------- | --------------------------------------------------------------- | ------ |
| Alert types supported  | 8/8 (DXCC, grid, state, zone, callsign, B4, contest, band-slot) | 100%   |
| Audio alert            | rodio sound playback                                            | 100%   |
| Push notification      | Pushover + desktop notification                                 | 100%   |
| Per-band/mode tracking | Award engine                                                    | 100%   |
| Callsign lookup        | QRZ/HamQTH API                                                  | 100%   |

---

## 10. Timeline

| Milestone                    | Scope                                                                                                           | Files                                                                      | Target  | Exit Criteria                                                                                                                      |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **M1: Skeleton**             | Rust binary, config, WebSocket server, `bridge.welcome`/`ping`/`pong`, builds on all platforms                  | `main.rs`, `config.rs`, `net/ws.rs`, `net/protocol.rs`, `Cargo.toml`       | Week 2  | `wscat ws://127.0.0.1:9868` connects and receives welcome message. CI builds for all 4 targets.                                    |
| **M2: CAT Parity**           | rigctld TCP client + flrig XML-RPC client. Same protocol as Node.js bridge. Auto-detect backend. 200ms polling. | `rig/hamlib.rs`, `rig/flrig.rs`, `rig/ptt.rs`, `rig/mod.rs`                | Week 4  | `rig.status`, `rig.set`, `rig.connect`, `rig.disconnect`, `rig.test` all work. Frontend `useBridge` hook connects without changes. |
| **M3: WSJT-X Relay**         | UDP listener with QDataStream parser. Status, Decode, Clear, QSOLogged, LoggedADIF messages.                    | `net/wsjtx.rs`                                                             | Week 5  | WSJT-X decodes appear in Propulse frontend via Rust engine. Byte-for-byte compatible parse with Node.js version.                   |
| **M4: DX Cluster**           | Telnet client, spot parsing, deduplication, filtering, reconnection.                                            | `net/cluster.rs`                                                           | Week 6  | DX cluster spots appear on globe via Rust engine. Reconnection tested.                                                             |
| **M5: Node.js Deprecation**  | Full protocol parity. Static file server. Take over port 9867. Node.js bridge moved to 9868.                    | `net/static_files.rs`, protocol finalization                               | Week 7  | All 31 message types work. `protocol_compat.rs` test suite passes. Frontend works with zero code changes.                          |
| **M6: Audio Capture**        | cpal integration, device enumeration, ring buffer, audio level meter.                                           | `audio/capture.rs`, `audio/devices.rs`, `audio/ring_buffer.rs`             | Week 9  | Audio devices listed. Audio captured from USB radio. `audio.level` messages sent at 10 Hz.                                         |
| **M7: Waterfall**            | FFT via RustFFT, spectrum data packaging, binary WebSocket frames.                                              | `dsp/fft.rs`, `dsp/waterfall.rs`, `dsp/filters.rs`, `dsp/meter.rs`         | Week 10 | Spectrum data visible in frontend waterfall component. 15 fps sustained.                                                           |
| **M8: Alert Engine**         | Rule evaluation, audio alerts (rodio), desktop notifications, Pushover integration.                             | `alerts/engine.rs`, `alerts/rules.rs`, `alerts/audio.rs`, `alerts/push.rs` | Week 12 | Alert fires when wanted DXCC decoded by WSJT-X. Sound plays. Desktop notification appears. Pushover received on phone.             |
| **M9: Native CW/PSK/RTTY**   | Goertzel CW decoder, BPSK31 decoder, FSK RTTY decoder.                                                          | `decode/cw.rs`, `decode/psk31.rs`, `decode/rtty.rs`                        | Week 14 | CW at 20 WPM decoded from audio. PSK31 decoded from audio. RTTY decoded from audio. All via `decode.*` messages.                   |
| **M10: ft8_lib FFI**         | Experimental FT8 decode via kgoba/ft8_lib. Behind feature flag.                                                 | `decode/ft8_ffi.rs`, `build.rs`                                            | Week 16 | FT8 decodes produced independently of WSJT-X. Results compared against WSJT-X for accuracy.                                        |
| **M11: Training Collection** | Audio + decode pair capture, zstd compression, disk storage, upload.                                            | `training/collector.rs`, `training/storage.rs`, `training/upload.rs`       | Week 17 | Training examples written to disk. Examples contain correct audio + decode pairs. Disk cap respected.                              |
| **M12: Beta Release**        | Polish, documentation, installer packaging, community beta.                                                     | Installers, docs, bug fixes                                                | Week 20 | MSI, DMG, DEB, RPM, AppImage all built and tested. README and setup guide complete. 10+ beta testers operational.                  |

### Milestone Dependencies

```
M1 (Skeleton) ──► M2 (CAT) ──► M5 (Deprecation)
      │                              ▲
      ├──► M3 (WSJT-X) ─────────────┤
      │                              │
      └──► M4 (Cluster) ────────────┘

M1 ──► M6 (Audio) ──► M7 (Waterfall)
                  │
                  ├──► M9 (CW/PSK/RTTY)
                  │
                  └──► M10 (ft8_lib) ──► M11 (Training)

M3 (WSJT-X) ──► M8 (Alerts)
M4 (Cluster) ──► M8 (Alerts)
M6 (Audio) ──► M11 (Training)
M3 (WSJT-X) ──► M11 (Training)
```

**Parallelizable work**: M2 (CAT), M3 (WSJT-X), and M4 (Cluster) can be developed in parallel after M1. M7 (Waterfall) and M9 (Decoders) can be developed in parallel after M6.

---

## 11. Risk Register

| #       | Risk                                                                                                                                                                                                                    | Likelihood | Impact | Mitigation                                                                                                                                                                                                                                                                       |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R1**  | **Audio device compatibility across platforms.** cpal has known issues with some USB audio codecs on Linux (ALSA vs PulseAudio vs PipeWire). Some ham radio USB audio devices use non-standard descriptors.             | Medium     | High   | Test with the top 5 USB audio codecs used in ham radio (IC-7300, FT-DX10, TS-890S, SignaLink, built-in sound card). Provide fallback instructions for ALSA/PulseAudio/PipeWire configuration. Document known issues.                                                             |
| **R2**  | **CAT protocol edge cases.** Each radio manufacturer has quirks: CI-V address collisions on Icom bus, Yaesu radios that don't respond when transmitting, Kenwood radios with different command sets across generations. | High       | Medium | Start with rigctld/flrig passthrough (M2) which delegates edge cases to Hamlib. Add direct serial CAT incrementally (M9+), one protocol family at a time. Community testing for each supported radio.                                                                            |
| **R3**  | **WSJT-X UDP format changes between versions.** WSJT-X has changed the QDataStream schema across major versions (2.5 → 2.6 → 2.7). Some fields are added, order preserved but length changes.                           | Low        | Medium | The existing Node.js parser already handles schema version tolerance (`schema > WSJTX_SCHEMA_VERSION + 1`). Port the same version flexibility. Test against WSJT-X 2.5, 2.6, 2.7, and JTDX.                                                                                      |
| **R4**  | **Cross-compilation challenges for ARM.** `cpal` and `serialport` use platform-specific C libraries that may fail to cross-compile for ARM64 from x86_64 CI runners.                                                    | Medium     | Medium | Use Docker-based `cross` tool which bundles ARM toolchains. Alternatively, build ARM on an actual ARM runner (GitHub has ARM runners). Test on real Raspberry Pi 4/5 hardware.                                                                                                   |
| **R5**  | **User adoption of new binary.** Ham radio operators skew older demographic and may be resistant to installing another binary, even if it replaces three others. Windows users may face SmartScreen warnings.           | Medium     | High   | Provide MSI installer with proper code signing (requires Apple Developer and Windows Authenticode certificates). Clear setup guide in Propulse frontend. One-click install from the `/setup` page. Show clear value proposition ("removes 4 apps").                              |
| **R6**  | **Lock-free ring buffer correctness.** Lock-free data structures are notoriously difficult to get right. Memory ordering bugs may cause audio glitches that are intermittent and hard to reproduce.                     | Low        | High   | Use established patterns (SPSC queue with atomic head/tail). Stress test with `ring_buffer.rs` integration test running millions of produce/consume cycles under load. Consider using the `ringbuf` crate (2M+ downloads, battle-tested) instead of writing from scratch.        |
| **R7**  | **ft8_lib FFI stability.** kgoba/ft8_lib is a personal project with no stability guarantees. API may change. Decode quality may differ from WSJT-X.                                                                     | Medium     | Low    | ft8_lib is behind a feature flag and is explicitly labeled "experimental." The primary FT8 path remains WSJT-X relay. ft8_lib is a stepping stone to the neural decoder (Part 2). Pin a specific commit hash.                                                                    |
| **R8**  | **Training data privacy concerns.** Some operators may be uncomfortable with audio capture, even if opt-in. Ham radio transmissions are public, but recording and uploading audio has different optics.                 | Medium     | Medium | Opt-in with prominent consent dialog. Local storage by default. Clear explanation that only RF audio (not microphone) is captured. Show exactly what is collected. Provide one-click data deletion. Anonymize before upload.                                                     |
| **R9**  | **Rust build times.** Full clean build of the workspace may take 5-10 minutes. This slows iteration during development.                                                                                                 | Low        | Low    | Use incremental compilation (default). `cargo check` for fast feedback. `sccache` in CI. Split into library crates for parallelism.                                                                                                                                              |
| **R10** | **macOS Gatekeeper and notarization.** Unsigned macOS binaries require right-click > Open workaround. Many users won't figure this out.                                                                                 | Medium     | Medium | Eventually sign and notarize with Apple Developer account ($99/year). For beta, provide clear instructions in DMG README and on the setup page. Consider Homebrew distribution which bypasses Gatekeeper.                                                                        |
| **R11** | **Competing with entrenched tools.** JTAlert has 15+ years of development. GridTracker has a loyal user base. Some operators may prefer the familiar workflow.                                                          | Medium     | Medium | Don't position as "replacement" initially. Position as "optional enhancement." Users can run JTAlert alongside Propulse. Gradually demonstrate superior UX (single window, 3D globe, one-click setup). The training data collection is a unique capability no competitor offers. |
| **R12** | **Serial port permissions on Linux.** Users often need to add themselves to the `dialout` group for serial port access. This is a common support issue.                                                                 | Medium     | Low    | The setup guide detects this and provides the exact `sudo usermod -a -G dialout $USER` command. The engine checks permissions on startup and provides a clear error message.                                                                                                     |

---

## 12. Security Considerations

### 12.1 Network Security

- **Localhost binding by default.** The WebSocket server binds to `127.0.0.1` only. Remote connections require explicit `bind = "0.0.0.0"` in config.
- **No authentication required for localhost.** Same security model as the existing Node.js bridge. Local processes on the same machine are trusted.
- **Optional token authentication.** When `bind = "0.0.0.0"`, an `auth_token` config option enables token-based authentication in the WebSocket handshake.
- **No TLS built-in.** For remote access, operators should use SSH tunnels or reverse proxies (nginx with TLS). This is documented in the setup guide.

### 12.2 Input Validation

- **All WebSocket messages are validated** against expected types and ranges before processing.
- **CAT commands are bounds-checked.** Frequency must be within the radio's declared range. Mode must be a recognized string. PTT is boolean only.
- **Cluster spot lines are parsed with regex** and malformed lines are silently dropped.
- **WSJT-X UDP datagrams are length-checked** before parsing. Malformed datagrams are dropped.

### 12.3 Supply Chain

- **Minimal dependency tree.** Each crate is evaluated for maintenance status, download count, and security history.
- **`cargo audit`** runs in CI to check for known vulnerabilities in dependencies.
- **No network access at runtime** except to configured endpoints (cluster nodes, Pushover API). No telemetry, no update checks (unless explicitly enabled).

---

## 13. Glossary

| Term            | Definition                                                                              |
| --------------- | --------------------------------------------------------------------------------------- |
| **ADIF**        | Amateur Data Interchange Format — standard file format for ham radio log exchange       |
| **CAT**         | Computer Aided Transceiver — serial protocol for rig control                            |
| **CI-V**        | Icom's CAT protocol variant (binary, framed with FE FE ... FD)                          |
| **cpal**        | Cross-Platform Audio Library — Rust crate for audio device access                       |
| **DXCC**        | DX Century Club — award for contacting 100+ countries/entities                          |
| **DX Cluster**  | Network of stations sharing real-time spot announcements via telnet                     |
| **FT8**         | Franke-Taylor 8-FSK — weak signal digital mode (15s TX cycle, K1JT)                     |
| **Goertzel**    | Efficient algorithm for detecting a single frequency (used in CW decoder)               |
| **JTAlert**     | Windows alerting program that monitors WSJT-X for wanted stations                       |
| **GridTracker** | Electron-based map application that displays WSJT-X decodes geographically              |
| **PSK31**       | Phase Shift Keying 31 baud — keyboard-to-keyboard digital mode                          |
| **QDataStream** | Qt's binary serialization format used by WSJT-X's UDP protocol                          |
| **rigctld**     | Hamlib's network-accessible rig control daemon (TCP text protocol)                      |
| **rodio**       | Rust audio playback library (wraps cpal with a higher-level API)                        |
| **RTTY**        | Radio TeleTYpe — FSK digital mode using Baudot/ITA2 encoding                            |
| **SPSC**        | Single-Producer Single-Consumer — lock-free queue pattern for one writer + one reader   |
| **tokio**       | Rust async runtime for network I/O and concurrency                                      |
| **Varicode**    | Variable-length character encoding used by PSK31                                        |
| **WAS**         | Worked All States — award for contacting all 50 US states                               |
| **WSJT-X**      | Weak Signal Joe Taylor — software suite for FT8, FT4, JT65, and other weak signal modes |
| **zstd**        | Zstandard — fast lossless compression algorithm (Facebook/Meta)                         |
