# PropSphere Sprint Roadmap

**Product**: Propulse - PropSphere Map View
**Document Version**: 1.0
**Created**: 2026-02-03

---

## Overview

This document outlines three sprints of planned features, polish, and quality-of-life improvements for the PropSphere globe view. Features are prioritized based on operator workflow impact, contest/DX hunting utility, and user experience refinement.

---

# Sprint 1: Core Operator Efficiency

**Theme**: Remove friction from high-frequency workflows. Make the tool faster for experienced operators while maintaining approachability for newcomers.

---

## Feature 1.1: Keyboard Navigation System

### User Story

> As a contest operator, I want to control PropSphere entirely via keyboard so that I can keep my hands on the radio and minimize mouse movements during high-rate periods.

### Description

Implement a comprehensive keyboard shortcut system that allows power users to navigate, select targets, switch views, and access key features without mouse interaction.

### Acceptance Criteria

- [ ] `G` opens a grid input modal with autofocus on text field
- [ ] `T` sets the last-hovered location as the current target
- [ ] `R` opens Grid Research Panel for the last-clicked/hovered grid
- [ ] `W` toggles watch on the current target grid
- [ ] `P` adds a pin at the current target location
- [ ] `Escape` clears the current target and closes any open panels
- [ ] `1` switches to 3D Globe view
- [ ] `2` switches to 2D Map view
- [ ] `3` switches to Azimuthal view
- [ ] `?` or `F1` opens a keyboard shortcuts help overlay
- [ ] `L` toggles Lite Mode
- [ ] `Space` toggles between live time and last Time Machine setting
- [ ] Shortcuts are disabled when focus is in a text input field
- [ ] Shortcuts overlay shows all available commands with descriptions
- [ ] Shortcuts are discoverable via tooltip hints on hover of relevant UI elements

### Technical Notes

- Use a global keyboard event listener with proper focus management
- Store shortcut preferences in localStorage for future customization
- Ensure shortcuts don't conflict with browser defaults

---

## Feature 1.2: Long Path Display & Toggle

### User Story

> As a DXer working stations on the opposite side of the world, I want to see both short path and long path bearings so that I can choose the optimal antenna heading based on current propagation.

### Description

Extend the Path Info panel to display long path information alongside short path, with the ability to toggle between them or view both simultaneously.

### Acceptance Criteria

- [ ] Path Info panel shows both "Short Path" and "Long Path" sections
- [ ] Long path displays: distance (km/mi), bearing, return bearing
- [ ] Long path bearing is correctly calculated as (short path bearing + 180) mod 360
- [ ] Visual toggle allows switching the globe path arc between short/long path
- [ ] When long path is selected, the arc renders over the opposite hemisphere
- [ ] Long path arc uses a distinct visual style (dashed line or different color)
- [ ] Path difficulty assessment updates based on selected path
- [ ] 24H Propagation Forecast updates to show long path predictions when LP selected
- [ ] Keyboard shortcut `S` toggles between short/long path display
- [ ] Default is short path; selection persists during session

### Technical Notes

- Long path distance = Earth circumference (~40,075 km) - short path distance
- Consider propagation model differences for long path predictions

---

## Feature 1.3: Spot Label Clustering

### User Story

> As an operator monitoring European activity, I want spot labels to intelligently cluster when overlapping so that I can actually read callsigns instead of seeing an illegible mess.

### Description

Implement smart clustering for DX spot markers that groups nearby spots at lower zoom levels and expands them on interaction or higher zoom.

### Acceptance Criteria

- [ ] Spots within a configurable pixel radius (default 50px) cluster into a single marker
- [ ] Cluster marker displays count badge (e.g., "12 spots")
- [ ] Cluster marker uses distinct visual style (larger, different shape)
- [ ] Clicking a cluster zooms in to expand contained spots
- [ ] Hovering a cluster shows a tooltip listing contained callsigns (max 10, then "+N more")
- [ ] At maximum zoom, all spots display individually
- [ ] Clustering algorithm runs efficiently (<16ms for 500 spots)
- [ ] Clusters re-calculate on zoom, pan, and spot data updates
- [ ] Option in settings to disable clustering for users who prefer raw display
- [ ] Cluster color reflects the "best" spot within (e.g., needed DXCC takes priority)

