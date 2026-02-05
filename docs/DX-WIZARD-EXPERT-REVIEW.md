# DX Wizard / Propulse -- Expert Review & Recommendations

_From the desk of someone who's been chasing DXCC entities since before the internet existed, who's sat in the chair at 0300Z watching gray line roll across the Pacific, and who's debugged more propagation predictions than most people have made QSOs._

---

First, let me say: **this is genuinely impressive work.** The ionospheric modeling chain (NOAA -> f0F2/D-layer -> signal path loss -> SNR prediction -> band recommendations) is more sophisticated than what most commercial tools offer. The PropSphere page alone -- with three map projections, time machine, path analysis, NVIS, gray line, aurora overlay, and MUF grid -- would have been a standalone product 10 years ago. The contest engine supporting 18 contests with proper per-band multiplier tracking, Cabrillo export, and dupe checking is solid groundwork.

That said, I've spent 45 years finding the gap between "good tool" and "tool I can't live without." Here's what would close that gap.

---

## CONCRETE FEATURE IMPROVEMENTS

### 1. Real DX Cluster Integration (Critical)

Your `dxcluster.ts` is entirely simulated -- `generateDemoSpots()` with fake latency. This is the single biggest gap. Every serious DXer's workflow starts with the cluster. You need a backend WebSocket relay to at least one DX Spider or AR-Cluster node (VE7CC, DX Summit, or your own). The PSKReporter and RBN proxies prove you can do this. Without live cluster spots, the entire DX Spot List, Watch system, and "Needed Only" filter are toys.

### 2. Spot-Model Correlation Engine

You have two completely independent data pipelines: (1) propagation predictions from your ionospheric model and (2) live spot data from PSKReporter/RBN. These never talk to each other. Build a correlation engine that validates model predictions against actual reported spots. When your model says 15m is "closed" to JA but PSKReporter shows 47 FT8 decodes on 21.074, surface that discrepancy. Conversely, when your model says 20m is "excellent" but zero spots exist, flag it. This is how you build trust in predictions AND catch sporadic E openings your model can't predict.

### 3. Sporadic E Layer Detection & Prediction

Your ionosphere model has zero sporadic E support -- and this is the single most exciting propagation mode for 6m and 10m operators. At minimum: (a) detect Es openings from live spot clustering (sudden burst of 50 MHz or 28 MHz spots from a geographic region), (b) display estimated Es cloud location on the map, (c) alert users when Es is detected on their path. MUF jumps from 7 MHz to 70+ MHz during Es events -- your model currently has no way to represent this.

### 4. WSJT-X / JTDX UDP Integration

WSJT-X broadcasts decoded spots on UDP port 2237 using a well-documented protocol. A lightweight bridge (Electron/Tauri sidecar, or a companion app) that receives these UDP datagrams and feeds them into your spot pipeline would be transformative. You'd get: real-time decoded callsigns with SNR, automatic band/mode detection, and the ability to highlight "heard but not spotted" stations. This is how every modern DX tool works -- N1MM, JTDX, GridTracker all consume this feed.

### 5. CAT Control / Rig Integration

Your contest page has a comment on line 49: "Band and mode state will be CAT-driven in Phase 7." Make this happen. Via a companion service (flrig, rigctld/Hamlib, or direct serial over WebSerial API), you can: auto-detect current band/mode, auto-tune to spotted frequencies, and sync the contest logger's band/mode with the radio. Without CAT, operators have to manually select band/mode for every QSO -- that's a non-starter for serious contest operation. The WebSerial API now works in Chromium browsers, making this feasible without an external daemon.

### 6. LoTW / Club Log / eQSL Actual Integration

You store service credentials in `userStore` (in-memory only, which is correct for security), but there are zero API calls to these services. Implement: (a) LoTW ADIF upload via their HTTPS endpoint with TQ8 digital signature, (b) Club Log real-time upload (they have a simple POST API), (c) eQSL upload. More importantly: implement **download** from LoTW to check QSL status and automatically mark confirmed entities. This feeds directly into awards tracking. Every DXer checks LoTW confirmations daily.

### 7. DXCC / Awards Tracking with Worked-Before Intelligence

You have an `AwardsTracker` component but the underlying data model is thin. Build a proper DXCC entity database (all 340 entities, not the 57 hardcoded in `strategy.ts`). Cross-reference against the logbook to show: entities worked, entities confirmed (via LoTW sync), entities needed, entities needed on specific bands/modes. Then integrate this into the spot display -- color-code spots by "new entity," "new band-entity," "new mode-entity," "already confirmed." This is the #1 feature that separates casual operators from DXCC chasers.

