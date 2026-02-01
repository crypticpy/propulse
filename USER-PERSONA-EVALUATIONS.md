# Propulse User Persona Evaluations

## Document Overview

This document contains detailed evaluations of the Propulse ham radio toolset from five distinct user perspectives. Each persona represents a different segment of the amateur radio community, from beginners to world-class experts. These evaluations identify what works well, what's missing, and priority improvements for each user type.

---

## Persona 1: "New Nick" — The Beginner

### Profile Summary

- **License Class:** Technician (recently upgraded to General)
- **Experience:** 6 months
- **Equipment:** Entry-level HF transceiver (Icom IC-7300), wire dipole antenna
- **Primary Interest:** Learning HF, making first DX contacts
- **Technical Comfort:** Moderate with computers, minimal with RF theory

### What Nick Would Love

1. **The Visual Design**
   "Wow, this actually looks like software from this decade! Most ham radio tools look like they were designed for Windows 3.1. The dark theme is easy on the eyes and the color-coding makes sense immediately."

2. **Solar Pulse Dashboard Simplicity**
   The primary metrics panel with its colored indicators is exactly what Nick needs. Green = good, red = bad. He doesn't need to understand why SFI 145 is good; he just needs to know it IS good.

3. **Band Conditions Display**
   The Day/Night band conditions table with "Best For" descriptions is perfect. "Night DX, regional" and "Daytime DX" tell Nick when to try different bands without needing a PhD in ionospheric physics.

4. **PropSphere Globe View**
   The 3D globe with day/night terminator is stunning and immediately understandable. Nick can visualize what he's been reading about in the ARRL Handbook.

5. **Contextual Help System**
   The help buttons and tooltips explaining what K-index and SFI mean are exactly what beginners need. No other ham tool has ever explained these things in plain language.

### What Frustrates Nick

1. **Information Overload on PropSphere**
   "There are too many panels, buttons, and options. I just want to know if I can work Japan tonight. The layer toggles, presets, and three different map views are overwhelming. I don't know what 'Azimuthal' means."

2. **No Guided Onboarding**
   "When I first loaded the app, I had no idea what to do. There was no 'Getting Started' or 'Set Up Your Station' wizard. I had to hunt for the settings gear to enter my callsign."

3. **Missing Educational Content**
   The PRD mentions a `/learn` section with propagation guides and interactive glossary, but these haven't been implemented. Nick desperately needs "Propagation 101" and "Your First DX Contact" tutorials.

4. **Target Selection Confusion**
   "I clicked on the map and got a grid square like FN31xx. What does that mean? Where is that? I want to click and see 'Boston, Massachusetts' not cryptic codes."

5. **No Beginner Mode**
   The PRD's progressive disclosure strategy describes "Beginner Mode" with simplified views, but currently everyone sees the same complex interface. Nick needs a toggle to hide advanced features.

### Feature Requests from Nick

1. **"Is It Open?" Quick Answer**
   A single, prominent indicator: "Can I make contacts right now? YES/NO" with one recommended action: "Try 20m FT8 to Europe."

2. **Onboarding Wizard**
   Step-by-step setup: Enter callsign → Set location → Choose experience level → Get personalized dashboard.

3. **Reverse Geocoding for Targets**
   When clicking the map, show city/country name, not just grid squares. "Tokyo, Japan (PM95)" instead of just "PM95vq".

4. **Band Recommendations Without Target**
   "What bands are open RIGHT NOW from my location?" without needing to select a target first.

5. **Beginner Mode Toggle**
   Hide: MUF contours, aurora overlay, frequency limits (MUF/LUF/FOT), NVIS analysis, DX Cluster until comfortable.

### UI/UX Pain Points

- **Cognitive Load:** The PropSphere page has 15+ interactive elements visible at once
- **Jargon:** Terms like "FOT," "HPF," "F-layer hops" appear without explanation
- **Mobile Experience:** On phone, the tabbed interface is cramped; beginners often use phones
- **Settings Discovery:** No obvious way to change units (metric/imperial) or time format
- **Error States:** When solar data fails to load, there's no friendly "What's happening" message

### Priority Ranking (Nick's View)