### Technical Notes

- Consider using a spatial index (R-tree or grid-based) for efficient clustering
- Implement debounced recalculation on view changes
- Test performance with 1000+ simultaneous spots

---

## Feature 1.4: Frequency Display on Spots

### User Story

> As a contest operator, I want to see the exact frequency of spotted stations so that I can tune directly without having to look up the spot details.

### Description

Enhance spot markers and tooltips to prominently display the spotted frequency, not just the band.

### Acceptance Criteria

- [ ] Spot tooltip shows frequency in kHz (e.g., "14.195" or "14195.0")
- [ ] Spot list rows in DX Cluster panel show frequency column
- [ ] Frequency display respects user preference (MHz vs kHz)
- [ ] Clicking a spot copies frequency to clipboard with visual confirmation
- [ ] Spot marker on globe shows frequency on hover (not just callsign)
- [ ] Search in DX Cluster supports frequency range filtering (e.g., "14200-14350")
- [ ] Sort DX Cluster by frequency (ascending/descending)

### Technical Notes

- Ensure frequency parsing handles various cluster formats (some report in Hz)
- Consider CAT integration hooks for future "tune to" functionality

---

## Feature 1.5: Quick Grid Input

### User Story

> As an operator who just heard a callsign on the air, I want to quickly type a grid square to see its location without having to click on the map.

### Description

Add a quick grid input field accessible from the header or via keyboard shortcut that instantly centers the map and opens research for the entered grid.

### Acceptance Criteria

- [ ] Grid input field in header area (near the EM10BP badge)
- [ ] Accepts 4 or 6 character Maidenhead grids
- [ ] Real-time validation with visual feedback (green border = valid, red = invalid)
- [ ] Pressing Enter with valid grid: centers map, sets as target, opens Grid Research
- [ ] Auto-uppercase input as user types
- [ ] Input field has placeholder text "Grid..."
- [ ] Escape clears input and returns focus to map
- [ ] Recently entered grids shown in dropdown (last 10, stored in localStorage)
- [ ] Clicking recent grid from dropdown applies it immediately
- [ ] Works in all three view modes

### Technical Notes

- Validate against Maidenhead format: 2 letters + 2 digits (+ optional 2 letters)
- Integrate with existing grid-to-coordinates utility

---

## Feature 1.6: Path Bearing Compass Rose

### User Story

> As a directional antenna operator, I want a visual compass overlay showing my beam heading relative to the target so that I can quickly verify my antenna is pointed correctly.

### Description

Add an optional compass rose overlay on the globe showing cardinal directions and the current target bearing with antenna beam width visualization.

### Acceptance Criteria

- [ ] Compass rose overlay toggleable via layer button or settings
- [ ] Rose centered on operator QTH location
- [ ] Shows N, NE, E, SE, S, SW, W, NW labels
- [ ] Current target bearing highlighted with distinct line/wedge
- [ ] Optional beam width visualization (configurable: 30°, 45°, 60°, 90°)
- [ ] Beam width wedge shows approximate antenna coverage pattern
- [ ] Rose scales appropriately at different zoom levels
- [ ] Rose fades/hides when zoomed out beyond usefulness
- [ ] Works on 3D Globe and Azimuthal views (not applicable to 2D Map)

### Technical Notes

- Consider using Three.js sprite or CSS overlay for performance
- Beam width is informational only, not a true radiation pattern

---

# Sprint 2: Intelligence & Integration

**Theme**: Make PropSphere smarter by connecting data sources and surfacing actionable insights automatically.

---

## Feature 2.1: "Needed" Filter & Highlighting

### User Story

> As a DXer chasing DXCC, I want spots that represent new countries to visually stand out so that I can instantly identify multiplier opportunities.

### Description

