# PropSphere - Global HF Propagation Visualizer

## Product Requirements Document

**Version:** 1.0  
**Last Updated:** January 31, 2026  
**Author:** Chris & Claude

---

## Executive Summary

PropSphere is a next-generation, real-time HF propagation visualization platform that combines 3D globe rendering with live space weather data to help amateur radio operators optimize their DX operations. Think "FlightRadar24 meets Google Earth for radio waves."

### Vision Statement
*"Make the invisible visible"* — Transform complex ionospheric physics into intuitive, actionable visuals that help any ham operator understand and predict propagation conditions.

---

## Problem Statement

### Current Pain Points

1. **Fragmented Data Sources**
   - HamQSL, NOAA SWPC, PSKReporter, DXCluster all show different pieces
   - No unified view of "what bands are open where right now"

2. **Steep Learning Curve**
   - Understanding SFI, K-index, MUF, foF2 requires expertise
   - New hams struggle to translate numbers into "should I try 20m to Japan?"

3. **Static Predictions**
   - VOACAP gives point-in-time snapshots
   - Real-world propagation is dynamic and changes hour-by-hour

4. **Poor Visualization**
   - Text-based band condition reports
   - No intuitive spatial understanding of propagation paths

---

## Target Users

### Primary: Active HF Operators
- **Profile:** Licensed amateur radio operators who regularly work HF bands
- **Goals:** Maximize DX contacts, plan operating schedules, understand propagation
- **Pain:** Checking multiple sources before getting on air, missing band openings

### Secondary: New Hams & Technicians
- **Profile:** Recently licensed or upgrading, curious about HF
- **Goals:** Learn how propagation works, understand when to try HF
- **Pain:** Intimidated by technical jargon, don't know when bands are open

### Tertiary: SWL & Radio Enthusiasts
- **Profile:** Shortwave listeners, emergency communicators, preppers
- **Goals:** Know when to tune in for distant broadcasts, understand skip
- **Pain:** No simple way to know what's receivable

---

## Core Features

### 1. Interactive Globe View

**Description:** Real-time 3D Earth visualization showing radio propagation conditions

**Requirements:**
- WebGL-based 3D globe (Three.js or Cesium)
- Day/night terminator with smooth transition
- Moon position and shadow
- Greyline highlight band (±15° of terminator)
- Click-drag rotation, pinch/scroll zoom
- Auto-rotation option (configurable speed)
- Smooth animations at 60fps

**Technical Specs:**
- Globe resolution: 4K texture minimum
- Coastline detail: 10km resolution
- Performance target: <16ms frame time on mid-range GPU

### 2. Data Overlay Layers

**Description:** Toggleable visual layers showing different propagation factors

| Layer | Data Source | Update Freq | Visualization |
|-------|-------------|-------------|---------------|
| Day/Night Terminator | Calculated | Real-time | Shadow gradient |
| Greyline Zone | Calculated | Real-time | Golden band at terminator edges |
| MUF (Maximum Usable Frequency) | NOAA ionosondes, GIRO | 15 min | Heatmap (color = frequency) |
| foF2 Critical Frequency | GIRO/LGDC | 15 min | Contour lines |
| D-Layer Absorption | GOES X-ray flux | 1 min | Red/orange danger zones |
| Aurora Oval | OVATION model | 30 min | Green/purple glow at poles |
| Sporadic E Probability | DX cluster analysis | 5 min | Bright cloud patches |
| Signal Noise Floor | K-index derived | 3 hours | Noise intensity gradient |
| Real-time Spots | PSKReporter/RBN | 1 min | Animated arcs/lines |

**Layer Controls:**
- Toggle each layer on/off
- Adjust opacity per layer
- Layer presets: "DX Hunter", "Contester", "SWL", "Emergency"

### 3. View Modes

**3.1 Globe View (Default)**
- 3D spherical Earth
- Best for understanding global propagation
- Natural intuition for day/night

**3.2 Flat Map View**
- Mercator or Robinson projection
- Better for path measurement
- Familiar map interface
- Options: Equirectangular, Mercator, Robinson, Mollweide

**3.3 Azimuthal View**
- Centered on user's QTH
- "Beam heading" perspective
- Distance rings at 5000km intervals
- Bearing labels (N/E/S/W and degrees)
- Best for antenna pointing

**3.4 Path Profile View** (Future)
- Side view showing ionospheric layers
- F1, F2, E, D layer heights
- Ray tracing showing skip path
- Hop points visualization

### 4. Home QTH Management

**Description:** Configure and persist user's station location

**Features:**
- Set location by:
  - Click on map
  - Enter grid square (Maidenhead)
  - Enter lat/lon
  - GPS/browser geolocation
  - Address lookup (geocoding)