| Priority | Feature/Fix                      | Reason                                           |
| -------- | -------------------------------- | ------------------------------------------------ |
| 1        | Onboarding wizard                | Can't use the app without initial setup guidance |
| 2        | Beginner mode toggle             | Too much complexity kills engagement             |
| 3        | "What's open now?" quick summary | Core question for beginners                      |
| 4        | Educational content (/learn)     | Need to understand what I'm seeing               |
| 5        | City names on targets            | Grid squares are meaningless to newbies          |

### Nick's Summary Quote

> "Propulse is the most beautiful ham radio app I've ever seen. For the first time, I feel like I'm using modern software, not something from 1995. But I need training wheels — right now it's like handing me the keys to a fighter jet when I just got my driver's license. Add a beginner mode and some tutorials, and this could be the app that finally gets me on HF."

---

## Persona 2: "DX Diana" — The Casual DXer

### Profile Summary

- **License Class:** Extra
- **Experience:** 4 years
- **Equipment:** Yaesu FTDX10, tri-band beam at 45 feet
- **Primary Interest:** DXCC progress (currently 187/340), weekend DXing
- **Modes:** Primarily FT8, some SSB
- **Operating Pattern:** 5-10 hours/week, mostly weekends

### What Diana Would Love

1. **Intelligent Recommendations Panel**
   The mode selector (SSB/CW/FT8/RTTY) with band recommendations is exactly what Diana needs. "Optimal window now" indicator with countdown to next window is brilliant for planning weekend operating sessions.

2. **Path Analysis with Difficulty Rating**
   Short/long path bearings, hop counts, and difficulty ratings (Easy to Extreme) help Diana decide whether to attempt a contact or wait for better conditions.

3. **24-Hour Propagation Forecast**
   The mini forecast in PropSphere and the expanded modal showing band-by-band predictions for the next 24 hours is perfect for planning when to wake up early for Japan or stay up late for Africa.

4. **DX Cluster Integration**
   Seeing live spots with band/mode filters, plus the ability to highlight "new" vs "worked" callsigns, is essential for DXCC chasing.

5. **Saved Targets**
   The ability to save up to 10 favorite targets (like VK, ZS, JA) and quickly check path conditions is a time-saver.

### What Frustrates Diana

1. **No DXCC Progress Tracking**
   "The PRD shows beautiful DXCC tracking with progress bars (247/340), but it's not implemented! I need to see which entities I need, not just raw spot data."

2. **Spots Aren't Real**
   "The DX Cluster shows spots, but they're simulated demo data. I need PSKReporter and RBN integration — that's where my FT8 contacts come from!"

3. **No 'Needed Only' Filter**
   The PRD mentions filtering spots to show only ATNO (All-Time New One) or new band slots, but there's no logbook integration to make this work.

4. **Missing Award Tracking Dashboard**
   No WAS, WAZ, or IOTA tracking. Diana wants to see her progress toward multiple awards, not just DXCC.

5. **No LoTW/eQSL Integration**
   Diana uses LoTW for all her QSL confirmations. Without LoTW sync, she can't see which countries are confirmed vs. just worked.

### Feature Requests from Diana

1. **LogBook Implementation**
   Quick contact logging with callsign lookup, ADIF import from existing log (1,847 QSOs), and duplicate checking.

2. **Real PSKReporter/RBN Integration**
   Live spots from real data sources, not simulated data. Show who's actually active right now.

3. **DXCC Entity Status Matrix**
   Visual grid showing which entities are worked/confirmed on each band, just like the PRD mockup shows.

4. **"Needed Only" Spot Filtering**
   After importing her log, Diana wants spots filtered to only show countries she needs for DXCC.

5. **Greyline Alert Notifications**
   Push notification or sound when greyline approaches her QTH — perfect timing for 40m/80m DX.

### UI/UX Pain Points

- **Target Persistence:** Selecting a target on the globe, then switching tabs, loses the selection
- **Spot Clicking:** Clicking a DX spot should auto-select it as the target and show path analysis
- **Time Zone Confusion:** 24-hour forecast uses UTC hours only; option for local time overlay needed
- **Panel Resizing:** Left/right panel resize handles are hard to grab on laptop trackpads
- **No Quick Log:** Clicking a spot should offer "Log This Contact" button for quick entry