Integrate with the logbook to identify and highlight spots that represent "new" entities (DXCC, grid, zone, band-slot) based on the operator's confirmed contacts.

### Acceptance Criteria

- [ ] Spots matching "needed" criteria display with gold/star marker style
- [ ] "Needed" badge appears on matching spots in DX Cluster list
- [ ] Filter toggle in DX Cluster: "Show Needed Only"
- [ ] Multiple need types configurable: DXCC, Grid, CQ Zone, ITU Zone, Band-New
- [ ] Need checking respects current mode filter (e.g., need on CW vs SSB)
- [ ] Grid Research Panel shows "Needed: Yes/No" with details
- [ ] Count of needed spots shown in DX Cluster header (e.g., "5 needed")
- [ ] Needed spots sort to top when sort-by-needed enabled
- [ ] Visual legend explains needed marker styling
- [ ] Works with empty logbook (all spots show as "needed")

### Technical Notes

- Requires logbook data structure with DXCC/grid/zone lookup
- Consider caching needed status to avoid recalculating on every render
- Design for extensibility (award tracking integration later)

---

## Feature 2.2: Spot Age Visualization

### User Story

> As an operator scanning for activity, I want to visually distinguish fresh spots from stale ones so that I don't waste time calling stations that have already QRT.

### Description

Implement visual decay for spot markers where freshness is indicated by size, opacity, or color intensity.

### Acceptance Criteria

- [ ] Spots 0-2 minutes old: full size, full opacity, bright color
- [ ] Spots 2-5 minutes old: 90% size, 90% opacity
- [ ] Spots 5-10 minutes old: 75% size, 75% opacity, slightly desaturated
- [ ] Spots 10-15 minutes old: 60% size, 60% opacity, noticeably faded
- [ ] Spots 15+ minutes old: 50% size, 40% opacity, grayed out
- [ ] Decay is smooth/animated, not stepped
- [ ] Tooltip shows exact spot age in minutes:seconds
- [ ] Option to hide spots older than configurable threshold (default: 30 min)
- [ ] Refreshed/re-spotted stations reset to fresh appearance
- [ ] Decay visualization can be disabled in settings for users who prefer uniform markers

### Technical Notes

- Use CSS transitions or requestAnimationFrame for smooth decay
- Spot age calculated from spot timestamp vs current time (or Time Machine time)

---

## Feature 2.3: Band Sync Mode

### User Story

> As an operator focused on a single band, I want the DX Cluster and map to automatically filter to my current band of interest so that I see only relevant activity.

### Description

Add a "sync" mode that links spot filtering across all views to the currently selected or most-recently-clicked band.

### Acceptance Criteria

- [ ] "Sync" toggle button in DX Cluster toolbar
- [ ] When sync enabled: clicking a spot filters all views to that spot's band
- [ ] Band filter pills visually indicate sync state
- [ ] Globe shows only spots from synced band (others hidden or very faded)
- [ ] 24H Propagation Forecast highlights synced band row
- [ ] Band Conditions panel highlights synced band entry
- [ ] Clicking a different band pill updates the sync
- [ ] Sync mode persists until manually disabled
- [ ] Keyboard shortcut `B` cycles through bands when sync enabled
- [ ] Clear visual indicator when sync is active (e.g., colored border on cluster panel)

### Technical Notes

- Consider future CAT integration to sync with radio's current band
- Sync state should be sessionStorage (not persist across page loads)

---

## Feature 2.4: Greyline Enhancement

### User Story

> As a low-band DXer, I want the greyline to be more visually prominent during prime operating windows so that I can take advantage of enhanced propagation along the terminator.

### Description

Enhance the greyline visualization with dynamic prominence based on operating relevance and add greyline-specific alerts.

### Acceptance Criteria

