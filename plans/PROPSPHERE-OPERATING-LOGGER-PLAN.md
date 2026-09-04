# PropSphere Operating Logger — Product Definition

**Status:** Product definition (supersedes the 2026-09-04 kickoff draft)
**Date:** 2026-09-04
**Scope:** How PropSphere should feel when you are watching the world, working one station, or logging — and how that survives contact with real operators.

---

## 0. One-sentence product

PropSphere is the radio desk: the globe tells you what is workable, the dock lets you pick and log it, `/log` is the book you reconcile later. Contact is a *map posture*, not a tab.

---

## 1. What operators actually do (and complain about)

Pulled from contest docs (N1MM), map companions (GridTracker, HamClock, DXView), everyday loggers (Log4OM, QLog, HRD, Cloudlog), and the newer “one window” projects (Nexus, Log4YM, SDRLoggerPlus). Our own QLog competitive analysis already called several of these P0.

### Two tribes, one radio

**Veterans (CW/SSB DXers, Elmers, contest ops)**

- Hands never leave the keyboard. N1MM’s ESM exists because *Enter* is the whole QSO. Space moves fields. They will not hunt a mouse to log.
- **Never steal the VFO.** Click-to-tune is loved in HamClock *when they asked for it*, hated when a cluster click QSYs them off a pileup. Tune is an explicit verb.
- **Needed-at-a-glance is non-negotiable.** QLog’s most-praised feature is callsign color: new DXCC / new band-slot / worked / dupe. Forums still argue about award windows that take six clicks to answer “have I worked this country *this year*?”
- They run suites (DXLab, HRD) and *hate* the suite: too many windows, same button in three places, crashes. Log4OM won by being one tabbed app. K9KMS: “I just want my radio to go there when I find the spot.”
- Rotator: N1MM Alt+J turns the beam to the call in the entry window. Even without rotator control, they want **bearing on screen** so they can crank the mast by hand.
- Auto-zoom during a QSO is controversial. GridTracker’s “Fit Map to QRZ” exists *and* is an opt-in that restores the previous view when TX ends — because operators complained when the map hijacked them.

**Younger / digital-native (FT8-first, POTA, GridTracker kids, Log4YM’s “not for old men” joke)**

- The **map is the UI**. GridTracker’s call roster + globe is how a huge cohort learned to hunt. They expect click a decode → work it, and they expect the log to appear without exporting ADIF by hand.
- One window, or they bounce. HRD/DXLab window sprawl is exactly what they will not install. Nexus, Log4YM, SDRLoggerPlus are all “dockable panels, one log, UDP everything.”
- FT8 is the majority of QSOs. If WSJT-X logs and PropSphere only toasts, they will not trust us. GridTracker’s own docs say: GT is a *viewer*, send QSOs to a real logger. We should *be* that logger.
- Phone/tablet in the park matters (POTA). Desktop-only loggers lose this cohort. We already have mobile logbook; Operate must not be desktop-only chrome.
- They will forgive missing Cabrillo. They will not forgive “I worked it and it isn’t in the log.”

### Rituals that show up in every successful tool

| Ritual | Who does it | What they use today |
| --- | --- | --- |
| Hunt the cluster, click, path appears | Everyone | HamClock, DXView, Log4OM lookup map |
| Click spot → radio goes there | Veterans who opted in | HamClock, QLog band map, N1MM bandmap |
| Type call, Space, Enter, logged | Veterans / contest | N1MM ESM, TRLog |
| Decode list → one click → QSO | Digital-native | GridTracker call roster + WSJT-X |
| Map frames *this* path while in QSO, then restores | Digital-native | GridTracker Fit-to-QRZ |
| Color = new / needed / dupe before you call | DXers | QLog, JTAlert, N1MM |
| Don’t overwrite what I’m typing | Everyone | N1MM pending-replace, contest dock already |
| After log, form clears, radio stays | Everyone | Every serious logger |
| QSY wipe: tune away, draft dies | Veterans | QLog, N1MM “QSYing wipes the call” |

### Wishes that keep showing up

