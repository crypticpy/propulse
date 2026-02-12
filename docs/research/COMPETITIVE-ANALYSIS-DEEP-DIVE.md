# Competitive Analysis: Deep Dive — The Overlooked 10%

> Supplemental to COMPETITIVE-ANALYSIS-2026.md | Research Date: 2026-02-12
> Focus: Underserved niches, edge cases, delighters, overlooked integrations, business model insights, and accessibility

---

## 1. Underserved Niche Groups

### 1A. Blind & Visually Impaired Operators

**The Scale of the Problem**

This is not a tiny niche. An aging ham population means vision impairment is _increasingly common_, not decreasingly. Darrell Hilliker (NU7I), a totally blind operator and accessibility professional, is leading a community initiative to make WSJT-X accessible — and the fact that this effort only started in 2025/2026 reveals how badly the ecosystem has neglected this group.

The most critical finding: **WSJT-X's Band Activity and Rx Frequency tables are "painted" to the screen rather than implemented as proper UI components** — meaning screen readers literally cannot access the most important data in the application. This is the #1 FT8 tool in the world, and blind operators simply cannot use it.

**Current State of Accessibility**

| Software              | Screen Reader Support                                                                | Verdict                         |
| --------------------- | ------------------------------------------------------------------------------------ | ------------------------------- |
| N3FJP AC Log          | NVDA works; added audio field identification via wave files                          | Best-in-class, but limited      |
| JJRadio (rig control) | Built by blind developer; fully accessible                                           | Model for how it should be done |
| RT Systems            | NVDA works; JAWS incompatible                                                        | Fragmented support              |
| CHIRP                 | "Only minimally accessible with many controls on the interface that are not labeled" | Unusable                        |
| WSJT-X                | Band Activity tables invisible to screen readers                                     | Fundamentally broken            |
| N1MM+                 | Functional with screen readers but complex                                           | Workable                        |
| Most others           | Untested or inaccessible                                                             | Unknown                         |

> "Almost all [programming software] made for most of the radios out there can't be used by the blind at all." — Active Elements evaluation

One developer reportedly told the blind ham community that the blind amateur population was **"so rare that making these changes could not be justified."** Active Elements explicitly pushes back on this, encouraging blind hams to "join mailing lists and demonstrate the size of this user community to developers."

**Hardware Gap**: HamPod was a $295 standalone text-to-speech device for radio equipment (Elecraft, ICOM, Kenwood, Yaesu). It provided audio feedback for equipment that relies on visual displays. **Production ended May 2022 after ~200 units over 10+ years.** No replacement exists. A software solution that provides audio feedback for rig state would fill this void.

**Propulse Opportunity**:

- **Web apps have a massive structural advantage** — ARIA roles, semantic HTML, and screen reader compatibility are native to the platform. Qt/Win32 apps require painful retrofitting.
- Implement ARIA landmarks, live regions for real-time data (decode list, band activity, spots), and full keyboard navigation from day one.
- Add an "audio-first" mode: spoken callsign on QSO completion, audio band condition announcements, spoken decode notifications.
- Every UI table must be a real `<table>` element with proper headers, not a canvas/div paint.
- This costs almost nothing to do right if designed in from the start, and is nearly impossible to retrofit.

