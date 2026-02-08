# Propulse Radio Daemon Bridge (Chrome Extension)

This extension lets the Propulse web app (served over HTTPS) connect to a local `ws://` Propulse Radio Daemon without being blocked by browser mixed-content rules.

## Install (unpacked)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder: `extensions/propulse-daemon-bridge`

## How it works

- The Propulse page sends messages via `window.postMessage(...)`.
- The extension connects to your daemon URL using a background WebSocket.
- Incoming daemon JSON/binary frames are relayed back to the page.

## Notes

- Default daemon URL in Propulse is `ws://127.0.0.1:9867`.
- The extension has host permissions for `ws://*/*` so it can reach LAN daemons like `ws://192.168.1.10:9867`.