- Stop hopping apps between cluster, map, radio, and log.
- Instant “is this new for me?” without opening Awards.
- Path *before* the QSO is complete (Facebook ops hacking N1MM→Log4OM LookupInfo just to see the map *during* the contact).
- Cluster that is not a firehose: filter to my band, my needed, my continent.
- Don’t fight the operator: no surprise QSY, no surprise zoom, no surprise form wipe.
- Offline still logs (Field Day, POTA, contest).

---

## 2. Pressure test of the kickoff plan

The kickoff draft was right about **two rooms** (`/map` vs `/log`) and **LogIntent**. It was too small about the *map*, and it copied contest incompletely.

| Kickoff claim | Verdict | Why |
| --- | --- | --- |
| Operate is a dock tab, not a layout mode | **Keep, but incomplete** | Display modes (lite/pro/hamclock) stay. But Contact is a **map posture** that must change camera, rotation, and spot visual weight. A tab that doesn’t change the globe is just `/log` with a smaller form. |
| Replace band map with logger | **Reject as default** | S&P operators hunt on the band map *while* logging. Contest dock already keeps **both**. Everyday DX should too. Logger is a *strip* plus a pane, not a band-map replacement. |
| Select spot = prefill when Logger tab is active | **Too magical** | Observe clicks should not fill a hidden form. Prefill is a Contact verb (Work / Log / Enter on a row), not a side effect of browsing. |
| Globe “just stays,” path chip is enough | **Too timid** | Today `setTarget` draws a path and **does not frame the camera** (watch-alert pans are the only fly-to). Contact must pause auto-rotate and optionally frame QTH+DX, then restore — GridTracker’s lesson. |
| Last 5 QSOs strip | **Necessary but not sufficient** | DXers need **this call’s** DXCC/band-slot color in the entry itself, not a history tape. QLog P0. |
| Lite mode currently closes the console | **Must fix in PR1** | Otherwise “Log this” from the globe is a dead control. |
| Contest logger stays separate | **Keep** | Different write path (scoring). UI must make it obvious: Contest tab vs DX tab, never two entry fields fighting. |
| WSJT-X → toast only until PR3 | **Too late for trust** | Digital-native majority. At least a visible “logged to PropSphere? No” state in PR1; write-to-`qsoStore` should not slip past PR2. |
| Three PRs, UI first | **Reorder** | Map posture + compact entry + intent in the first slice, or the feature ships as another isolated widget. |

---

## 3. Three postures (this is the product)

Not layout modes. Not routes. A single `opsPosture: "observe" | "contact" | "desk"` that the globe, spots, and dock all read.

Think of it as **where attention lives**.

### 3.1 Observe — “what’s on the planet”

**Who:** wall display, coffee-cup DXing, kiosk, HamClock-like watching, teaching a new ham.

**Map**

- Full spot field. Equal visual weight (existing clustering/LOD stays).
- Auto-rotate allowed.
- Hover/click a spot: path + pin, **no camera steal**, **no VFO steal**, **no logger prefill**.
- Click is *inspect* (SelectedSpotCard / list highlight). Work is a separate control on that card.
- Greyline, solar, layers stay as the operator set them.

**Dock**

- DX list + band map + skeds. Classic observe console.
- Compact logger is **not** required on screen (saves space on lite/wall). A small “Log” control still exists so a click can *enter Contact*.

**Radio**

- Hands off. CAT can still *display* freq in the chrome; we do not write the VFO.

### 3.2 Contact — “I am working this station”

Entered by: **Work** on a spot/card, **L** on a focused row, “Log this” on the globe card, or typing a call into the logger while a target is set.

This is the Facebook/Log4OM wish: *see the path before the QSO is in the book*.

**Map**

- Pause auto-rotate (remember prior state).
- Frame the great circle: QTH and DX both in view, path as the hero (short path default; LP toggle still works). Do **not** slam-zoom into the DX pin — that loses the path.
- Dim other spots (~30–40% opacity); keep the worked-station and a handful of *same-band* neighbors so you still see the pileup.
- Show bearing + distance on-map (not only in the side panel). Reciprocal bearing for the other op is a DXer delight; cheap to add.
- Needed coloring on this call’s pin (new DXCC / new band / dupe) — even before full award dashboards exist, `qsoStore` already has dupe/worked-band data.
- Operator pan/zoom during Contact: we **stop framing**. Restoring on exit uses the view captured at Contact *entry*, not a live track (GridTracker restore).
- Exit Contact: log success, Esc, or Work another station. Restore camera + auto-rotate unless they panned.

