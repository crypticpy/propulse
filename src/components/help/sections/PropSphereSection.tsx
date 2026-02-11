import { Link } from "react-router-dom";
import { HelpAccordion } from "@/components/help/HelpAccordion";
import { HelpCallout } from "@/components/help/HelpCallout";
import { HelpDataTable } from "@/components/help/HelpDataTable";
import { HelpShortcutTable } from "@/components/help/HelpShortcutTable";
import { HelpFAQ } from "@/components/help/HelpFAQ";

export function PropSphereSection() {
  return (
    <div className="space-y-6">
      {/* Overview — no accordion */}
      <p className="text-sm leading-relaxed text-gray-300">
        PropSphere is your interactive propagation intelligence globe. It
        visualizes live DX spots, propagation paths, and environmental data on a
        3D globe, flat map, or azimuthal projection — giving you a real-time
        picture of worldwide radio activity. For targeted transmit guidance to a
        specific station, see the{" "}
        <Link
          to="/help/dx-wizard"
          className="text-plasma-orange hover:underline"
        >
          DX Wizard
        </Link>
        .
      </p>

      {/* ─── 4.1 Map Views ─────────────────────────────────────────────────── */}
      <HelpAccordion
        id="map-views"
        title="Map Views"
        summary="Globe, Flat Map, and Azimuthal projections"
      >
        <div className="space-y-4 text-sm text-gray-300 leading-relaxed">
          <p>
            PropSphere offers three distinct map projections, each suited to
            different operating tasks. Switch between them using the tabs above
            the map or the keyboard shortcuts{" "}
            <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/10 text-xs font-mono">
              1
            </kbd>{" "}
            <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/10 text-xs font-mono">
              2
            </kbd>{" "}
            <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/10 text-xs font-mono">
              3
            </kbd>
            .
          </p>

          <div>
            <h4 className="text-white font-semibold mb-1.5">3D Globe</h4>
            <p>
              A fully interactive 3D Earth rendered with NASA Blue Marble
              satellite imagery. The globe supports orbit controls — drag to
              rotate, scroll to zoom, and all data layers render as true 3D
              overlays on the sphere surface. Lighting follows the real-time
              subsolar point so the day/night boundary matches reality. A
              starfield background and directional sun lighting create an
              immersive experience. Auto-rotate can be enabled to slowly spin
              the globe for passive monitoring.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1.5">Flat Map (2D)</h4>
            <p>
              A 2D equirectangular canvas projection showing the entire world at
              once. Renders the same data layers — spots, arcs, terminator,
              aurora, MUF heatmap — on a flat surface. Supports pan (click-drag)
              and zoom (scroll wheel or pinch). Better for seeing the full
              global picture when you want to monitor all regions
              simultaneously. Available in both satellite imagery and grayscale
              standard map styles.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1.5">
              Azimuthal Equidistant
            </h4>
            <p>
              Centered on your station's QTH, this projection makes great circle
              paths appear as straight lines radiating from the center. Distance
              rings are drawn at 5,000, 10,000, 15,000, and 20,000 km from your
              station, with bearing labels (N, NE, E, SE, S, SW, W, NW) around
              the perimeter. This is the ideal projection for antenna pointing —
              the direction from center to any point on the map is the true beam
              heading.
            </p>
          </div>

          <HelpCallout type="tip">
            Use Azimuthal view when you need to point your antenna — great
            circle paths are straight lines from center, making beam headings
            instantly visible.
          </HelpCallout>

          <HelpShortcutTable
            shortcuts={[
              { key: "1", action: "Switch to Globe view" },
              { key: "2", action: "Switch to Flat Map view" },
              { key: "3", action: "Switch to Azimuthal view" },
            ]}
          />
        </div>
      </HelpAccordion>

      {/* ─── 4.2 Layout Modes ──────────────────────────────────────────────── */}
      <HelpAccordion
        id="layout-modes"
        title="Layout Modes"
        summary="Normal, Pro, Lite, and HamClock layouts"
      >
        <div className="space-y-4 text-sm text-gray-300 leading-relaxed">
          <p>
            Layout modes control how the interface is arranged around the map.
            Each mode optimizes the screen for a different operating style. Your
            chosen layout persists between sessions.
          </p>

          <div>
            <h4 className="text-white font-semibold mb-1.5">Normal</h4>
            <p>
              The classic 3-panel layout. Band Conditions sits on the left, the
              map fills the center, and Path Analysis occupies the right. The DX
              Cluster runs along the bottom. All panels are collapsible and
              resizable — drag the dividers between panels to adjust widths. A
              top row shows Time Control, Operator Profile, 24h Propagation
              Forecast, and Solar Snapshot cards.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1.5">Pro</h4>
            <p>
              Fullscreen map with floating panels that can be dragged, resized,
              and docked to screen edges. A ribbon toolbar at the top provides
              quick access to all controls. This is the most powerful layout for
              advanced users who want complete control over their workspace.
              Each panel remembers its position and size, and you can collapse
              panels to edge-docked tabs.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1.5">Lite</h4>
            <p>
              Minimalist layout for maximum map visibility. Band conditions and
              path analysis appear as compact, expandable floating pills
              overlaid on the map corners. Time and callsign info display as a
              translucent HUD bar at the top. Click any pill to expand it into a
              full panel; click again to collapse. All the same data is
              available, just tucked away until you need it.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1.5">HamClock</h4>
            <p>
              A dense information dashboard mode inspired by traditional ham
              clock displays. Packs multiple data displays into a compact view
              with the map as one of several equal panels. Ideal for operators
              who want maximum information density in a single screen.
            </p>
          </div>

          <HelpCallout type="tip">
            Try Lite mode for monitoring — it shows the maximum map area while
            keeping essential info accessible via floating pills.
          </HelpCallout>

          <HelpShortcutTable
            shortcuts={[{ key: "L", action: "Toggle Lite mode on/off" }]}
          />
        </div>
      </HelpAccordion>

      {/* ─── 4.3 Observatory Mode ──────────────────────────────────────────── */}
      <HelpAccordion
        id="observatory"
        title="Observatory Mode"
        summary="Lean-back auto-rotating globe for passive monitoring"
      >
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>
            Observatory mode transforms PropSphere into a lean-back display.
            Enter it via the telescope icon in the toolbar (labeled
            "Observatory"). On entry, the globe switches to fullscreen with
            auto-rotation enabled, and the camera smoothly animates to center on
            your home station.
          </p>

          <ul className="list-disc list-inside space-y-1.5 pl-1">
            <li>
              The globe auto-rotates slowly with all active data layers
              rendering in real time — spots, terminator, arcs, and aurora
              continue to update.
            </li>
            <li>
              <strong>No click interactions</strong> — the globe is
              observation-only. Zoom (scroll wheel) remains active so you can
              adjust distance.
            </li>
            <li>
              Camera orientation is locked to prevent accidental dragging. Only
              zoom is permitted.
            </li>
            <li>
              Exit Observatory mode by pressing Escape or clicking the exit
              button. You are returned to your previous layout mode, view mode,
              and auto-rotate setting.
            </li>
          </ul>

          <HelpCallout type="tip">
            Observatory mode is perfect for hamshack displays or demo setups —
            set it and let it run. The globe will slowly rotate while live data
            overlays update continuously.
          </HelpCallout>
        </div>
      </HelpAccordion>

      {/* ─── 4.4 Toolbar Reference ─────────────────────────────────────────── */}
      <HelpAccordion
        id="toolbar"
        title="Toolbar Reference"
        summary="All toolbar buttons, popovers, and controls"
      >
        <div className="space-y-4 text-sm text-gray-300 leading-relaxed">
          <p>
            The toolbar sits directly below the view mode tabs. It provides
            quick access to every map configuration option through a series of
            icon buttons and popover menus.
          </p>

          <div>
            <h4 className="text-white font-semibold mb-1.5">
              Map Style Toggle
            </h4>
            <p>
              Switches between <strong>Satellite</strong> imagery (NASA Blue
              Marble) and <strong>Standard</strong> (grayscale line-art map).
              The satellite style shows night lights on the dark side and
              provides a realistic view. The standard style offers higher
              contrast borders and labels for easier reading.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1.5">Layers Popover</h4>
            <p>
              Opens the comprehensive layer control panel. Every data layer
              (terminator, aurora, MUF, spots, satellites, hazards, and more)
              has an individual toggle. Layers are grouped by category for quick
              scanning. See the <strong>Data Layers Reference</strong> section
              below for details on each layer.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1.5">Colors Popover</h4>
            <p>
              Configure how spot dots and arcs are colored. Options include
              coloring by <strong>band</strong> (each amateur band gets a
              distinct color), by <strong>mode</strong> (CW, SSB, FT8, etc.), or
              by <strong>signal strength</strong>. You can also choose between
              "realistic" and "high-viz" visual styles — high-viz uses brighter,
              more saturated colors that stand out on both satellite and
              standard maps.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1.5">Profile Popover</h4>
            <p>
              Operating profiles bundle layer visibility, spot filters, color
              mode, visual style, map style, and panel layout into a single
              click. Select a profile and the entire interface reconfigures for
              that activity:
            </p>
            <ul className="list-disc list-inside space-y-1.5 pl-1 mt-2">
              <li>
                <strong>DX Hunter</strong> — Terminator, greyline, MUF, live
                spots, and night lights. Spots colored by band. Satellite map
                style. Auto-follow enabled.
              </li>
              <li>
                <strong>Contest</strong> — Terminator and spots only, plus
                contest QSOs overlay. Spots filtered to CW, SSB, RTTY, and FT8.
                High-viz style on a standard (grayscale) map for maximum
                clarity. Minimal panels.
              </li>
              <li>
                <strong>VHF</strong> — Terminator, aurora overlay, and
                satellites. Focused on VHF/UHF propagation indicators like
                sporadic-E, aurora scatter, and satellite pass predictions.
              </li>
              <li>
                <strong>Emergency</strong> — NVIS zones, greyline, terminator,
                night lights, labels, plus all hazard layers (earthquakes,
                weather, lightning, fires, radar). Full situational awareness
                for ARES/RACES and emergency communications.
              </li>
              <li>
                <strong>Listener</strong> — All data layers enabled with minimal
                UI chrome. Designed for receive-only monitoring — see everything
                the ionosphere has to offer.
              </li>
              <li>
                <strong>Custom profiles</strong> — Create and save your own
                configurations. Each custom profile captures the current state
                of layers, filters, colors, and panels.
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1.5">Watch Popover</h4>
            <p>
              Configure grid watch alerts. Set a Maidenhead grid prefix (2 or 4
              characters) and Propulse will monitor incoming spots for activity
              in that area. When a match is found, you get an audio alert and a
              status pill appears below the toolbar showing the watched grid and
              recent matches. Auto-pan can be enabled to smoothly rotate the
              globe toward new matches.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1.5">
              Observatory Button
            </h4>
            <p>
              Enters Observatory mode (see above). The button shows a telescope
              icon with the label "Observatory".
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1.5">Views Popover</h4>
            <p>
              Region presets for quick navigation. Built-in presets include
              regions like North America, Europe, Asia, Pacific, and more. Click
              a preset and the camera smoothly animates to that region. You can
              also save your current view as a custom preset — give it a name
              and optional icon, and it appears in your presets list for quick
              recall. Custom presets can be reordered, edited, deleted,
              exported, and imported.
            </p>
          </div>

          <HelpCallout type="note">
            The Views popover is hidden when in Azimuthal mode, since that
            projection is always centered on your QTH.
          </HelpCallout>
        </div>
      </HelpAccordion>

      {/* ─── 4.5 Data Layers Reference ─────────────────────────────────────── */}
      <HelpAccordion
        id="layers"
        title="Data Layers Reference"
        summary="16+ toggleable data layers for spots, propagation, hazards, and navigation"
      >
        <div className="space-y-5 text-sm text-gray-300 leading-relaxed">
          <p>
            Toggle layers on and off in the Layers popover. Each layer adds a
            visual overlay to the map. Here is a detailed reference for every
            available layer.
          </p>

          {/* Terminator */}
          <div>
            <h4 className="text-white font-semibold mb-1">
              Day/Night Terminator
            </h4>
            <p>
              Renders the boundary between day and night on Earth's surface. The
              night side is darkened to show which regions are in darkness. HF
              propagation changes dramatically at the terminator — the D-layer
              that absorbs lower-band signals during daylight hours dissipates
              rapidly at sunset, allowing 80 m and 160 m to open for DX. Data is
              computed in real time from the subsolar point based on the current
              (or simulated) time.
            </p>
          </div>

          {/* Greyline */}
          <div>
            <h4 className="text-white font-semibold mb-1">Greyline</h4>
            <p>
              An enhanced propagation zone along the dawn and dusk terminator.
              The greyline is a band approximately 5 degrees wide on either side
              of the terminator where propagation conditions are uniquely
              favorable. When both your station and the DX station are
              simultaneously in the greyline, a short window of exceptional
              low-band propagation can occur. Many rare DX contacts happen
              during greyline openings on 80 m and 160 m. The greyline intensity
              indicator adapts based on your station's position relative to the
              terminator.
            </p>
          </div>

          {/* Aurora */}
          <div>
            <h4 className="text-white font-semibold mb-1">Aurora Oval</h4>
            <p>
              Real-time aurora probability overlay from the NOAA OVATION model.
              The aurora oval is drawn over both polar regions showing where
              auroral activity is likely occurring. In areas of active aurora,
              HF signals crossing high latitudes experience increased absorption
              and flutter, degrading propagation on polar paths. However, VHF
              operators benefit from aurora scatter — signals reflecting off the
              ionized curtain of the aurora can produce contacts on 50 MHz, 144
              MHz, and even 432 MHz. Updated every few minutes from NOAA SWPC.
            </p>
          </div>

          {/* MUF */}
          <div>
            <h4 className="text-white font-semibold mb-1">
              MUF (Maximum Usable Frequency)
            </h4>
            <p>
              A color-coded heatmap showing the estimated Maximum Usable
              Frequency across the globe. The MUF is the highest frequency at
              which a radio signal can be refracted back to Earth by the
              ionosphere on a given path. When the MUF exceeds your operating
              frequency, propagation is possible. The color scale runs from blue
              (low MUF, 3-7 MHz) through green and yellow to red (high MUF, 28+
              MHz). Based on the current Solar Flux Index (SFI) and ionospheric
              models accounting for time of day, season, and latitude.
            </p>
            <HelpCallout type="pro">
              Pro users get per-station MUF modeling — ray-traced predictions
              customized to your exact location and antenna configuration for
              more accurate band-by-band forecasts.
            </HelpCallout>
          </div>

          {/* NVIS */}
          <div>
            <h4 className="text-white font-semibold mb-1">
              NVIS (Near Vertical Incidence Skywave)
            </h4>
            <p>
              Shows NVIS propagation zones where signals transmitted nearly
              straight up are reflected back down by the ionosphere, providing
              reliable coverage within a 0-400 km radius. NVIS is critical for
              emergency communications (ARES/RACES) on 80 m and 40 m, where
              ground wave alone cannot cover the needed area and skip zones
              would leave gaps. The overlay indicates regions where NVIS
              propagation is currently viable based on ionospheric conditions.
            </p>
          </div>

          {/* Live Spots */}
          <div>
            <h4 className="text-white font-semibold mb-1">Live Spots</h4>
            <p>
              Real-time DX spots aggregated from PSKReporter, Reverse Beacon
              Network (RBN), and traditional DX Clusters. Each dot on the map
              represents a station that was heard or spotted. Spot color can
              represent band, mode, or signal strength depending on your color
              configuration. Spots are deduplicated — when the same station
              appears from multiple sources, the highest-priority source is
              kept. Includes arc lines connecting the spotter to the spotted
              station to show live propagation paths.
            </p>
          </div>

          {/* Spot Traces */}
          <div>
            <h4 className="text-white font-semibold mb-1">Spot Traces</h4>
            <p>
              Animated trace lines showing recent spot activity. Traces flow
              from spotter to spotted station in a "missile command" style
              animation, creating a visual pulse of propagation activity across
              the globe. Each trace fades after a few seconds to prevent
              clutter. This layer provides a visceral sense of real-time band
              activity that static dots cannot convey.
            </p>
          </div>

          {/* Night Lights */}
          <div>
            <h4 className="text-white font-semibold mb-1">Night Lights</h4>
            <p>
              City lights visible on the dark side of Earth, resembling
              satellite-style nighttime imagery. The lights give a visual
              reference for population centers and help you gauge which
              populated areas are currently in darkness (and thus more likely to
              be active on the low bands). Only visible when using the satellite
              map style — hidden in standard/grayscale mode.
            </p>
          </div>

          {/* Labels */}
          <div>
            <h4 className="text-white font-semibold mb-1">Labels</h4>
            <p>
              A collection of geographic and ham radio reference overlays, each
              independently toggleable via the Labels panel that appears when
              this layer is active:
            </p>
            <ul className="list-disc list-inside space-y-1 pl-1 mt-2">
              <li>
                <strong>Country Borders</strong> — Political boundaries between
                nations.
              </li>
              <li>
                <strong>US State Borders</strong> — State boundaries within the
                United States (useful for Worked All States tracking).
              </li>
              <li>
                <strong>Country Names</strong> — Text labels for country names
                placed at geographic centers.
              </li>
              <li>
                <strong>City Markers</strong> — Major world cities shown as
                labeled dots.
              </li>
              <li>
                <strong>Maidenhead Grid</strong> — Grid square overlay at the
                appropriate resolution for the current zoom level (field,
                square, or subsquare).
              </li>
              <li>
                <strong>WAS Overlay</strong> — Worked All States shading showing
                which US states you have confirmed QSOs with, based on your
                logbook.
              </li>
            </ul>
          </div>

          {/* Satellites */}
          <div>
            <h4 className="text-white font-semibold mb-1">Satellites</h4>
            <p>
              Real-time positions of amateur radio satellites and the ISS,
              computed from Two-Line Element (TLE) orbital data provided by
              NORAD/CelesTrak. When enabled, a satellite panel appears in the
              map overlay listing visible passes, upcoming passes, and satellite
              details. Satellite positions update continuously to show their
              current location and ground track.
            </p>
          </div>

          {/* Earthquakes */}
          <div>
            <h4 className="text-white font-semibold mb-1">Earthquakes</h4>
            <p>
              Recent seismic events from USGS real-time earthquake feeds.
              Markers show location, magnitude, and depth. Larger magnitudes are
              represented by larger markers. Useful for emergency preparedness
              and situational awareness, particularly for ARES/RACES operators
              who may need to coordinate disaster response.
            </p>
          </div>

          {/* Weather */}
          <div>
            <h4 className="text-white font-semibold mb-1">Weather Alerts</h4>
            <p>
              Weather alerts from national weather services showing severe
              weather warnings, watches, and advisories. Alerts are displayed as
              colored markers on the map. Relevant for operators who need
              awareness of storms that might affect antenna systems or require
              emergency communications support.
            </p>
          </div>

          {/* Lightning */}
          <div>
            <h4 className="text-white font-semibold mb-1">Lightning</h4>
            <p>
              Real-time lightning strike positions from the Blitzortung
              crowd-sourced lightning detection network. Strikes appear as flash
              markers on the map, updating approximately every 30 seconds.
              Beyond safety awareness, lightning generates broadband radio noise
              (QRN) that can degrade HF reception — seeing where thunderstorms
              are active helps explain elevated noise floors on certain bands.
            </p>
          </div>

          {/* WSPR */}
          <div>
            <h4 className="text-white font-semibold mb-1">WSPR</h4>
            <p>
              Weak Signal Propagation Reporter spots from wspr.live. WSPR
              beacons transmit very low power signals on designated frequencies
              across all HF bands. The spots from these beacons provide an
              unbiased, automated view of propagation conditions worldwide — if
              a WSPR path is open, human operators can likely make contacts on
              that path too.
            </p>
          </div>

          {/* Contest QSOs */}
          <div>
            <h4 className="text-white font-semibold mb-1">Contest QSOs</h4>
            <p>
              When you have an active contest session, this layer displays the
              locations of QSOs from that session on the map. Helps you
              visualize geographic coverage, identify multiplier gaps, and plan
              where to point your beam next.
            </p>
          </div>

          {/* Logged QSOs */}
          <div>
            <h4 className="text-white font-semibold mb-1">Logged QSOs</h4>
            <p>
              Shows locations from your station logbook on the map. Each logged
              contact appears as a marker, letting you see your historical
              operating patterns and coverage at a glance.
            </p>
          </div>

          {/* Fires */}
          <div>
            <h4 className="text-white font-semibold mb-1">Fires</h4>
            <p>
              Active fire hotspots detected by the VIIRS instrument aboard
              NASA's Suomi NPP and NOAA-20 satellites, sourced from NASA FIRMS
              (Fire Information for Resource Management System). Updated
              approximately every hour. Useful for emergency preparedness —
              wildfire proximity to infrastructure matters for ARES/RACES
              operations and can affect antenna site access.
            </p>
          </div>

          {/* Weather Radar */}
          <div>
            <h4 className="text-white font-semibold mb-1">Weather Radar</h4>
            <p>
              Weather radar mosaic overlay showing precipitation patterns. Helps
              identify approaching storms that could affect operations or
              antenna systems.
            </p>
          </div>
        </div>
      </HelpAccordion>

      {/* ─── 4.6 Layer Presets ─────────────────────────────────────────────── */}
      <HelpAccordion
        id="layer-presets"
        title="Layer Presets"
        summary="Pre-configured layer combinations for common operating scenarios"
      >
        <div className="space-y-4 text-sm text-gray-300 leading-relaxed">
          <p>
            Layer presets apply a curated set of layer toggles with a single
            click. They are independent of operating profiles — presets only
            change layer visibility, while profiles also configure spot filters,
            colors, map style, and panel layout. When you manually toggle any
            layer, the active preset is automatically cleared.
          </p>

          <div>
            <h4 className="text-white font-semibold mb-1">DX-Hunter</h4>
            <p>
              Enables terminator, greyline, MUF heatmap, live spots, and night
              lights. This combination shows you where bands are open, where the
              greyline advantage exists, and where stations are currently being
              heard — everything you need to chase rare DX.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1">Contest</h4>
            <p>
              Enables terminator, live spots, and contest QSOs. All other layers
              are disabled to minimize visual distractions. The focus is on
              seeing your contest multiplier coverage and where active stations
              are spotted.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1">VHF</h4>
            <p>
              Enables terminator, aurora oval, and satellites. These are the
              three key indicators for VHF and UHF propagation — the terminator
              affects sporadic-E, the aurora oval shows where scatter
              opportunities exist, and satellite passes provide time-limited
              contact windows.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1">Emergency</h4>
            <p>
              Enables terminator, greyline, NVIS, night lights, labels,
              earthquakes, weather alerts, lightning, fires, and weather radar.
              This is the full situational awareness preset for emergency
              communications — every hazard and environmental layer is active so
              you can assess the operating environment at a glance.
            </p>
          </div>
        </div>
      </HelpAccordion>

      {/* ─── 4.7 Display Controls ──────────────────────────────────────────── */}
      <HelpAccordion
        id="display-controls"
        title="Display Controls"
        summary="Sliders for spot size, pin size, label scale, arc density, and rotation speed"
      >
        <div className="space-y-4 text-sm text-gray-300 leading-relaxed">
          <p>
            Display controls are accessible via the size sliders panel at the
            bottom-left of the map area. They let you fine-tune the visual
            density and scale of map elements.
          </p>

          <div>
            <h4 className="text-white font-semibold mb-1">
              Spot Dot Scale (0.5x - 2.0x)
            </h4>
            <p>
              Adjusts the size of spot dots on the map. At 0.5x, spots are
              small, subtle points suitable for high-density monitoring. At
              2.0x, spots are large and easy to see at a glance. Default is
              1.0x.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1">
              Pin Size (0.5x - 2.0x)
            </h4>
            <p>
              Adjusts the size of saved pin icons on the map. Pins are
              customizable markers you place on the map to bookmark locations of
              interest — DXpedition sites, contest targets, repeaters, etc.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1">Label Scale</h4>
            <p>
              Adjusts the text size of country names, city labels, and other
              textual overlays on the map. Larger scale makes labels easier to
              read at the cost of more visual clutter.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1">
              Arc Display Density (10 - 200)
            </h4>
            <p>
              Controls how many propagation arcs (spot connections) are drawn
              simultaneously. Lower values produce a cleaner map with only the
              most recent or significant arcs. Higher values show more data but
              can be visually overwhelming on busy bands.
            </p>
            <HelpCallout type="tip">
              Set density to 50-80 for a clean view with meaningful arcs. 200
              shows everything but can be visually overwhelming on busy bands
              like 20 m FT8.
            </HelpCallout>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1">
              Auto-Rotate Toggle
            </h4>
            <p>
              Enable or disable automatic globe rotation (Globe view only). When
              active, the Earth slowly spins on its axis, providing a passive
              monitoring experience.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1">
              Auto-Rotate Speed (60 - 86,400 seconds per revolution)
            </h4>
            <p>
              Controls how fast the globe rotates when auto-rotate is enabled.
              At 60 seconds, the globe completes a full revolution per minute —
              fast enough to see all sides quickly. At 86,400 seconds (24
              hours), the globe rotates at real-time Earth speed — one
              revolution per day. The default is 86,400 for realistic rotation.
            </p>
          </div>
        </div>
      </HelpAccordion>

      {/* ─── 4.8 Interactions ──────────────────────────────────────────────── */}
      <HelpAccordion
        id="interactions"
        title="Interactions"
        summary="Click, hover, keyboard shortcuts, and context menus"
      >
        <div className="space-y-4 text-sm text-gray-300 leading-relaxed">
          <p>
            PropSphere supports a rich set of mouse, touch, and keyboard
            interactions across all three map views.
          </p>

          <div>
            <h4 className="text-white font-semibold mb-1.5">Mouse / Touch</h4>
            <ul className="list-disc list-inside space-y-1.5 pl-1">
              <li>
                <strong>Click</strong> — Sets a target location on the map and
                opens a flyout menu with actions: Set Target, Add Pin, Research
                Grid, and Toggle Watch.
              </li>
              <li>
                <strong>Double-Click</strong> — Centers the view on the clicked
                location with a smooth animation, without setting a target.
                Useful for quickly navigating to a region of interest.
              </li>
              <li>
                <strong>Hover (Globe surface)</strong> — Shows a tooltip with
                the Maidenhead grid square under the cursor and a count of
                active spots in that grid area.
              </li>
              <li>
                <strong>Long-Press / Right-Click</strong> — Opens a cluster
                detail popover showing all spots in that geographic area,
                grouped by band and mode.
              </li>
              <li>
                <strong>Hover on Pin</strong> — Shows a pin flyout with the
                pin's name, category, notes, and options to edit, delete, or set
                as target.
              </li>
              <li>
                <strong>Hover on Spot Arc/Label</strong> — Shows a spot detail
                flyout with the spotted station's callsign, frequency, mode,
                signal report, and path information.
              </li>
              <li>
                <strong>Hover on Target Marker</strong> — Shows an enhanced
                tooltip with the target grid, difficulty rating, and optimal
                band/signal estimate.
              </li>
              <li>
                <strong>Drag (Globe)</strong> — Rotate the globe by
                click-dragging. On flat map, drag to pan.
              </li>
              <li>
                <strong>Scroll / Pinch</strong> — Zoom in and out. Globe zoom
                range is 1.5x to 4x distance from Earth center.
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1.5">
              Keyboard Shortcuts
            </h4>
            <HelpShortcutTable
              shortcuts={[
                { key: "1", action: "Switch to Globe view" },
                { key: "2", action: "Switch to Flat Map view" },
                { key: "3", action: "Switch to Azimuthal view" },
                { key: "L", action: "Toggle Lite mode" },
                { key: "T", action: "Toggle short/long path display" },
                { key: "B", action: "Cycle band filter" },
                { key: "R", action: "Research grid (requires target)" },
                { key: "P", action: "Add pin (requires target)" },
                { key: "W", action: "Toggle watch on target grid" },
                { key: "G", action: "Open quick grid input" },
                { key: "Esc", action: "Clear target / close overlays" },
                { key: "Space", action: "Reset time machine to live" },
                { key: "?", action: "Show keyboard shortcuts overlay" },
              ]}
            />
          </div>

          <HelpCallout type="note">
            Keyboard shortcuts are active in Normal and Lite layout modes. They
            are disabled when a modal dialog or the shortcuts help overlay is
            open to prevent accidental actions.
          </HelpCallout>
        </div>
      </HelpAccordion>

      {/* ─── 4.9 Path Analysis ─────────────────────────────────────────────── */}
      <HelpAccordion
        id="path-analysis"
        title="Path Analysis"
        summary="Great circle paths, distance, bearing, hops, illumination, and difficulty"
      >
        <div className="space-y-4 text-sm text-gray-300 leading-relaxed">
          <p>
            When you set a target location, PropSphere calculates and displays a
            comprehensive path analysis between your home station and the
            target. The analysis appears in the Path Analysis panel (right side
            in Normal mode, floating pill in Lite mode).
          </p>

          <div>
            <h4 className="text-white font-semibold mb-1">Great Circle Arcs</h4>
            <p>
              An animated dashed arc is drawn on the map showing the shortest
              path (great circle route) between your station and the target.
              Press{" "}
              <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/10 text-xs font-mono">
                T
              </kbd>{" "}
              to toggle between short path and long path display. The arc is
              rendered using spherical linear interpolation (slerp) across
              intermediate points to ensure smooth curvature on the globe.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1">
              Distance Calculation
            </h4>
            <p>
              Uses the Haversine formula to calculate the shortest distance
              between two points on Earth's surface, accounting for the planet's
              curvature. Both short path and long path distances are shown. Long
              path distance equals Earth's circumference (~40,030 km) minus the
              short path distance. Displayed in both kilometers and miles.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1">Bearing</h4>
            <p>
              The initial bearing (forward azimuth) from your station to the
              target — this is the direction to point your antenna. Calculated
              using spherical trigonometry and displayed as both a compass
              heading in degrees and a compass direction label (N, NNE, NE,
              etc.). The reciprocal bearing (the direction the DX station would
              point toward you) is also shown.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1">
              F-Layer Hop Estimation
            </h4>
            <p>
              Estimates the number of ionospheric hops needed to reach the
              target. At typical F-layer reflection angles, each hop covers
              approximately 3,000 km. The calculation divides the short path
              distance by 3,000 km and rounds up. More hops mean more signal
              loss at each reflection point, making longer paths inherently more
              difficult.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1">Path Illumination</h4>
            <p>
              The percentage of the great circle path that is currently in
              daylight, calculated by sampling 20 evenly-spaced points along the
              path and checking each against the subsolar point. Paths that are
              mostly in daylight tend to favor higher bands (20 m, 15 m, 10 m)
              because the F-layer is fully ionized. Paths mostly in darkness
              favor lower bands (40 m, 80 m, 160 m) because the D-layer
              absorption that blocks those frequencies during the day has
              dissipated.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1">Difficulty Rating</h4>
            <p>
              A 1-5 scale based on short path distance, with arcs color-coded by
              difficulty:
            </p>
            <ul className="list-disc list-inside space-y-1 pl-1 mt-2">
              <li>
                <strong>1 — Easy</strong> (under 2,000 km): Short skip, single
                hop. Color: blue.
              </li>
              <li>
                <strong>2 — Medium</strong> (2,000-5,000 km): One to two hops.
                Reliable with decent conditions. Color: green.
              </li>
              <li>
                <strong>3 — Moderate</strong> (5,000-10,000 km): Two to three
                hops. Requires good propagation. Color: yellow/orange.
              </li>
              <li>
                <strong>4 — Hard</strong> (10,000-15,000 km): Multi-hop path,
                possible polar crossing. Color: orange/red.
              </li>
              <li>
                <strong>5 — Extreme</strong> (over 15,000 km): Near-antipodal
                path. Maximum signal loss, may require long path. Color: red.
              </li>
            </ul>
          </div>

          <HelpCallout type="tip">
            Long path propagation (the arc going the "wrong way" around the
            globe) can sometimes provide a clearer signal than short path,
            especially for paths crossing the polar regions where auroral
            absorption may degrade the short path. Press T to toggle and
            compare.
          </HelpCallout>
        </div>
      </HelpAccordion>

      {/* ─── 4.10 Maidenhead Grid System ───────────────────────────────────── */}
      <HelpAccordion
        id="grid-system"
        title="Maidenhead Grid System"
        summary="Grid squares for location reference in ham radio"
      >
        <div className="space-y-4 text-sm text-gray-300 leading-relaxed">
          <p>
            The Maidenhead Locator System divides the entire surface of the
            Earth into a hierarchy of progressively smaller grid squares,
            identified by alternating letters and digits. It is the universal
            location exchange system in amateur radio — used in contests, on QSL
            cards, for propagation analysis, and in every digital mode.
          </p>

          <div>
            <h4 className="text-white font-semibold mb-1">Grid Hierarchy</h4>
            <ul className="list-disc list-inside space-y-2 pl-1">
              <li>
                <strong>Field</strong> (2 letters, e.g., FN): 20 degrees
                longitude by 10 degrees latitude. There are 324 fields worldwide
                (18 x 18). The first letter encodes longitude (A-R), the second
                encodes latitude (A-R).
              </li>
              <li>
                <strong>Square</strong> (2 digits appended, e.g., FN31): 2
                degrees longitude by 1 degree latitude — approximately 160 x 110
                km at mid-latitudes. Each field contains 100 squares (10 x 10).
              </li>
              <li>
                <strong>Subsquare</strong> (2 lowercase letters appended, e.g.,
                FN31pr): 5 minutes longitude by 2.5 minutes latitude —
                approximately 7.5 x 4.6 km at mid-latitudes. Each square
                contains 576 subsquares (24 x 24).
              </li>
              <li>
                <strong>Extended</strong> (2 digits appended, e.g., FN31pr15):
                0.5 minutes longitude by 0.25 minutes latitude — pinpoint
                accuracy for precise location exchange.
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1">Grid Overlay</h4>
            <p>
              Enable the Maidenhead grid overlay in Labels (toggle it on in the
              Labels panel). The grid lines and labels automatically adapt to
              your zoom level — zoomed out shows field boundaries (2-char),
              zoomed in shows square boundaries (4-char), and zoomed in further
              shows subsquare boundaries (6-char). Grid labels are rendered at
              the center of each cell.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1">
              Usage in Ham Radio
            </h4>
            <p>
              Your 4-character grid square (e.g., FN31) identifies your
              approximate location. In VHF/UHF contests, grid squares are the
              exchange — you send your grid and the other station sends theirs,
              and each unique grid worked counts as a multiplier. Grids appear
              on QSL cards, in logbook entries, and are used by propagation
              tools (including Propulse) to calculate paths and estimate
              conditions.
            </p>
          </div>

          <HelpCallout type="note">
            Your 4-character grid (e.g., FN31) is one of the most important
            things to know as a ham operator — it is used in contests, on QSL
            cards, and for propagation calculations. Set it in Settings to
            enable all location-based features in Propulse.
          </HelpCallout>
        </div>
      </HelpAccordion>

      {/* ─── 4.11 Data Sources ─────────────────────────────────────────────── */}
      <HelpAccordion
        id="data-sources-propsphere"
        title="Data Sources"
        summary="APIs feeding real-time data to the map"
      >
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>
            PropSphere aggregates data from multiple real-time sources. All
            external data is proxied through Propulse edge functions for CORS
            handling and caching.
          </p>

          <HelpDataTable
            sources={[
              {
                name: "PSKReporter",
                source: "Live FT8/FT4/WSPR spots",
                endpoint: "/api/spots/pskreporter",
                refresh: "60s",
                cache: "60s",
              },
              {
                name: "Reverse Beacon Network",
                source: "CW/RTTY beacon spots",
                endpoint: "/api/spots/rbn",
                refresh: "30s",
                cache: "30s",
              },
              {
                name: "DX Clusters",
                source: "Traditional DX spots",
                endpoint: "/api/spots/dxcluster",
                refresh: "30s",
                cache: "30s",
              },
              {
                name: "WSPR.live",
                source: "WSPR beacon reports",
                endpoint: "/api/wspr/spots",
                refresh: "120s",
                cache: "120s",
              },
              {
                name: "Blitzortung",
                source: "Lightning strikes",
                endpoint: "/api/lightning/strikes",
                refresh: "30s",
                cache: "30s",
              },
              {
                name: "NASA FIRMS",
                source: "Fire hotspots (VIIRS)",
                endpoint: "/api/fires/hotspots",
                refresh: "1 hr",
                cache: "1 hr",
              },
              {
                name: "NOAA SWPC",
                source: "Aurora, solar data, MUF",
                endpoint: "/api/solar/*",
                refresh: "varies",
                cache: "varies",
              },
              {
                name: "USGS",
                source: "Earthquake data",
                endpoint: "/api/earthquakes",
                refresh: "5 min",
                cache: "5 min",
              },
              {
                name: "CelesTrak / NORAD",
                source: "Satellite TLE data",
                endpoint: "/api/satellites/tle",
                refresh: "6 hrs",
                cache: "6 hrs",
              },
            ]}
          />

          <HelpCallout type="note">
            Spot deduplication: when the same station appears from multiple
            sources, Propulse keeps the highest-priority source (PSKReporter
            &gt; RBN &gt; WSJT-X &gt; Cluster) and removes duplicates. This
            ensures each spot is counted once and displayed with the best
            available data.
          </HelpCallout>
        </div>
      </HelpAccordion>

      {/* ─── 4.12 Propagation Modeling ─────────────────────────────────────── */}
      <HelpAccordion
        id="propagation-modeling"
        title="Propagation Modeling"
        summary="How Propulse estimates propagation conditions"
      >
        <div className="space-y-4 text-sm text-gray-300 leading-relaxed">
          <p>
            Propulse combines multiple data sources and mathematical models to
            estimate real-time propagation conditions. Here is how each element
            of the propagation picture is computed.
          </p>

          <div>
            <h4 className="text-white font-semibold mb-1">MUF Estimation</h4>
            <p>
              The Maximum Usable Frequency is estimated based on the current
              Solar Flux Index (SFI), which indicates the level of F-layer
              ionization. Higher SFI raises the MUF globally. The model also
              accounts for time of day (the F-layer is strongest during local
              afternoon and weakest before dawn), season (summer hemispheres
              have higher MUF due to longer daylight), and latitude (equatorial
              regions generally sustain higher MUF than polar regions).
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1">
              Band Condition Derivation
            </h4>
            <p>
              Band-by-band propagation quality is derived by combining several
              factors:
            </p>
            <ul className="list-disc list-inside space-y-1 pl-1 mt-2">
              <li>
                <strong>SFI (Ionization Level)</strong> — Higher SFI means
                higher MUF and more bands open.
              </li>
              <li>
                <strong>K-Index (Geomagnetic Disturbance)</strong> — Higher Kp
                degrades propagation, especially on polar paths and higher
                bands.
              </li>
              <li>
                <strong>Bz (IMF Energy Coupling)</strong> — Southward Bz feeds
                energy into the magnetosphere, causing disturbances.
              </li>
              <li>
                <strong>Time of Day</strong> — D-layer absorption during
                daylight blocks lower bands; at night, lower bands open and
                higher bands may close.
              </li>
              <li>
                <strong>Path Geometry</strong> — Distance, latitude of the
                midpoint, and whether the path crosses the auroral zone.
              </li>
            </ul>
            <p className="mt-2">
              These inputs are weighted and combined to produce a Good / Fair /
              Poor / Closed rating for each amateur band from 160 m through 10
              m. The model also estimates an expected signal strength (in
              S-units and dB SNR) when your antenna type is configured.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1">Spot Correlation</h4>
            <p>
              Propulse compares observed spot patterns with predicted
              propagation to validate the model. When live spots are being
              received on a band that the model predicts should be open, it
              confirms the prediction. When spots appear on bands predicted to
              be closed (or vice versa), the divergence helps identify model
              limitations and unusual propagation events like sporadic-E.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1">Grid Glow</h4>
            <p>
              When a new spot appears in a Maidenhead grid field, that field
              briefly "glows" on the map with a 5-second color pulse. This
              provides a real-time visual heartbeat of propagation activity —
              you can literally see the ionosphere working as fields light up
              with new spots. The glow color matches your configured spot color
              mode (band, mode, or signal strength).
            </p>
          </div>

          <HelpCallout type="pro">
            Pro users get per-station propagation modeling — ray-traced
            predictions customized to your exact location, antenna type, and
            transmit power. This provides significantly more accurate band
            condition estimates and signal predictions than the generic model.
          </HelpCallout>
        </div>
      </HelpAccordion>

      {/* ─── FAQ ───────────────────────────────────────────────────────────── */}
      <div className="pt-2">
        <h3 className="text-sm font-semibold text-gray-200 mb-2">
          Frequently Asked Questions
        </h3>
        <HelpFAQ
          items={[
            {
              question: "How do I center the map on my QTH?",
              answer:
                "Set your grid square in Settings (the gear icon in the main navigation). Once your grid is configured, PropSphere will automatically center on your location when you open the page. In Globe view, your home station appears as a blue marker. In Azimuthal view, your QTH is always at the center of the projection.",
            },
            {
              question: "What does the MUF layer show?",
              answer:
                "The MUF (Maximum Usable Frequency) layer is a color-coded heatmap showing the highest frequency that will propagate via the ionosphere at each point on the globe. If the MUF at a given location is higher than your operating frequency, propagation is possible on that path. Blue indicates low MUF (only lower bands open), while red indicates high MUF (all bands including 10 m open). The MUF varies with time of day, season, solar activity, and latitude.",
            },
            {
              question: "How are propagation arcs computed?",
              answer:
                "Arcs follow the great circle path — the shortest route between two points on Earth's surface. The path is calculated using the Haversine formula for distance and spherical trigonometry for bearing, then rendered using spherical linear interpolation (slerp) to generate smooth intermediate points along the curve. The arc is animated from your station toward the target with a dashed-line style.",
            },
            {
              question: "Why can't I see spots on the map?",
              answer:
                "First, check that the Live Spots layer is enabled in the Layers popover (the layer toggle icon in the toolbar). Next, verify your band and mode filters are not hiding spots — open the DX Cluster panel filters or check the active operating profile, which may restrict visible modes. If spots are enabled but arcs seem sparse, try increasing the Arc Display Density slider in the display controls (bottom-left of map). Also confirm you have an internet connection, as spots require live data feeds.",
            },
            {
              question: "How do I save a region view?",
              answer:
                "Open the Views popover in the far-right section of the toolbar. Click 'Save Current View', give it a name and optionally choose an icon. The saved preset will appear in your Views list for quick one-click navigation back to that region, zoom level, and rotation. Custom presets can also be exported and imported for sharing between devices.",
            },
            {
              question: "What is the difference between Globe and Flat Map?",
              answer:
                "Globe provides a realistic 3D view with proper perspective — it shows the Earth as it actually appears from space, with correct distance proportions near the center of view. Flat Map shows the entire world simultaneously on a 2D equirectangular canvas, which is better for global overview but introduces distortion (areas near the poles appear stretched). Both views show identical data layers, spots, and overlays — only the projection differs.",
            },
            {
              question:
                "What is the difference between Layer Presets and Operating Profiles?",
              answer:
                "Layer Presets only change which data layers are visible on the map. Operating Profiles are more comprehensive — they configure layers, spot color mode, visual style, map style (satellite vs. standard), spot filters (which bands and modes are shown), and panel layout, all in a single click. Profiles are designed for specific operating activities like DX hunting, contesting, or emergency communications.",
            },
            {
              question: "Can I use PropSphere offline?",
              answer:
                "The map interface itself works offline, but live data layers (spots, aurora, MUF, lightning, earthquakes, satellites, etc.) require an internet connection to receive real-time feeds. Computed layers like the terminator and greyline continue to work based on local time calculations. Previously loaded spot data will remain visible until it ages out.",
            },
          ]}
        />
      </div>
    </div>
  );
}
