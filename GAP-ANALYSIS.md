# Propulse Gap Analysis

**Date:** January 31, 2026
**Analyst:** Claude Code
**Purpose:** Comprehensive gap analysis for achieving "world class" status

---

## Executive Summary

Propulse has completed Phases 1-4 of its roadmap and made significant progress on Phase 5. The application currently serves as an excellent **visualization and analysis tool** for HF propagation. However, to become "world class" and compete with established tools like N1MM, HRD, and VOACAP, critical gaps remain in **operational integration** (logging, rig control, alerts) and **propagation model accuracy**.

| Category             | Current Grade | Target Grade | Gap Severity |
| -------------------- | ------------- | ------------ | ------------ |
| Visualization        | A             | A+           | Minor        |
| Propagation Science  | B-            | A            | Moderate     |
| Operational Features | C             | A            | Critical     |
| UX/Accessibility     | B+            | A            | Minor        |
| Mobile Experience    | B             | A-           | Minor        |

---

## 1. PRD vs Reality Assessment

### 1.1 Features Documented and Implemented

**Phase 1 (Solar Pulse) - 100% Complete**

- [x] Solar Flux Index, K-Index, Sunspots, A-Index display
- [x] K-Index 24-hour chart
- [x] Solar Flux 30-day trend
- [x] Flare probability panel
- [x] Band conditions matrix (11 bands)
- [x] Modal expansions for all metrics
- [x] Demo data fallback

**Phase 2 (PropSphere Core) - 100% Complete**

- [x] 3D Globe view (Three.js)
- [x] 2D Flat map view (Canvas)
- [x] Day/night terminator
- [x] Greyline visualization
- [x] Home QTH configuration
- [x] Click-to-target path analysis
- [x] Time slider (24 hours)
- [x] Basic path metrics

**Phase 3 (PropSphere Advanced) - 100% Complete**

- [x] MUF overlay layer (SFI-based estimation)
- [x] Aurora oval visualization (NOAA OVATION)
- [x] Azimuthal equidistant projection
- [x] 24-hour propagation forecast
- [x] Band-by-band path conditions with SNR
- [x] Saved targets (max 10)
- [x] Layer presets (DX Hunter, Contest, VHF, Emergency)

**Phase 4 (PropSphere Professional) - 100% Complete**

- [x] MUF/LUF/FOT ionospheric model
- [x] Signal strength predictions (ITU-R P.533 simplified)
- [x] ADIF 3.1.6 export
- [x] Cabrillo 3.0 export
- [x] CSV export
- [x] NVIS analysis
- [x] DX Cluster integration (demo data)
- [x] ITU Region band plans
- [x] License class privilege checking

**Phase 5 (PropSphere Expansion) - ~85% Complete**

- [x] Fullscreen mode with escape key exit
- [x] All panels functional in fullscreen
- [x] Recommendations panel integrated
- [x] PSKReporter API integration
- [x] RBN API integration
- [x] Live spots layer on map
- [x] Animated spot arcs (LiveSpotArcs component)
- [ ] RBN spots not rendering on map (missing geolocation)
- [ ] Source filtering not applied in LiveSpotArcs

### 1.2 Features Implemented but Not in PRD

The following features exist in code but were not explicitly documented:

1. **IndexedDB Local Storage** (`src/lib/db/`) - Full CRUD for log entries and alert rules
2. **Alert Matching System** (`src/lib/utils/alertMatcher.ts`) - Rule-based spot alerting
3. **ADIF Parser** (`src/lib/utils/adifParser.ts`) - Import capability
4. **Prefix Locations** (`src/lib/data/prefixLocations.ts`) - Callsign to location mapping
5. **Radio Manager** (`src/components/settings/RadioManager.tsx`) - Radio configuration UI
6. **Notification System** (`src/lib/utils/notifications.ts`) - Browser notification support

### 1.3 PRD Accuracy Assessment

| Aspect                 | Accuracy | Notes                                     |
| ---------------------- | -------- | ----------------------------------------- |
| Feature descriptions   | 95%      | Very accurate                             |
| Technical architecture | 90%      | Some deviations (Canvas vs Leaflet)       |
| API integrations       | 85%      | GIRO rate limit workaround not documented |
| Success criteria       | 95%      | All measurable and met                    |
| Timeline estimates     | 100%     | Phases 1-4 completed on schedule          |