**Dock**

- Logger is **mounted and focused**. Callsign filled, freq/mode from the spot, RST defaults for the mode.
- Band map remains available (tab or split). Default split on wide screens: list | logger, band map as tab. On XL: list | band map with logger as a **persistent strip above the split** (N1MM entry window always exists).
- Path chip is backup for when side panels are mini.

**Radio**

- **Tune is explicit** (button / `T`). A setting “Click-to-tune in Contact” can match HamClock for people who want it. Default off.
- If CAT is connected after Tune, form freq/mode follow the radio unless the operator edited them this QSO (QLog QSY wipe is the inverse: big VFO move *clears* a stale call — offer that as a setting, default on for Contact).

### 3.3 Desk — “I’m logging, hunting is secondary”

Entered by: opening the Logger pane without a target, or staying in Contact after a log with an empty form (CQ/run).

**Map**

- Observe-like camera (rotation may resume).
- Spot field full again.
- If CAT is connected, **band emphasis** follows the radio: other bands recede (not hidden). HamClock already switches VOACAP band with the VFO — we should switch *spot emphasis* the same way.
- New QSOs can pulse once on the globe (HamClock ADIF UDP pins). Then they join “worked” styling.

**Dock**

- Logger always up. Empty callsign, freq/mode from CAT or last used.
- List filtered to active band by default, override allowed (hunt 17m while parked on 20m — veterans do this).
- Enter logs, Esc clears, focus returns to callsign (already true on `/log`).

**Radio**

- Form follows VFO. No framing. No surprise QSY.

```
Observe  --Work / L / Log this-->  Contact  --log or Esc-->  Desk or Observe
Desk     --Work a spot---------->  Contact
Any      --Contest tab---------->  contest dock (unchanged)
```

Lite/pro/hamclock are still *how big the chrome is*. Posture is *what the map is doing*.

---

## 4. Map behavior spec (concrete)

Today: `setTarget` writes a pin and a path. Camera does not care. Auto-rotate keeps spinning. Other spots stay loud. That is Observe-only behavior leaking into every click.

| Event | Observe | Contact | Desk |
| --- | --- | --- | --- |
| Hover spot | Tooltip + faint path | Same, unless it is the worked station | Tooltip |
| Click spot | Select + inspect card. No prefill, no QSY, no frame | If click is a *different* station: pending-replace if logger dirty; else retarget + reframe | Work control enters Contact; plain click inspects |
| Work / Log this | → Contact + prefill + frame | Retarget | → Contact |
| Tune / `T` | No-op or prompt to enter Contact | Stage CAT | Stage CAT to form freq |
| CAT VFO change | Ignore for map | If QSY-wipe on and Δfreq large: clear call, stay Desk-ish; else update form freq | Emphasize that band’s spots |
| Auto-rotate | Allowed | Paused | Restored to user preference |
| Frame QTH+DX | Never | Once on enter; cancel if user pans | Never |
| Other spots | Full | Dim; same-band neighbors remain | Band-emphasized |
| After successful log | — | Clear form, brief “logged” on pin, restore camera → Desk (or Observe if they came from Observe and console collapsed) | Pulse pin |
| Esc | Clear inspect | Clear form + exit Contact + restore camera | Clear form |

**Azimuthal / flat:** same rules. Framing = fit bounds to QTH+DX with padding, not globe-orbit. Do not invent a fourth camera system.

**HamClock layout:** Observe is the native feel. Contact still frames (HamClock already “redefines DX” on list tap). Don’t fight the dense chrome; logger strip along the bottom of the ops area, not a giant pane.

**Kiosk / wall:** Observe only. Hide Work/Log or make them no-ops. A public globe should never open a logger.

---

## 5. Dock + logger spec

