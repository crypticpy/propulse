import { HelpAccordion } from "@/components/help/HelpAccordion";
import { HelpCallout } from "@/components/help/HelpCallout";
import { HelpFAQ } from "@/components/help/HelpFAQ";

export function SettingsSection() {
  return (
    <div className="space-y-6">
      {/* Overview */}
      <p className="text-sm leading-relaxed text-gray-300">
        Settings lets you configure every aspect of your Propulse experience
        &mdash; from display preferences and map rendering to notification
        alerts, hardware connections, subscription management, and data control.
        The Settings page is organized into six sections accessible via a
        sidebar on desktop or pill tabs on mobile. All changes are applied
        immediately &mdash; there is no save button. Navigate to{" "}
        <code className="text-xs bg-white/10 px-1.5 py-0.5 rounded font-mono">
          /settings
        </code>{" "}
        or use the gear icon in the header. Press <kbd>Esc</kbd> to return to
        the main view.
      </p>

      {/* ── Preferences ──────────────────────────────────────────────── */}
      <HelpAccordion
        id="preferences"
        title="Preferences"
        summary="Display, accessibility, map & globe, propagation, forecast, interaction, and band settings"
      >
        <div className="space-y-5 text-sm text-gray-300 leading-relaxed">
          {/* Display */}
          <div>
            <h4 className="text-white font-semibold mb-1.5">Display</h4>
            <ul className="list-disc list-inside space-y-1.5 pl-1">
              <li>
                <strong>Time Format</strong> &mdash; Choose between 24-hour and
                12-hour clock display. This affects all timestamps throughout
                the app including the DX cluster, logbook, and dashboard.
              </li>
              <li>
                <strong>Text Size</strong> &mdash; Small, Normal, or Large.
                Increases text size across panels and data displays for better
                readability. Useful on large monitors or for accessibility
                needs.
              </li>
              <li>
                <strong>Visual Style</strong> &mdash; Realistic or High-Viz.
                Controls the rendering style for the globe and map view.
                High-Viz uses simplified, high-contrast graphics for better
                visibility.
              </li>
            </ul>
          </div>

          {/* Accessibility */}
          <div>
            <h4 className="text-white font-semibold mb-1.5">Accessibility</h4>
            <ul className="list-disc list-inside space-y-1.5 pl-1">
              <li>
                <strong>Color Vision Mode</strong> &mdash; Select from several
                color-blind accommodation modes (Protanopia, Deuteranopia,
                Tritanopia, Achromatopsia, and more). Each mode adjusts the
                app&apos;s color palette to improve visibility for that specific
                condition.
              </li>
              <li>
                <strong>High Contrast</strong> &mdash; Increases contrast
                throughout the UI for better visibility in bright environments
                or for users who need stronger visual differentiation.
              </li>
            </ul>
            <HelpCallout type="note">
              High Contrast and Color Vision modes can be combined. The app also
              automatically respects your operating system&apos;s{" "}
              <code className="text-xs bg-white/10 px-1 py-0.5 rounded font-mono">
                prefers-reduced-motion
              </code>{" "}
              and contrast preferences.
            </HelpCallout>
          </div>

          {/* Map & Globe */}
          <div>
            <h4 className="text-white font-semibold mb-1.5">Map &amp; Globe</h4>
            <ul className="list-disc list-inside space-y-1.5 pl-1">
              <li>
                <strong>Spot Clustering</strong> &mdash; Groups nearby DX spots
                together on the globe. When enabled, you can adjust the grid
                size (5&ndash;15 degrees) and minimum cluster size (2&ndash;10
                spots). Clustering reduces visual clutter when many stations are
                active in the same region.
              </li>
              <li>
                <strong>Compass Rose</strong> &mdash; Displays a compass rose
                overlay centered on your QTH. When enabled, you can set beam
                width (30&deg;, 45&deg;, 60&deg;, or 90&deg;) and toggle the
                beam width wedge overlay to visualize your antenna&apos;s
                coverage pattern.
              </li>
              <li>
                <strong>Spot Age Display</strong> &mdash; Older spots fade
                visually based on age. Configure the maximum age before full
                fade (5&ndash;120 minutes) and optionally show an age column in
                the DX cluster list.
              </li>
              <li>
                <strong>Callsign Labels</strong> &mdash; Show callsign text
                labels directly on globe spot markers for quick identification.
              </li>
              <li>
                <strong>Spotter Labels</strong> &mdash; Show the spotter&apos;s
                callsign on globe markers alongside the spotted station.
              </li>
              <li>
                <strong>Spot Click Radius</strong> &mdash; Adjust how close you
                need to click to select a spot on the globe (0.5x to 2.0x).
                Increase this on touch devices or if you find spots hard to
                select.
              </li>
              <li>
                <strong>Spot Color Mode</strong> &mdash; Color-code spots on the
                globe by operating mode (CW, SSB, FT8, etc.) or by band (160m
                through 6m). Choose whichever grouping is more useful for your
                operating style.
              </li>
            </ul>
          </div>

          {/* Propagation */}
          <div>
            <h4 className="text-white font-semibold mb-1.5">Propagation</h4>
            <ul className="list-disc list-inside space-y-1.5 pl-1">
              <li>
                <strong>Noise Environment</strong> &mdash; Quiet Rural, Rural,
                Suburban/Residential, or Urban/City. Affects SNR predictions for
                band conditions and propagation models. Based on ITU-R P.372
                man-made noise levels. Urban environments have significantly
                higher noise floors, which reduces the effective range of
                weak-signal modes.
              </li>
              <li>
                <strong>Antenna Type</strong> &mdash; Select your antenna model
                (isotropic, dipole, vertical, Yagi, etc.). Each type has
                different peak gain (dBi) and optimal elevation angle. This is
                used in propagation predictions to calculate realistic signal
                levels based on your actual antenna pattern and the path takeoff
                angle.
              </li>
            </ul>
            <HelpCallout type="tip">
              Setting your noise environment and antenna type accurately is
              critical for realistic propagation predictions. An urban station
              with a simple dipole will see very different results than a rural
              station with a stacked Yagi array.
            </HelpCallout>
          </div>

          {/* Forecast Display */}
          <div>
            <h4 className="text-white font-semibold mb-1.5">
              Forecast Display
            </h4>
            <ul className="list-disc list-inside space-y-1.5 pl-1">
              <li>
                <strong>Band Mode</strong> &mdash; Common (popular bands only),
                All (every band), or Custom (hand-pick which bands to show in
                the forecast panel).
              </li>
              <li>
                <strong>Show SNR Values</strong> &mdash; Display numeric SNR
                values inside forecast cells for precise readings.
              </li>
              <li>
                <strong>Detailed Footer</strong> &mdash; Show additional
                metadata below the forecast grid.
              </li>
              <li>
                <strong>Hours to Show</strong> &mdash; Display 13 or 24 hours of
                forecast data in the propagation forecast view.
              </li>
            </ul>
          </div>

          {/* Interaction */}
          <div>
            <h4 className="text-white font-semibold mb-1.5">Interaction</h4>
            <ul className="list-disc list-inside space-y-1.5 pl-1">
              <li>
                <strong>Hover Info Tips</strong> &mdash; Show brief explanations
                when hovering over info icons throughout the app.
              </li>
              <li>
                <strong>Hold Duration</strong> &mdash; Time required to trigger
                a context menu on long-press (300ms to 2000ms). Increase if you
                accidentally trigger context menus; decrease for faster access.
              </li>
              <li>
                <strong>Auto-Dismiss Flyout</strong> &mdash; Automatically
                dismiss popup flyouts after a configurable delay (1s to 10s).
              </li>
            </ul>
          </div>

          {/* Bands */}
          <div>
            <h4 className="text-white font-semibold mb-1.5">Bands</h4>
            <ul className="list-disc list-inside space-y-1.5 pl-1">
              <li>
                <strong>Favored Bands</strong> &mdash; Select the bands you
                regularly operate on. Favored bands are highlighted in the Band
                Planner, DX Wizard, and used for filtered views across the app.
              </li>
              <li>
                <strong>Band Presets</strong> &mdash; Save and load band
                selection presets for different operating scenarios (e.g.,
                &quot;Contest HF&quot;, &quot;FT8 Bands&quot;, &quot;Low Band
                DX&quot;). Quickly switch between preset configurations.
              </li>
            </ul>
          </div>
        </div>
      </HelpAccordion>

      {/* ── Appearance ───────────────────────────────────────────────── */}
      <HelpAccordion
        id="appearance"
        title="Appearance"
        summary="Theme, accent color, custom colors, and SDR waterfall palette"
      >
        <div className="space-y-4 text-sm text-gray-300 leading-relaxed">
          <div>
            <h4 className="text-white font-semibold mb-1.5">Accent Color</h4>
            <p>
              Choose from eight accent color presets that change the primary and
              secondary highlight colors throughout the entire app. The default
              preset is &ldquo;Plasma&rdquo; (orange/green). All buttons,
              panels, and interactive elements update instantly when you switch
              accents.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1.5">Custom Colors</h4>
            <p>
              Power users can expand the &ldquo;Custom Colors&rdquo; section to
              enter exact hex values for the accent (primary) and secondary
              colors. Enter any valid{" "}
              <code className="text-xs bg-white/10 px-1 py-0.5 rounded font-mono">
                #RGB
              </code>{" "}
              or{" "}
              <code className="text-xs bg-white/10 px-1 py-0.5 rounded font-mono">
                #RRGGBB
              </code>{" "}
              value and click Apply. Use Reset to return to the default Plasma
              palette.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1.5">Theme</h4>
            <p>
              Select a base theme for the interface. Multiple themes are
              available, each with different background colors and panel styles.
              Dark themes are recommended for hamshack use and low-light
              environments.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1.5">
              SDR Waterfall Palette
            </h4>
            <p>
              Controls the color scheme used by the SDR Console waterfall and
              spectrum display. Available palettes:
            </p>
            <ul className="list-disc list-inside space-y-1 pl-1 mt-2">
              <li>
                <strong>Classic</strong> &mdash;
                Black&rarr;Blue&rarr;Cyan&rarr;Yellow&rarr;Red. The traditional
                waterfall color scheme.
              </li>
              <li>
                <strong>Viridis</strong> &mdash; Perceptually uniform,
                colorblind-friendly palette.
              </li>
              <li>
                <strong>Magma</strong> &mdash; Dark-to-bright warm palette with
                good contrast.
              </li>
              <li>
                <strong>Grayscale</strong> &mdash; Simple black-to-white
                gradient. Clean and distraction-free.
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1.5">Live Preview</h4>
            <p>
              A preview panel at the bottom of the Appearance section shows
              sample UI elements with your current accent color and theme so you
              can see the effect before navigating away.
            </p>
          </div>

          <HelpCallout type="note">
            Accent colors are applied globally via CSS custom properties. Every
            panel, button, and highlight that references the primary or
            secondary accent color updates instantly without a page reload.
          </HelpCallout>
        </div>
      </HelpAccordion>

      {/* ── Notifications ────────────────────────────────────────────── */}
      <HelpAccordion
        id="notifications"
        title="Notifications"
        summary="Band alerts, storm warnings, sound controls, watch alerts, and quiet hours"
      >
        <div className="space-y-4 text-sm text-gray-300 leading-relaxed">
          <div>
            <h4 className="text-white font-semibold mb-1.5">Alert Types</h4>
            <ul className="list-disc list-inside space-y-1.5 pl-1">
              <li>
                <strong>Greyline Alerts</strong> &mdash; Notifies you when the
                greyline (sunrise/sunset terminator) approaches your QTH. The
                greyline is a prime opportunity for low-band DX because signals
                travel efficiently along the twilight boundary.
              </li>
              <li>
                <strong>Geomagnetic Storm Warnings</strong> &mdash; Alerts when
                the Kp index exceeds your configured threshold (1&ndash;9). A
                higher threshold means fewer alerts but only for significant
                storms. Set this to Kp 5 for major storms or Kp 3 for early
                warnings of degraded conditions.
              </li>
              <li>
                <strong>Solar Flare Alerts</strong> &mdash; Notifications about
                significant solar flare activity that may impact HF propagation.
              </li>
              <li>
                <strong>Band Opening Notifications</strong> &mdash; Alerts when
                selected bands show inter-continental activity. Select which
                bands to monitor using the band chip selector. At least one band
                must be selected for alerts to fire.
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1.5">Sound Controls</h4>
            <ul className="list-disc list-inside space-y-1.5 pl-1">
              <li>
                <strong>Sound Enabled</strong> &mdash; Master toggle for audible
                notification sounds. When disabled, all alerts are visual only.
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1.5">Watch Alerts</h4>
            <p>
              Watch alerts are tied to your saved watch targets. When a watched
              grid square, callsign, or region has activity, you receive a
              notification. Watch alerts include sunrise/sunset at the target
              location and geomagnetic events affecting the path to that target.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1.5">Quiet Hours</h4>
            <p>
              Suppress all audible alerts during specified UTC hours. When
              enabled, configure a start and end hour (0&ndash;23 UTC). During
              quiet hours, alerts still appear visually but make no sound.
              Useful for overnight operation or shared spaces.
            </p>
          </div>

          <HelpCallout type="tip">
            Set geomagnetic storm warnings to Kp 4 and band opening
            notifications for your favorite bands. This gives you a heads-up
            when conditions are changing without overwhelming you with
            notifications during normal operation.
          </HelpCallout>
        </div>
      </HelpAccordion>

      {/* ── Connections ──────────────────────────────────────────────── */}
      <HelpAccordion
        id="connections"
        title="Connections"
        summary="ProPulse Bridge, DX Cluster, CAT rig control, and hardware integration"
      >
        <div className="space-y-5 text-sm text-gray-300 leading-relaxed">
          <div>
            <h4 className="text-white font-semibold mb-1.5">ProPulse Bridge</h4>
            <p>
              The ProPulse Bridge is a local companion application that connects
              Propulse (running in your browser) to your radio hardware. It
              provides WebSocket connectivity for DX cluster spot streaming, CAT
              rig control, and WSJT-X integration. Enable the Bridge toggle to
              start the connection. The bridge must be running on your local
              machine or network.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1.5">DX Cluster</h4>
            <p>
              Connect to a DX cluster node for real-time spot streaming via the
              ProPulse Bridge. Features include:
            </p>
            <ul className="list-disc list-inside space-y-1.5 pl-1 mt-2">
              <li>
                <strong>Cluster Node</strong> &mdash; Choose from well-known
                nodes (VE7CC, NC7J, HB9DRV, K3LR) or enter a custom host:port.
                Nodes are regional &mdash; pick one near you for lower latency.
              </li>
              <li>
                <strong>Login Callsign</strong> &mdash; Your callsign for
                cluster authentication (auto-filled from your profile).
              </li>
              <li>
                <strong>Password</strong> &mdash; Optional. Some cluster nodes
                require a password for access.
              </li>
              <li>
                <strong>Spot Filters</strong> &mdash; Filter incoming spots by
                band (160m&ndash;6m) and mode (CW, SSB, FT8, FT4, RTTY, DATA).
                Leave empty to receive all spots.
              </li>
              <li>
                <strong>Connection Status</strong> &mdash; Shows
                connected/connecting/disconnected state, the current spot source
                (Bridge WebSocket or REST API), and total spots received.
              </li>
            </ul>
            <p className="mt-2">
              Without the bridge, spots are fetched from the REST API fallback.
              The bridge provides lower latency and higher throughput for
              serious DX chasers.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1.5">
              CAT / Rig Control
            </h4>
            <p>
              Computer-aided transceiver (CAT) control syncs frequency, mode,
              band, S-meter, and PTT status between Propulse and your radio.
            </p>
            <ul className="list-disc list-inside space-y-1.5 pl-1 mt-2">
              <li>
                <strong>CAT Backend</strong> &mdash; Auto (tries all backends),
                Hamlib (rigctld), Flrig, or Disabled. Auto-detect is recommended
                for most setups.
              </li>
              <li>
                <strong>Hamlib (rigctld)</strong> &mdash; Enter the host and
                port where rigctld is running. Default: localhost:4532.
              </li>
              <li>
                <strong>Flrig</strong> &mdash; Enter the host and port for the
                Flrig XML-RPC server. Default: localhost:12345.
              </li>
              <li>
                <strong>Test Connection</strong> &mdash; Verify connectivity
                before enabling full CAT control.
              </li>
              <li>
                <strong>PTT Safety Lockout</strong> &mdash; Prevents accidental
                transmissions via CAT control. When enabled, PTT commands from
                Propulse are blocked (manual PTT on the radio still works).
              </li>
              <li>
                <strong>Rig Status</strong> &mdash; When connected, displays
                real-time frequency, mode, band, PTT state (TX/RX), rig model,
                and an S-meter visualization with readings from S0 to S9+60.
              </li>
            </ul>
          </div>

          <HelpCallout type="warning">
            The ProPulse Bridge must be running locally for DX cluster and CAT
            connections. Without the bridge, these features are unavailable and
            Propulse falls back to REST API spot data.
          </HelpCallout>
        </div>
      </HelpAccordion>

      {/* ── Subscription ─────────────────────────────────────────────── */}
      <HelpAccordion
        id="subscription"
        title="Subscription"
        summary="Manage your plan, compare features, upgrade, and billing"
      >
        <div className="space-y-4 text-sm text-gray-300 leading-relaxed">
          <p>
            Propulse offers two plans: <strong>Free</strong> and{" "}
            <strong>Pro</strong> ($6.99/month). The free plan includes all
            real-time data, local tools, and a basic profile at zero cost.
          </p>

          <div>
            <h4 className="text-white font-semibold mb-1.5">Plan Comparison</h4>
            <ul className="list-disc list-inside space-y-1.5 pl-1">
              <li>
                <strong>Cloud Sync</strong> &mdash; Logbook, settings, and
                watches sync across devices (Pro only).
              </li>
              <li>
                <strong>Custom Profile Images &amp; Gear Photos</strong> &mdash;
                Upload your own avatar and station photos (Pro only).
              </li>
              <li>
                <strong>Per-User Propagation Modeling</strong> &mdash; Tailored
                propagation predictions using your exact antenna and location
                (Pro only).
              </li>
              <li>
                <strong>Spot Replay &amp; Extended History</strong> &mdash; 7
                days local on Free, 30 days on Pro.
              </li>
              <li>
                <strong>Contest Watch Presets</strong> &mdash; Pro only.
              </li>
              <li>
                <strong>Saved Watch Presets</strong> &mdash; 5 on Free, 20 on
                Pro.
              </li>
              <li>
                <strong>Arc Density Limit</strong> &mdash; 100 on Free, 200 on
                Pro.
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1.5">
              Managing Your Subscription
            </h4>
            <ul className="list-disc list-inside space-y-1.5 pl-1">
              <li>
                <strong>Upgrade Button</strong> &mdash; Opens Stripe Checkout to
                start your Pro subscription.
              </li>
              <li>
                <strong>Manage Subscription</strong> &mdash; For Pro users,
                opens the Stripe Customer Portal where you can update payment
                methods, view invoices, or cancel.
              </li>
              <li>
                <strong>Past Due Warning</strong> &mdash; If payment fails, a
                warning banner appears with an &ldquo;Update Payment
                Method&rdquo; button.
              </li>
              <li>
                <strong>Renewal Info</strong> &mdash; Shows your current billing
                period end date and whether the subscription will renew or
                expire.
              </li>
            </ul>
          </div>

          <HelpCallout type="pro">
            Pro supports the infrastructure that keeps Propulse running &mdash;
            cloud storage, compute for propagation models, and historical data
            processing. Every subscription directly funds development.
          </HelpCallout>
        </div>
      </HelpAccordion>

      {/* ── Data & Account ───────────────────────────────────────────── */}
      <HelpAccordion
        id="data-account"
        title="Data & Account"
        summary="Account management, export/import settings, logbook export, and data clearing"
      >
        <div className="space-y-4 text-sm text-gray-300 leading-relaxed">
          <div>
            <h4 className="text-white font-semibold mb-1.5">Account</h4>
            <p>
              If Supabase authentication is configured, this section shows your
              account status. When signed in, you see your email, sync status
              (synced, syncing, offline, or error), pending change count, and
              last sync time. You can sign out from this section. If not signed
              in, a prompt explains the benefits of an account (cloud sync,
              social features) with a sign-in button.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1.5">
              Export / Import Settings
            </h4>
            <ul className="list-disc list-inside space-y-1.5 pl-1">
              <li>
                <strong>Export Settings</strong> &mdash; Downloads all your
                settings as a JSON file. This includes your station profile,
                preferences, saved targets, watches, pins, and filter settings.
              </li>
              <li>
                <strong>Import Settings</strong> &mdash; Load a previously
                exported JSON backup file. The import shows a summary of what
                will be restored and requires confirmation before applying.
                Importing replaces your current settings and cannot be undone.
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1.5">Export Logbook</h4>
            <p>
              Download your logbook as an ADIF file compatible with other
              amateur radio logging software (Logger32, N1MM, HRD, etc.). The
              button shows the current QSO count and is disabled if your logbook
              is empty.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1.5">
              Clear Local Data
            </h4>
            <p>
              Permanently deletes all locally stored data including settings,
              logbook entries, pins, and cached information from your browser
              (both localStorage and IndexedDB). This requires a double-click
              confirmation to prevent accidental data loss. After clearing, the
              page reloads automatically.
            </p>
            <HelpCallout type="warning">
              Clearing local data is irreversible. If you have a cloud account,
              your synced data remains on the server, but any local-only data
              will be lost forever. Always export your settings and logbook
              first.
            </HelpCallout>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1.5">About</h4>
            <p>
              Displays the current Propulse version number. Backup files include
              version information for compatibility, so you can safely import
              backups from older versions.
            </p>
          </div>
        </div>
      </HelpAccordion>

      {/* ── FAQ ──────────────────────────────────────────────────────── */}
      <HelpFAQ
        items={[
          {
            question: "How do I change my callsign?",
            answer:
              "Go to your Profile page (not Settings) and update the Station Callsign field in the Station Identity section. This changes your callsign across the entire app — profile, logbook, path calculations, DX cluster login, and QSL cards. On desktop you can edit directly in the sidebar card; on mobile, use the Station Identity form in the Overview tab.",
          },
          {
            question: "Can I reset all settings to defaults?",
            answer:
              'Go to Settings > Data & Account and use the "Clear All Local Data" button. This resets all locally stored settings, preferences, and cached data to defaults. If you have a cloud account, your profile data remains on the server and will re-sync after sign-in. Always export your settings first if you want to keep a backup.',
          },
          {
            question: "Where is my data stored?",
            answer:
              "Without an account, everything is stored in your browser's localStorage and IndexedDB — it never leaves your machine. With a free account, your profile and basic settings sync to Supabase cloud servers. With Pro, your full logbook, settings, watches, and custom images sync to the cloud. All data is encrypted in transit (TLS) and at rest. Service credentials are stored separately in encrypted IndexedDB, not in plain localStorage.",
          },
        ]}
      />
    </div>
  );
}