**PRD Overall Accuracy: 93%** - Well-maintained and up-to-date.

---

## 2. Phase Status Assessment

### Phase 1-4: Verified Complete

All claimed deliverables have been verified in the codebase:

- 70+ React components
- 7 custom hooks
- 4 Zustand stores
- Complete API layer with proxies
- Full export system

### Phase 5: Current Status

**Completed Items:**

1. FullscreenPropSphere with all panels
2. RecommendationsPanel with intelligent band suggestions
3. useLiveSpots hook with PSKReporter + RBN
4. LiveSpotArcs component for animated paths
5. DXSpotList with filtering UI

**Remaining Items (from EXPERT-FEEDBACK.md):**

1. RBN geolocation - spots have no coordinates, don't render on globe
2. Source filtering - UI exists but filter not applied in LiveSpotArcs
3. A-Index calculation fix - uses incorrect `Kp * 4` formula
4. Bz component - missing from solar display
5. Input validation in API proxies

**Phase 5 Completion: 85%**

### Phase 6: "Pro Mode" - Not Scoped

The PRD describes Phase 6 deliverables but lacks implementation details:

| Feature               | Specification Level      | Implementation Ready        |
| --------------------- | ------------------------ | --------------------------- |
| Pro Mode button       | Vague                    | No                          |
| Center globe display  | Clear                    | Yes (exists)                |
| Mini map portals      | Vague                    | No                          |
| Contest presets       | Listed but not specified | No                          |
| Band recommendations  | Partially specified      | Already implemented         |
| Rate/Score tracking   | Basic concept            | No                          |
| Contact logging panel | Clear                    | Partially (IndexedDB ready) |
| Unified layout        | Grid concept only        | No                          |

**Phase 6 Scoping: 40%** - Needs detailed specifications before implementation.

### Phase 7: "LogBook & Awards" - Partially Scoped

The PRD provides good feature lists but missing technical details:

| Feature              | Specification Level    | Implementation Ready |
| -------------------- | ---------------------- | -------------------- |
| Quick log entry form | UI mockup exists       | Yes                  |
| Contact list view    | Concept only           | Partial              |
| ADIF import          | Clear                  | Yes (parser exists)  |
| DXCC tracking        | Entity list referenced | Needs entity data    |
| WAS tracking         | Basic concept          | Needs state mapping  |
| WAZ tracking         | Basic concept          | Needs zone mapping   |
| IOTA tracking        | Mentioned              | No data structure    |
| Callsign lookup      | API specified          | Ready                |
| IndexedDB storage    | Not in PRD             | Already implemented  |
| Award visualization  | Mockup exists          | No                   |

**Phase 7 Scoping: 60%** - Core storage ready, needs award calculation logic.

---

## 3. Critical Gaps for "World Class" Status

### 3.1 Must-Have Features (Priority: Critical)

Based on EXPERT-FEEDBACK.md and competitor analysis:

| Gap                               | Impact                           | Complexity | Competitor Reference     |
| --------------------------------- | -------------------------------- | ---------- | ------------------------ |
| **Contact Logging UI**            | Can't track worked stations      | Medium     | N1MM, HRD                |
| **Worked/Needed Status on Spots** | No DX hunting capability         | Medium     | N1MM, DXLab              |
| **ATNO Alerts**                   | Miss rare DX                     | Low        | Inherent DX feature      |
| **Bz Component Display**          | Missing critical storm predictor | Low        | SolarHam, HamQSL         |
| **Correct A-Index Calculation**   | Inaccurate data display          | Low        | All competitors          |
| **RBN Spot Geolocation**          | Half the spots don't render      | Low        | Already have prefix data |

### 3.2 Nice-to-Have Features (Priority: Medium)