- [ ] Greyline overlay has three intensity levels: normal, enhanced, peak
- [ ] Enhanced mode activates 30 minutes before local sunrise/sunset
- [ ] Peak mode activates 15 minutes before/after local sunrise/sunset
- [ ] Greyline path width increases in enhanced/peak modes
- [ ] Optional pulsing animation during peak greyline window
- [ ] "Greyline Alert" notification when entering enhanced/peak window
- [ ] Alert is dismissible and can be disabled in settings
- [ ] Greyline indicator in Solar Snapshot shows time to next greyline event
- [ ] Band Conditions panel notes "Greyline Active" when applicable to low bands
- [ ] Tip text updates to reference current greyline status

### Technical Notes

- Calculate sunrise/sunset using existing QTH coordinates
- Consider target location's greyline status as well as home QTH

---

## Feature 2.5: Watch System Audio Alerts

### User Story

> As an operator monitoring for specific stations or grids, I want an audio notification when watched items appear so that I can multitask without missing opportunities.

### Description

Add configurable audio alerts when watched callsigns, grids, or patterns appear in the DX Cluster feed.

### Acceptance Criteria

- [ ] Audio alert plays when watched item spotted (default: subtle chime)
- [ ] Different alert sounds for: watched callsign, watched grid, watched DXCC
- [ ] Volume control for alerts (0-100%, default 50%)
- [ ] Master mute toggle for all alerts
- [ ] Test sound button in settings
- [ ] Browser notification permission requested and used when granted
- [ ] Alert cooldown prevents repeated alerts for same spot (configurable, default 5 min)
- [ ] Visual badge on Watch Indicator pulses when alert triggered
- [ ] Alert log shows recent notifications with timestamps
- [ ] Custom sound upload option (MP3/WAV, max 1MB)

### Technical Notes

- Use Web Audio API for reliable playback
- Handle browser autoplay restrictions gracefully
- Store audio preferences in localStorage

---

## Feature 2.6: Spot Context Actions

### User Story

> As an operator who found an interesting spot, I want quick actions available without navigating away so that I can respond to opportunities faster.

### Description

Add a context action menu for spots with common operations available in one click.

### Acceptance Criteria

- [ ] Right-click on spot marker opens context menu
- [ ] Context menu actions:
  - Set as Target
  - Research Grid
  - Watch Callsign
  - Watch Grid
  - Copy Frequency
  - Copy Callsign
  - Open on QRZ.com (new tab)
  - Open on ClubLog (new tab)
  - Hide this Spot
- [ ] Left-click on spot sets it as target (existing behavior)
- [ ] Long-press on touch devices opens context menu
- [ ] Context menu closes on outside click or Escape
- [ ] Menu appears at cursor position, adjusts to stay in viewport
- [ ] Keyboard navigation within menu (arrow keys, Enter to select)

### Technical Notes

- Reuse existing flyout/context menu component patterns
- Ensure touch accessibility for mobile/tablet users

---

# Sprint 3: Polish & Delight

**Theme**: Elevate the experience from functional to delightful. Focus on visual refinement, accessibility, and features that make users smile.

---

## Feature 3.1: Animated Path Visualization

### User Story

> As a visual learner, I want to see an animated representation of signal propagation along the path so that I can better understand how my signal travels.

### Description

Add optional animation to the great circle path showing signal "traveling" from QTH to target.

### Acceptance Criteria

- [ ] Toggle in settings: "Animate signal path" (default: off)
- [ ] When enabled, small dot/pulse travels along path arc
- [ ] Animation speed adjustable (slow/medium/fast)
- [ ] Animation direction indicates short vs long path
- [ ] Multiple ionospheric "hops" visualized for HF paths
- [ ] Number of hops based on path distance and MUF
- [ ] Animation pauses when tab not visible (performance)
- [ ] Path glow/intensity varies with predicted signal strength
- [ ] Animation works on both 3D Globe and 2D Map views
- [ ] Disable animation when > 5 paths displayed (performance)

### Technical Notes

- Use Three.js shader or sprite animation for WebGL views
- Consider using CSS animation for 2D map performance

---

## Feature 3.2: Spot Statistics Dashboard

### User Story

> As a data-oriented operator, I want to see aggregate statistics about current band activity so that I can identify trends and optimal operating times.