### 8. Geomagnetic Latitude Calculations

Your entire ionospheric model uses geographic latitude. This matters enormously for D-layer absorption, auroral zone proximity, and polar path degradation. The geomagnetic equator is offset ~11.5 degrees from geographic, and stations near the geomagnetic poles (like Scandinavian and northern Canadian stations) experience dramatically different propagation than geographic latitude alone would predict. Use the IGRF (International Geomagnetic Reference Field) dipole model -- it's a straightforward coordinate transform that would improve every prediction.

### 9. Frequency-Dependent External Noise Model

Your `signal.ts` uses a fixed 15 dB external noise figure across all HF bands. Real-world HF noise varies from ~40 dB at 1.8 MHz to ~8 dB at 30 MHz (ITU-R P.372, "quiet rural" curve). This means your 160m SNR predictions are optimistic by 25 dB and your 10m predictions are pessimistic by ~7 dB. Implement the ITU-R P.372 noise model with at least the four standard environment curves (city, residential, rural, quiet rural) and let users select their noise environment. This single change would dramatically improve the accuracy of your band recommendations.

### 10. Antenna Modeling & Pattern Integration

Your signal model uses isotropic gain (a scalar `antennaGainDbi`). No real antenna is isotropic. At minimum, support: (a) a library of common antenna radiation patterns (dipole, vertical, Yagi, hex beam) with elevation angle characteristics, (b) NVIS vs. DX takeoff angle differentiation (NVIS antennas need 70-90 degree patterns; DX antennas need 5-20 degrees), (c) directional gain for beam antennas toward the target azimuth. This would make the DX Wizard's power recommendations actually useful -- currently telling someone with a low dipole to try 10m DX is misleading because their antenna has no gain at the 5-degree takeoff angles that band requires.

### 11. Multi-Hop Ray Tracing

Your path loss model uses midpoint-only ionospheric parameters. For multi-hop paths (e.g., 160m from W6 to ZL, which is 4-5 hops), the ionospheric conditions at each reflection point matter independently. Implement a simplified ray-trace that: calculates each hop's reflection point along the great circle, evaluates f0F2 and absorption at each point, and sums the per-hop losses. This is standard practice in VOACAP/ICEPAC and would significantly improve long-path predictions.

### 12. Contest Database Expansion

18 contests is a start, but serious contesters need: WAE DX (with its unique QTC system), JIDX, All Asian DX, Oceania DX, IOTA (island-based multipliers), ARRL VHF (grid-square multipliers with rover support), CQ WW VHF, Stew Perry Top Band (distance-based scoring -- your stub!), Sprint (name exchange, QSY rule), NAQP RTTY, State QSO Parties (at least the major ones: CA, TX, PA, FL, OH). Each has unique exchange formats, scoring quirks, and multiplier rules that your contest engine architecture already supports.

### 13. External SCP Database Support

Your `scp.ts` only uses session history for partial callsign matching. Import the standard MASTER.SCP file (maintained by supercheckpartial.com, ~60,000 active contest callsigns) and the CT/NA history files. In a pileup, the difference between typing "W7" and instantly seeing "W7AB W7AV W7BE W7BQ..." vs. having no suggestions is the difference between winning and losing rate. This is a solved problem -- just load the file.

### 14. Gray Line Propagation Enhancement Quantification

Your `grayline.ts` identifies the geometric zone but doesn't quantify the propagation enhancement. During gray line, D-layer absorption drops to near-zero while F-layer ionization persists -- this creates a ~10-20 dB improvement on 160m and 80m for about 20-30 minutes. Model this as a time-varying absorption reduction in your signal path, and surface it in the band recommendations: "160m to VK is marginal now, but in 47 minutes gray line enhances the path by ~15 dB. Set your alarm."

### 15. Satellite Doppler & Uplink/Downlink Frequency Management

Your satellite tracker calculates orbits and pass predictions but has no Doppler compensation or frequency management. For linear transponder satellites (RS-44, QO-100, CAS-4A/B), operators need real-time Doppler-corrected uplink/downlink frequencies. Store each satellite's transponder passband data (uplink range, downlink range, inverted/non-inverted) and compute instantaneous Doppler shift from the range-rate. Display the corrected frequency pair so operators can tune accurately.

### 16. Propagation Mode Identification (F2, Es, TEP, NVIS)