### Priority Ranking (Diana's View)

| Priority | Feature/Fix                | Reason                                         |
| -------- | -------------------------- | ---------------------------------------------- |
| 1        | LogBook with ADIF import   | Core functionality for DX tracking             |
| 2        | Real PSKReporter/RBN spots | Simulated data is useless for actual operating |
| 3        | DXCC progress tracking     | The whole point of DXing                       |
| 4        | "Needed only" spot filter  | Save time by seeing only what matters          |
| 5        | Spot → target linking      | Click spot, see path analysis instantly        |

### Diana's Summary Quote

> "Propulse is SO close to being my dream DX tool. The propagation analysis is genuinely useful — the 24-hour forecast helped me plan my Japan pileup strategy last weekend. But without real spots and a logbook, I'm still juggling three different programs. Get those Phase 6 and 7 features done, and I'm deleting QRZ Logbook forever."

---

## Persona 3: "Contest Carl" — The Serious Contester

### Profile Summary

- **License Class:** Extra
- **Experience:** 15 years, contesting for 12
- **Equipment:** SO2R setup with Elecraft K3s, SteppIR beam, 160m 4-square
- **Primary Interest:** Major contests (CQ WW, ARRL DX, CQWW WPX)
- **Operating Style:** 48-hour endurance, aggressive band switching
- **Goals:** Top 10 USA, top 50 World in SOAB HP

### What Carl Would Love

1. **Pro View Fullscreen Mode**
   The fullscreen PropSphere with globe center and surrounding panels is exactly the "mission control" view contesters dream about. All critical info visible without tab-switching.

2. **Band Activity Visualization**
   Seeing where activity is concentrated globally helps decide when to call CQ vs. S&P, and when to QSY to a higher band opening to Asia.

3. **Layer Presets**
   The "Contest" preset that focuses on terminator and spots (hiding MUF complexity) shows someone understands contest operating priorities.

4. **Real-Time Path Illumination**
   The "Path Light" percentage indicator showing 65% daylight along path is useful for predicting when openings will fade.

5. **MUF/LUF/FOT Display**
   Frequency limits help decide whether 10m is actually open or just fluky — should I invest time calling CQ there?

### What Frustrates Carl

1. **No Rate Meter**
   "Where's my QSO rate? I need to see QSOs/hour in real-time. If my rate drops below 60, I need to QSY or switch strategies."

2. **No Contest Logging Mode**
   The quick log entry in the PRD isn't designed for contest logging. Carl needs: Tab-Tab-Enter flow, dupe checking with audio alert, exchange logging (zones, serials, sections).

3. **No Multiplier Tracking**
   "I need to see which CQ zones, DXCC entities, and states I'm missing. The DX spot list doesn't highlight 'new mult' like N1MM does."

4. **No Band Change Suggestions**
   "Tell me 'Rate declining on 20m, 15m opening to EU detected' — the app has all this data but doesn't synthesize it into actionable advice."

5. **No CAT Integration**
   "The app should read my radio's frequency and auto-populate band/mode. Better yet, clicking a spot should QSY my radio directly."

### Feature Requests from Carl

1. **Contest Mode Dashboard**
   Dedicated contest interface with: Score display, QSO count, mult count, rate meter (last 10/60 min), band breakdown chart.

2. **Keyboard-Optimized Quick Log**
   Callsign → Space → Exchange → Enter. Dupe warning sound. F-keys for CW macros (future).

3. **Multiplier Matrix**
   Visual grid showing worked/confirmed status for CQ zones (1-40), DXCC entities, US states for the current contest.

4. **Band Change Advisor**
   AI-style suggestions: "15m opening to JA in 20 minutes. Consider QSY from 20m when rate drops below 40."

5. **Cabrillo Export**
   One-click export to Cabrillo 3.0 format for contest submission.

### UI/UX Pain Points