### Description

Add a collapsible statistics panel showing real-time activity metrics and historical comparisons.

### Acceptance Criteria

- [ ] Stats panel accessible from DX Cluster header (expand/collapse)
- [ ] Metrics displayed:
  - Total spots in last hour (with trend arrow)
  - Most active band (by spot count)
  - Most active mode (by spot count)
  - Top 5 spotted DXCCs
  - Peak activity time today
  - Average spot rate (spots/minute)
- [ ] Mini chart showing spot activity over last 6 hours
- [ ] Comparison to "typical" activity for this time (requires baseline data)
- [ ] Stats update in real-time as spots arrive
- [ ] Export stats as CSV or JSON
- [ ] Stats respect current filters (band, mode, time range)

### Technical Notes

- Cache computed statistics to avoid expensive recalculation
- Consider time-series storage for historical comparison

---

## Feature 3.3: Custom Map Themes

### User Story

> As an operator who spends hours looking at PropSphere, I want to customize the visual theme so that I can reduce eye strain and personalize my experience.

### Description

Provide multiple map color themes and allow customization of key visual elements.

### Acceptance Criteria

- [ ] Theme selector in settings with presets:
  - Default (current dark theme)
  - High Contrast (for accessibility)
  - Night Mode (extra dark, red-shifted)
  - Light Mode (for daytime use)
  - Classic (traditional blue ocean/green land)
- [ ] Custom theme builder with options:
  - Ocean color
  - Land color
  - Border color
  - Night side opacity
  - City light color
  - Spot marker colors (by status)
  - Path arc color
- [ ] Theme preview before applying
- [ ] Themes saved to localStorage
- [ ] Import/export themes as JSON
- [ ] Quick toggle between last two used themes

### Technical Notes

- Use CSS custom properties for UI theming
- WebGL shaders may need recompilation for map textures

---

## Feature 3.4: Accessibility Improvements

### User Story

> As a visually impaired operator, I want PropSphere to work well with screen readers and respect my system preferences so that I can use it effectively.

### Description

Comprehensive accessibility audit and improvements to meet WCAG 2.1 AA standards.

### Acceptance Criteria

- [ ] All interactive elements have appropriate ARIA labels
- [ ] Focus indicators visible on all focusable elements
- [ ] Tab order follows logical visual flow
- [ ] Color contrast meets 4.5:1 ratio for text
- [ ] Non-color indicators for status (icons, patterns, not just color)
- [ ] Reduced motion mode respects `prefers-reduced-motion`
- [ ] High contrast mode available (separate from theme)
- [ ] Screen reader announces spot updates (configurable verbosity)
- [ ] Alt text for all informational images/icons
- [ ] Skip navigation link to main content
- [ ] Keyboard-only operation possible for all features
- [ ] Touch targets minimum 44x44px on mobile

### Technical Notes

- Test with VoiceOver (macOS), NVDA (Windows), TalkBack (Android)
- Use axe-core or similar for automated testing

---

## Feature 3.5: Offline Mode & PWA

### User Story

> As a portable operator, I want PropSphere to work offline with cached data so that I can use it during field operations with spotty internet.

### Description

Implement Progressive Web App capabilities with offline support and installability.

### Acceptance Criteria

- [ ] Service worker caches app shell and static assets
- [ ] Map tiles cached for last-viewed regions
- [ ] Offline indicator shown when network unavailable
- [ ] Last-known spot data displayed when offline (with staleness warning)
- [ ] Solar data cached with timestamp (valid for 1 hour)
- [ ] Propagation predictions work offline using cached solar data
- [ ] "Install App" prompt available on supported browsers
- [ ] Installed app opens full-screen without browser chrome
- [ ] Background sync queues log entries when offline, syncs when online
- [ ] Clear cache option in settings with size indicator

### Technical Notes

- Use Workbox for service worker management
- Implement IndexedDB for structured offline data storage
- Test offline scenarios on mobile devices

---

## Feature 3.6: Time Machine Enhancements

### User Story

