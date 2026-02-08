# Propulse Radio Daemon

Rust companion daemon for Propulse. Provides a unified WebSocket API for:
- SDR/rig discovery and control
- FFT/audio streaming (binary WebSocket frames)
- (Future) WSJT-X, DX cluster, N1MM+, mDNS discovery

## Quick start (local only)

```bash
cd daemon
cargo run -p propulse-daemon
```

By default it binds to `127.0.0.1:9867`.

