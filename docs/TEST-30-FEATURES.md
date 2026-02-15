# Feature Testing Checklist — 30 New Features

Run `npm run dev` and open `http://localhost:5173`. Test each feature below and note any bugs.

---

## A. Solar Data — `/solar` Page

### A1. Proton Flux Card

**Where**: Solar Pulse page, in a 2-column row after the NOAA Scales / X-ray / Solar Wind cards
**Expected**:

- Card titled "Proton Flux" with a value in **pfu** (particle flux units)
- S-scale classification badge: S0 (green), S1 (yellow), S2 (orange), S3+ (red)
- Timestamp showing when data was last updated
- Small reference legend at bottom (S1=10, S2=100, etc.)
- Loading spinner while fetching

**If broken**: Card missing entirely, shows "N/A" permanently, or no color coding

---

### A2. Dst Index Card

**Where**: Solar Pulse page, paired with Proton Flux in the same 2-column row
**Expected**:

- Card titled "Dst Index" with a value in **nT** (nanotesla), typically negative during storms
- Storm classification: Quiet (green, >-30), Moderate (yellow), Active (orange), Storm/Severe (red)
- Timestamp
- Classification reference legend

**If broken**: Card missing, value always 0, or wrong color mapping

---

### A3. SFI 3-Day Forecast Table

**Where**: Solar Pulse page, between the chart rows and flare probability section
**Expected**:

- Table with 3 rows (one per forecast day)
- Columns: Date, Predicted SFI (color-coded), Observed SFI (if available)
- SFI color: green (>100 = good), yellow (80-100), orange (70-80), red (<70)
- Interpretation legend at bottom

**If broken**: Table empty, dates wrong, all values null

---

### A4. CME Analysis Panel

**Where**: Solar Pulse page, after the flare probability / band conditions section
**Expected**:

- Section titled "CME Analysis" or similar
- If CMEs exist (speed >500 km/s in past 30 days): cards showing speed, half-angle, type, date, notes
- Speed color-coded: green (<800), yellow (800-1200), red (>1200 km/s)
- If no significant CMEs: message like "No significant CME activity"
- Link to NASA DONKI

**If broken**: Section missing, data never loads, or always shows empty

---

### A5. Mobile Solar Panels

**Where**: Open on mobile viewport (or resize browser narrow). Navigate to Solar section.
**Expected**: Same 4 panels (Proton, Dst, SFI Forecast, CME) appear as accordion cards
**If broken**: Panels don't appear on mobile, layout breaks

---

## B. Satellite Features — Globe View Satellite Panel

Open the Prop Spheres 3D globe. Enable the **Satellites** layer in the Layers menu.

### B1. SGP4 Accuracy

**Where**: Click any satellite marker on globe
**Expected**:

- Satellite diamond markers visible on globe, moving in real-time
- Ground track line appears when satellite is selected
- Position updates every ~5 seconds

**If broken**: No satellite markers, markers frozen, ground track missing

---

### B2. Custom TLE Import Button

**Where**: Satellite panel header area (top toolbar)
**Expected**:

- Small upload/cloud icon button in the panel toolbar
- Click it → centered modal dialog opens
- Dialog has: textarea for pasting TLE, "Source" label input, "Import from file" button
- Paste a valid 3-line TLE → preview shows satellite name + NORAD ID
- Click Import → success message, dialog closes, satellite appears on globe

**Test TLE** (paste this):

```
ISS (ZARYA)
1 25544U 98067A   24045.53205556  .00016717  00000-0  30059-3 0  9998
2 25544  51.6412 201.1234 0007891  34.5678 325.5432 15.49560123456780
```

**If broken**: No upload button visible, dialog doesn't open, import fails silently

---

### B3. Pass Quality Stars

**Where**: Satellite panel pass prediction list (click a satellite to see upcoming passes)
**Expected**:

- Each pass row shows ★ star rating (1-5 filled stars)
- Quality label badge: "Excellent" (green), "Good" (green), "Fair" (yellow), "Marginal" (orange), "Poor" (red)
- Higher elevation passes get more stars