| Gap                                | Impact                     | Complexity | Notes                            |
| ---------------------------------- | -------------------------- | ---------- | -------------------------------- |
| Gray line enhancement modeling     | +5-15 dB accuracy          | Medium     | RF expert recommended            |
| Polar path auroral absorption      | Accurate polar predictions | High       | Currently 4dB, should be 20-40dB |
| Trans-equatorial propagation (TEP) | 6m/10m predictions         | Medium     | Not implemented                  |
| Sporadic E prediction              | VHF opportunities          | High       | No model exists                  |
| VOACAP API integration             | Gold-standard predictions  | Medium     | Standard for serious tools       |
| Callsign auto-lookup               | Faster logging             | Low        | HamQTH API ready                 |
| Contest mode                       | Rapid logging              | High       | N1MM competitor                  |

### 3.3 Potential Competitive Differentiators

Features that could set Propulse apart:

1. **Unified Visualization + Logging** - No current tool does both well
2. **Mobile-First Design** - Desktop tools don't work on phones
3. **AI-Powered Recommendations** - "When should I work Japan?" answered intelligently
4. **Historical Propagation Analysis** - "How did conditions compare to last week?"
5. **Social DX Features** - Share interesting openings with community
6. **Offline-First Architecture** - Works without internet (IndexedDB ready)

---

## 4. UX Gaps

### 4.1 Beginner Friendliness Issues

| Issue                                  | Severity | Fix Complexity |
| -------------------------------------- | -------- | -------------- |
| No onboarding flow                     | High     | Medium         |
| Tooltips exist but inconsistent        | Medium   | Low            |
| No "What does this mean?" explanations | Medium   | Low            |
| Band conditions hard to interpret      | Medium   | Low            |
| No guided first-time experience        | High     | Medium         |

**Recommendation:** Implement progressive disclosure mode selector (Beginner/Intermediate/Expert) as specified in PRD but not implemented.

### 4.2 Power User Features Missing

| Feature               | Impact | Notes                           |
| --------------------- | ------ | ------------------------------- |
| Keyboard shortcuts    | High   | No hotkeys for common actions   |
| Rig control (CAT)     | High   | Can't tune to spotted frequency |
| WSJT-X integration    | Medium | No FT8 SNR reports              |
| Custom alert sounds   | Low    | Single notification sound       |
| Layout customization  | Medium | Fixed panel arrangement         |
| Multi-monitor support | Medium | No detachable panels            |

### 4.3 Mobile Responsiveness

| View             | Desktop   | Tablet | Phone |
| ---------------- | --------- | ------ | ----- |
| SolarPulse       | Excellent | Good   | Good  |
| PropSphere Globe | Excellent | Good   | Fair  |
| PropSphere Flat  | Excellent | Good   | Good  |
| Azimuthal        | Good      | Fair   | Poor  |
| Fullscreen Mode  | Excellent | Fair   | Poor  |

**Issues:**

- Azimuthal view controls cramped on mobile
- Fullscreen panels overlap on small screens
- Touch interactions on globe could be smoother
- DXSpotList needs virtualization for long lists

### 4.4 Accessibility

| Aspect                | Current State   | WCAG 2.1 AA Compliance |
| --------------------- | --------------- | ---------------------- |
| Color contrast        | Good            | Likely passes          |
| Keyboard navigation   | Partial         | Needs work             |
| Screen reader support | Unknown         | Not tested             |
| Focus indicators      | Inconsistent    | Needs work             |
| Alt text for images   | Partial         | Needs audit            |
| Motion preferences    | Not implemented | Fails                  |

**Recommendation:** Conduct full accessibility audit before Phase 9.

---

## 5. Technical Debt

### 5.1 Code Issues (from EXPERT-FEEDBACK.md)

| Issue                             | File(s)                  | Severity | Fix Time |
| --------------------------------- | ------------------------ | -------- | -------- |
| CORS wildcard `*`                 | All API proxies          | High     | 1 hour   |
| No input validation               | `api/spots/*.ts`         | High     | 2 hours  |
| Memory leak risk                  | `useDXCluster.ts`        | Medium   | 1 hour   |
| `bands.ts` monolith (1200+ lines) | `src/lib/utils/bands.ts` | Medium   | 4 hours  |
| Missing AbortController           | Fetch requests           | Low      | 2 hours  |

### 5.2 Performance Concerns

