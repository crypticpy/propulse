# SDR Radio and Device Console Remediation Plan

This document tracks the 22 findings from the SDR radio, CAT/bridge, daemon,
device-picker, monitoring, and saved-radio inventory audit. A finding is only
complete after its implementation and the listed acceptance criteria are
verified.

Status legend: `TODO`, `IN PROGRESS`, `DONE`.

## Phase 1 — Transmit safety and device identity

### 1. Server-enforced PTT safety (`DONE`)

- Persist a PTT lockout setting and enforce it in every frontend transmit path.
- Enforce a maximum manual key-down duration in the Node bridge.
- Associate manual PTT with the requesting client and release it on client
  disconnect, radio disconnect, backend stop, and process shutdown.
- Clear PTT state when the Rust daemon disconnects a radio.
- Acceptance: lockout blocks `radio:ptt`, `rig.setPTT`, and FT8 TX; disconnecting
  or losing the owning client always attempts PTT release; a timer releases a
  manually keyed radio.
- Implemented in both servers with persisted frontend lockout, client ownership,
  serialized hardware transitions, release-on-disconnect/stop/shutdown, bounded
  manual key-down, hardware-confirmed release retries, and generation-safe FT8
  cancellation.
- Verified by five Node safety tests, Rust protocol coverage, Rust unit tests,
  bridge build, and live dummy-daemon console checks.

### 2. Selected device versus connected device (`DONE`)

- Disable device selection while connected, and derive all live name,
  capability, stream, mode, antenna, gain, and PTT UI from the connected
  device.
- Acceptance: it is impossible for controls displayed for device B to issue a
  command to connected device A.
- Live controls now derive from `connectedDeviceId`; device selectors are
  disabled while connected and picker-driven device switches explicitly
  reconcile streams before reconnecting.
- Verified in the browser with a connected dummy radio and by production build.

### 3. Rust Hamlib devices must control real hardware (`DONE`)

- Route Hamlib radio connect/tune/mode/PTT/disconnect through the Rust rig
  service, or stop advertising those devices as controllable.
- Acceptance: successful commands represent backend success, not an in-memory
  state-only change.
- Configured Hamlib pseudo-devices remain visible for diagnostics but are marked
  unavailable with no command capabilities. Compatibility `rig.connect` now
  uses the real `RigService` with the requested backend/host/port.
- Verified by Rust compile/unit tests and protocol-capability assertions.

## Phase 2 — Protocol, state, streams, and reconnect

### 4. Protocol parity across frontend, Node bridge, and Rust daemon (`DONE`)

- Define command-level capabilities and protocol version/feature negotiation.
- Implement or hide VFO, RIT, XIT, split, ANF, QSK, VOX, IF shift, and CW-speed.
- Normalize AGC and squelch payloads across implementations.
- Acceptance: every visible control is supported by the connected backend and
  the same payload has the same meaning in both servers.
- Added protocol 1.1 feature negotiation and command-level capability maps;
  unsupported advanced controls are hidden. AGC/squelch payloads are normalized,
  and active Rust DSP pipelines now receive mode/filter/NR/NB/AGC changes.
- Verified by TypeScript builds, Rust protocol tests, and capability-driven
  browser rendering against the Rust daemon.

### 5. Correlated command acknowledgments and rollback (`DONE`)

- Track pending commands by message ID.
- Commit optimistic state only on success or roll it back/refetch on failure.
- Prevent unrelated responses from clearing errors.
- Acceptance: a rejected command restores authoritative state and displays the
  error for the command that failed.
- Radio and stream commands are tracked by request ID; failed optimistic radio
  edits roll back to the latest authoritative state, and unrelated successes no
  longer clear an existing error.
- Verified by frontend tests, CAT correlation tests, and manual failure-path QA.

### 6. Reconnect must restore radio state and stream subscriptions (`DONE`)

- Clear or revalidate stale connection state when transport drops.
- Reissue idempotent radio connect/status requests after reconnect.
- Restore per-client FFT/audio subscriptions only after radio state is known.
- Acceptance: reconnect restores controls and previously enabled streams
  without requiring a page reload or manual disconnect.
- Stale transport state is invalidated, saved radios are re-enumerated and
  reconnected, and desired FFT/audio subscriptions are restored only after a
  connected radio-state event. Stale WebSocket events cannot clobber a newer
  connection.
- Verified by radio-store reconciliation tests and browser reload/reconnect QA
  that restored the dummy radio and its FFT stream.

### 7. Accurate, command-level device capabilities (`DONE`)

- Replace hard-coded Node bridge capabilities with backend-derived flags.
- Return authoritative gain values or do not expose unsupported gain controls.
- Remove arbitrary audio input fallback index `2`.
- Acceptance: the UI does not advertise TX, streams, antennas, modes, or gains
  that the active backend cannot provide.