> As an operator planning a future contest, I want to simulate propagation conditions at specific dates/times so that I can plan my operating strategy.

### Description

Extend Time Machine to support date selection and save/recall of favorite time scenarios.

### Acceptance Criteria

- [ ] Date picker allows selecting any date (past 30 days, future 7 days)
- [ ] Selecting future date uses predicted solar indices
- [ ] Historical dates use archived solar data (if available)
- [ ] "Save Scenario" button captures current date/time/target
- [ ] Saved scenarios list with names and one-click restore
- [ ] Maximum 10 saved scenarios (warn when limit reached)
- [ ] Scenario includes: date, time, target grid, view mode, layer settings
- [ ] "Compare" mode shows two times side-by-side (split view)
- [ ] Propagation forecast updates based on selected date's solar conditions
- [ ] Visual indicator clearly shows when not viewing "live" time
- [ ] One-click return to live time from any time machine state

### Technical Notes

- Source historical solar data from NOAA archives
- Future predictions use 27-day solar rotation approximation

---

## Feature 3.7: Mini-Map Navigator

### User Story

> As an operator who frequently zooms into specific regions, I want a mini-map overview so that I can quickly reorient and jump to other areas.

### Description

Add an optional mini-map in the corner showing the full globe with current viewport indicator.

### Acceptance Criteria

- [ ] Mini-map appears in bottom-left corner (configurable position)
- [ ] Shows full globe at fixed zoom level
- [ ] Rectangle overlay indicates current main view extent
- [ ] Click on mini-map to pan main view to that location
- [ ] Drag rectangle on mini-map to adjust main view
- [ ] Mini-map toggle via settings or keyboard (`M`)
- [ ] Mini-map respects current view mode (3D/2D/Azimuthal representation)
- [ ] Mini-map size configurable (small/medium/large)
- [ ] Mini-map shows simplified spot density (no individual markers)
- [ ] Mini-map collapses to icon when not hovered (space saving)

### Technical Notes

- Render mini-map as separate canvas for performance isolation
- Simplified rendering (no labels, no overlays except spots heat)

---

## Feature 3.8: Social Sharing

### User Story

> As an operator who made an exciting QSO, I want to share a snapshot of my propagation view so that I can show others the path and conditions.

### Description

Enable sharing current PropSphere view as an image or link with embedded state.

### Acceptance Criteria

- [ ] "Share" button in toolbar
- [ ] Share options:
  - Download as PNG image
  - Copy shareable link to clipboard
  - Share to Twitter/X (with image)
  - Share to Mastodon (with image)
- [ ] Shareable link encodes: view mode, center coordinates, zoom, target, time
- [ ] Links open PropSphere with restored view state
- [ ] Generated image includes:
  - Current globe/map view
  - Path arc and target info overlay
  - Timestamp and operator callsign watermark
  - PropSphere branding (subtle, corner)
- [ ] Image resolution options (1x, 2x for retina)
- [ ] Privacy option to exclude callsign from shared content

### Technical Notes

- Use html2canvas or WebGL toDataURL for screenshot
- URL state compression to keep links reasonable length
- Consider serverless function for link shortening

---

## Feature 3.9: Onboarding Tour

### User Story

> As a new user, I want a guided tour of PropSphere's features so that I can quickly learn how to use the tool effectively.

### Description

Implement an interactive onboarding experience for first-time users that highlights key features.

### Acceptance Criteria

- [ ] Tour launches automatically on first visit (can skip)
- [ ] Tour accessible later via Help menu ("Take the Tour")
- [ ] Tour steps (minimum):
  1. Welcome + overview
  2. Globe interaction (click to target)
  3. View mode switching
  4. Layer toggles explanation
  5. DX Cluster basics
  6. Grid Research Panel
  7. Path Analysis reading
  8. Keyboard shortcuts preview
  9. Settings location
  10. Completion + tips
