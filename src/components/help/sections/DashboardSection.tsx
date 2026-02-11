import { HelpAccordion } from "@/components/help/HelpAccordion";
import { HelpCallout } from "@/components/help/HelpCallout";
import { HelpDataTable } from "@/components/help/HelpDataTable";
import { HelpFAQ } from "@/components/help/HelpFAQ";

export function DashboardSection() {
  return (
    <div className="space-y-6">
      {/* Overview — no accordion */}
      <p className="text-sm leading-relaxed text-gray-300">
        The Dashboard is your at-a-glance command center for HF propagation
        conditions. It combines real-time solar data, band status, and DX
        activity into a single view. Everything on this page updates
        automatically so you can keep it open during an operating session and
        always know the state of the ionosphere.
      </p>

      {/* Band Conditions */}
      <HelpAccordion
        id="band-conditions"
        title="Band Conditions"
        summary="Real-time HF band status from 160 m through 10 m"
      >
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>
            The Band Conditions panel shows propagation status for the major HF
            amateur bands:{" "}
            <strong>
              160 m, 80 m, 60 m, 40 m, 30 m, 20 m, 17 m, 15 m, 12 m,
            </strong>{" "}
            and <strong>10 m</strong>. Each band is assigned a color-coded
            status based on the current K-Index and Solar Flux Index (SFI).
          </p>

          <ul className="list-disc list-inside space-y-1.5 pl-1">
            <li>
              <span className="text-green-400 font-semibold">Green (Good)</span>{" "}
              — Strong propagation expected. SSB, CW, and digital modes should
              all work well on this band.
            </li>
            <li>
              <span className="text-yellow-400 font-semibold">
                Yellow (Fair)
              </span>{" "}
              — Marginal conditions. CW and digital modes (FT8/FT4) will
              outperform SSB. Patience may be rewarded.
            </li>
            <li>
              <span className="text-red-400 font-semibold">Red (Poor)</span> —
              Weak or unreliable propagation. Digital modes may still produce
              contacts, but expect difficulty.
            </li>
            <li>
              <span className="text-gray-400 font-semibold">Gray (Closed)</span>{" "}
              — No propagation expected on this band under current conditions.
            </li>
          </ul>

          <p>
            Status is computed by combining the current K-Index (geomagnetic
            disturbance) with the Solar Flux Index (ionospheric ionization
            level). Higher bands like 10 m and 12 m require stronger solar flux
            to open, while lower bands like 80 m and 160 m are more affected by
            geomagnetic disturbance.
          </p>

          <HelpCallout type="tip">
            Band conditions update every minute based on live K-Index data. If
            you see a band flicker between statuses, geomagnetic conditions are
            right on the boundary — try calling CQ and see what happens.
          </HelpCallout>
        </div>
      </HelpAccordion>

      {/* Propagation Index */}
      <HelpAccordion
        id="propagation-index"
        title="Propagation Index"
        summary="Composite propagation quality score combining multiple solar parameters"
      >
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>
            The Propagation Index is a single composite score that summarizes
            overall HF propagation quality. It synthesizes data from the Solar
            Flux Index, K-Index, and IMF Bz component into one easy-to-read
            gauge.
          </p>

          <ul className="list-disc list-inside space-y-1.5 pl-1">
            <li>
              <strong>High values (green zone)</strong> — Excellent conditions.
              High solar flux, low geomagnetic disturbance, and favorable IMF
              orientation combine to produce reliable, strong propagation across
              most bands.
            </li>
            <li>
              <strong>Medium values (yellow zone)</strong> — Moderate
              conditions. Some bands will be usable, but performance may be
              inconsistent. Focus on the bands highlighted as "Good" in the Band
              Conditions panel.
            </li>
            <li>
              <strong>Low values (red zone)</strong> — Poor conditions. High
              geomagnetic disturbance, low solar flux, or southward Bz are
              suppressing propagation. Consider low-band or digital-mode
              operation.
            </li>
          </ul>

          <p>
            Click the Propagation Index card on the dashboard to expand a
            detailed breakdown showing how each input parameter contributes to
            the score.
          </p>
        </div>
      </HelpAccordion>

      {/* Primary Metrics */}
      <HelpAccordion
        id="primary-metrics"
        title="Primary Metrics"
        summary="Key solar and geomagnetic measurements that drive propagation predictions"
      >
        <div className="space-y-5 text-sm text-gray-300 leading-relaxed">
          {/* K-Index */}
          <div>
            <h4 className="text-white font-semibold mb-1.5">K-Index (Kp)</h4>
            <p>
              The planetary K-Index measures geomagnetic disturbance on a 0 to 9
              scale. It is derived from magnetometer readings at observatories
              worldwide and updated every minute from NOAA SWPC.
            </p>
            <ul className="list-disc list-inside space-y-1 pl-1 mt-2">
              <li>
                <strong>Kp 0-1:</strong> Quiet — Excellent HF propagation.
                Stable ionosphere, predictable skip distances.
              </li>
              <li>
                <strong>Kp 2-3:</strong> Unsettled — Good conditions for most
                bands. Slight variations in signal strength possible.
              </li>
              <li>
                <strong>Kp 4:</strong> Active — Fair conditions. High bands may
                be degraded; low bands can still perform well.
              </li>
              <li>
                <strong>Kp 5+:</strong> Storm — Poor to closed conditions.
                Geomagnetic storm in progress. HF bands may be severely degraded
                or blacked out.
              </li>
            </ul>
            <p className="mt-2">
              Higher Kp values mean more geomagnetic disturbance, which disrupts
              the ionosphere and degrades HF propagation. The relationship is
              inverse: as Kp goes up, propagation quality goes down.
            </p>
            <HelpCallout type="warning">
              K-Index of 5 or higher indicates a geomagnetic storm. HF bands may
              be severely degraded, especially on paths crossing high latitudes.
            </HelpCallout>
          </div>

          {/* Solar Flux */}
          <div>
            <h4 className="text-white font-semibold mb-1.5">
              Solar Flux Index (SFI)
            </h4>
            <p>
              The 10.7 cm radio flux, measured in solar flux units (sfu), is the
              primary indicator of solar activity affecting the ionosphere. It
              directly correlates with the level of ionization in the F-layer,
              which is responsible for long-distance HF propagation.
            </p>
            <ul className="list-disc list-inside space-y-1 pl-1 mt-2">
              <li>
                <strong>&lt; 70 sfu:</strong> Low solar activity — Only lower HF
                bands (40 m and below) reliably open. 10 m and 12 m likely
                closed.
              </li>
              <li>
                <strong>70-120 sfu:</strong> Moderate — 20 m and 17 m open
                reliably. 15 m may open during daylight peaks.
              </li>
              <li>
                <strong>120-180 sfu:</strong> High — 15 m, 12 m, and 10 m open
                during daylight hours. Excellent high-band DX potential.
              </li>
              <li>
                <strong>&gt; 180 sfu:</strong> Very high — All bands open.
                Worldwide propagation on 10 m possible. Peak solar cycle
                conditions.
              </li>
            </ul>
            <HelpCallout type="tip">
              SFI above 120 usually means 10 m and 12 m will be wide open during
              daylight hours. This is the time to chase rare DX on the high
              bands.
            </HelpCallout>
          </div>

          {/* Sunspot Number */}
          <div>
            <h4 className="text-white font-semibold mb-1.5">
              Sunspot Number (SSN)
            </h4>
            <p>
              The monthly International Sunspot Number tracks how many sunspots
              are visible on the solar disk. Sunspots are regions of intense
              magnetic activity that produce the ultraviolet and X-ray radiation
              responsible for ionizing Earth's upper atmosphere.
            </p>
            <p className="mt-2">
              Higher SSN correlates with higher SFI and better HF conditions.
              The Sun follows an approximately 11-year cycle of activity. We are
              currently in <strong>Solar Cycle 25</strong>, which began in
              December 2019 and is progressing toward its maximum.
            </p>
          </div>

          {/* A-Index */}
          <div>
            <h4 className="text-white font-semibold mb-1.5">A-Index</h4>
            <p>
              The A-Index is a 24-hour summary of geomagnetic activity, derived
              from the K-Index using the standard Kp-to-Ap conversion table. It
              provides a smoother, daily view of geomagnetic conditions compared
              to the rapidly changing K-Index.
            </p>
            <ul className="list-disc list-inside space-y-1 pl-1 mt-2">
              <li>
                <strong>0-7:</strong> Quiet — Stable geomagnetic field.
                Excellent day for HF.
              </li>
              <li>
                <strong>8-15:</strong> Unsettled — Minor fluctuations. Most
                bands unaffected.
              </li>
              <li>
                <strong>16-29:</strong> Active — Noticeable degradation on
                high-latitude paths and higher bands.
              </li>
              <li>
                <strong>30+:</strong> Storm — Significant geomagnetic storm
                activity. Expect band closures.
              </li>
            </ul>
          </div>

          {/* Bz */}
          <div>
            <h4 className="text-white font-semibold mb-1.5">
              Bz (IMF Z-Component)
            </h4>
            <p>
              Bz is the north-south component of the Interplanetary Magnetic
              Field (IMF), measured in nanotesla (nT). It is one of the most
              important real-time indicators for predicting geomagnetic storms
              and HF propagation disruptions.
            </p>
            <ul className="list-disc list-inside space-y-1 pl-1 mt-2">
              <li>
                <strong>Positive (northward) Bz:</strong> The magnetosphere is
                shielded from solar wind energy. Good for HF propagation.
              </li>
              <li>
                <strong>Negative (southward) Bz:</strong> Energy from the solar
                wind couples into Earth's magnetosphere, causing geomagnetic
                disturbance and degrading HF conditions.
              </li>
            </ul>
            <HelpCallout type="warning">
              Bz below -5 nT often precedes geomagnetic storm conditions. If Bz
              has been sustained below -10 nT for more than an hour, expect
              K-Index to rise and HF conditions to deteriorate within 1-3 hours.
            </HelpCallout>
          </div>
        </div>
      </HelpAccordion>

      {/* Activity Cards */}
      <HelpAccordion
        id="activity-cards"
        title="Activity Cards"
        summary="DX cluster spots, log statistics, predictions, and history at a glance"
      >
        <div className="space-y-4 text-sm text-gray-300 leading-relaxed">
          <div>
            <h4 className="text-white font-semibold mb-1">Cluster Pulse</h4>
            <p>
              Displays a live count of DX spots from the worldwide DX cluster
              network. This tells you how active the bands are right now — more
              spots mean more stations are hearing and working DX. Click the
              card to expand a detailed view with spot breakdowns by band and
              mode.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1">Log Stats</h4>
            <p>
              Shows your recent QSO statistics including contact counts, bands
              worked, and modes used. This card reflects activity from your
              station logbook, helping you track your operating patterns
              alongside current conditions.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1">Predictions</h4>
            <p>
              Displays upcoming propagation events, contest schedules, and other
              relevant forecasts. Use this card to plan your operating sessions
              around expected band openings and events.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1">History</h4>
            <p>
              Shows past propagation conditions as a trend reference. By
              comparing historical patterns with current conditions, you can
              develop intuition for how conditions evolve and when they tend to
              improve or degrade. Click to expand a detailed historical view.
            </p>
          </div>
        </div>
      </HelpAccordion>

      {/* Data Sources */}
      <HelpAccordion
        id="data-sources-dashboard"
        title="Data Sources"
        summary="Where the dashboard data comes from and how often it refreshes"
      >
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>
            All solar and geomagnetic data is sourced from NOAA's Space Weather
            Prediction Center (SWPC). Propulse proxies these feeds through
            Vercel Edge Functions to handle CORS restrictions and add
            server-side caching, reducing load on NOAA's servers while keeping
            data fresh.
          </p>

          <HelpDataTable
            sources={[
              {
                name: "K-Index",
                source: "NOAA SWPC",
                endpoint: "/api/solar/k-index",
                refresh: "1 min",
                cache: "15 min",
              },
              {
                name: "Solar Flux",
                source: "NOAA SWPC",
                endpoint: "/api/solar/flux",
                refresh: "4 hrs",
                cache: "4 hrs",
              },
              {
                name: "Sunspots",
                source: "NOAA SWPC",
                endpoint: "/api/solar/sunspots",
                refresh: "6 hrs",
                cache: "24 hrs",
              },
              {
                name: "Magnetometer",
                source: "NOAA SWPC",
                endpoint: "/api/solar/magnetometer",
                refresh: "1 min",
                cache: "5 min",
              },
              {
                name: "Probabilities",
                source: "NOAA SWPC",
                endpoint: "/api/solar/probabilities",
                refresh: "6 hrs",
                cache: "12 hrs",
              },
            ]}
          />

          <HelpCallout type="note">
            The "Refresh" column shows how often the client polls for new data.
            The "Cache" column shows how long the edge proxy caches responses.
            Even during a cache window, you will always see the most recent
            cached value — not stale placeholder data.
          </HelpCallout>
        </div>
      </HelpAccordion>

      {/* FAQ */}
      <HelpFAQ
        items={[
          {
            question: "Why are band conditions changing so fast?",
            answer:
              "K-Index updates every minute, and geomagnetic conditions can shift rapidly during disturbances. A solar wind shock or a sudden change in IMF Bz can cause the K-Index to jump within minutes, which immediately changes band status calculations. This is normal — the ionosphere is a dynamic system. If you see rapid changes, check the Bz chart for sustained southward dips, which often precede prolonged disturbances.",
          },
          {
            question: "What's a good SFI for 10 m?",
            answer:
              "SFI above 120 usually supports 10 m propagation during daylight hours, especially on north-south paths. Above 150 can produce worldwide openings where even modest stations can work DX. During solar minimum (SFI below 70), 10 m is essentially closed for F-layer propagation, though sporadic-E openings can still occur in summer months.",
          },
          {
            question: "How often does data refresh?",
            answer:
              "K-Index and magnetometer data update every minute, giving you near-real-time awareness of geomagnetic conditions. Solar flux updates every 4 hours since it changes slowly. Sunspot numbers and flare probabilities update every 6 hours. You can manually force a refresh using the refresh button in the header.",
          },
        ]}
      />
    </div>
  );
}