- **Mouse Required:** Too much clicking; contesters live on keyboard
- **Panel Collapse:** Collapsed panels should remember state between sessions
- **Font Size:** Rate/score displays need to be readable from 6 feet away
- **No Dark Red Theme:** Current orange accent is too bright for night operating; need dim red option
- **Clock Position:** UTC clock is tiny in header; should be huge and centered in contest mode

### Priority Ranking (Carl's View)

| Priority | Feature/Fix          | Reason                               |
| -------- | -------------------- | ------------------------------------ |
| 1        | Contest logging mode | Can't contest without proper logging |
| 2        | Rate meter display   | Core metric for contest performance  |
| 3        | Multiplier tracking  | Half the strategy is chasing mults   |
| 4        | Cabrillo export      | Must submit logs after contest       |
| 5        | Band change advisor  | Would genuinely improve scores       |

### Carl's Summary Quote

> "Look, I'm not leaving N1MM during a contest — it's too integrated with my station. But Propulse could be the second monitor display I've always wanted. Give me that big globe with real-time spots showing who's working what, put the rate meter and mult counter in the corners, and make the whole thing keyboard-driven. That's a $100 purchase, easy. Right now it's a pretty visualization tool, not a contesting weapon."

---

## Persona 4: "Emergency Ed" — The Preparedness Operator

### Profile Summary

- **License Class:** Extra
- **Experience:** 20 years, ARES member for 15
- **Equipment:** Portable go-kit with IC-7300, horizontal dipole for NVIS, battery/solar power
- **Primary Interest:** Regional emergency communications, traffic handling
- **Focus:** Reliability within 500-mile radius, not DX
- **Operating Style:** Scheduled nets, deployed operations during disasters

### What Ed Would Love

1. **NVIS Analysis Component**
   The dedicated NVIS panel showing optimal frequency, coverage radius (km), and reliability percentage is EXACTLY what emergency communicators need. No other ham tool has this.

2. **Layer Presets - "Emergency" Mode**
   The preset that enables terminator and D-layer absorption (warning about HF blackouts) shows understanding of EmComm priorities.

3. **Solar Event Alerts**
   The EventAlert component for M-class flare warnings with "EXPECT IMPACT" on sunlit side is critical. Ed needs to know when HF will go down during an event.

4. **Recommended Bands for NVIS**
   Showing that 60m and 80m are best for NVIS with "horizontal dipole at 1/4 wavelength" tip is operationally useful.

5. **Flare Probability Panel**
   C/M/X-class probabilities help Ed advise the Emergency Coordinator whether to rely on HF or have VHF/UHF backup ready.

### What Frustrates Ed

1. **NVIS Coverage Map Missing**
   "The NVISCoverage component exists but where's the actual coverage circle on the map? I need to SEE which counties my NVIS signal reaches."

2. **No Offline Mode**
   "During a disaster, internet goes down first. I need solar indices cached locally and basic propagation calculations to work offline."

3. **No Regional Focus**
   "The app assumes everyone wants to work DX. I want to set my target as '500-mile radius' not 'Japan.' Give me regional propagation, not global."

4. **Missing HF Reliability Score**
   "I need a simple answer: 'HF reliable for regional comms: YES/NO/DEGRADED.' Don't make me interpret SFI and Kp myself during a deployment."

5. **No Net Frequency Monitoring**
   "I want to pin my traffic net frequencies (3.915, 7.280) and see propagation specifically for those frequencies, not just bands."

### Feature Requests from Ed

1. **NVIS Coverage Overlay**
   Draw the 400km coverage circle on the map, colored by reliability (green/yellow/red).

2. **Offline Mode with Local Cache**
   Store 24 hours of solar data locally; calculate band conditions without internet.

3. **Regional Mode**
   Target mode: "Within 300 miles of my QTH" showing which bands support NVIS/regional skip.

4. **HF Status Summary Card**
   Simple card: "Regional HF Status: RELIABLE" / "DEGRADED - Flare in progress" / "UNRELIABLE - Storm"

5. **Pinned Frequency Monitor**
   Add specific frequencies to track and see per-frequency propagation prediction (not just per-band).

### UI/UX Pain Points