- [ ] Each step highlights relevant UI element
- [ ] Progress indicator (step X of Y)
- [ ] Skip, Back, Next navigation
- [ ] Tour step can trigger demo interaction
- [ ] Tour completion tracked (don't re-show)
- [ ] Separate "What's New" tour for returning users after updates

### Technical Notes

- Consider using existing tour library (Shepherd.js, Intro.js)
- Ensure tour works on mobile with adjusted positioning

---

## Feature 3.10: Performance Optimizations

### User Story

> As an operator with a mid-range laptop, I want PropSphere to run smoothly even with many spots displayed so that I can focus on operating instead of waiting for the interface.

### Description

Audit and optimize performance across all components, particularly WebGL rendering and data processing.

### Acceptance Criteria

- [ ] Initial load time < 3 seconds on 4G connection
- [ ] Time to interactive < 5 seconds
- [ ] Smooth 60fps globe rotation on mid-range hardware
- [ ] Spot rendering scales to 2000 spots without frame drops
- [ ] Memory usage stays under 500MB with typical usage
- [ ] No memory leaks after 4 hours of continuous use
- [ ] Web Workers used for heavy computation (spot processing, propagation)
- [ ] Code splitting implemented for route-based chunks
- [ ] Images and textures use appropriate compression
- [ ] Lazy loading for off-screen panels
- [ ] Performance metrics logged for monitoring
- [ ] "Low performance mode" setting disables heavy effects

### Technical Notes

- Profile with Chrome DevTools and Lighthouse
- Consider texture atlasing for spot markers
- Implement virtual scrolling for spot list

---

# Appendix: QOL Improvements Backlog

Small improvements that can be addressed opportunistically:

| ID  | Improvement                                                | Effort |
| --- | ---------------------------------------------------------- | ------ |
| Q1  | Remember last-used DX Cluster filters                      | S      |
| Q2  | Double-click grid to zoom and research                     | S      |
| Q3  | Tooltip showing UTC+local time on hover of times           | S      |
| Q4  | "Copy grid" button in Grid Research Panel                  | S      |
| Q5  | Band Conditions auto-refresh indicator                     | S      |
| Q6  | Spot list alternating row colors for readability           | S      |
| Q7  | Confirmation before clearing all saved targets             | S      |
| Q8  | Tooltip on truncated callsigns in spot list                | S      |
| Q9  | Highlight own callsign if spotted                          | M      |
| Q10 | "Working split" indicator parsing from spot comments       | M      |
| Q11 | Draggable panel resize handles                             | M      |
| Q12 | Context-aware help (? button shows relevant docs)          | M      |
| Q13 | Remembers panel collapse state per session                 | S      |
| Q14 | Globe auto-rotate when idle (screensaver mode)             | S      |
| Q15 | Right-click copy coordinates from any map location         | S      |
| Q16 | Spot source indicator (PSK/RBN/Cluster) as icon            | S      |
| Q17 | Visual feedback when action completes (toast notification) | M      |
| Q18 | Undo last action (target clear, pin delete)                | M      |
| Q19 | Export current view as KML for Google Earth                | M      |
| Q20 | Color-blind friendly mode (distinct marker shapes)         | M      |

**Effort Scale**: S = Small (< 2 hours), M = Medium (2-8 hours), L = Large (> 8 hours)

---

# Success Metrics

Track these KPIs to measure sprint success:

| Metric                             | Baseline | Sprint 1 Target | Sprint 2 Target | Sprint 3 Target |
| ---------------------------------- | -------- | --------------- | --------------- | --------------- |
| Time to set target from cold start | 8 sec    | 4 sec           | 3 sec           | 2 sec           |
| User actions to research a grid    | 3 clicks | 2 clicks        | 1 click         | 1 key           |
| Spots visible without scrolling    | 10       | 15              | 20              | 25              |
| Page load (LCP)                    | 4.2s     | 3.5s            | 3.0s            | 2.5s            |
| Session duration (avg)             | 12 min   | 15 min          | 20 min          | 25 min          |
| Return user rate                   | -        | 40%             | 50%             | 60%             |

---

_Document maintained by the Propulse development team. Last updated: 2026-02-03_