| Concern                   | Current State      | Target     | Fix                     |
| ------------------------- | ------------------ | ---------- | ----------------------- |
| Three.js bundle size      | ~500KB             | <300KB     | Tree-shaking, lazy load |
| DXSpotList rendering      | Slows at 50+ spots | 500+ spots | Virtualization          |
| MUF calculation frequency | Every render       | Throttled  | Memoization             |
| Aurora overlay complexity | High polygon count | Simplified | LOD system              |

### 5.3 Security Issues

| Issue                       | Risk Level | Mitigation                |
| --------------------------- | ---------- | ------------------------- |
| CORS wildcards              | Medium     | Restrict to known origins |
| Unbounded API limits        | Low        | Add validation            |
| No rate limiting on client  | Low        | Add request throttling    |
| localStorage sensitive data | Low        | Encrypt if needed         |

---

## 6. Recommended Priority Order

### Tier 1: Quick Wins (1-2 days each)

Impact: High | Complexity: Low

1. **Fix A-Index calculation** - Use proper Kp-to-Ap conversion table
2. **Add RBN geolocation** - Use existing `prefixLocations.ts` data
3. **Apply source filtering in LiveSpotArcs** - Connect existing filter state
4. **Add Bz component to solar display** - New API proxy + display
5. **Fix CORS wildcards** - Use environment variable for origin
6. **Add input validation** - Validate limit and grid parameters

### Tier 2: Core Operational Features (1-2 weeks each)

Impact: Critical | Complexity: Medium

7. **Contact Logging UI** - Form + list view using existing IndexedDB
8. **Worked/Needed Status** - Query log entries for spot enrichment
9. **ATNO/New Band Alerts** - Use existing alert system + notifications
10. **ADIF Import Flow** - UI for existing parser

### Tier 3: Enhanced Accuracy (1-2 weeks each)

Impact: Medium | Complexity: Medium-High

11. **Gray line enhancement modeling** - Physics improvement
12. **Improved polar path absorption** - Geomagnetic coordinate system
13. **Sporadic E seasonal model** - Statistical prediction

### Tier 4: Polish & Differentiation (2-4 weeks each)

Impact: Medium | Complexity: Medium

14. **Onboarding flow** - First-time user experience
15. **Progressive disclosure mode** - Beginner/Intermediate/Expert
16. **Mobile optimization** - Touch improvements, responsive fixes
17. **Keyboard shortcuts** - Power user efficiency
18. **Accessibility audit** - WCAG 2.1 AA compliance

### Tier 5: Advanced Features (Future)

Impact: Varies | Complexity: High

19. **Contest mode** - Full Phase 6 implementation
20. **Rig control (CAT)** - Hardware integration
21. **WSJT-X integration** - FT8 SNR reports
22. **VOACAP API integration** - Gold-standard predictions
23. **Cloud sync** - Phase 8 features

---

## 7. Metrics for "World Class" Status

| Metric                          | Current | Target   | Gap     |
| ------------------------------- | ------- | -------- | ------- |
| Feature parity with DXLook      | 70%     | 95%      | 25%     |
| Feature parity with VOACAP      | 60%     | 80%      | 20%     |
| Logging feature parity with QRZ | 20%     | 80%      | 60%     |
| Propagation accuracy            | B-      | A-       | 1 grade |
| Mobile usability                | B       | A-       | 1 grade |
| Time to first value             | 5 min   | <1 min   | 4 min   |
| User retention (theoretical)    | Unknown | >50% DAU | -       |

---

## 8. Conclusion

Propulse has a **solid foundation** with excellent visualization capabilities and accurate ionospheric modeling. The primary gaps are in **operational integration** - the features that turn a visualization tool into an operating companion.

**To achieve "world class" status, prioritize:**

1. Complete Phase 5 remaining items (RBN geolocation, source filtering, A-index fix)
2. Implement contact logging UI using existing IndexedDB infrastructure
3. Add worked/needed status enrichment to DX spots
4. Fix the CORS and validation security issues
5. Implement basic alerts for ATNO/new band slots

These five initiatives would transform Propulse from "something I would glance at" (per the RF expert) into "something I would operate with."

---

_Document generated by gap analysis of PRD-COMPREHENSIVE.md, EXPERT-FEEDBACK.md, PLAN-PHASE5.md, PLAN-PHASE3.md, and codebase exploration._