- **Color Coding for Emergencies:** Purple for NVIS is subtle; need clearer "emergency mode" color scheme
- **Mobile-First Need:** EmComm operators often use tablets; mobile layout needs work
- **Export for Briefings:** Need PDF export of current conditions for briefing documents
- **Integration with Winlink:** No indication of Winlink gateway availability/propagation
- **Print View:** Should be able to print simple conditions summary for EOC whiteboard

### Priority Ranking (Ed's View)

| Priority | Feature/Fix                  | Reason                                   |
| -------- | ---------------------------- | ---------------------------------------- |
| 1        | Offline mode                 | Internet fails before we need HF         |
| 2        | NVIS coverage map overlay    | Must show coverage to EOC leadership     |
| 3        | HF reliability simple status | Non-hams need simple answers             |
| 4        | Regional mode                | DX focus is wrong for EmComm             |
| 5        | Mobile/tablet optimization   | Deployed operations use portable devices |

### Ed's Summary Quote

> "Finally, someone built an NVIS tool! I've been calculating optimal frequencies by hand for years. The NVIS Analysis panel is worth the entire app to me. But I can't use it during an actual emergency if it requires internet. Give me offline mode with cached solar data, add the coverage circle to the map so I can show my Emergency Coordinator, and make it work on a tablet. Then this becomes standard equipment in every ARES go-kit."

---

## Persona 5: "Dr. Harold 'Hal' Morrison (W1HAL)" — The Master Expert

### Profile Summary

- **License:** Extra class since 1985 (45 years licensed)
- **Credentials:** PhD Electrical Engineering (MIT), RF propagation specialty
- **Professional:** Former JPL deep space communications, NOAA ionospheric research consultant
- **Achievements:**
  - Former ARRL Director
  - Past President, Contest Club of New England
  - CQ WW DX Multi-Op winner (3x), ARRL DX winner (5x)
  - 5BDXCC, 160m DXCC, 380+ DXCC entities worked
  - Author of "The Complete Guide to HF Propagation" (standard textbook)
- **Equipment:** Multi-station remote setup including New Zealand long-path station
- **Operating Style:** Research-grade precision, long-path experiments, propagation studies

### What Hal Would Love

1. **Ionospheric Physics Foundation**
   "I reviewed the ionosphere.ts utility — they're using proper f0F2 calculations with Chapman function for D-layer absorption. Someone actually read the ITU-R P.533 recommendations. The MUF/FOT/LUF calculations are competent, not just SFI multipliers."

2. **Signal Prediction Model**
   "The signal.ts implementation includes path loss with D-layer absorption and ground reflection. The S-unit conversion is correct (-73 dBm = S9, 6 dB/S-unit). This is undergraduate-level RF engineering, but it's correct."

3. **Aurora Visualization**
   "NOAA OVATION integration with actual probability overlays — not just a static Kp threshold. The shader-based rendering is visually impressive and scientifically reasonable."

4. **MUF Contours**
   "Geographic MUF visualization using solar zenith angle correction and latitude factors. Not research-grade, but adequate for operational purposes."

5. **Band Plans with Regulatory Compliance**
   "The bandplans.ts includes ITU Region 1/2/3 allocations and license class privileges. Someone understands that regulations matter."

### What Frustrates Hal

1. **Oversimplified Ionospheric Model**
   "The foF2 estimation uses a basic SFI correlation. Real ionosondes give you direct foF2 measurements — GIRO/LGDC data is available. Using estimated foF2 when measured foF2 exists is lazy."

2. **No Absorption Model Beyond D-Layer**
   "D-layer absorption is modeled, but deviative absorption in the F-layer is ignored. For low-band DX, this matters significantly."

3. **Single-Hop Assumption for MUF**
   "The MUF calculations use midpoint geometry. Real long-path propagation involves 4-6 hops with MUF varying along the path. Each hop has different geometry and foF2."

4. **No Ray-Tracing**
   "For serious path analysis, you need ray-tracing through a realistic ionospheric model — like PropLab Pro or VOACAP. This tool gives you 'good enough' answers but not research-grade predictions."

5. **Missing Electron Density Profiles**
   "The app calculates layer heights (hmF2, hmE) but doesn't visualize them. An electron density profile plot would be educational and operationally useful."