Sources: [Blind Access Journal](https://blindaccessjournal.com/), [Active Elements Software Evaluations](https://active-elements.org/category/all-evaluations/software-evaluations/), [N3FJP Visual Assist](https://www.n3fjp.com/visualassist.html), [HamPod](https://www.hampod.com/)

### 1B. Youth & New Hams — The Onboarding Cliff

**The Core Problem**

> "Your license is a departure, not a destination. To get anything at all out of the hobby, you'll have to invest some effort into learning much more than what you had to know to pass a test." — Off Grid Ham

New operators face an overwhelming breadth of sub-hobbies (DXing, contesting, POTA, satellite, digital modes, CW, emergency comms, antenna building) with no structured path through them. The result is paralysis.

**Compounding Factors**:

- Local clubs are "very clique-ish and don't want their group invaded" (multiple reports)
- Some established operators actively discourage newcomers — "bitter old cranks" who seem uninterested in welcoming fresh participants
- Finding a mentor (Elmer) is hit-or-miss: "it might be hard to find someone who has the time and desire to give one-on-one help"
- After five months on the air, one new amateur's reaction "based on observations and interactions with the community on-air and in forums has been negative"

**What Beginners Actually Need** (synthesized from multiple sources):

1. Clear direction-setting guidance before equipment purchases
2. A structured "first 30 days" path with achievable milestones
3. Permission to specialize rather than pressure to master everything
4. A welcoming digital community when local clubs fail them
5. Contextual help at the moment of confusion, not a 300-page manual

**Propulse Opportunity**:

- **Guided first-run experience**: "What interests you?" quiz that configures the UI for their operating style (casual ragchewer, digital mode enthusiast, contester, portable activator, DXer)
- **Achievement-based onboarding**: "Make your first QSO", "Log 10 contacts", "Work a new state", "Try FT8" — each unlocking the next feature tier
- **Contextual glossary**: Hover/tap on any ham jargon (RST, QTH, CQ Zone, LoTW) for instant plain-English explanation
- **"What should I do right now?"** — a smart suggestion engine based on current band conditions, time of day, and their equipment: "10m is wide open to Europe right now. Here's how to call CQ."
- **Built-in Elmer mode**: experienced operator can share their screen/log with a new ham for guided sessions

Sources: [Off Grid Ham - Beginner](https://offgridham.com/2020/01/ham-radio-beginner/), [Ham Radio Prep](https://hamradioprep.com/log-ham-radio-contacts/), [Jeff Geerling](https://www.jeffgeerling.com/blog/2023/getting-my-amateur-radio-ham-license)

### 1C. Non-English Speaking Operators

**The Gap Nobody Talks About**

Almost no ham radio logging software supports CJK (Chinese/Japanese/Korean) languages. The multilingual options that exist (Swisslog, KLog) are limited to European languages. Japan has the second-largest ham population in the world (~390,000 licensed operators), yet JA operators are expected to use English-only interfaces.

**Propulse Opportunity**:

- React + i18next provides a clean i18n foundation
- Japanese, Korean, Chinese, Portuguese (Brazil has a large ham community), and Spanish would cover the vast majority of non-English operators
- ADIF supports UTF-8 for operator names and comments — ensure full Unicode support in all text fields
- Callsign prefix auto-detection could set a suggested language

### 1D. QRP Operators — The Minimalists

QRP operators (5W or less) are a passionate niche with specific needs no logger addresses well:

- **Power-per-QSO tracking** at milliwatt precision (not just "5W" but "200mW")
- **Watts-per-kilometer** efficiency metrics (how far did your signal travel per milliwatt?)
- **QRP-specific award tracking** (QRP DXCC, QRP WAS, QRP WAZ)
- **"QRP factor"** scoring that celebrates low-power achievements proportionally

N3FJP's AC Log allows querying by power level, but no logger calculates QRP efficiency metrics or tracks QRP-specific awards automatically.

### 1E. Satellite Operators

Satellite operation requires a unique workflow: predict pass, configure Doppler, make contact during a 5-15 minute window, log with sat name and mode. Currently this requires juggling 3+ separate tools (Gpredict/SatPC32 for tracking, a logger, and rig control for Doppler compensation).

**73QRZ** is a notable new entrant — a modern web dashboard with real-time satellite tracking, pass predictions with quality ratings, and a "WTF Does This All Mean?" educational section. It demonstrates demand for modern satellite tooling.

**SatMatch** by K5EM solves a unique problem: finding times when a satellite is visible from two locations simultaneously, specifically for scheduling amateur radio satellite QSOs between two stations.

**Propulse Opportunity**: ISS tracker already exists in codebase. Extend to full amateur satellite constellation with pass prediction, Doppler offset calculation, and one-click "log this pass" that auto-fills satellite name, mode, and time window.

Sources: [73QRZ Satellites](https://73qrz.com/satellites), [SatMatch](https://www.satmatch.com/), [AMSAT](https://www.amsat.org/track/)

### 1F. Club Stations & Multi-Operator

Field Day and club station logging has a specific pain: multiple operators using one callsign, tracking who operated when, and merging logs from simultaneous stations.

ADIF defines two critical fields: `STATION_CALLSIGN` (the call used on air) and `OPERATOR` (the individual at the controls). Most loggers conflate these. HAMRS users report confusion: "Help! I've confused myself with ADIF STATION_CALLSIGN and OPERATOR."

**Propulse Opportunity**:

- First-class multi-operator mode with operator login/switch (just enter your callsign when you sit down)
- Real-time shared log visible to all operators (Supabase real-time is perfect for this)
- Band-slot matrix showing which bands are in use by which operators (prevents same-band conflicts in multi-op)
- Automatic operator statistics: QSOs per operator, rate per operator, time-on-air per operator
- Post-event report generation for Field Day submissions

Source: [HAMRS Community Forum](https://community.hamrs.app/t/field-day-help-ive-confused-myself-with-adif-station-callsign-and-operator/584)

---

## 2. Offline Sync Edge Cases

### 2A. Same Station Logged on Two Devices Simultaneously

**Scenario**: Operator logs a QSO on their phone (outdoor) and their desktop (indoor) within seconds of each other — different QSOs but overlapping timestamps.

**Current State**: No ham radio logger handles this. ADIF merge tools use a 90-second window matching same band/call/mode to detect duplicates. Two different QSOs at similar times on different bands would survive merge, but same-band contacts would collide.

**Propulse Solution Design**:

- Each device generates a UUID per QSO at creation time — the canonical identity
- Sync uses UUID matching, not band/call/time matching
- Conflict resolution: if two devices modify the same QSO (same UUID), use last-write-wins with full version history
- If two devices create QSOs with different UUIDs but matching band/call/time within 60s, flag for human review rather than auto-deduping

### 2B. Clock Drift Between Devices

**Scenario**: Phone clock is 3 minutes ahead of actual time; desktop has NTP sync.

**This matters enormously** for digital modes. FT8 requires clock accuracy within ~2 seconds. VE2HEW documents the importance of time sync for ham radio, recommending Meinberg NTP and Chrony for precise synchronization.

Off-grid operators use GPS time sync: "Off Grid JS8Call Time Sync — No GPS or NTP needed" describes a technique for time synchronization without internet.

**Propulse Solution Design**:

- Record both device-local time AND server time on sync
- Calculate per-device clock offset
- Flag QSOs with suspicious time gaps (device time differs from server time by >30s)
- Offer "correct times" bulk action to adjust QSO timestamps by measured offset
- For digital modes, warn if device clock drift exceeds 2 seconds

### 2C. Paper Log Post-Hoc Digitization

**Scenario**: Operator logs on paper during a POTA activation, then enters contacts into the app later that evening.

**Fast Log Entry (FLE)** by DF3CB is the gold standard for this workflow — a minimal text format where you type shorthand like:

```
date 20260212
40m ssb
1510 W1ABC 59 59
11 K2DEF 59 59      # only changed minutes
20m
1520 VE3GHI 57 59
```

FLE's genius: you only enter what changed. Same band? Don't re-enter it. Time only differs by minutes? Just type the minutes.

**No logger has OCR for paper logs.** This is a whitespace opportunity — phone camera + AI transcription of handwritten logs could be a genuine delighter. Even partial OCR with human review would save hours.

**Propulse Opportunity**:

- Build an FLE-style rapid entry mode (text-based, minimal keystrokes)
- Future: phone camera OCR for paper logs using on-device ML
- "Paper log" template mode: pre-fill date/band/mode, tab through just callsign and RST fields

Source: [DF3CB Fast Log Entry](https://df3cb.com/fle/)

### 2D. ADIF Import Conflicts & Legacy Log Migration

The `adif_merge` tool by pleasantone reveals the real-world complexity:

- Duplicate detection uses same band + call + mode within 90 seconds
- LoTW files are treated as more authoritative for QSL-related fields
- QRZ and LoTW "often differ about user-entered information like ITU and CQ zones"
- A `--problems` flag generates human-readable JSON of unresolved conflicts

**QRZ.com defines duplicates as matching callsign + mode + band + date/time within +/-30 minutes** — a much wider window than adif_merge's 90 seconds.

**The "garbage-in/garbage-out" problem**: ADIF files from different sources contain contradictory data for the same QSO. There is no authoritative single source of truth.

**Propulse Solution Design**:

- Smart ADIF import wizard with preview: show exact duplicates, fuzzy matches, and conflicts before committing
- Per-field source trust ranking: LoTW > local log > QRZ > eQSL for QSL fields; local log > all others for operator-entered fields
- Preserve import provenance: tag each QSO field with its source
- Never silently discard data — park conflicts in a review queue

Sources: [adif_merge GitHub](https://github.com/pleasantone/adif_merge), [ADIF Multitool](https://github.com/flwyd/adif-multitool)

### 2E. Extended Offline / Restricted Internet Countries

**Scenario**: Supabase is down for days, or operator is in a country with restricted internet (China, Iran, Cuba).

China has a growing ham population but "complex laws governing equipment use" and has "previously targeted radio communications by jamming international broadcasts." Iranian hams "must adhere to a strict rule: they are not allowed to communicate with Israeli operators" and "risk losing their licenses or facing government scrutiny."

**Propulse Solution Design**:

- IndexedDB-first architecture (already in place) must be the COMPLETE application, not a degraded mode
- Sync queue with exponential backoff — try for days, not minutes
- Manual export/import as ADIF if cloud never reconnects
- Data sovereignty option: "Keep my data on-device only" mode for operators who cannot or choose not to use cloud sync
- Consider censorship-resistant sync alternatives (though this is complex territory)

---

## 3. Delighters — The "Show Your Friends" Features

### 3A. QSO Audio Recording & Replay

**QSOrder** by K3IT is a plugin for N1MM+ that records audio buffers and saves individual WAV files per QSO, triggered by N1MM's UDP broadcast when a contact is logged. The QSOrder cloud service lets operators "share their contest and DXpedition audio recordings."

**Nobody has built audio recording into the logger itself.** It's always an external plugin.

**Propulse Opportunity**:

- Web Audio API can capture microphone/line-in audio in a rolling buffer
- On QSO save, clip the last N seconds and attach as a voice memo
- "Relive your DX" — play back the audio of your rarest contacts
- Storage: compressed opus audio, ~50KB per 30-second clip
- Privacy-first: audio stays local unless explicitly shared

Source: [QSOrder](https://hamradiomap.com/qsorder/)

### 3B. "On This Day" Memories

**Nobody has built this.** Zero results in ham radio software. Yet Facebook proved that "on this day" memories are one of the most engaging features ever created.

**Propulse Opportunity**:

- "1 year ago today, you worked JA1ABC on 20m FT8 — your first Japan contact!"
- "3 years ago today, you activated POTA K-1234 and made 47 contacts"
- Show the solar conditions from that day alongside for context
- Optional push notification or home screen card
- Anniversary badges: "Your 1-year ham-iversary!" / "500th QSO anniversary"

### 3C. Automatic Propagation Journal

**No tool automatically correlates your QSO log with solar/propagation conditions at the time of each contact.** Operators manually check HamQSL or NOAA. The data exists (SFI, K-index, A-index, Bz) but nobody embeds it per-QSO.

**Propulse Opportunity**:

- Auto-stamp every QSO with solar conditions at time of contact (SFI, K-index, Bz, band conditions rating)
- Generate "propagation diary" views: "Your best DX days were when SFI > 150 and K < 3"
- Pattern detection: "You make 3x more JA contacts between 0200-0400 UTC on 20m"
- "Your personal propagation model" — learn which conditions produce YOUR best contacts from YOUR location
- This is a direct extension of the existing Propulse spot collector + band_region_stats infrastructure

Sources: [HamQSL](https://www.hamqsl.com/solar.html), [NOAA SWPC](https://www.swpc.noaa.gov/)

### 3D. QSO Map Replay Animation

HamDXMap offers "play to animate QSOs" — importing a contest log and animating contacts on a map over time. MOTRT QSO Map Tool visualizes contacts on an interactive map.

**But no logger has this built in.** You have to export ADIF, upload to a third-party tool, and view separately.

**Propulse Opportunity**:

- Built-in timeline slider: drag through your log and watch QSO paths animate on the existing globe view
- "Contest replay" mode: watch your contest unfold at 60x speed with rate meter overlay
- Share as animated GIF/video for social media
- "Heat map" overlay showing your contact density by grid square over time

Sources: [HamDXMap](https://dxmap.f5uii.net/), [MOTRT QSO Map Tool](https://hamradio.my/2025/09/visualize-your-qsos-with-the-motrt-qso-map-tool/)

### 3E. AI-Powered Features

The ham radio community is cautiously optimistic about AI. KB6NU notes: "The sooner someone figures out how to take advantage of it, the better." But "AI and machine learning haven't really made any inroads into ham radio up to this point."

**Concrete AI opportunities**:

- **Callsign correction**: Fuzzy matching against callsign databases when manual entry has typos
- **Auto-fill from voice**: Whisper-based transcription of SSB audio to pre-fill callsign, name, QTH
- **Smart scheduling**: "Based on propagation predictions and your DXCC needs, try 15m at 1400 UTC for South America"
- **CW decode**: Real-time CW-to-text using ML, integrated into the logging flow
- **QSO summarization**: For ragchew contacts, auto-generate a brief note from audio recording

Source: [KB6NU on AI](https://www.kb6nu.com/artificial-intelligence-and-machine-learning-for-amateur-radio/)

### 3F. Paper Log OCR

Zero ham radio tools offer camera-based paper log digitization. Operators with decades of paper logs face hours of manual transcription. Phone camera + on-device OCR + AI post-processing to parse the columnar format into structured QSO data would be genuinely unprecedented.

---

## 4. Overlooked Integrations

### 4A. POTA API Direct Integration

The POTA API is available at `https://api.pota.app/spot/` returning JSON data. Key endpoints:

- Spot feed: real-time activator spots
- Park reference lookup: lat/lon bounding box queries for park references
- The current API "does not allow applications to see into user's stats as that would require user authentication"

Multiple apps already use this API (HAMRS iPhone, PotaHunter Desktop), though official documentation is sparse and approval status for general use is unclear.

**Propulse Opportunity**:

- Real-time POTA spot feed on the map (activators shown as park pins)
- "Start activation" mode: select park, auto-fill MY_SIG/MY_SIG_INFO, auto-spot to POTA
- Post-activation: generate POTA-compliant ADIF and auto-submit
- Park finder: "Show me parks within 30 miles" using the bounding box API

Sources: [POTA Documentation](https://docs.pota.app/), [PotaHunter](https://github.com/johnkochjr/PotaHunter_Desktop)

### 4B. SOTA Database API

The SOTA API supports client authentication with client_id/username/password. Ham2K Polo (iPhone app) already does direct SOTA upload. SOTAdata at `sotadata.org.uk` is the official database.

**SOTA + POTA dual activation** is a documented unmet need: "Not a logging program that will handle both SOTA and POTA simultaneously" (K0NR). No logger handles this cleanly.

**Propulse Opportunity**:

- Dual-activation mode: POTA + SOTA fields active simultaneously
- SOTA summit finder with point values and activation status
- Direct upload to SOTAdata on sync
- Combined SOTA/POTA leaderboard in Propulse social features

Sources: [SOTA API Client](https://github.com/PopeFelix/sota-api-client), [K0NR Blog](https://www.k0nr.com/wordpress/2022/03/logging-for-sota-and-pota/)

### 4C. IOTA Reference Lookup

Islands On The Air has ~1,200 island groups worldwide. Reference lookup data is available through QRZCQ, Mapability (EI8IC), and iota-world.org. DX4WIN and HRD have IOTA reference integration, but most modern loggers do not.

**Propulse Opportunity**: Auto-lookup IOTA reference from callsign/DXCC entity. Display island group on map. Track IOTA award progress.

### 4D. Solar Weather Push Notifications

NOAA SWPC provides Alerts, Watches, and Warnings for space weather. No ham radio logger sends push notifications for band openings triggered by solar events.

**Propulse Opportunity**:

- Monitor SWPC feeds for significant events (X-class flares, CME arrivals, sudden ionospheric disturbances)
- Push notification: "X-class flare detected! 10m may open in 1-3 hours. SFI now 185."
- Correlate with real-time spot data from the collector: "10m just opened — 47 spots in the last 15 minutes"
- Personal alert rules: "Notify me when K-index drops below 3 AND SFI is above 120"

### 4E. Contest Calendar with Auto-Configuration

No logger auto-configures for upcoming contests. Operators manually look up rules, exchange formats, multiplier definitions, and scoring formulas, then configure their logger.

N1MM+ has the most contest definitions but requires manual selection and configuration. TLF lets users "add new contests by editing a text file."

**Propulse Opportunity**:

- Curated contest calendar with one-click contest activation
- Auto-configure: exchange format, scoring formula, multiplier tracking, Cabrillo export format
- "This weekend" dashboard: show upcoming contests with difficulty level, expected participation, and whether user's equipment is suitable
- Post-contest: auto-generate Cabrillo, submit to sponsors, track results when published

### 4F. QSL Card Design & Generation

RadioQTH, DigiQSL, and QSL.design offer card creation. QSL Maker imports ADIF for auto-filling QSO data. DX4WIN auto-fills card templates.

**But no logger generates QSL cards natively.** It's always a separate tool or service.

**Propulse Opportunity**:

- Built-in QSL card templates with auto-filled QSO data
- Custom card designer with photo upload, layout templates
- "Generate batch" for print-at-home or send to print service
- eQSL-style digital cards shareable via link
- Achievement-based card designs that unlock with rank progression (ties into existing rank system)

### 4G. SDR Waterfall Integration

SDR Console can display a waterfall and click-to-tune a transceiver via HRD integration. SkyRoof merges satellite tracking with SDR reception in one window.

**Propulse Opportunity**: The bridge daemon already communicates with radios. If the operator has an SDR (RTL-SDR, SDRplay, Airspy), embed a WebSDR-style waterfall view within Propulse using WebAudio/WebGL. Click a signal on the waterfall to auto-tune the transceiver. This is technically ambitious but would be a "show your friends" feature.

Sources: [SkyRoof](https://hamradio.my/2025/09/skyroof-all-in-one-sdr-and-satellite-tracking-for-ham-radio-enthusiasts/), [SDR-Radio.com HRD Integration](https://www.sdr-radio.com/ham-radio-deluxe)

---

## 5. Business Model Insights

### 5A. What Operators Actually Pay For

| Willingness                                                               | Evidence                                                        |
| ------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **Will pay for**: Quality hardware, rig accessories, antennas             | Hams routinely spend $1,000-$10,000 on equipment                |
| **Will pay for**: Convenience that saves significant time                 | HRD at $100 + $50/yr still has buyers; MacLoggerDX at $95 sells |
| **Resist paying for**: Software that was previously free                  | HRD backlash was partially about the free-to-paid transition    |
| **Resist paying for**: Subscriptions with unclear ongoing value           | General software subscription fatigue in the hobby              |
| **Will not pay for**: Basic logging                                       | Core logging is viewed as a utility, like a text editor         |
| **Will pay for**: Premium integrations, cloud services, advanced analysis | Operators understand server costs                               |

### 5B. World Radio League's Model

WRL is "free to use, with subscriptions available for users who want to unlock advanced features." All plans billed annually. Premium unlocks printable awards and expanded import limits. First 5,000 subscribers get a "Founding Member Award."

**Critical finding**: A WRL user reported contacts being dropped from logs — "when closing a log with 29 contacts, it showed only 2, and then showed none." Another user emphasized: "Developer focus needs to be 100% on reliably storing log information." **Reliability is table stakes.** No amount of features overcomes data loss.

**Lesson**: The "founding member" gamification hook works for early adoption but cannot substitute for rock-solid data integrity. WRL's reviews reveal that even a modern, attractive logger will be abandoned instantly if data reliability is questioned.

Sources: [World Radio League](https://worldradioleague.com/), [WRL App Store](https://apps.apple.com/us/app/world-radio-league/id6502666646)

### 5C. Station Master Pro's Model

Station Master Pro uses a subscription model at **GBP 3.33/month** or **GBP 36.50/year** (~$42/year USD). Includes all platforms (mobile, PC, Mac, Linux, web). 7-day free trial. All Trustpilot reviews are 5 stars.

Features include: control up to 5 radios and 2 rotators, auto-upload to QRZ/eQSL/ClubLog, SDR panadapter integration, POTA/SOTA/WWFF activation support, and real-time gamified competition with leaderboards.

**Lesson**: A low-cost subscription (~$3-4/month) with genuine cross-platform access and continuous feature delivery can work if the value proposition is clear and ongoing.

### 5D. The Emerging Competitive Landscape

**NextLog** is a new entrant — a "clone of Wavelog with a modern tech stack" built with Next.js 15, PostgreSQL, TypeScript, and Tailwind CSS. MIT-licensed, Vercel-deployable, full Cloudlog API compatibility. This is the closest architectural competitor to Propulse.

**73QRZ** is "The Modern Ham Radio Dashboard" — satellite tracking, propagation data, APRS, Meshtastic, POTA spots, PSK Reporter, band conditions. Dark mode, responsive design, educational content. It proves there's demand for modern, well-designed ham radio web tools.

Both validate Propulse's architectural bet (modern web stack, cloud-native, responsive) but neither combines logging + propagation + rig control + social features into one platform.

### 5E. Recommended Propulse Pricing Strategy

Based on evidence:

- **Free forever**: Core logging, ADIF import/export, basic award tracking, offline operation
- **Premium ($4-5/month or $40-50/year)**: Cloud sync, multi-device, propagation intelligence, solar alerts, advanced analytics, audio recording, QSL card generator, contest auto-config
- **Club/Team ($8-10/month)**: Multi-operator mode, shared logs, team leaderboards, bulk LoTW management
- **Founding member hook**: First 1,000 premium subscribers get permanent "Pioneer" badge and early-access features
- **Data guarantee**: "Your data is always yours. Full ADIF export is always free, even if you cancel premium."

---

## 6. Accessibility & Inclusivity Deep Dive

### 6A. Screen Reader Support — The Technical Requirements

Based on the Active Elements software evaluations and NU7I's WSJT-X initiative, here are the specific technical requirements:

1. **All interactive elements must have accessible names** — buttons, inputs, dropdowns, tabs
2. **Data tables must use semantic `<table>` markup** with `<th>` headers and `scope` attributes
3. **Live regions (`aria-live`)** for real-time data: decode lists, spot feeds, band conditions
4. **Keyboard navigation** must follow logical tab order (G4FON's Koch Trainer was criticized for illogical tab order)
5. **Focus management** on view changes: when a modal opens, focus must move to it; when it closes, focus returns to trigger
6. **No information conveyed by color alone** — always pair color with text, icon, or pattern
7. **Minimum contrast ratios**: 4.5:1 for normal text, 3:1 for large text (WCAG AA)

### 6B. Color Blind Safe Design for Band Indicators

Ham radio UIs universally color-code bands (160m = dark red, 80m = orange, 40m = yellow, 20m = green, 15m = blue, 10m = purple, etc.). The classic red/green combination is the worst for the most common form of color blindness (deuteranopia, ~8% of males).

**Design Rules**:

- Never use red vs. green as the only distinguishing feature
- Use a blue-orange primary palette (universally distinguishable)
- Add secondary indicators: band label text, pattern fills, or icons alongside color
- Implement a "high contrast" mode using IBM's color-blind safe palette
- Test with Coblis or similar color blindness simulator

**Propulse already uses band color coding** in maps and propagation views. This needs an accessibility audit.

Sources: [Venngage Color Blind Guide](https://venngage.com/blog/color-blind-friendly-palette/), [Esri Map Design](https://www.esri.com/arcgis-blog/products/arcgis-pro/mapping/designing-maps-for-colorblind-readability/), [IBM Color-Blind Safe Palette](https://www.color-hex.com/color-palette/1044488)

### 6C. Voice-Controlled Logging

**RadioTranscriptor** uses OpenAI's Whisper model for real-time radio speech-to-text transcription. Real-time speech-to-text from radio via DragonOS + SDR4Space + WhisperCPP has been demonstrated.

WaveTalkers describes a hypothetical "AI Voice Recognition" system for ham radio: "Integrating AI-based voice recognition into ham radio equipment could enable hands-free operation."

**No logger offers voice-controlled QSO entry today.**

**Propulse Opportunity**:

- Web Speech API for voice commands: "Log contact with Whiskey One Alpha Bravo Charlie, five nine, twenty meters"
- Whisper-based CQ/callsign extraction from audio: listen to the QSO, auto-suggest callsign
- Voice commands for navigation: "Show me 20 meter contacts", "Switch to contest mode"
- Critical for operators with mobility impairments, one-handed operation, or while driving/hiking

Sources: [RadioTranscriptor](https://www.rtl-sdr.com/radiotransciptor-real-time-radio-speech-to-text-transcriptor-using-ai/), [WaveTalkers AI](https://wavetalkers.com/resources/ai/ai_voice_recognition.php)

### 6D. Keyboard-Only Operation

N1MM+ is the gold standard for keyboard-driven operation: Ctrl+Left/Right for VFO swap, Pause for radio swap, customizable key remapper. This isn't just for accessibility — it's how contest operators achieve 200+ QSOs/hour.

**Propulse Opportunity**:

- Full keyboard navigation with visible focus indicators
- Vim-style shortcuts for power users (optional)
- Command palette (already exists) should cover all actions
- Single-key contest shortcuts: Space = log QSO, F1-F12 = CW/voice macros
- Keyboard shortcut cheat sheet (dismissible overlay)

Source: [N1MM Keyboard Shortcuts](https://n1mmwp.hamdocs.com/setup/keyboard-shortcuts/)

### 6E. Large Text & High Contrast

WSJT-X suffers from "small type on larger monitors, similar to size 6 type on a newspaper" with a buried HiDPI checkbox. This is a 2-line CSS fix in a web app (`font-size: clamp()`).

**Propulse Opportunity**:

- Responsive typography that scales with viewport and user preference
- Respect `prefers-contrast: more` media query
- User-configurable font size slider (stored in settings)
- High-contrast mode: pure white on pure black, no gradients, no transparency
- Ensure all interactive targets are minimum 44x44px (WCAG touch target guideline)

---

## 7. Gamification — What Actually Works

### 7A. Existing Programs and Their Mechanics

| Program            | Points                   | Badges                                                | Leaderboards      | Feedback Speed            |
| ------------------ | ------------------------ | ----------------------------------------------------- | ----------------- | ------------------------- |
| SOTA               | 1-10 points per summit   | Mountain Goat (1000pt), Shack Sloth (1000 chaser pts) | Regional + global | Immediate (self-reported) |
| POTA               | Activation/hunter counts | Multiple award tiers                                  | Program-wide      | Within days               |
| DXCC               | Entity count             | 100/200/300/Honor Roll                                | ARRL listing      | Months (LoTW processing)  |
| Contests           | Score formula            | Plaques, certificates                                 | Contest sponsors  | 2-6 months (!!)           |
| Hamchievements     | Upload-based scoring     | Achievement badges                                    | Global            | Immediate (v3.4.0)        |
| World Radio League | Contact-based            | Founding Member award                                 | Live leaderboards | Real-time                 |

**Key insight from K0NR**: Traditional contesting has "painfully slow feedback" — official results sometimes take six months. Modern platforms like contest.run and WRL that provide real-time scoring better serve gamification principles.

### 7B. What Propulse Already Has

The existing rank system (7 tiers from Novice to Ethereal, 50,000 RP) with visual effects, card aesthetics, and celebration overlays is far ahead of any competitor. But it's currently based on profile completeness and theoretical scoring, not actual on-air activity.

### 7C. What to Add

1. **Daily/weekly challenges**: "Work 5 new grid squares this week" / "Make a QSO on a band you've never used"
2. **Streak system**: consecutive days with at least one QSO (already have loginStreakDays, extend to QSO streaks)
3. **Milestone celebrations**: 100th QSO, first DXCC entity, first satellite contact, first contest — with shareable cards
4. **Social proof**: "K3ABC just worked their 100th DXCC entity!" feed
5. **Seasonal events**: "Solar Maximum Sprint" / "Winter DX Challenge" / "POTA Week"
6. **Speed-of-feedback**: NEVER delay gratification. Award badges and update leaderboards in real-time, not days or months later.

Source: [K0NR on Gamification](https://www.k0nr.com/wordpress/2022/10/ham-radio-gamification/), [Hamchievements](https://hamchievements.com/)

---

## 8. Emerging Competitors Summary (Not in First Pass)

| Product                | Stack                              | Threat Level | Why It Matters                                                                 |
| ---------------------- | ---------------------------------- | ------------ | ------------------------------------------------------------------------------ |
| **NextLog**            | Next.js 15 + PostgreSQL + Tailwind | MEDIUM       | Closest tech stack to Propulse; Cloudlog API compatible; MIT licensed          |
| **73QRZ**              | Modern web dashboard               | LOW          | Not a logger, but proves demand for modern ham radio web UIs                   |
| **Station Master Pro** | Cross-platform app                 | MEDIUM       | GBP 3.33/mo subscription working; 5-star reviews; gamified leaderboard         |
| **World Radio League** | Web/mobile app                     | MEDIUM       | Modern UI, real-time contests, POTA integration; but data reliability concerns |
| **Hamchievements**     | Web service                        | LOW          | Gamification-focused; potential integration partner rather than competitor     |
| **Ham2K Polo**         | iPhone app                         | LOW          | Strong SOTA/POTA mobile logging; iOS only                                      |

---

## 9. Top 10 "Deep Dive" Strategic Additions

These supplement the original Top 10 and represent the overlooked opportunities with outsized emotional impact:

### 1. Accessibility-First Design (WCAG AA from Day One)

**Impact**: HIGH | **Effort**: LOW-MEDIUM (if done now; VERY HIGH if retrofitted)
ARIA roles, semantic HTML, keyboard navigation, screen reader compatibility, color-blind-safe palettes. The web platform gives Propulse an enormous structural advantage over Qt/Win32 competitors. Being the FIRST accessible ham radio logger would generate significant press coverage and community goodwill. NU7I's initiative proves the demand exists.

### 2. "On This Day" QSO Memories

**Impact**: HIGH | **Effort**: LOW
Query log for same-date contacts from previous years. Generate a card with map, solar conditions, and QSO details. Optional push notification. Zero competitors offer this. Highest engagement-to-effort ratio of any feature.

### 3. Automatic Propagation Journal (Solar Stamp Every QSO)

**Impact**: HIGH | **Effort**: MEDIUM
Auto-capture SFI, K-index, Bz at QSO time. Generate personal propagation patterns. "Your best 20m DX happens between 0200-0400 UTC when SFI > 140." Leverages existing spot collector infrastructure.

### 4. Paper-to-Digital Pipeline (FLE-Style Entry + Future OCR)

**Impact**: MEDIUM-HIGH | **Effort**: LOW (FLE mode) / HIGH (OCR)
FLE-style minimal text entry for rapid post-hoc logging. Future: phone camera OCR for paper logs. Addresses a real pain point for every portable operator.

### 5. Dual POTA+SOTA Activation Mode

**Impact**: MEDIUM-HIGH | **Effort**: MEDIUM
First-class support for simultaneous POTA and SOTA activations with direct API submission to both databases. K0NR explicitly documented this as an unmet need.

### 6. QSO Audio Attachment (Voice Memos)

**Impact**: MEDIUM | **Effort**: MEDIUM
Web Audio API rolling buffer + opus compression. "Relive your DX" playback. Share memorable QSO audio. Extends QSOrder's concept natively.

### 7. Smart New-Ham Onboarding

**Impact**: HIGH | **Effort**: MEDIUM
"What interests you?" quiz, achievement-based progressive disclosure, contextual jargon glossary, "What should I do right now?" engine. Addresses the documented onboarding cliff.

### 8. Multi-Operator / Club Station Mode

**Impact**: MEDIUM | **Effort**: MEDIUM
Operator login/switch, real-time shared log (Supabase real-time), band-slot matrix, per-operator statistics. Critical for Field Day — the single largest annual ham radio event.

### 9. Contest Calendar with One-Click Auto-Configuration

**Impact**: MEDIUM | **Effort**: MEDIUM-HIGH
Curated contest database with exchange format, scoring, multiplier definitions. "ARRL DX Contest is this weekend — activate it?" One click sets up everything.

### 10. Solar Weather Push Notifications

**Impact**: MEDIUM | **Effort**: LOW
Monitor NOAA SWPC feeds. Push notification on significant solar events correlated with band-opening predictions. "X-class flare! 10m may open in 2 hours." Pairs with existing propagation engine.

---

_Sources: 30+ web searches, 15+ page fetches, forum threads, GitHub repositories, accessibility evaluations, and blog posts. Full citations inline throughout document._
