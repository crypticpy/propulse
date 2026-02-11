import { Link } from "react-router-dom";
import { HelpAccordion } from "@/components/help/HelpAccordion";
import { HelpCallout } from "@/components/help/HelpCallout";
import { HelpFAQ } from "@/components/help/HelpFAQ";

export function BandPlannerSection() {
  return (
    <div className="space-y-6">
      {/* Overview */}
      <p className="text-sm leading-relaxed text-gray-300">
        The Band Planner gives you a 24-hour propagation forecast, showing which
        bands will be open at each hour of the day. Use it to plan your
        operating sessions around the best propagation windows.
      </p>

      {/* Reading the Heatmap */}
      <HelpAccordion
        id="heatmap"
        title="Reading the Heatmap"
        summary="Understanding the band x hours forecast grid"
      >
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>
            The heatmap is the central visualization of the Band Planner. It
            displays bands as rows (160 m through 10 m) against hours as columns
            (0-23 UTC), forming a grid where each cell represents predicted
            propagation quality for that band at that hour.
          </p>

          <ul className="list-disc list-inside space-y-1.5 pl-1">
            <li>
              The current UTC hour is highlighted with an orange ring marker so
              you can quickly see where "now" falls in the forecast.
            </li>
            <li>
              Hover over any cell to see a tooltip with the exact status and SNR
              estimate for that band and hour.
            </li>
            <li>
              Click any band row to select it and view detailed information in
              the Best Windows section.
            </li>
            <li>
              The color of each cell corresponds to the propagation status
              (excellent, good, fair, poor, or closed) — see Status Colors below
              for the full mapping.
            </li>
          </ul>

          <HelpCallout type="tip">
            Set a target location first — the forecast is calculated for the
            path between your QTH and the target. Without a target, no forecast
            data is shown. Enter a grid square like JN58 (central Europe) or
            FN31 (northeastern US) in the target field.
          </HelpCallout>
        </div>
      </HelpAccordion>

      {/* Status Colors */}
      <HelpAccordion
        id="status-colors"
        title="Status Colors"
        summary="What each propagation status color means"
      >
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <ul className="list-disc list-inside space-y-2 pl-1">
            <li>
              <span className="font-semibold" style={{ color: "#00ff88" }}>
                Excellent (bright green)
              </span>{" "}
              — Strong propagation with SNR at -8 dB or better. All modes are
              viable including SSB. Signal strength is well above the threshold
              for any mode.
            </li>
            <li>
              <span className="font-semibold" style={{ color: "#44dd66" }}>
                Good (yellow-green)
              </span>{" "}
              — Reliable propagation with SNR between -12 dB and -8 dB. SSB and
              CW work well. Digital modes are very comfortable.
            </li>
            <li>
              <span className="font-semibold" style={{ color: "#ffaa00" }}>
                Fair (orange)
              </span>{" "}
              — Marginal propagation with SNR between -18 dB and -12 dB. Digital
              modes (FT8/FT4) are recommended. SSB may be difficult — you'll
              need favorable conditions and patience.
            </li>
            <li>
              <span className="font-semibold" style={{ color: "#ff4455" }}>
                Poor (red)
              </span>{" "}
              — Weak or unreliable propagation with SNR between -24 dB and -18
              dB. Only digital modes may get through, and even those may require
              patience and maximum power.
            </li>
            <li>
              <span className="font-semibold" style={{ color: "#374151" }}>
                Closed (gray)
              </span>{" "}
              — No propagation expected on this band at this hour. SNR below -24
              dB. The band is not viable for any mode on this path.
            </li>
          </ul>
        </div>
      </HelpAccordion>

      {/* Best Windows */}
      <HelpAccordion
        id="best-windows"
        title="Best Windows"
        summary="How optimal operating times are identified"
      >
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>
            The planner automatically identifies contiguous open hours for each
            band by scanning the 24-hour forecast. A "window" is a consecutive
            run of hours where a band has fair-or-better propagation. The
            algorithm works as follows:
          </p>

          <ol className="list-decimal list-inside space-y-1.5 pl-1">
            <li>
              Find the peak SNR hour for each band across the full 24-hour
              period.
            </li>
            <li>
              Expand outward from the peak in both directions, including
              consecutive hours that have at least "fair" status.
            </li>
            <li>
              Skip bands that never reach "fair" or better during any hour.
            </li>
          </ol>

          <p>
            Windows are sorted with priority: <strong>currently active</strong>{" "}
            windows first (the current hour falls within the window), then{" "}
            <strong>upcoming</strong> windows, then windows that have{" "}
            <strong>already passed</strong> (shown dimmed). Within each group,
            windows are sorted by current-hour SNR or peak SNR.
          </p>

          <p>
            Each window card shows the band name, start and end hour (UTC), peak
            hour, peak SNR in dB, and the peak propagation status. Click a
            window card to highlight that band in the heatmap.
          </p>

          <HelpCallout type="tip">
            Look for bands with 3 or more consecutive "good" or "excellent"
            hours — these are your best operating opportunities where conditions
            are stable enough for extended sessions.
          </HelpCallout>
        </div>
      </HelpAccordion>

      {/* Storm & Confidence */}
      <HelpAccordion
        id="storm-confidence"
        title="Storm & Confidence"
        summary="How geomagnetic activity affects forecast reliability"
      >
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>
            The Band Planner monitors geomagnetic conditions and adjusts its
            confidence level accordingly. Three alert conditions are tracked:
          </p>

          <ul className="list-disc list-inside space-y-2 pl-1">
            <li>
              <span className="text-red-400 font-semibold">
                Storm Alert (Kp &ge; 5)
              </span>{" "}
              — A red banner appears indicating a geomagnetic storm in progress.
              All HF propagation forecasts are significantly degraded. Expect
              band closures, especially on paths crossing high latitudes.
              Consider lower bands (40 m, 80 m) and digital modes.
            </li>
            <li>
              <span className="text-amber-400 font-semibold">
                Disturbed Conditions (Kp &ge; 4)
              </span>{" "}
              — Medium confidence. Conditions may be worse than predicted.
              High-band forecasts are less reliable. The ionosphere is unsettled
              and could shift quickly.
            </li>
            <li>
              <span className="text-amber-400 font-semibold">
                Southward IMF (Bz &lt; -5 nT)
              </span>{" "}
              — A yellow alert banner indicates that the interplanetary magnetic
              field is oriented southward, which allows solar wind energy to
              couple into Earth's magnetosphere. A geomagnetic storm may
              develop, and forecast confidence is reduced.
            </li>
          </ul>

          <p>
            The <strong>Confidence Level</strong> is displayed prominently near
            the target input:
          </p>

          <ul className="list-disc list-inside space-y-1 pl-1">
            <li>
              <span className="text-green-400 font-semibold">High</span> — Quiet
              geomagnetic conditions (Kp &lt; 4, Bz &ge; 0). Forecasts are most
              reliable.
            </li>
            <li>
              <span className="text-amber-400 font-semibold">Medium</span> —
              Unsettled conditions (Kp &ge; 4 or Bz &lt; 0). Some forecast
              inaccuracy expected.
            </li>
            <li>
              <span className="text-red-400 font-semibold">Low</span> — Stormy
              conditions (Kp &ge; 5 or Bz &lt; -5 nT). Forecasts are rough
              estimates only.
            </li>
          </ul>

          <HelpCallout type="warning">
            When confidence is Low, treat all forecasts as rough estimates.
            Conditions during geomagnetic storms can change rapidly — a band
            that is predicted to be open may close within minutes, and vice
            versa.
          </HelpCallout>
        </div>
      </HelpAccordion>

      {/* Operating Recommendations */}
      <HelpAccordion
        id="operating-recommendations"
        title="Operating Recommendations"
        summary="Mode and power guidance based on conditions"
      >
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>
            The Band Planner provides mode and power guidance tailored to
            current conditions on the best available band:
          </p>

          <div>
            <h4 className="text-white font-semibold mb-1.5">
              Mode Recommendations
            </h4>
            <ul className="list-disc list-inside space-y-1.5 pl-1">
              <li>
                <strong>Excellent/Good status</strong> — SSB, CW, and digital
                modes are all viable. Strong signals mean you have flexibility
                to choose any mode. SSB ragchewing is comfortable.
              </li>
              <li>
                <strong>Fair status</strong> — FT8/FT4 recommended. Digital
                modes have a 12-24 dB advantage over SSB due to narrower
                bandwidth and digital processing gain. CW is a good middle
                ground.
              </li>
              <li>
                <strong>Poor status</strong> — Digital modes only. Maximum legal
                power if possible. Even FT8 may require patience for contacts.
              </li>
              <li>
                <strong>No bands open</strong> — Save power and wait for
                conditions to improve. Check the forecast for upcoming windows,
                or try VHF/UHF for local contacts.
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1.5">Power Guidance</h4>
            <ul className="list-disc list-inside space-y-1.5 pl-1">
              <li>
                <strong>SNR &ge; -10 dB</strong> — 50-100W should be sufficient
                for reliable contacts. Even QRP (5W) may work on strong
                openings.
              </li>
              <li>
                <strong>SNR -10 to -18 dB</strong> — Full 100W recommended.
                Higher power helps on marginal paths, especially for SSB.
              </li>
              <li>
                <strong>SNR &lt; -18 dB</strong> — Maximum legal power
                recommended. You are operating at the edge of what the band can
                support — every decibel counts.
              </li>
            </ul>
          </div>
        </div>
      </HelpAccordion>

      {/* Favorites Filter */}
      <HelpAccordion
        id="favorites-filter"
        title="Favorites Filter"
        summary="Focus on your preferred bands"
      >
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>
            The Favorites button (star icon) next to the 24-Hour Forecast
            heading toggles between showing all bands and showing only your
            favorite bands. This reduces visual clutter when you only operate on
            certain bands or have specific antennas that cover a subset of the
            HF spectrum.
          </p>

          <ul className="list-disc list-inside space-y-1.5 pl-1">
            <li>
              Click the star icon next to any band name in the heatmap to toggle
              it as a favorite.
            </li>
            <li>
              Favorites are saved in your user preferences and persist across
              sessions.
            </li>
            <li>
              When the Favorites filter is active, only your starred bands
              appear in the heatmap rows. The Best Windows section still
              evaluates all bands.
            </li>
          </ul>
        </div>
      </HelpAccordion>

      {/* Data Sources */}
      <HelpAccordion
        id="data-sources-planner"
        title="Data Sources"
        summary="Where the forecast data comes from"
      >
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>
            The Band Planner derives its forecasts from the same real-time solar
            and geomagnetic data used throughout Propulse. Specifically:
          </p>
          <ul className="list-disc list-inside space-y-1.5 pl-1">
            <li>
              <strong className="text-white">Solar Flux Index (SFI)</strong>{" "}
              &mdash; Used to estimate ionization levels and MUF for each band.
              Sourced from NOAA SWPC via the proxied{" "}
              <code className="text-xs bg-white/10 px-1 py-0.5 rounded font-mono">
                /api/solar/flux
              </code>{" "}
              endpoint.
            </li>
            <li>
              <strong className="text-white">K-Index (Kp)</strong> &mdash;
              Measures geomagnetic disturbance, which degrades propagation.
              Sourced from NOAA SWPC via{" "}
              <code className="text-xs bg-white/10 px-1 py-0.5 rounded font-mono">
                /api/solar/k-index
              </code>
              .
            </li>
            <li>
              <strong className="text-white">Bz (IMF Z-Component)</strong>{" "}
              &mdash; The north-south interplanetary magnetic field component,
              used for storm confidence assessment. Sourced from SWPC solar wind
              data.
            </li>
          </ul>
          <p>
            For full details on these data sources and their refresh intervals,
            see the{" "}
            <Link
              to="/help/dashboard"
              className="text-plasma-orange hover:underline"
            >
              Dashboard
            </Link>{" "}
            and{" "}
            <Link
              to="/help/solar-pulse"
              className="text-plasma-orange hover:underline"
            >
              Solar Pulse
            </Link>{" "}
            help sections.
          </p>
        </div>
      </HelpAccordion>

      {/* FAQ */}
      <HelpFAQ
        items={[
          {
            question: "Why are all bands closed?",
            answer:
              "This typically happens during geomagnetic storms (Kp >= 5) or at night when higher bands shut down. Check the Solar Pulse page for current storm conditions and the Kp/Bz values shown in the Band Planner header. If it is nighttime at the path midpoint, try lower bands (80 m, 40 m) which often improve after dark. During a severe storm, even lower bands may be degraded — wait for conditions to recover, which usually takes 12-24 hours after the storm peak.",
          },
          {
            question: "What makes confidence low?",
            answer:
              "Geomagnetic storm conditions (Kp >= 5) or sustained southward IMF (Bz < -5 nT). The ionosphere becomes unpredictable during storms because energy from the solar wind is rapidly deposited into the upper atmosphere, causing irregular ionization patterns that the forecast model cannot accurately predict. Low confidence means the actual conditions could be significantly better or worse than what the forecast shows.",
          },
        ]}
      />
    </div>
  );
}
