# GridTracker2 Competitive Intelligence Report

**Date:** 2026-02-14
**Analyst:** Propulse Dev Team
**Subject:** GridTracker2 v2.250914 (GridTracker.org)
**Comparison Target:** Propulse v0.14.0

---

## 1. GridTracker2 Overview

| Attribute       | Detail                                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Website         | [gridtracker.org](https://gridtracker.org/)                                                                                   |
| Repository      | [gitlab.com/gridtracker.org/gridtracker2](https://gitlab.com/gridtracker.org/gridtracker2)                                    |
| Version         | v2.250914 (Sept 22, 2025)                                                                                                     |
| License         | BSD 3-Clause "New" or "Revised"                                                                                               |
| Stack           | JavaScript/HTML/CSS, Electron (migrated from NW.js in GT1), Node.js, OpenLayers maps                                          |
| Platforms       | Windows 10/11, macOS 13-15, Linux x86_64, Linux ARM 32/64 (Raspberry Pi, Odroid)                                              |
| Commits / Tags  | 385 commits, 122 tags (9 branches)                                                                                            |
| Authors         | Stephen Loomis N0TTL and Henry Forte N2VFL (+ community contributors)                                                         |
| Release Cadence | Frequent — 8+ releases in 2025 alone (monthly-ish)                                                                            |
| Chocolatey DLs  | 10,598 total downloads (Windows package manager only; actual total much higher)                                               |
| Community       | Discord server, Groups.io mailing list (GridTrackerApp), GitLab issue tracker, official forum                                 |
| Philosophy      | "A warehouse of amateur radio information presented in an easy-to-use interface." Companion to WSJT-X, NOT a logging program. |
| Cost            | **Free** — open source, donation-supported                                                                                    |
| Partnerships    | Log4OM, Parks On The Air (POTA), Linux In The Ham Shack, Ham Radio Crash Course                                               |

---

## 2. Core Identity

GridTracker2 is fundamentally a **WSJT-X companion application** — it listens to UDP traffic from WSJT-X or JTDX and presents decoded digital mode activity on an interactive world map. It is explicitly **not a logging program**; instead it displays QSO data from WSJT-X plus ADIF files, and can forward QSO data to multiple external logging services.

The software evolved from GridTracker v1 (NW.js-based) to GridTracker2 (Electron-based, created Sept 2024), gaining improved performance and modern framework support.

---

## 3. Feature Matrix

### Legend

- **GT2**: Full = fully implemented, Partial = basic/limited, None = absent
- **Propulse**: Full / Partial / None / Planned

| Feature Area                      | GT2      | Propulse | Notes                                                                           |
| --------------------------------- | -------- | -------- | ------------------------------------------------------------------------------- |
| **Interactive World Map**         | Full     | Full     | GT2 uses OpenLayers; Propulse uses Three.js 3D globe                            |
| **Real-time Decode Display**      | Full     | Partial  | GT2 shows live WSJT-X decodes on map; Propulse shows cluster spots              |
| **WSJT-X/JTDX Integration**       | Full     | None     | GT2's core feature — UDP listener for WSJT-X data                               |
| **PSK Reporter Spots**            | Full     | Partial  | GT2 shows PSK spots with flight paths, heatmaps; Propulse shows PSK data        |
| **DX Cluster Spots**              | Full     | Full     | Both display cluster spot data                                                  |
| **Award Tracking (DXCC)**         | Full     | None     | GT2 tracks DXCC progress with map overlays per entity                           |
| **Award Tracking (WAS)**          | Full     | None     | GT2 shows US states with worked/confirmed status                                |
| **Award Tracking (VUCC/Grids)**   | Full     | None     | GT2 colors grids by worked/confirmed status                                     |
| **Award Tracking (CQ/ITU Zones)** | Full     | None     | Map overlays for CQ zones and ITU zones                                         |
| **Award Tracking (Counties)**     | Full     | None     | US county-level tracking overlay                                                |
| **QSO Logging**                   | Partial  | Full     | GT2 keeps ADIF log but defers to external loggers; Propulse has full QSO system |
| **Offline Operation**             | Full     | Full     | GT2 has 100% offline mode for POTA/SOTA/Field Day                               |
| **Call Roster / Decode List**     | Full     | None     | GT2's Call Roster is a major feature — filterable, click-to-call                |
| **Click-to-Call (TX Control)**    | Full     | None     | Single-click on callsign initiates WSJT-X transmission                          |
| **Callsign Lookup**               | Full     | None     | CALLOOK, HamQTH, QRZ.com, QRZCQ.com integration                                 |
| **Grayline Overlay**              | Full     | Full     | Both show day/night terminator                                                  |
| **Moon Position**                 | Full     | None     | GT2 shows moon position + 24hr trajectory for EME                               |
| **Lightning Strikes**             | Full     | None     | Real-time global lightning overlay                                              |
| **Weather Radar (US NEXRAD)**     | Full     | None     | Continental US weather radar overlay                                            |
| **Solar Conditions**              | Full     | Full     | GT2 shows hamqsl.com solar widget; Propulse has SolarPulse dashboard            |
| **Band Activity Graph**           | Full     | Full     | GT2 shows PSK-based band activity; Propulse has band condition panels           |
| **Off-Air Messaging (OAMS)**      | Partial  | None     | Internet-based messaging between GT users (chat removed in v2.250809)           |
| **Real-time User Spotting**       | Full     | None     | GT users see each other on map when sharing on-air status                       |
| **POTA Integration**              | Full     | None     | POTA activation map icons, auto-spotting to pota.app                            |
| **Push Notifications**            | Full     | None     | SimplePush, Pushover integration for mobile alerts                              |
| **Audio/Visual Alerts**           | Full     | None     | TTS and sound alerts for new callsigns, grids, DXCC, CQ/ITU zones, states       |
| **Text-to-Speech**                | Full     | None     | Announces wanted stations audibly                                               |
| **HamClock Integration**          | Full     | None     | Interfaces with HamClock display                                                |
| **CAT Control (Rig)**             | Indirect | None     | GT2 controls rig through WSJT-X/ACLog, not directly                             |
| **Shack/Equipment Management**    | None     | Full     | Propulse has full equipment CRUD, signal path builder, performance analysis     |
| **3D Globe**                      | None     | Full     | Propulse uses Three.js; GT2 is 2D map only                                      |
| **Operator Rank/Gamification**    | None     | Full     | Propulse has 7-tier rank system with visual effects                             |
| **Bridge Daemon (Rig Control)**   | None     | Full     | Propulse has dedicated bridge server for hardware integration                   |
| **Profile System**                | None     | Full     | Propulse has full operator profile with achievements, social                    |
| **Mobile/Responsive**             | None     | Full     | GT2 is desktop-only (Electron); Propulse is responsive SPA                      |
| **Propagation Prediction**        | None     | Full     | Propulse has ML-based propagation modeling; GT2 shows current conditions only   |

---

## 4. Supported Modes

GridTracker2 supports all digital modes that WSJT-X/JTDX decode:

| Mode   | Supported | Notes                                     |
| ------ | --------- | ----------------------------------------- |
| FT8    | Yes       | Primary use case, most popular mode       |
| FT4    | Yes       | Contest-speed variant                     |
| JT65   | Yes       | Legacy weak-signal mode                   |
| JT9    | Yes       | Narrowband weak-signal mode               |
| JT4    | Yes       | VHF/UHF/microwave weak-signal             |
| MSK144 | Yes       | Meteor scatter                            |
| QRA64  | Yes       | EME mode                                  |
| ISCAT  | Yes       | Aircraft scatter / tropospheric scatter   |
| WSPR   | Yes       | Weak Signal Propagation Reporter          |
| FST4   | Yes       | Long-period weak signal (via WSJT-X 2.3+) |
| FST4W  | Yes       | WSPR-like for LF/MF bands                 |
| CW     | No        | Not a WSJT-X mode                         |
| SSB    | No        | Not a WSJT-X mode                         |
| PSK31  | Partial   | Shown in mode filter dropdown but limited |
| RTTY   | Partial   | Shown in mode filter dropdown but limited |

**Key limitation**: GridTracker2 is fundamentally tied to WSJT-X's digital mode ecosystem. It cannot independently decode or monitor CW, SSB, or non-WSJT-X digital modes.

---

## 5. Integration Ecosystem

### Data Sources (Input)

| Source               | Type         | Details                                                   |
| -------------------- | ------------ | --------------------------------------------------------- |
| **WSJT-X**           | UDP listener | Primary data source — decodes, QSO data, frequency, mode  |
| **JTDX**             | UDP listener | WSJT-X derivative, full support                           |
| **Local ADIF Files** | File import  | Any .adi/.adif file on disk, network, or cloud (OneDrive) |
| **PSK Reporter**     | API          | Reception reports, band activity, spot flight paths       |
| **QRZ.com**          | API          | QSO import, callsign lookup                               |
| **LoTW**             | API/Download | QSL confirmation import, user database                    |
| **ClubLog**          | API/Download | OQRS database, QSO import                                 |
| **eQSL**             | Download     | User database for eQSL membership indicators              |
| **CALLOOK**          | API          | US-only callsign lookup (default)                         |
| **HamQTH**           | API          | Callsign lookup                                           |
| **QRZCQ.com**        | API          | Callsign lookup                                           |
| **FCC ULS**          | Database DL  | US callsign database (weekly updates)                     |
| **POTA API**         | API          | Active park activations, spot data                        |
| **OAMS Network**     | WebSocket    | Real-time GridTracker/Log4OM user spotting                |

### QSO Logging Destinations (Output)

GridTracker states it can send QSO data to "QRZ.com, LoTW, and 10 other outside programs or websites." The confirmed destinations include:

| Destination              | Type       | Notes                                                |
| ------------------------ | ---------- | ---------------------------------------------------- |
| **GridTracker Internal** | Local ADIF | GridTracker_QSO.adif file                            |
| **QRZ.com**              | API        | Direct upload                                        |
| **LoTW (ARRL)**          | API/Queue  | With failed upload retry queue                       |
| **Cloudlog/Wavelog**     | API        | Web-based loggers (comprehensive fixes in 2025)      |
| **N3FJP ACLog**          | TCP/UDP    | Dedicated integration with band/mode/frequency sync  |
| **Log4OM**               | OAMS       | Via Off-Air Messaging System integration             |
| **eQSL**                 | API        | QSL confirmation upload                              |
| **HRDLog.net**           | API        | Likely (listed in Wavelog chain; not 100% confirmed) |
| **ClubLog**              | API        | QSO upload                                           |
| **DXKeeper**             | TCP        | DXLab Suite integration                              |
| **POTA (pota.app)**      | API        | Auto-spot POTA contacts when logged                  |

### Third-Party Application Integrations

| Application        | Integration Type | Notes                                                     |
| ------------------ | ---------------- | --------------------------------------------------------- |
| **HamClock**       | Network          | Sends data to HamClock display                            |
| **POTA**           | Map + API        | Map icons for activations, auto-spotting                  |
| **SimplePush**     | Push API         | Mobile push notifications                                 |
| **Pushover**       | Push API         | Mobile push notifications                                 |
| **Custom Scripts** | Shell/Python     | cr-alert.sh/bat for custom actions on Call Roster matches |

---

## 6. UI/UX Analysis

### Design Philosophy

GridTracker2 is a **dense, information-rich desktop application**. It prioritizes showing maximum data simultaneously over aesthetic minimalism. The interface consists of:

1. **Main Map View** — Full-screen interactive 2D map (OpenLayers) with 30+ base map options
2. **Control Panel** — Docked panel showing operating status, band activity graph, QSO counters, and feature toggles
3. **Call Roster** — Tabular decode view with extensive filtering, sorting, and click-to-call capability
4. **Settings Panel** — 12 tabs of configuration (General, Lookups, Audio, Map, Grids, Logging, Alerts, Call Roster, OAMS, User Logbook, Update, About)

### Map Customization

- **30+ base map layers** (default: Humanitarian OpenStreetMap)
- **Auto night map** — Switches to dark-friendly map after sunset
- **Grid opacity slider** — Controls transparency of Maidenhead grid coloring
- **Map brightness** — Adjustable base map brightness
- **Grid coloring system**: QSO (worked), QSL (confirmed), QSX (decoded), CQ (calling CQ), CQDX, QRZ (calling you), QTH (home), WSPR
- **Push-pin mode** — Replaces grid colors with location pins
- **Award layer cycling** — Toggle between CQ zones, ITU zones, continents, US states, DXCC, counties, grids

### Map Overlays

| Overlay               | Hotkey | Description                                          |
| --------------------- | ------ | ---------------------------------------------------- |
| Grayline              | N      | Day/night terminator                                 |
| PSK Spots             | O      | Reception report flight paths from PSK Reporter      |
| Heatmap               | H      | Heatmap view of spot density                         |
| Moon Position         | D      | Lunar position for EME                               |
| Moon Trajectory       | E      | 24-hour moon path                                    |
| Lightning             | Y      | Real-time global lightning strikes                   |
| US NEXRAD Radar       | 0      | Continental US weather radar                         |
| Time Zones            | 9      | Global timezone display                              |
| GT User Flags         | G      | Other online GridTracker users                       |
| Maidenhead Grids      | B/W    | 4-char and 6-char grid overlays                      |
| Award Layers          | =      | Cycle through CQ/ITU/continents/states/DXCC/counties |
| Active Path Animation | A      | Animated QSO paths                                   |
| Spot Flight Paths     | F      | Visual spot propagation paths                        |

### Keyboard Shortcuts

GridTracker2 has an extensive hotkey system (accessible via F1):

- **26 letter keys** (A-Z) for feature toggles
- **Number keys** (0-9, =) for map layers
- **F5-F10** (+ Shift) for 6 saveable map positions
- **F11** fullscreen, **F12** sidebar toggle

### Strengths

- Extremely feature-rich for WSJT-X operators
- Highly customizable map with dozens of overlays
- Call Roster is a powerful filtered decode view with direct TX control
- Keyboard-driven workflow with comprehensive hotkeys
- Excellent award tracking visualization

### Weaknesses

- **Desktop-only** — No mobile, no responsive design, no web version
- **Dense/overwhelming UI** — Steep learning curve for new users
- **2D map only** — No 3D globe visualization
- **Electron overhead** — Relatively heavy resource usage for a companion app
- **WSJT-X dependency** — Core features require WSJT-X/JTDX running
- **No modern design language** — Functional but dated-looking compared to modern web apps

---

## 7. Platform Support

| Platform         | Status      | Notes                                               |
| ---------------- | ----------- | --------------------------------------------------- |
| Windows 10       | Supported   | Primary platform, EXE installer, Chocolatey package |
| Windows 11       | Supported   | Full support                                        |
| macOS 13 Ventura | Supported   | Intel and Apple Silicon (ARM)                       |
| macOS 14 Sonoma  | Supported   | Full support                                        |
| macOS 15 Sequoia | Supported   | Full support                                        |
| Linux x86_64     | Supported   | 64-bit distributions, Homebrew cask available       |
| Linux ARM 32-bit | Supported   | Raspberry Pi (legacy)                               |
| Linux ARM 64-bit | Supported   | Raspberry Pi 5 Debian, Odroid                       |
| Windows 7/8      | Unsupported | EOL OS, may work but no bug fixes guaranteed        |
| macOS < 13       | Unsupported | EOL OS                                              |
| iOS / Android    | None        | No mobile version                                   |
| Web browser      | None        | Desktop Electron app only                           |

**Minimum hardware**: Any recent x86 (32 or 64-bit) PC or ARM system. Monitor minimum 1024x780. Dual monitors recommended for simultaneous WSJT-X + GridTracker operation.

---

## 8. Version History & Development Trajectory

### GridTracker v1 (2018-2024) — NW.js Era

GridTracker originated in 2018 as a NW.js application. Major milestones in v1:

- v1.18 (2019): Early releases, basic map functionality
- v1.21-v1.23 (2021-2023): Matured feature set, OAMS messaging, POTA integration
- v1.24 (2024): Final NW.js versions, QSL authority management, Canadian provinces

### GridTracker2 (2024-present) — Electron Era

GitLab repo created September 2024. Description: "Now with Electron!"

- **v2.250101** (Jan 2025): First major v2 release
- **v2.250507** (May 2025): Wavelog/Cloudlog fixes
- **v2.250809** (Aug 2025): Removed OAMS Chat (performance issues), fixed mouse stutter
- **v2.250820** (Aug 2025): OpenLayers 10.6.0 upgrade, 5-year-old ADIF Unicode bug fixed
- **v2.250831** (Aug 2025): Reverted OpenLayers to 10.1.0 (Windows compat issues)
- **v2.250901** (Sept 2025): US Weather Radar restored after NOAA service change
- **v2.250914** (Sept 2025): Latest — Electron 35.7.5, UTF-8 improvements

**Pattern**: Frequent releases addressing compatibility issues, library updates, and bug fixes. The v1→v2 migration to Electron was a major rewrite effort.

---

## 9. Community Feedback Summary

### What Users Love

1. **Visual mapping excellence** — "Visually excels by presenting live maps of band activity" ([FlexRadio Community](https://community.flexradio.com/discussion/8026463/gridtracker-alternative))
2. **Easy setup** — "Took less than a minute to setup" ([K9ZW blog](https://k9zw.wordpress.com/2023/05/20/gridtracker-add-on-to-your-ft8-setup/))
3. **Makes FT8 engaging** — "Making FT8 Fun Again" is a recurring theme ([KE2YK review](https://ke2yk.com/2024/04/22/making-ft8-fun-again-with-gridtracker/))
4. **Award tracking visualization** — DXCC, WAS, VUCC progress visible at a glance on map
5. **Free and open source** — No cost barrier, BSD license
6. **POTA integration** — Popular among Parks On The Air operators
7. **Call Roster click-to-call** — Streamlines the QSO workflow with WSJT-X
8. **Cross-platform** — Including Raspberry Pi support for field/portable setups
9. **PSK Reporter integration** — Band activity graphs and spot visualization

### What Users Dislike / Complain About

1. **Cannot run simultaneously with JTAlert** — UDP port conflict unless using multicast ([Groups.io](https://groups.io/g/GridTrackerApp/topic/jtalert_and_gridtracker/76394312))
2. **Call Roster reliability** — "Call Roster feature wasn't functioning properly" reported ([FlexRadio Community](https://community.flexradio.com/discussion/8026463/gridtracker-alternative))
3. **OAMS chat removed** — Performance issues forced removal of chat feature in v2.250809
4. **Mouse stutter / system slowing** — Reported and fixed in v2.250809 but was a significant issue
5. **Windows compatibility regressions** — OpenLayers upgrades breaking Windows, installer issues
6. **Wavelog upload failures** — ~1 in 10-20 QSOs fail to upload ([Wavelog GitHub #1603](https://github.com/wavelog/wavelog/issues/1603))
7. **Documentation gaps** — Manual pages reported as empty/incomplete in some areas
8. **Steep learning curve** — Feature density can be overwhelming for newcomers
9. **Electron resource consumption** — Desktop companion app that's relatively heavy
10. **WSJT-X dependency** — Nearly useless without WSJT-X/JTDX running

### Feature Requests / Wish List (from community)

- Bidirectional UDP relay (initiate QSOs from other software via GT)
- Column reordering in Call Roster (acknowledged as "in the works")
- Better multicast UDP support documentation
- Lighter resource footprint
- Web/mobile version

---

## 10. Known Issues & Limitations

| Issue                            | Severity | Status                                                    |
| -------------------------------- | -------- | --------------------------------------------------------- |
| ADIF malformed content rejection | Medium   | Fixed — previously rejected entire file on one bad record |
| OpenLayers Windows compat        | High     | Mitigated — reverted to v10.1.0                           |
| OAMS chat causing lag            | High     | Fixed — chat removed entirely in v2.250809                |
| Mouse stutter / system slowing   | High     | Fixed in v2.250809                                        |
| Wavelog intermittent upload fail | Medium   | Partially addressed in v2.250507, issue closed as stale   |
| PSK spots disappearing           | Low      | User error — accidental filter; documented in FAQ         |
| Windows 7 support dropped        | Low      | Policy — EOL OS not supported                             |
| Column reorder not available     | Low      | Planned — acknowledged as coming feature                  |
| ADIF Unicode field length bug    | Medium   | Fixed in v2.250820 (was 5-year-old bug)                   |

---

## 11. Competitive Positioning vs. Propulse

### Where GridTracker2 Excels Over Propulse

| Advantage                         | Impact | Propulse Response Needed?                               |
| --------------------------------- | ------ | ------------------------------------------------------- |
| WSJT-X native integration         | High   | Bridge daemon could relay WSJT-X UDP in future          |
| Click-to-call TX control          | High   | Requires bridge + WSJT-X relay architecture             |
| Award tracking (DXCC/WAS/VUCC)    | High   | QSO logging exists; award tracking is natural extension |
| Call Roster with filtering        | High   | Could be built as decode/spot viewer panel              |
| 14+ data source integrations      | High   | Propulse has fewer external data integrations currently |
| Callsign lookup (4 services)      | Medium | Could add to QSO logging workflow                       |
| POTA integration                  | Medium | Growing activity program; good partnership opportunity  |
| Audio/TTS alerts                  | Medium | Could add to spot watch or notification system          |
| Push notifications                | Medium | Mobile push could enhance bridge notifications          |
| Offline field operation mode      | Medium | Propulse has offline QSO logging; could expand          |
| PSK spot flight paths & heatmap   | Medium | Could add to globe overlays                             |
| Lightning / weather radar overlay | Low    | Nice-to-have environmental overlays                     |
| Moon position / trajectory        | Low    | Useful for EME operators                                |

### Where Propulse Excels Over GridTracker2

| Advantage                        | Impact | GT2 Likely to Add?                                     |
| -------------------------------- | ------ | ------------------------------------------------------ |
| 3D globe visualization           | High   | Unlikely — fundamental architecture difference         |
| Modern web-based UI              | High   | No — Electron desktop is their chosen path             |
| Mobile/responsive design         | High   | No — desktop-only philosophy                           |
| Full QSO logging system          | High   | No — explicitly not a logging program                  |
| Equipment/shack management       | High   | No — outside their scope                               |
| ML propagation prediction        | High   | No — they show conditions, don't predict               |
| Operator rank/gamification       | Medium | No — not in their roadmap                              |
| Bridge daemon (hardware control) | Medium | No — they rely on WSJT-X for rig control               |
| Profile system w/ achievements   | Medium | No — social features limited to OAMS                   |
| Real-time solar dashboard        | Medium | They show solar widget; Propulse has richer solar data |
| Station performance analysis     | Medium | No — not in scope                                      |
| Signal path builder              | Low    | No — not in scope                                      |

### Overlap / Direct Competition

| Area                 | GT2 Approach              | Propulse Approach                 |
| -------------------- | ------------------------- | --------------------------------- |
| World map with spots | 2D OpenLayers, grid-color | 3D Three.js globe, overlay layers |
| Band conditions      | PSK Reporter bar chart    | ML-enhanced band panels           |
| Solar conditions     | hamqsl.com widget embed   | Full SolarPulse dashboard         |
| Spot data            | PSK + DX Cluster + OAMS   | DX Cluster + PSKReporter          |
| Grayline             | 2D terminator overlay     | 3D globe grayline                 |
| Offline operation    | Toggle in control panel   | IndexedDB-first architecture      |

---

## 12. Strategic Implications for Propulse

### Threat Level: **Low-Medium**

GridTracker2 is a **different product category** than Propulse. GT2 is a WSJT-X companion tool focused on the FT8/digital mode operating experience — it makes the act of making FT8 QSOs more visual and efficient. Propulse is a propagation intelligence dashboard that spans all modes and integrates equipment management, prediction, and logging.

**The primary overlap is in the "ham operator wanting a visual map of activity" use case.** However:

- GT2 users need WSJT-X running — it's a **session companion**
- Propulse users check propagation conditions — it's a **planning/analysis tool**
- GT2 is desktop-only; Propulse is web-first
- GT2 has zero mobile story; Propulse is mobile-friendly

### Key Takeaways

1. **Award tracking is table stakes** — GT2's DXCC/WAS/VUCC tracking on the map is a beloved feature. Propulse should add award progress tracking as a natural extension of the QSO logging system.

2. **Call Roster / Decode View is a killer feature** — The ability to see filtered decodes and click-to-call is GT2's strongest workflow feature. If Propulse ever gets WSJT-X bridge support, a decode roster would be very high value.

3. **POTA integration matters** — POTA is one of the fastest-growing ham radio activities. GT2's tight POTA integration (map icons, auto-spotting) is a differentiator worth monitoring.

4. **PSK Reporter visualization** — GT2's spot flight paths and heatmap are compelling. Propulse could add similar visualizations to the 3D globe.

5. **Don't compete on GT2's turf** — Propulse should not try to become a WSJT-X companion. Instead, focus on the unique value proposition: modern web UI, 3D globe, ML prediction, equipment management, and mobile support. These are areas where GT2 will never compete.

6. **Callsign lookup integration** — A simple but high-value feature for the QSO logging workflow. Adding CALLOOK/QRZ/HamQTH lookup would enhance Propulse's logging.

7. **Propulse's moat** — Modern tech stack (React/Three.js/Zustand), mobile-first design, ML propagation model, gamification, and equipment management are all areas GT2 cannot or will not enter. The moat is real and growing.

---

## 13. Sources

- [GridTracker.org — Home](https://gridtracker.org/)
- [GridTracker2 Documentation — What Is GridTracker2?](https://docs.gridtracker.org/latest/Introduction/What-is-GridTracker.html)
- [GridTracker2 Documentation — System Requirements](https://docs.gridtracker.org/latest/Introduction/System-Requirements.html)
- [GridTracker2 Documentation — Getting Started](https://docs.gridtracker.org/latest/Getting-Started.html)
- [GridTracker2 Documentation — Control Panel](https://docs.gridtracker.org/latest/GridTracker-Overview/Control-Panel.html)
- [GridTracker2 Documentation — Settings](https://docs.gridtracker.org/latest/GridTracker-Overview/Settings-Sub-Menus.html)
- [GridTracker2 Documentation — Call Roster](https://docs.gridtracker.org/latest/Making-GridTracker-Work-For-You/Using-Call-Roster.html)
- [GridTracker2 Documentation — Logging Options](https://docs.gridtracker.org/latest/Making-GridTracker-Work-For-You/GridTracker-Logging-Options-and-Functions.html)
- [GridTracker2 Documentation — Hotkeys](https://docs.gridtracker.org/latest/Appendices/Appendix-C-Hotkeys.html)
- [GridTracker2 Documentation — WSJT-X Configuration](https://docs.gridtracker.org/latest/Appendices/Appendix-B-Configuring-WSJT-X-and-JTDX-for-GridTracker.html)
- [GridTracker2 Documentation — FAQ/Troubleshooting](https://docs.gridtracker.org/latest/FAQ-Troubleshooting.html)
- [GridTracker2 Documentation — POTA Integration](https://docs.gridtracker.org/latest/Third-Party-Integrations/GridTracker2-and-Parks-On-The-Air.html)
- [GridTracker2 Documentation — N3FJP ACLog Integration](https://docs.gridtracker.org/latest/Third-Party-Integrations/N3FJP-AC-Log-Integration.html)
- [GridTracker2 Documentation — License](https://docs.gridtracker.org/latest/License-Agreement-and-Copyright.html)
- [GridTracker2 — GitLab Repository](https://gitlab.com/gridtracker.org/gridtracker2)
- [GridTracker — Change Log](https://gridtracker.org/index.php/documentation/change-log)
- [GridTracker — eHam Reviews](https://www.eham.net/reviews/view-product?id=14380)
- [GridTracker — Chocolatey Package](https://community.chocolatey.org/packages/gridtracker)
- [GridTracker — Homebrew Cask](https://formulae.brew.sh/cask/gridtracker2)
- [FlexRadio Community — GridTracker Alternative Discussion](https://community.flexradio.com/discussion/8026463/gridtracker-alternative)
- [KE2YK — Making FT8 Fun Again with GridTracker](https://ke2yk.com/2024/04/22/making-ft8-fun-again-with-gridtracker/)
- [K9ZW — GridTracker Add-On to FT8 Setup](https://k9zw.wordpress.com/2023/05/20/gridtracker-add-on-to-your-ft8-setup/)
- [K0PIR — GridTracker, WSJT-X and Log4OM](https://k0pir.us/gridtracker-wsjt-x-and-log4om/)
- [RTL-SDR — GridTracker: A WSJT-X Mapping Program](https://www.rtl-sdr.com/gridtracker-wsjt-x-mapping-program/)
- [Mac Ham Radio — GridTracker Releases](https://machamradio.com/blog/category/gridtracker/)
- [Groups.io — GridTrackerApp](https://groups.io/g/GridTrackerApp/topics)
- [Wavelog GitHub — GridTracker2 Upload Issue #1603](https://github.com/wavelog/wavelog/issues/1603)
- [Jim Kerkhoff — WSJT-X and GridTracker for Great FT8](https://jimkerkhoff.com/2024/03/13/wsjt-x-and-gridtracker-for-great-ft8/)
- [VK3FS — WSJT-X GridTracker Night Screens Setup](https://3fs.net.au/amateur-radio/digital-amateur-radio-dmr/wsjt-x-gridtracker-night-screens-setup/)