6. **No Sporadic E Probability**
   "There's a 'Sporadic E' layer toggle but no actual Es probability calculation. Es is crucial for 6m openings — you can model it using geographic/seasonal/time-of-day factors."

### Feature Requests from Hal

1. **Real Ionosonde Data Integration**
   Pull actual foF2, foE, hmF2 from GIRO ionosondes near the path midpoint instead of estimating from SFI.

2. **Multi-Hop Path Analysis**
   For paths > 4,000 km, calculate MUF at each hop reflection point, not just the geometric midpoint.

3. **Electron Density Profile Visualization**
   Chapman-based electron density vs. altitude plot showing D, E, F1, F2 layers with current plasma frequencies.

4. **Sporadic E Probability Model**
   Statistical Es model based on location, season, time of day, and solar activity. June afternoon in the Mediterranean should show high Es probability.

5. **VOACAP Integration**
   Direct VOACAP API calls for point-to-point predictions. Let the professionals handle the ray-tracing; display their results.

6. **Long-Path Mode Toggle**
   When calculating for >15,000 km paths, automatically switch to long-path analysis with appropriate multi-hop geometry.

### UI/UX Pain Points

- **Data Resolution:** K-index shows 0.1 precision, but the underlying measurement is 0.33 resolution (integer Kp)
- **Time Granularity:** 24-hour forecast shows hourly resolution; 15-minute resolution would match reality
- **Source Attribution:** No indication of data source age or reliability for each metric
- **Export for Research:** Can't export propagation predictions as CSV/JSON for further analysis
- **No API:** Researchers need programmatic access, not just pretty visualizations

### Hal's Detailed Technical Critique

**What's Done Well:**

- Proper great-circle geometry for path calculations
- Correct solar zenith angle calculations using Julian date
- Reasonable D-layer absorption model with solar elevation factor
- ITU-compliant frequency allocations
- Appropriate use of suncalc library for astronomical calculations

**What Needs Improvement:**

- Replace estimated foF2 with real ionosonde data when within 1,000 km of station
- Add tilted ionosphere option for high-latitude paths
- Include geomagnetic latitude correction for polar paths
- Model auroral absorption separately from D-layer
- Consider TEP (Trans-Equatorial Propagation) for equatorial paths

**What's Missing Entirely:**

- No GOES X-ray flux history for flare decay prediction
- No polar cap absorption (PCA) modeling for proton events
- No scatter mode propagation (important for VHF EmE, troposcatter)
- No F2-layer tilts and traveling ionospheric disturbances (TIDs)
- No integrated VOACAP/ICEPAC backend

### Priority Ranking (Hal's View)

| Priority | Feature/Fix               | Reason                                  |
| -------- | ------------------------- | --------------------------------------- |
| 1        | Real ionosonde data       | Foundation of accurate predictions      |
| 2        | Multi-hop path analysis   | Current single-hop model fails for DX   |
| 3        | VOACAP integration        | Industry-standard predictions available |
| 4        | Sporadic E probability    | Critical for 6m operators               |
| 5        | Electron density profiles | Educational and operationally useful    |

### Hal's Summary Quote

> "I'll give credit where it's due: Propulse represents the best attempt I've seen at making ionospheric propagation accessible to the general ham population. The underlying physics is competent — not research-grade, but competent. However, this tool makes promises it can't keep. When it says 'MUF 21.4 MHz,' an operator trusts that number. But it's an estimate derived from an estimate (SFI to foF2 to MUF). We have real ionosonde data available; use it.
>
> For the casual operator, this is fine. For someone running a 160-meter DXpedition to Bouvet Island who needs to know the exact opening window to work Europe before polar absorption kicks in, Propulse would lead them astray. The path from 'looks professional' to 'is professionally useful' requires two things: real data sources and multi-hop propagation modeling. Do those, and this becomes a tool I'd actually recommend in my textbook's next edition."

---

## Cross-Persona Analysis

### Features That Satisfy Everyone

