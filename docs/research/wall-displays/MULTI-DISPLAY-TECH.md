# Multi-Display & Kiosk Technical Research

**Collected:** 2026-08-29 · browser API support, kiosk deployment paths, signage pairing patterns. Companion to `docs/plans/PLAN-WALL-DISPLAY-AND-PARITY.md`.

## 1. Window Management API (`getScreenDetails` / `requestFullscreen({screen})`)

- **Support (mid-2026): Chromium-only.** Chrome/Edge 100+ (`getScreenDetails()`, `Screen.isExtended`); `requestFullscreen({screen})` + fullscreen companion windows in 104+. **Firefox and Safari have not implemented it** (Mozilla standards-positions #542 — no committed timeline). No polyfill possible; degrade-gracefully only.
- **Permission model:** gated by `window-management` permission; one-time prompt; grant **persists per-origin** across sessions. Secure context required; `window.open` still requires a user gesture.
- **Mechanics:**
  ```js
  const details = await window.getScreenDetails();
  const target = details.screens.find(s => /* match by position/resolution */);
  await document.body.requestFullscreen({ screen: target });
  // or open a new window sized to that screen:
  window.open(url, "_blank", `left=${target.availLeft},top=${target.availTop},width=${target.availWidth},height=${target.availHeight}`);
  ```
- **Gotchas:** screen `label` inconsistent/empty off-ChromeOS; no stable screen ID across reboots (match by position/resolution); `currentScreen` updates live when windows are dragged.
- **Implication:** only solves "one machine, one browser, N monitors," Chromium-only. Treat as **progressive enhancement** over a baseline of N independent windows/devices each hitting a per-display URL.
- MDN Window Management API · w3.org/TR/window-management · developer.chrome.com/docs/capabilities/web-apis/window-management · mozilla/standards-positions#542

## 2. Kiosk deployment paths hams actually use

- **Raspberry Pi (Bookworm/Trixie, Wayland/labwc default):** old X11 `lxsession` autostart tricks are broken. Working pattern: systemd autologin → `~/.config/labwc/autostart` → `chromium --ozone-platform=wayland --kiosk <url>` (with a short `sleep` to avoid the white-screen compositor race). Screen blanking: X11 `xset s noblank -dpms`; Wayland needs `wlr-randr` / `wayfire.ini [idle] dpms_timeout=0`; console `consoleblank=0`. ~2GB RAM minimum for Chromium on Pi 4/5.
- **Fully Kiosk Browser (Android/Fire TV/tablets):** de facto standard — URL lockdown, scheduled wake/sleep, screen-always-on, CPU/WiFi wakelock. Caveat: some Fire OS devices suspend/kill regardless; Fire TV inconsistent.
- **Windows mini PC:** Edge kiosk mode / Assigned Access auto-launches fullscreen, **but kiosk sessions are locked to a single window/screen** — multi-monitor via Assigned Access means one kiosk account per monitor (clunky). For a shack mini PC, plain auto-started browser windows (not Assigned Access) are the practical path.
- **24/7 reliability layers (all platforms):** OS auto-restart (systemd `Restart=always` wrapping Chromium; Fully Kiosk watchdog), scheduled daily full reload (~3am, standard signage practice for leak hygiene), explicit DPMS/blanking disable. Wake Lock only works at tab level — OS-level blanking still needs OS config.
- **Implication:** build one **kiosk-friendly page contract** (per-display URL, self-contained, fullscreen-by-default, zero-interaction, stall-tolerant) + publish three deployment recipes (Pi/labwc, Fully Kiosk, Windows). Don't try to control the OS from the web app.
- forums.raspberrypi.com t=390764, t=389880 · fully-kiosk.com · learn.microsoft.com/deployedge/microsoft-edge-configure-kiosk-mode

## 3. Digital signage pairing/model patterns (Anthias, Xibo, PiSignage, DAKboard)

All converge on the same three-part model:
1. **Device identity generated on-device**, registered on first contact, "awaiting authorization" until approved (Xibo footgun: cloned images produce identical hardware keys — ensure per-device uniqueness).
2. **Pairing is a short code, never credentials typed on the device** — Netflix/YouTube `/activate` shape: device shows one-time code + QR; operator confirms from an authenticated phone/laptop; device polls or gets pushed confirmation.
3. **One device = one named display object** in the CMS, with content (playlists/schedules/layouts) assigned *to* it — re-pointing a screen is a CMS-side change, not a device reflash.
- **Implication:** mirror this exactly — a `displays` table decoupled from pairing mechanics; 6-char code + QR to `/pair?code=XXXXXX`; never type a password on a TV remote.
- anthias.screenly.io/docs · account.xibosignage.com/manual/en/displays · blog.dakboard.com

## 4. Per-display identity + realtime control prior art

- **Grafana kiosk/playlists:** pure URL params (`?kiosk=tv`) + client-side timer cycling dashboard URLs. Good rotation model, no push channel.
- **Home Assistant `browser_mod`:** each browser is a registered, addressable entity over the HA WebSocket; commands (navigate/popup/reload) target a browser ID. **Closest prior art to "push a layout change to one specific paired display."**
- **DAKboard:** each screen is a "Display" object; Screens/Loops/Schedules assigned per-display from a central dashboard (SaaS).
- **MagicMirror MMM-Remote-Control:** REST per mirror instance; no central plane — the anti-pattern to avoid.
- **Transport for PropPulse:** Supabase Realtime **broadcast channels** (already a dependency; "Broadcast from Database" GA since Apr 2025; RLS-gated) — one channel per display (`display:<id>`); dashboard publishes scene changes, kiosk subscribes. **BroadcastChannel API** (universal since 2022) is same-origin/same-machine glue only — optional optimization for N windows on one PC; simpler to let each window hold its own Realtime subscription and avoid leader election.
- grafana.com kiosk tutorial · github.com/thomasloven/hass-browser_mod · supabase.com/docs/guides/realtime/broadcast

## 5. PWA specifics

- **Display modes:** `"display": "fullscreen"` (no chrome at all) is right for kiosk; `window-controls-overlay` irrelevant here.
- **Wake Lock API: universally supported** since ~Mar 2025 (Chrome/Firefox/Safari + mobile; >94% global mid-2026). Acquire on load, **re-acquire on `visibilitychange`** (released when tab hidden). Does NOT override OS-level DPMS — pair with §2 OS recipes.
- **Multiple PWA windows:** ordinary `window.open` behavior; combined with Window Management on Chromium, a PWA can place windows on specific screens. No cross-browser guarantee.
- web.dev/blog/screen-wake-lock-supported-in-all-browsers · caniuse.com/wake-lock

## RECOMMENDATION

**Baseline contract:** one route shape, `/display/:id` (resolving to a scene server-side), self-contained, zero-interaction after load, Wake Lock on load + `visibilitychange`, re-renders from a Supabase Realtime subscription + normal data fetching. No Window Management dependency.

**(a) Single machine + N monitors:** a "Display Wall" control page requests `getScreenDetails()` once, lets the operator drag scene assignments onto a visual map of detected screens, and "Launch Wall" opens one positioned window per monitor, each calling `requestFullscreen({screen})` and holding its own Realtime subscription. Firefox/Safari: fall back to "open these N URLs and drag them" — don't fake positioning.

**(b) N cheap devices (Pi / Fire TV):** pairing flow per §3 — `/display/pair` shows 6-char code + QR; operator confirms from an authenticated session; device (subscribed to the pre-pairing channel) flips to its display identity instantly. Publish two deployment recipes (Pi labwc autostart + systemd restart wrapper; Fully Kiosk for Android/Fire TV).

**(c) Central management + live updates:** `displays` table (id, name, owner, `scene_config` jsonb, last_seen_at) as source of truth; a Displays page assigns scenes; changes = row write + Realtime broadcast, with device poll-on-reconnect as the consistency fallback (Realtime is an optimization, not the mechanism of record). Rotation playlists = client-side timer over an array of scene IDs in `scene_config` — no new transport.

**Design rule throughout:** everything that makes this *nice* (Window Management, auto-placement) is Chromium-only and must degrade; everything *load-bearing* (Wake Lock, Realtime, BroadcastChannel) is universally supported and safe to require.