### Always-on entry (Desk + Contact)

N1MM lesson: the entry window never goes away. We do **not** hide the logger behind a tab as the only way to log.

- **Compact strip** (always in Contact/Desk): Call · Freq · Mode · RST · Enter. DXCC color on the callsign. Dupe badge. Bearing.
- **Full compact panel** (optional right pane): notes, lookup strip, last QSOs, “open book” link to `/log`.
- **Band map** stays a peer, not a sacrifice.

Wide:

```
[ CALLSIGN    ] [14074.0] [FT8] [RST] [Log]
────────────────────────────────────────────
  Spot list (band-filtered)  │  Band map
```

Narrow: strip + tabs (List | Map | Logger details).

### Intent rules (unchanged idea, tighter verbs)

```
inspect  → select + path          (Observe-safe)
work     → inspect + prefill + frame + posture=contact
tune     → CAT only, never implied by inspect
log      → commit qsoStore
```

Dirty-form protection copies contest `requestDraftReplace`. Do not invent a second banner.

### Color on the callsign (P0, ship a thin version in the first slice)

Reuse logbook dupe/worked-band data already in `qsoStore`:

- New entity (never worked) — alert red
- New band or mode for this entity — signal green
- Worked this band+mode — orange/dupe treatment
- Exact dupe (call+band+mode recently) — gray + block Enter with an override (Ctrl+Enter / “log anyway”)

This is what makes veterans stay and what JTAlert trained digital ops to expect.

---

## 6. Radio, SDR, Aether (sockets, not vapor)

`LogIntent` stays the integration spine. Tighten the verbs:

| Source | Default verbs |
| --- | --- |
| Cluster / map inspect | inspect only |
| Cluster / map Work | work (setMapTarget, prefill, no tune) |
| Explicit Tune | tune |
| CAT freq change | update form if Desk/Contact and field not dirty; maybe QSY wipe |
| WSJT-X decode click (future / Aether) | work |
| WSJT-X `qso_logged` | **log** (commit), not inspect |
| Web SDR click (future) | work + optional tune |
| Aether DX client | same as WSJT-X: decode = work, completed QSO = log |
| Manual typing | desk |

Do not build SDR UI or Aether in these PRs. Do make `applyLogIntent` the only function those adapters will call.

WSJT-X writing the real log is a trust issue, not a nice-to-have. Target: PR2 at latest.

---

## 7. Personas → acceptance tests

**Veteran DXer:** Keyboard-only: focus a row, `L` enters Contact, path frames, `T` optional, type RST if needed, Enter logs, camera restores, form empty, VFO unchanged unless they tuned.

**New ham:** Big Work button on the spot card. They never learn shortcuts. Logger shows “this is a new country” in words, not only color.

**FT8 op:** WSJT-X QSO appears in `/log` and pulses on the globe. They never opened the logger. PropSphere was a map companion that *also* kept the book.

**POTA activator (mobile):** Compact strip usable with thumbs. Observe list still visible. No flyouts.

**Contester:** DX tab never steals the contest draft. Contest tab unchanged.

**Wall / kiosk:** Posture locked to Observe.

---

## 8. Revised shipping

### PR 1 + PR 2 — Contact loop, radio follow, digital trust, shack stamp

Shipped together on `feat/propsphere-ops-logger` so Ham Shack has a real operating spine.

- `opsPosture` on a small store (not `layoutMode`). Desk vs Observe persists; Contact does not.
- Compact strip + `LogIntent` (`inspect` / `work` / `tune` / `log`) + `commitWsjtxLogged`.
- Work / `L` from list and SelectedSpotCard.
- Contact map: pause rotate, frame QTH+DX, dim others, restore on exit (including “user panned → don’t fight”).
- CAT follow with optional QSY wipe; click-to-tune default off.
- WSJT-X `qso_logged` writes the book without clobbering the draft.
- Log entries stamp active Ham Shack chain (rig, antenna, power, grid, call).
- Thin DXCC/dupe color on the callsign from existing log data.
- Lite: Work re-opens the console.
- Kiosk: no Contact.

### PR 3 — Depth that veterans will smell as “real”