| Feature               | Nick         | Diana | Carl    | Ed      | Hal      |
| --------------------- | ------------ | ----- | ------- | ------- | -------- |
| Solar Pulse Dashboard | Love         | Like  | Neutral | Love    | Approve  |
| Globe Visualization   | Love         | Love  | Love    | Like    | Approve  |
| Path Analysis         | Confused     | Love  | Like    | Neutral | Critique |
| Band Recommendations  | Need simpler | Love  | Like    | Love    | Adequate |
| Time Machine          | Confused     | Love  | Love    | Like    | Useful   |

### Common Pain Points

1. **No Logbook** — Everyone except Nick explicitly needs it
2. **Simulated Spots** — Diana, Carl, Hal all want real data
3. **No Offline Mode** — Ed requires it; others would benefit
4. **No Onboarding** — Nick's #1 issue; others had to figure it out
5. **Mobile Weakness** — Ed's tablet use case; Nick's phone use

### Development Priority Matrix

| Feature             | Beginner | DXer | Contester | EmComm | Expert | Aggregate |
| ------------------- | -------- | ---- | --------- | ------ | ------ | --------- |
| Onboarding wizard   | 5        | 2    | 1         | 2      | 1      | 11        |
| Beginner mode       | 5        | 1    | 0         | 1      | 0      | 7         |
| LogBook             | 2        | 5    | 5         | 3      | 2      | 17        |
| Real spots          | 1        | 5    | 5         | 1      | 4      | 16        |
| DXCC tracking       | 0        | 5    | 4         | 0      | 2      | 11        |
| Contest mode        | 0        | 2    | 5         | 0      | 1      | 8         |
| Offline mode        | 1        | 2    | 1         | 5      | 2      | 11        |
| Real ionosonde data | 0        | 1    | 1         | 1      | 5      | 8         |
| NVIS coverage map   | 0        | 0    | 0         | 5      | 2      | 7         |
| Educational content | 5        | 2    | 0         | 2      | 1      | 10        |

### Recommended Development Prioritization

Based on aggregate scores and strategic value:

1. **LogBook with ADIF Import** (Score: 17) — Highest demand, enables DXCC tracking
2. **Real Spot Integration** (Score: 16) — PSKReporter/RBN, makes app genuinely useful
3. **Onboarding/Beginner Mode** (Score: 18 combined) — Reduces churn, increases adoption
4. **DXCC Tracking** (Score: 11) — Natural follow-on to LogBook
5. **Offline Mode** (Score: 11) — Critical for EmComm, nice-to-have for others
6. **Educational Content** (Score: 10) — Differentiator, supports beginners
7. **Contest Mode** (Score: 8) — Niche but passionate user base
8. **Real Ionosonde Data** (Score: 8) — Improves accuracy for all users
9. **NVIS Coverage Map** (Score: 7) — Completes EmComm feature set
10. **Beginner Mode Toggle** (Score: 7) — UX improvement for newcomers

---

## Appendix: Persona Quote Collection

### On First Impressions

- **Nick:** "This is the first ham radio app that doesn't look like it was designed by engineers for engineers."
- **Diana:** "Finally, someone combined propagation data with DX spots in one place."
- **Carl:** "Pretty, but can it keep up with a 200 QSO/hour rate?"
- **Ed:** "An NVIS tool built into a modern app? Where has this been for 20 years?"
- **Hal:** "Competent ionospheric physics. I'm pleasantly surprised."

### On What's Missing

- **Nick:** "Where's the 'Teach Me' button?"
- **Diana:** "I can see spots but can't log them. That's torture."
- **Carl:** "No rate meter? That's like a race car without a tachometer."
- **Ed:** "Can't use it if the internet's down. Fix that."
- **Hal:** "Estimated foF2 when real data is available. Inexcusable."

### On Potential

- **Nick:** "With a beginner mode, this could be what finally gets me on HF."
- **Diana:** "Add DXCC tracking and I'll pay for a subscription."
- **Carl:** "Put this on my second monitor with real-time mults and take my money."
- **Ed:** "Make it work offline and every ARES group in America will adopt it."
- **Hal:** "Add VOACAP integration and real ionosonde data — then we'll talk."

---

_Document generated: January 31, 2026_
_Propulse Version: Phase 4 Complete_
_Based on PRD v3.0 and current implementation review_