- Node capabilities are backend-derived and conservative; invented gain stages,
  antennas, modes, audio index fallbacks, and unsupported IQ streams were
  removed. Rust Soapy/SDRconnect/dummy capability maps now reflect implemented
  client commands.
- Verified by protocol assertions and browser control visibility checks.

### 8. Authoritative stream lifecycle (`DONE`)

- Keep FFT/audio in `starting` until a usable source/frame is confirmed.
- Surface start failures and watchdog exhaustion, and return controls to off.
- Acceptance: stream controls never show enabled when no stream is active.
- FFT/audio now distinguish desired, pending, and frame-confirmed state. Failed
  starts, no-frame timeouts, and exhausted audio retries turn controls off and
  issue a stop request.
- Verified live: FFT/audio changed to active only after binary frames arrived;
  reload restored the desired FFT subscription.

## Phase 3 — CAT, setup, discovery, and security

### 9. Secure LAN daemon authentication (`DONE`)

- Add daemon auth-token configuration to the console and device picker.
- Do not recommend a non-loopback bind without authentication guidance.
- Acceptance: an authenticated Rust daemon can be discovered, enumerated, and
  controlled; setup warns against unauthenticated LAN exposure.
- Added persisted daemon-token configuration to the picker/console and both
  WebSocket transports. The Rust daemon refuses non-loopback binds without a
  token and enforces authentication for flat and envelope commands.
- Verified by Rust compile/protocol paths, frontend build, and picker warning UX.

### 10. CAT serial scan protocol mismatch (`DONE`)

- Add an envelope-protocol scan command/response or use the flat daemon
  transport consistently.
- Make unknown bridge messages return errors rather than success acknowledgments.
- Acceptance: CAT Settings receives and displays real serial scan results and
  scan failures.
- Node now supports correlated scan results in both protocols; Rust returns an
  explicit correlated unsupported error. Unknown commands fail instead of
  receiving success acknowledgments, and CAT Settings displays errors/timeouts.
- Verified by browser CAT scan failure QA against Rust and bridge build.

### 11. Hydrate persisted CAT configuration into live rig state (`DONE`)

- Initialize transient CAT enabled/backend state from persisted settings.
- Reconnect the configured rig after bridge reconnect/page reload.
- Preserve pending tune commands until they are acknowledged.
- Acceptance: click-to-tune works after reload without visiting Settings.
- Live CAT enabled/backend state is hydrated from settings, the configured
  backend reconnects after transport recovery, and pending frequency/mode
  requests remain staged until their matching ACK.
- Verified by production build and reconnect/browser state checks.

### 12. Real connection-test results (`DONE`)

- CAT Settings must consume correlated `rig:test` responses.
- The setup wizard must genuinely probe Hamlib, Flrig, ICOM serial, and ICOM
  network backends.
- Report spectrum/audio only after verification.
- Acceptance: unavailable hardware can never produce “Connection OK.”
- Removed simulated success. CAT Settings and the setup wizard require a matching
  real probe ACK, enforce timeouts, reject generic success responses, and report
  verified stream features only. Unsupported Rust ICOM probes fail explicitly.
- Verified by three focused CAT protocol tests and browser test-failure QA.

### 13. HTTPS-safe setup and discovered-device queries (`DONE`)

- Reuse the Chrome-extension transport for setup probes and device enumeration.
- Acceptance: all local `ws://` workflows work from the hosted HTTPS app when
  the extension is installed.
- Setup, CAT bridge, console, and discovered-daemon probes all use the shared
  extension-safe transport. Extension sessions are strictly correlated and are
  disconnected on unmount.
- Verified by TypeScript build/lint and transport lifecycle review.

### 14. Preserve ICOM CI-V radio address (`DONE`)

- Hydrate, edit, scan-select, test, and connect with `radioAddress`.
- Acceptance: models whose CI-V address is not `0x94` connect using their
  discovered/configured address.
- The address is hydrated, editable, populated from scan results, persisted,
  and included in test/connect/reconnect payloads.
- Verified by CAT payload test using address `0xA4` and browser UI showing the
  configured address field.

### 15. Stable Zustand selectors in CAT Settings (`DONE`)

- Use `useShallow` or individual primitive selectors.
- Acceptance: CAT Settings mounts without getSnapshot or maximum-depth loops.
- Replaced the object selector with `useShallow` and stable primitive actions.
- Verified by browser mount/navigation QA with no console errors and by lint.

### 16. Referentially safe radio deletion (`DONE`)

- Remove or repair station presets referencing deleted radios.
- Delete image/gallery blobs for instances removed by custom-definition cascade.
- Show the number of instances/presets/chains affected before destructive delete.
- Acceptance: deletion leaves no stale radio IDs or orphan image blobs.
- Instance/custom-definition deletion now removes presets, repairs active IDs,
  removes chain nodes, and best-effort deletes primary/gallery blobs. Confirmation
  text reports affected instances, presets, chains, and images.