**If broken**: No stars visible, all passes show same rating, label colors wrong

---

### B4. Satellite Log Button

**Where**: Satellite detail view, when a satellite is above the horizon
**Expected**:

- Green "Log This Pass" button with pencil icon
- Only appears when satellite elevation > 0 (above horizon)
- Click → navigates to `/log` with pre-filled fields (SAT_NAME, mode, frequency)

**If broken**: Button never appears, doesn't navigate, fields not pre-filled

---

### B5. Notification Bell Toggle

**Where**: Satellite panel header toolbar
**Expected**:

- Bell icon button (only if browser supports notifications)
- Gray when disabled, green with dot when enabled
- Click → browser asks "Allow notifications?" permission prompt
- Once allowed, bell turns green

**If broken**: No bell icon, clicking does nothing, permission not requested

---

### B6. SatNOGS Transponders

**Where**: Satellite detail area showing transponder info
**Expected**:

- When selecting a satellite with known transponders, see transponder list
- "SatNOGS" badge next to "Transponders" heading (if live data available)
- Each transponder shows: mode, uplink/downlink frequencies, active/inactive badge
- Falls back to static data if SatNOGS unavailable

**If broken**: No transponders shown, "SatNOGS" badge but empty list, badge missing

---

### B7. Link Budget Indicator

**Where**: Satellite Detail Modal (click expand/detail on a satellite)
**Expected**:

- Near the Doppler correction display: colored pill showing "Good" (green), "Marginal" (yellow), or "Unlikely" (red)
- Secondary info: path loss (dB), squint angle (°), link margin (dB)
- Only shows when satellite is visible and transponder data exists

**If broken**: Pill never appears, always shows same quality, missing secondary info

---

### B8. Satellite Footprints

**Where**: 3D Globe, Layers menu → Activity → "Sat Footprints"
**Expected**:

- Toggle on → translucent circles appear on globe under visible satellites
- Circle radius proportional to satellite altitude (ISS ~408km = large circle, ~2400km radius)
- Circles colored by satellite category
- Move in real-time as satellites orbit
- Maximum 5 footprints at once

**If broken**: No circles appear, circles don't move, circles at wrong size/position

---

## C. 3D Globe Layers — Prop Spheres

Open the Layers menu (layers icon in toolbar). Each new layer has a toggle.

### C1. NVIS Coverage Dome

**Where**: Layers → Propagation → "NVIS Coverage"
**Expected**:

- Semi-transparent cyan hemisphere dome centered on your QTH location
- Dome size ~300km radius (small but visible bubble)
- Gentle pulsing opacity animation
- Band labels at dome edge ("40m", "80m", etc.)
- Color varies by quality: bright cyan (excellent) → teal (fair) → hidden (none)

**If broken**: No dome appears, dome at wrong location, no pulse animation, no band labels

---

### C2. Sporadic E Clouds

**Where**: Layers → Propagation → "Sporadic E"
**Expected**:

- Translucent green patches floating above the globe at E-layer altitude
- Concentrated at mid-latitudes (30-50°), stronger in summer months
- Brighter patches = higher probability
- Additive blending for ethereal cloud look

**If broken**: No patches, patches at wrong altitude, patches everywhere uniformly

---

### C3. D-RAP Absorption

**Where**: Layers → Propagation → "D-RAP Absorption"
**Expected**:

- Colored patches at ionospheric altitude showing HF absorption
- Color: blue (normal >15MHz) → yellow (some absorption) → orange → red (severe blackout <5MHz)
- Concentrated on the sunlit side of Earth during solar flare events
- During quiet conditions: mostly blue or nothing visible

**If broken**: No overlay, all one color, covers dark side too

---

### C4. Tropospheric Ducting

**Where**: Layers → Propagation → "Tropo Ducting"
**Expected**:

- Colored patches at ground level showing ducting probability
- Color by type: green (surface duct), yellow (elevated), teal (evaporation)
- Concentrated along coastlines (Mediterranean, Gulf of Mexico, Persian Gulf)
- Stronger in evening/overnight, late summer