- Store callsign for display
- Multiple QTH profiles (home, portable, club)
- Persistent storage (localStorage + optional account)
- Calculate local sunrise/sunset/greyline times

### 5. Path Analysis Tool

**Description:** Deep analysis of propagation path between two points

**Inputs:**
- Home QTH (automatic)
- Target location (click, grid square, callsign lookup)

**Outputs:**
| Metric | Description |
|--------|-------------|
| Great Circle Distance | km and miles |
| Short Path Bearing | Degrees from north |
| Long Path Bearing | Opposite direction |
| Hop Count Estimate | Number of ionospheric bounces |
| Band Conditions | Per-band open/closed status |
| Best Band | Currently optimal frequency |
| Difficulty Rating | 1-5 stars based on distance, conditions, time |
| SNR Estimate | Expected signal-to-noise ratio |
| Optimal Times | 24-hour chart showing best windows |

**Algorithm Factors:**
- Solar flux index (SFI)
- K-index (geomagnetic activity)
- Time of day at both ends
- Season (affects MUF)
- Distance and path geometry
- Current MUF at midpoint
- D-layer absorption (for lower bands)

### 6. Band Scanner Panel

**Description:** Quick reference for all bands with current status

**Display per band (160m → 6m):**
- Band name and frequency range
- Current status (Excellent/Good/Fair/Poor/Closed)
- Day vs Night conditions
- Estimated SNR
- Recommended modes (CW/SSB/FT8/Digital)
- Activity indicator (from cluster data)

**Visual Design:**
- Color-coded status pills
- Compact grid layout
- Expandable for details

### 7. Time Controls

**Description:** View conditions at any time, not just now

**Features:**
- Real-time mode (default, live updates)
- Time slider: ±24 hours from now
- Time input: Jump to specific date/time
- Animation mode: Watch conditions evolve
- Playback speed: 1x, 2x, 5x, 10x
- Day-of-year presets (equinox, solstice)

**Use Cases:**
- "What will 20m to Japan look like at 0600 UTC?"
- "Watch the greyline sweep across the Pacific"
- "Compare summer vs winter conditions"

### 8. Alerts & Notifications (Future)

**Description:** Proactive alerts for band openings

**Alert Types:**
- Band opening to target area
- Greyline approaching path
- Solar event (flare, CME)
- Geomagnetic storm beginning
- Sporadic E detected
- DX spotted on watched band/path

**Delivery:**
- In-app toast notifications
- Browser push notifications
- Email digest (optional)
- Webhook for integration

---

## Data Sources & APIs

### Primary Sources (NOAA SWPC)

| Endpoint | Data | Update |
|----------|------|--------|
| `/json/planetary_k_index_1m.json` | K-index history | 1 min |
| `/json/f107_cm_flux.json` | Solar flux index | Daily |
| `/json/solar_probabilities.json` | Flare probabilities | Daily |
| `/json/ovation_aurora_latest.json` | Aurora forecast | 30 min |
| `/json/goes/primary/xrays-*.json` | X-ray flux | 1 min |
| `/json/solar-cycle/sunspots.json` | Sunspot numbers | Daily |

### Secondary Sources

| Source | Data | Access |
|--------|------|--------|
| GIRO/LGDC | foF2, MUF from ionosondes | REST API |
| PSKReporter | Real-time digital spots | WebSocket |
| Reverse Beacon Network | CW/RTTY spots | API |
| DX Cluster | SSB/CW DX spots | Telnet/API |
| QRZ.com | Callsign lookup | API (key required) |
| HamQTH | Callsign lookup | API (free) |

### Calculated Data

| Metric | Calculation |
|--------|-------------|
| Sun position | NOAA solar position algorithm |
| Moon position | Simplified lunar ephemeris |
| Terminator | 90° from sun longitude |
| Greyline | Terminator ±10-15° |
| MUF estimate | f = SFI/10 * sqrt(cos(zenith)) |
| Path loss | Free space + ionospheric absorption |
| Hop count | Distance / avg skip distance (~3000km) |

---

## Technical Architecture

### Frontend Stack

```
React 18 + TypeScript
├── Three.js (3D globe rendering)
├── D3.js (data visualization)
├── Zustand (state management)
├── React Query (data fetching/caching)
├── Tailwind CSS (styling)
└── Framer Motion (animations)
```

### Performance Requirements

| Metric | Target |
|--------|--------|
| Initial load | < 3s on 4G |
| Time to interactive | < 5s |
| Frame rate | 60fps stable |
| Memory usage | < 200MB |
| API calls | Batched, cached |

### Browser Support

- Chrome 90+ (primary)
- Firefox 88+
- Safari 14+
- Edge 90+
- Mobile: iOS Safari, Android Chrome

### Deployment