Your model assumes F2 propagation for everything. Build a propagation mode classifier that, given the path geometry, time, and conditions, identifies the likely propagation mechanism: F2 single/multi-hop, sporadic E, trans-equatorial propagation (TEP), NVIS, gray line, long path, skewed path, or backscatter. Display this on the path analysis panel. Operators make fundamentally different decisions based on the propagation mode -- TEP has specific frequency preferences, Es is fleeting, long path has specific time windows.

### 17. Contest Rate Optimization & Band-Change Advisor

Your contest strategy engine ranks multiplier targets but doesn't advise on band changes for rate optimization. Build an advisor that monitors: (a) current run rate vs. historical rate on this band, (b) spot density trends on other bands, (c) propagation predictions for the next 1-2 hours, and recommends: "Rate has dropped below 40/hr on 20m. 15m opening to EU predicted in 22 minutes based on SFI trend. Consider QSY." This is what experienced multi-op teams do mentally; automate it.

### 18. Bearing/Distance Overlay with Antenna Rotor Integration

Your map shows great circle paths, but competitive DXers need: (a) bearing and distance readout for any point on the map, (b) integration with antenna rotor controllers (via rotctld/Hamlib) to auto-point beams at spotted DX, (c) long-path vs. short-path bearing comparison with propagation quality for each. When a rare DX spot appears, the winning station is the one whose beam is already pointed the right direction.

### 19. Historical Propagation Pattern Database

Build a database of historical propagation patterns indexed by SFI range, season, and solar cycle phase. When SFI is 150 in October, show what bands were open to what regions during previous cycles at similar conditions (using decades of solar cycle data from NOAA archives). Experienced operators carry this knowledge in their heads; new operators don't. "At this SFI level, 12m typically opens to Asia by 1400Z in autumn" is the kind of insight that comes from 30 years of experience -- or a good database.

### 20. Real-Time Propagation Heatmap from Spot Data

You have the map, you have spot data (once real cluster is integrated), you have the math. Generate a real-time MUF/propagation heatmap derived from actual reported contacts, not just your ionospheric model. If 50 FT8 spots are being reported between EU and NA on 21 MHz, that's empirical evidence that the MUF on those paths exceeds 21 MHz. Overlay this "observed MUF" on the map alongside your modeled MUF. Where they diverge is where the interesting propagation is happening.

### 21. QSO Scheduling & DX Sked Integration

For rare DX (VP8, 3Y, etc.), operators often arrange skeds via email or DX cluster. Add a sked scheduler: pick a target callsign, propose time/band/mode, and the system recommends optimal windows based on propagation predictions for the specific path. Store scheduled skeds and alert when the window approaches. Integrate with the ON4KST chat system or DXHeat API for real-time sked coordination.

### 22. Terrain-Aware Path Analysis

Your signal model uses "mixed" terrain type for all paths. Using a low-resolution terrain/land-water database (even just coastline polygons), classify each ground-reflection point as sea, land, or coastal. Sea paths (e.g., east coast US to EU) have 1 dB per-hop loss vs. 3 dB for all-land paths. This 2 dB per hop difference is 6-10 dB over a typical transatlantic path -- the difference between a solid QSO and not hearing them.

### 23. Band Scope / Waterfall Integration

