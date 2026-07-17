import { Link } from "react-router-dom";
import { HelpAccordion } from "@/components/help/HelpAccordion";
import { HelpCallout } from "@/components/help/HelpCallout";
import { HelpDataTable } from "@/components/help/HelpDataTable";
import { HelpFAQ } from "@/components/help/HelpFAQ";

export function DashboardSection() {
  return (
    <div className="space-y-6">
      <p className="text-sm leading-relaxed text-gray-300">
        The Dashboard combines source-aged solar observations, general band
        guidance, and DX activity in one operational view. Solar cards preserve
        the last validated observation during a bounded outage and label it
        stale; they do not turn a missing value into zero. See{" "}
        <Link to="/help/solar-pulse" className="text-plasma-orange hover:underline">
          Solar Pulse
        </Link>{" "}
        for product-level provenance, official forecasts, and imagery.
      </p>

      <HelpAccordion
        id="band-conditions"
        title="Band Conditions"
        summary="General HF guidance from global Kp and solar-flux inputs"
      >
        <div className="space-y-3 text-sm leading-relaxed text-gray-300">
          <p>
            The panel groups the major amateur bands from 160 m through 10 m
            into Good, Fair, and Poor categories. These are global heuristics,
            not measured openings or station-to-station predictions.
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li><strong>Good:</strong> the available global inputs are supportive for that band.</li>
            <li><strong>Fair:</strong> the inputs are mixed; weak-signal modes may be more practical.</li>
            <li><strong>Poor:</strong> the inputs indicate elevated disruption or limited support.</li>
          </ul>
          <HelpCallout type="tip">
            Actual results still depend on both endpoints, path illumination,
            season, time, mode, antennas, and local noise. Check PropSphere or
            observed spots before treating a category as an opening.
          </HelpCallout>
        </div>
      </HelpAccordion>

      <HelpAccordion
        id="propagation-index"
        title="Global Conditions Score"
        summary="Transparent, uncalibrated context—not a probability or path forecast"
      >
        <div className="space-y-3 text-sm leading-relaxed text-gray-300">
          <p>
            The score combines observed 10.7 cm solar flux (40%), planetary Kp
            (40%), and IMF Bz (20% when available). Missing Bz does not receive
            hidden neutral points. Evidence coverage states whether two or
            three inputs contributed.
          </p>
          <p>
            High, medium, and low values mean globally supportive, mixed, or
            disrupted inputs. The score has not been calibrated against contact
            probability and intentionally avoids confidence language.
          </p>
        </div>
      </HelpAccordion>

      <HelpAccordion
        id="primary-metrics"
        title="Primary Metrics"
        summary="Observed Kp, SFI, monthly sunspots, and IMF Bz"
      >
        <div className="space-y-4 text-sm leading-relaxed text-gray-300">
          <p>
            <strong>Planetary Kp</strong> describes global geomagnetic
            disturbance in official three-hour intervals. Observed, estimated,
            and predicted intervals remain distinct; Kp 5 or higher corresponds
            to geomagnetic storm levels.
          </p>
          <p>
            <strong>10.7 cm solar flux (SFI)</strong> is an observed global
            proxy for solar EUV output and ionospheric ionization. Higher SFI
            can support higher-frequency F-layer propagation, but it does not
            determine whether a particular path is open.
          </p>
          <p>
            <strong>Sunspot number</strong> is a monthly observed series used
            for solar-cycle context. The card shows its as-of month rather than
            implying minute-level freshness.
          </p>
          <p>
            <strong>IMF Bz</strong> is the north-south component of the solar-wind
            magnetic field measured near L1. Sustained southward Bz can increase
            coupling into Earth’s magnetosphere; a single sample is context,
            not a geomagnetic or HF forecast.
          </p>
          <HelpCallout type="note">
            NOAA’s official three-day product includes predicted planetary A.
            Propulse shows it only in forecast context. Any Kp conversion shown
            elsewhere is labeled estimated ap-equivalent, not measured A-index.
          </HelpCallout>
        </div>
      </HelpAccordion>

      <HelpAccordion
        id="activity-cards"
        title="Activity Cards"
        summary="Observed network activity, station history, and planning context"
      >
        <div className="space-y-3 text-sm leading-relaxed text-gray-300">
          <p>
            Cluster Pulse summarizes recent DX-cluster reports; Log Stats and
            History summarize your own records. A spot is evidence that one
            reporting station heard another—it is not proof that your path will
            behave the same way.
          </p>
          <p>
            Planning cards may show modeled operating projections. They remain
            distinct from provider-issued space-weather forecasts.
          </p>
        </div>
      </HelpAccordion>

      <HelpAccordion
        id="data-sources-dashboard"
        title="Data Sources"
        summary="Shared validation, age, refresh, and last-good behavior"
      >
        <div className="space-y-3 text-sm leading-relaxed text-gray-300">
          <p>
            Solar data is validated and normalized by same-origin endpoints,
            then stored in a bounded browser last-good cache. Soft expiry starts
            revalidation; hard expiry removes the value from decision claims.
          </p>
          <HelpDataTable
            sources={[
              { name: "Planetary Kp", source: "NOAA SWPC", endpoint: "/api/solar/k-index", refresh: "2 min", cache: "5 min soft / 30 min hard" },
              { name: "Solar flux", source: "NOAA SWPC", endpoint: "/api/solar/flux", refresh: "4 hr", cache: "4 hr soft / 24 hr hard" },
              { name: "IMF Bz", source: "NOAA SWPC", endpoint: "/api/solar/magnetometer", refresh: "2 min", cache: "5 min soft / 30 min hard" },
              { name: "Monthly sunspots", source: "NOAA SWPC", endpoint: "/api/solar/sunspots", refresh: "24 hr", cache: "35 day soft / 75 day hard" },
            ]}
          />
        </div>
      </HelpAccordion>

      <HelpFAQ
        items={[
          {
            question: "Why is a value marked stale but still visible?",
            answer: "It is the last validated observation and remains inside that product’s hard usability limit. Propulse keeps it visible with its real age while retrying; after hard expiry, the value becomes unavailable.",
          },
          {
            question: "What is a good SFI for 10 m?",
            answer: "Higher SFI generally improves high-band potential, but no SFI threshold proves a 10 m path is open. Check both endpoints, illumination, time, season, mode, noise, and current observations.",
          },
          {
            question: "What does the dashboard refresh control cover?",
            answer: "It refreshes the registered structured sources visible on the dashboard and reports partial failures. Product imagery performs its own stable-URL metadata checks.",
          },
        ]}
      />
    </div>
  );
}