- Static hosting (Vercel, Netlify, Cloudflare Pages)
- CDN for globe textures
- API proxy for CORS-blocked sources
- Optional: Edge workers for data aggregation

---

## UI/UX Design Principles

### Visual Design

1. **Dark Theme Primary**
   - Space/cosmic aesthetic
   - Reduces eye strain for night operating
   - Better contrast for data visualization

2. **Color Palette**
   - Primary: Orange (#FF6B35) - energy, radio waves
   - Secondary: Cyan (#00FF88) - positive conditions
   - Warning: Yellow (#FFD23F) - caution
   - Danger: Red (#FF4455) - poor conditions
   - Background: Deep blue/black gradients

3. **Typography**
   - Headers: Orbitron (sci-fi, technical)
   - Data: JetBrains Mono (readable numbers)
   - Body: Inter (clean, accessible)

### Interaction Design

1. **Direct Manipulation**
   - Click to set targets
   - Drag to rotate globe
   - Pinch/scroll to zoom

2. **Progressive Disclosure**
   - Simple view by default
   - Advanced options expandable
   - Tooltips for technical terms

3. **Feedback**
   - Hover states on all interactive elements
   - Loading indicators for data fetches
   - Success/error toasts for actions

---

## Roadmap

### Phase 1: MVP (8 weeks)

- [ ] Basic 3D globe with day/night
- [ ] Home QTH setting
- [ ] Click-to-target selection
- [ ] Band conditions panel
- [ ] Path analysis (distance, bearing, best band)
- [ ] Solar data display (SFI, K-index, SSN)
- [ ] Flat map view
- [ ] Time slider

### Phase 2: Enhanced Visualization (6 weeks)

- [ ] MUF overlay layer
- [ ] Aurora oval visualization
- [ ] Azimuthal projection view
- [ ] Real-time spot overlay (PSKReporter)
- [ ] 24-hour optimal time chart
- [ ] Multiple QTH profiles

### Phase 3: Advanced Features (8 weeks)

- [ ] D-layer absorption overlay
- [ ] Sporadic E detection
- [ ] Path profile view (ionospheric layers)
- [ ] Greyline tracking and alerts
- [ ] Mobile-responsive design
- [ ] PWA (offline capable)

### Phase 4: Community & Integration (6 weeks)

- [ ] User accounts (optional)
- [ ] Saved paths and targets
- [ ] Alert notifications
- [ ] Callsign lookup integration
- [ ] Export to ADIF
- [ ] API for third-party integration

---

## Success Metrics

### User Engagement

| Metric | Target |
|--------|--------|
| Daily Active Users | 5,000+ |
| Session Duration | > 3 minutes |
| Return Rate (7-day) | > 40% |
| Feature Adoption | > 60% use path analysis |

### Technical Performance

| Metric | Target |
|--------|--------|
| Uptime | 99.9% |
| API Response Time | < 200ms |
| Error Rate | < 0.1% |
| Lighthouse Score | > 90 |

### User Satisfaction

| Metric | Target |
|--------|--------|
| NPS Score | > 50 |
| App Store Rating | > 4.5 stars |
| Support Tickets | < 10/week |

---

## Competitive Analysis

| Product | Strengths | Weaknesses |
|---------|-----------|------------|
| HamQSL | Comprehensive data, embeddable widgets | Dated design, no interactivity |
| VOACAP Online | Accurate predictions | Complex UI, point-in-time only |
| PSKReporter | Real-time spots | No propagation context |
| DXMaps | Good visualization | Focused on spotting, not prediction |
| PropView | Good predictions | Desktop only, dated |

**PropSphere Differentiation:**
- Modern, intuitive interface
- Real-time 3D visualization
- Unified data sources
- Path-focused analysis
- Time scrubbing capability
- Mobile-first design

---

## Appendix

### Glossary

| Term | Definition |
|------|------------|
| SFI | Solar Flux Index - 10.7cm radio emissions from sun |
| K-index | Geomagnetic activity (0-9 scale) |
| MUF | Maximum Usable Frequency - highest freq that will reflect |
| foF2 | Critical frequency of F2 layer |
| Greyline | Zone at sunrise/sunset with enhanced propagation |
| Skip | Radio wave bouncing off ionosphere |
| QTH | Station location (from Q-codes) |
| DX | Long-distance contact |

### References

1. [NOAA Space Weather Prediction Center](https://www.swpc.noaa.gov/)
2. [GIRO - Global Ionospheric Radio Observatory](https://giro.uml.edu/)
3. [VOACAP](https://www.voacap.com/)
4. [PSKReporter](https://pskreporter.info/)
5. [ITU-R P.533 - HF Propagation Prediction Method](https://www.itu.int/rec/R-REC-P.533/)

---

*"The ionosphere is nature's most magnificent antenna — let's help everyone see it."*