- Rotator heading command if we already have rotator in shack/bridge; otherwise bearing-only stays.
- Same-band neighbor preservation tuned with live spots.
- Award-needed filters on the Observe list (“only new DXCC”).
- Aether/SDR clients themselves — adapters already have a fixture test via `commitWsjtxLogged` / `applyLogIntent`.

`/log` remains the book. No `/log` redesign in this program.

---

## 9. Explicit non-goals (still)

- Flyout logger.
- Merging contest one-line with `qsoStore`.
- Full DX Wizard in the dock.
- Auto-QSY on every cluster click.
- Auto-zoom that cannot be undone (always restore or honor pan).
- Building SDR or Aether clients here.
- HamClock “log mode” as a fourth product mode — HamClock layout uses the same three postures.

---

## 10. Decision

**Kickoff decision kept:** everyday logging lives in PropSphere, `/log` is the book, contest stays its own dock.

**Kickoff decision revised:** Contact is a map posture with framing, dimming, and restore — not a Logger tab that hides the band map. Inspect ≠ Work ≠ Tune ≠ Log. The compact strip is always present in Contact and Desk; the band map is not sacrificed.

---

## 11. PR1 traceability (implementation map)

Shipped as one feature branch (`feat/propsphere-ops-logger`), not per-item PRs. Section → files:

| Plan | What | Files |
| --- | --- | --- |
| §3 postures | `observe \| contact \| desk` | `src/stores/opsPostureStore.ts` |
| §3.2 / §4 Contact map | Pause rotate, frame QTH+DX, restore unless user panned | `src/lib/map/contactMapPolicy.ts`, `src/components/map/GlobeView.tsx` (`CameraController`) |
| §4 dim others, keep same-band | Visual weight, not a data cut | `contactSpotOpacity` in `contactMapPolicy.ts`, applied in `LiveSpotArcs.tsx` |
| §4 public spots stay in Contact | `MapDataScope` "log" no longer hides the firehose while Contact/Desk | `resolveMapPolicyScope` → `useMapOperationalContext.ts` |
| §4 kiosk locked to Observe | Work/L/Tune no-ops; Work button hidden | `applyLogIntent` + `SelectedSpotCard.tsx` |
| §5 compact strip | Call · Freq · Mode · RST · Enter; DXCC + dupe; bearing | `src/components/ops/OpsLoggerStrip.tsx`, mounted from `OpsConsole.tsx` (and lite/mobile in `PropSphere.tsx`) |
| §5 Log tab keeps the list | LoggingDock is list + recents, not a full form that replaces observe | `OpsConsole.tsx` `LoggingDock` |
| §5 intent verbs | `inspect / work / tune / log` + WSJT-X | `src/lib/qso/logIntent.ts`, `commitWsjtxLogged` |
| §5 dirty-form | Pending-replace banner (contest pattern, not a second system) | `opsPostureStore.pendingReplace` + strip banner |
| §5 Work / `L` | Card button, row `L`, list keyboard | `SelectedSpotCard.tsx`, `DXSpotList.tsx`, `SpotRow.tsx` |
| §8 lite | Work re-opens console; lite/mobile get the strip overlay | `logIntent` `setDXConsoleExpanded`, `PropSphere.tsx` |
| §4 bearing on-map | Contact path chip on the globe | `GlobeView.tsx` |
| §8 radio follow | CAT updates freq; band QSY wipes call | `src/lib/qso/radioFollow.ts`, `useQSOEntry.ts` |
| §8 click-to-tune | Default off; map click only | `maybeTuneOnMapClick` in `radioFollow.ts` + Preferences |
| §8 digital trust | WSJT-X → IndexedDB log, not toast-only | `useWSJTXAutoLog.ts` → `commitWsjtxLogged` |
| §8 shack stamp | Rig / antenna / power / grid on every QSO | `src/lib/station/stationLogStamp.ts`, `qsoStore.logQSO` |
| §8 persist Desk | Reload returns to Desk if that was last | `opsPostureStore.deskPreferred` |

**Still out (PR3):** rotator command, award-needed Observe filter, `/log` redesign.
