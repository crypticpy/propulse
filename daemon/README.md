# Propulse Radio Daemon

Rust companion daemon for Propulse. Provides a unified WebSocket API for:
- Radio discovery and control (dummy radio for demos; hardware backends in progress)
- FFT/audio streaming (binary WebSocket frames)
- WSJT-X UDP listener (decodes/status/QSO logged)
- DX Cluster telnet client (spots)
- N1MM+ UDP interop (basic)
- Virtual CAT server (rigctl subset)
- mDNS discovery (`_propulse._tcp.local.`)
- Backward-compatible migration mode for the legacy `bridge/` protocol (`--compat-bridge`)

## Quick start (local only)

```bash
cd daemon
cargo run -p propulse-daemon
```

By default it binds to `127.0.0.1:9867`.

## Configuration

On first run, the daemon writes a default config file to:
- macOS/Linux: `~/.propulse/daemon.toml`
- Windows: `%APPDATA%\\propulse\\daemon.toml`

You can override with `--config /path/to/daemon.toml`. See `daemon/config.example.toml` for the full schema.

Common options:
- `server.bind = "127.0.0.1"` for local-only (default)
- `server.bind = "0.0.0.0"` to allow LAN/VPN clients
- `server.auth_token = "..."` to require a token (client sends `hello` with `auth_token`)

Config hot-reload:
- File watcher: edits are applied automatically
- Unix: `SIGHUP` triggers reload

### SDRconnect (LAN)

To use an SDR managed by **SDRconnect** on another machine in your network, add it to the config:

```toml
[radio.sdrconnect]
enabled = true

[[radio.sdrconnect.radios]]
name = "SDRconnect (LAN)"
url = "ws://192.168.1.50:5000"
device_id = 0
sample_rate = 2048000
format = "s16le"
```

## Frontend

Propulse includes an SDR Console route at `/sdr` that connects to the daemon via WebSocket.

### HTTPS note

If you open Propulse over HTTPS (e.g. `https://propulse.vercel.app`) and your daemon is `ws://...`, browsers may block the connection as mixed content.

Use the included Chrome extension at `extensions/propulse-daemon-bridge` to proxy the connection.