**If broken**: No patches, patches over land interiors (should be coastal), wrong colors

---

### C5. HF Noise Floor

**Where**: Layers → Propagation → "HF Noise Floor"
**Expected**:

- Global heatmap of small colored discs at grid points
- Color: blue (quiet, polar/rural) → green → yellow → red (noisy, tropical/urban)
- Tropical belt should be noisier (redder) than polar regions
- Calculated for 14 MHz (20m band) by default

**If broken**: No heatmap, all same color, pattern doesn't match geography

---

### C6. Geomagnetic Field Lines

**Where**: Layers → Propagation → "Geomagnetic Field"
**Expected**:

- 3D curves arcing from magnetic north to south poles
- Extend well above the globe (up to ~3x Earth radius)
- Color by current Kp: green (quiet) → yellow → orange → red (storm)
- Small particles flowing along the field lines (animated)
- ~32 field lines visible

**If broken**: No curves, curves don't connect poles, no particle animation, wrong color

---

### C7. WSPR Paths

**Where**: Layers → Activity → "WSPR Paths"
**Expected**:

- Glowing arcs between TX and RX locations (like existing spot arcs but for WSPR)
- Color by band: red (160m) through purple (10m)
- Arc height proportional to distance
- Brighter arcs = higher SNR
- Up to 100 arcs

**If broken**: No arcs, all same color, arcs flat on surface, no brightness variation

---

### C8. Beacon Network

**Where**: Layers → Activity → "Beacon Network"
**Expected**:

- 18 diamond-shaped markers at beacon station locations worldwide
- All beacons in golden yellow
- ONE beacon pulsing bright green = currently transmitting on 14.100 MHz
- Active beacon label shows callsign + frequency (e.g., "4U1UN 14.100")
- Active beacon changes every 10 seconds (3-minute full cycle)

**If broken**: No markers, no pulsing active beacon, active beacon never changes, wrong positions

---

### C9. Meteor Showers

**Where**: Layers → Activity → "Meteor Showers"
**Expected**:

- Starburst icons at radiant points of active meteor showers
- Translucent scatter zone circles around each radiant
- 6m-favorable showers in green, others in purple/magenta
- Drifting particle animation from center outward
- Labels with shower name, ZHR, and peak timing
- Only visible during active shower date ranges (check current date)

**If broken**: Nothing visible (may be correct if no showers active today), wrong positions, no labels

---

### C10. Spectrum Waterfall Ring

**Where**: Layers → Activity → "Spectrum Waterfall"
**Expected**:

- Ring structure orbiting at the equator, slightly above globe
- Segmented by band (160m through 2m)
- Color shows activity: dark blue (quiet) → cyan → yellow → white (active)
- Scrolls over time (waterfall effect, new row every 30 seconds)
- Band labels around the edge
- Takes ~30 seconds for first row to appear (samples on interval)

**If broken**: Nothing visible (wait 30+ seconds), ring not at equator, no scrolling, all dark

---

### C11. Terminator Enhancement

**Where**: Automatically visible when "Greyline" layer is ON (Layers → Illumination → Greyline)
**Expected**:

- Glowing golden/orange band along the day/night boundary (terminator line)
- Subtle flowing particles along the terminator path
- Represents enhanced propagation corridor
- Only visible with greyline toggle enabled

**If broken**: No golden glow on terminator, particles missing, visible even with greyline off

---

### C12. Science Preset

**Where**: Toolbar presets (the row of preset buttons at top)
**Expected**:

- "Science" or "SCI" preset button with nebula-blue accent
- Click → enables: terminator, aurora, ionosphere, DRAP, geomagnetic field, noise floor
- Disables other layers not in the preset

**If broken**: No Science preset, wrong layers enabled, accent color wrong

---

## Bug Report Template

```
## Bug: [Feature Name]

**Feature #**: (e.g., C6 Geomagnetic Field Lines)
**Expected**: What should happen
**Actual**: What actually happened
**Steps**: How to reproduce
**Screenshot**: (attach if possible)
**Browser**: Chrome/Firefox/Safari + version
**Mobile?**: Yes/No
```