- Verified by two deletion-integrity tests and browser confirmation-preview QA.

## Phase 4 — Remaining device-management and monitoring issues

### 17. Reliable Device Picker selection (`DONE`)

- Apply device choice even when the daemon URL is unchanged.
- Clear stale remembered device IDs for URL-only selections.
- Try all discovered addresses and authenticate enumeration probes.
- Acceptance: every picker action produces the selected daemon/device state.
- Same-URL device choices are applied, URL-only choices clear remembered IDs,
  authenticated probes try each address in isolated keyed transports, and stale
  probe errors cannot skip a candidate.
- Verified by frontend build/lint and same-URL selection logic review.

### 18. Cancel delayed radio commands (`DONE`)

- Clear gain/filter debounce timers on device change, disconnect, and unmount.
- Acceptance: no delayed command can target a previously connected radio.
- Gain/filter timers and pending command IDs are cleared on device change,
  disconnect, and unmount.
- Verified by hook lifecycle review, lint, and production build.

### 19. Radio limit and custom-definition inventory UX (`DONE`)

- Explain/disable additions at the ten-radio limit.
- Count owned radio instances separately from reusable custom definitions.
- Make “duplicate/add instance” actions explicit.
- Acceptance: the count and action labels match persisted inventory semantics.
- Owned instances and reusable definitions now have separate counts/actions;
  additions/duplicates are explicitly labeled and disabled with a ten-instance
  limit explanation.
- Verified in browser Shack/Radio Manager QA.

### 20. Correct bridge health and connection-test timers (`DONE`)

- Monitor the configured bridge instead of a permanently disabled hook.
- Clear Bridge Info test timeouts on success, error, retry, and unmount.
- Acceptance: health reflects the actual bridge and successful tests stay
  successful.
- Health now observes the configured bridge. Bridge Info clears its test timeout
  on retry, success, error, and unmount.
- Verified by lint/build and timer lifecycle review.

### 21. Functional frequency lock (`DONE`)

- Render a lock control in both states and block all tuning entry points while
  locked.
- Acceptance: keyboard, wheel, waterfall, preset, and manual tuning cannot
  change frequency while locked.
- Lock is always visible, survives authoritative state refreshes for the current
  device, and gates manual inputs, band buttons, memory/preset tuning, keyboard,
  wheel, spectrum, waterfall, and FT8 preset paths.
- Verified live: after locking, the frequency input and band controls were
  disabled and an attempted change left the VFO at 14.074 MHz.

### 22. Protect ICOM network credentials and add subsystem coverage (`DONE`)

- Move the password out of the general persisted settings payload into the
  credential store; migrate and remove legacy plaintext.
- Add focused frontend, bridge, and daemon tests for the findings above.
- Include bridge build/tests and Rust tests in the repository verification/CI
  path.
- Acceptance: `propulse-settings` contains no ICOM password; automated checks
  cover transmit safety, protocol parity, reconnect, CAT setup, and deletion
  integrity.
- The ICOM password is runtime-only in settings, excluded from
  `propulse-settings`, and migrated to the encrypted vault when it is unlocked.
  Frontend, bridge, and daemon coverage plus `verify:radio` now exercise the
  subsystem build/test path.
- Verified: 7 focused frontend tests, 5 bridge safety tests, 6 Rust unit tests, all Rust
  integration binaries compiled, and the credential persistence assertion
  confirms neither the value nor key is written to `propulse-settings`.

## Implementation order

1. PTT fail-safes and device identity (1–3).
2. Shared protocol/capability contract, command reconciliation, reconnect, and
   streams (4–8).
3. Authentication, CAT/setup/discovery, ICOM configuration, and selector
   stability (9–15).
4. Inventory integrity and remaining console/monitoring fixes (16–22).
5. Run lint, frontend tests/build, bridge build/tests, Rust tests, and a final
   requirement-by-requirement audit. Record evidence beside each item and mark
   it `DONE` only when its acceptance criteria are met.

## Final verification matrix

- `npm run lint` — passed with zero warnings.
- `npm run test` — 1 file, 7 focused tests passed.
- `npm run build` — TypeScript and Vite production build passed.
- `npm run test:bridge` — bridge TypeScript build and 5 PTT tests passed.
- `cargo check -p propulse-daemon --offline` — passed.
- `cargo test -p propulse-daemon --lib --offline` — 6 tests passed.
- `cargo test -p propulse-daemon --tests --no-run --offline` — all unit and
  integration test executables compiled.
- Browser QA with the live Rust dummy daemon covered device enumeration/connect,
  capability-driven controls, FFT/audio frame activation, reconnect + FFT restore,
  frequency lock, CAT scan/test failures, stable CAT mounting, radio inventory,
  deletion-impact preview, and zero browser console errors.
- The sandbox blocks Rust integration tests from binding ephemeral ports, so the
  binaries were compiled here and the equivalent daemon protocol/stream paths
  were exercised through the live browser session.