If WSJT-X integration happens (recommendation #4), display a visual representation of activity across the FT8/FT4 sub-bands showing decode density, SNR distribution, and new-entity highlights. Think of a simplified waterfall that shows "the band is alive here" without requiring the full SDR waterfall. This gives operators instant situational awareness of band activity that spot lists alone can't convey.

---

## QUALITY OF LIFE IMPROVEMENTS

### 1. Keyboard-First DX Spot Interaction

The spot list requires mouse interaction. Add keyboard navigation: arrow keys to scroll spots, Enter to tune (with CAT), `W` to add a watch for the spotted entity, `N` to mark as "needed," `B` to show bearing on map. Contest operators and DXers live on the keyboard -- every mouse movement is lost time.

### 2. Persistent Service Credentials with Encryption

Service credentials (LoTW, Club Log, eQSL, QRZ) are in-memory only and must be re-entered every session. Use the Web Crypto API to encrypt credentials with a user-provided passphrase and store them in IndexedDB. Prompt for the passphrase once per session. Re-entering credentials every time the app loads is a dealbreaker for daily use.

### 3. Spot Age Decay Visualization

You have `spotAgePrefs` in the user store but the visual implementation could go further. Implement progressive opacity fade on the map pins -- fresh spots (< 2 min) are fully opaque and bright, aging spots (5-10 min) become translucent, stale spots (> 15 min) are nearly invisible. The eye should be drawn to what's happening _now_, not 25 minutes ago. The same principle applies to the spot list -- stale spots should visually recede.

### 4. One-Click "Work This Station" Flow

When a user sees an interesting spot, they should be able to click it and get: bearing to station, propagation assessment for that specific path, suggested TX power, nearby alternative frequencies if the spotted frequency is busy, and (with CAT) auto-QSY. Currently the user has to: click the spot, read the details, mentally switch to the DX Wizard, re-enter the target... that's too many steps. Collapse it to one click.

### 5. Smart Notifications with Quiet Hours

Your alert system fires notifications but has no concept of quiet hours or notification batching. Add: (a) quiet hours schedule (e.g., 0200-0600 local, no audio alerts), (b) notification batching (if 15 entities open on 10m simultaneously, send one summary notification, not 15), (c) priority escalation (a new DXCC entity breaks through quiet hours; a band opening does not).

### 6. Contest Timer & Off-Time Tracker

For 48-hour contests with mandatory off-time rules (CQ WW single-op must be off for 6 of 48 hours), add: visible countdown timer, off-time accumulator, warning when approaching minimum off-time threshold, and "you need to take X more hours off before the contest ends" advisory. Getting disqualified for off-time violations after 40 hours of operating is devastating.

### 7. Spot Source Quality Indicators

Not all spots are created equal. RBN spots are machine-generated (high confidence, CW/RTTY only). PSKReporter spots are automated decode reports (high confidence, digital modes). DX Cluster spots are human-posted (variable quality, may be busted calls). Display a source-quality indicator on each spot and let users filter by confidence level. Experienced operators know this instinctively; surface it for everyone.

### 8. Map Pin Clustering at Low Zoom

When zoomed out on the globe with 200 spots displayed, the map becomes a mess of overlapping pins. Implement spot clustering at low zoom levels -- group nearby spots into numbered clusters that expand on zoom/click. Standard approach (Leaflet.markercluster, Mapbox clustering) but critical for usability. Show cluster color based on highest-priority spot within (new entity > new band > worked).

### 9. Solar Cycle Context on Dashboards

Your SolarPulse page shows current conditions but doesn't contextualize them in the solar cycle. Add: (a) current position in Solar Cycle 25 (we're near the peak as of 2025-2026), (b) comparison to previous cycle peaks, (c) trend direction indicator (rising/plateau/declining). "SFI is 180" means nothing without context; "SFI is 180, near the Cycle 25 peak and 15% higher than Cycle 24 peak" tells a story.

### 10. Propagation Forecast Confidence Intervals

Your band condition forecasts show a single status per band per hour. Add confidence bands -- "20m to EU at 1400Z: Good (85% confidence)" vs. "20m to EU at 0200Z: Fair (35% confidence)." Confidence should drop near sunrise/sunset (rapid ionospheric changes), during geomagnetic storms (Kp > 4), and for longer paths. This helps operators decide whether to commit to a band or hedge their bets.

### 11. Customizable Dashboard Layout

PropSphere is feature-dense but the panel layout is fixed. Let users drag-resize and rearrange panels. A contest operator wants the spot list maximized and solar data minimized. A propagation researcher wants the band forecast and path analysis front-and-center. A satellite operator wants the pass prediction table prominent. One layout doesn't serve all these users.

### 12. Import Log from N1MM / Log4OM / Other Loggers

You support ADIF import, which is good. But add specific import profiles for common logging programs (N1MM+, Log4OM, DXLog, etc.) that handle their ADIF quirks -- field naming variations, mode capitalization differences, non-standard fields. Also support direct `.mdb` or `.sqlite` import from N1MM's database format, since many operators have years of logs there and ADIF export loses some metadata.

### 13. Mobile-Responsive Contest View

Your contest page uses fixed layouts that don't work well on tablets. Field Day operators often use tablets in the field. Build a responsive contest entry view: large touch-friendly buttons for band/mode, oversized callsign input field, and a simplified scoreboard that works on a 10" screen. Field Day is the most widely participated contest in the US -- don't leave those operators behind.

### 14. Propagation Alert: "Band Just Opened"

Detect the moment a band opens to a region by monitoring spot density changes. When 10m has had zero spots to Asia for 3 hours and suddenly 5 appear in 2 minutes, fire a high-priority alert: "10m just opened to JA." This is the alert every DXer wants. Currently your watch system monitors for specific callsigns/grids/entities, but band-opening detection requires aggregate pattern recognition across all spots.

---

_73 de Expert Review. Now go build the tool I wish I'd had in 1985._
