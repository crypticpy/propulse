import { HelpAccordion } from "@/components/help/HelpAccordion";
import { HelpCallout } from "@/components/help/HelpCallout";
import { HelpDataTable } from "@/components/help/HelpDataTable";
import { HelpFAQ } from "@/components/help/HelpFAQ";

export function SolarPulseSection() {
  return (
    <div className="space-y-6">
      <p className="text-sm leading-relaxed text-gray-300">
        Solar Pulse separates current observations, official forecasts, global
        guidance, impacts, history, and imagery. Every product shows its source
        and observation or issue age. A failed refresh does not turn missing
        data into zero or an all-clear message.
      </p>

      <HelpCallout type="note">
        “Current” means the product is within its approved freshness window.
        “Stale” means the last validated value is still usable but a refresh is
        overdue or failed. “Unavailable” means there is no value within the
        product’s hard usability limit.
      </HelpCallout>

      <HelpAccordion
        id="solar-current-products"
        title="Current observations"
        summary="What Kp, SFI, Bz, X-ray flux, and NOAA scales actually report"
      >
        <HelpDataTable
          sources={[
            {
              name: "Planetary Kp",
              source: "NOAA SWPC three-hour product",
              refresh: "Observed, estimated, and predicted intervals remain distinct",
            },
            {
              name: "10.7 cm solar flux",
              source: "NOAA SWPC observed SFI",
              refresh: "Global ionization proxy; not a path forecast",
            },
            {
              name: "IMF Bz",
              source: "NOAA SWPC real-time solar wind",
              refresh: "L1 observation; one sample is not a forecast",
            },
            {
              name: "GOES X-ray flux",
              source: "NOAA SWPC 0.1–0.8 nm channel",
              refresh: "Missing channel remains unavailable, never zero",
            },
            {
              name: "R / S / G scales",
              source: "Official NOAA scale snapshot",
              refresh: "Blank is not interpreted as a reported zero",
            },
          ]}
        />
      </HelpAccordion>

      <HelpAccordion
        id="solar-impacts"
        title="Impact products"
        summary="Radiation, geomagnetic, absorption, alerts, and CME context"
      >
        <div className="space-y-4 text-sm leading-relaxed text-gray-300">
          <p>
            The proton widget filters NOAA’s multi-energy feed to the exact
            integral &gt;=10 MeV channel before applying the S-scale thresholds.
            Dst describes ring-current storm intensity. D-RAP is a global model
            of sunlit-side D-region absorption. NASA DONKI entries are CME
            analyses, not guaranteed Earth-arrival forecasts.
          </p>
          <p>
            Official SWPC bulletins distinguish a successful empty response
            from a failed request. “No recent bulletins reported” appears only
            after a current successful response.
          </p>
          <HelpCallout type="warning">
            Space-weather impacts vary by latitude, path, frequency,
            illumination, and event duration. Polar and transpolar paths may be
            affected differently from mid-latitude paths.
          </HelpCallout>
        </div>
      </HelpAccordion>

      <HelpAccordion
        id="solar-official-forecast"
        title="Official forecasts"
        summary="NOAA predicted Kp, one-day probabilities, solar flux, and planetary A"
      >
        <div className="space-y-4 text-sm leading-relaxed text-gray-300">
          <p>
            “Forecast” is reserved for provider-issued products. The Kp chart
            distinguishes observed, estimated, and official predicted
            three-hour intervals. Event probabilities show their issue time and
            one-day horizon. The three-day table contains NOAA’s predicted
            10.7 cm flux and predicted planetary A index.
          </p>
          <p>
            Planetary A is intentionally absent from the current-observation
            headline cards. The application does not relabel a Kp conversion as
            a current observed A index.
          </p>
        </div>
      </HelpAccordion>

      <HelpAccordion
        id="solar-guidance"
        title="General HF guidance"
        summary="A transparent global heuristic, not a confidence score or path forecast"
      >
        <div className="space-y-4 text-sm leading-relaxed text-gray-300">
          <p>
            General guidance uses current SFI and Kp, with Bz as an additional
            input. The card lists the evidence it used and names missing inputs.
            It does not assume that 06:00–18:00 UTC is daytime everywhere, does
            not claim a band “should be open,” and does not publish an
            uncalibrated confidence percentage.
          </p>
          <p>
            For operating decisions, open PropSphere and supply both station
            and target context. Path-aware analysis can then account for
            geometry, time, season, frequency, mode, and solar illumination.
          </p>
        </div>
      </HelpAccordion>

      <HelpAccordion
        id="solar-cycle-imagery"
        title="Cycle context and imagery"
        summary="Monthly sunspots, stable image URLs, timestamps, and animations"
      >
        <div className="space-y-4 text-sm leading-relaxed text-gray-300">
          <p>
            Solar-cycle context comes from NOAA’s validated monthly observed
            sunspot series and shows its as-of month. It does not compare a
            current SFI value with an unrelated static sunspot peak.
          </p>
          <p>
            Scientific images use stable same-origin URLs, preserve complete
            legends and map edges, and show the provider timestamp when one is
            published. Timelines fetch their manifest only when opened, preload
            a small adjacent-frame window, pause when hidden, and retain the
            static product if animation is unavailable.
          </p>
        </div>
      </HelpAccordion>

      <HelpFAQ
        items={[
          {
            question: "Why can a value remain visible after a refresh fails?",
            answer:
              "Solar Pulse keeps the last validated observation through a product-specific hard usability limit. It labels that value stale, shows its age, and records the failed refresh. Once the hard limit passes, the widget becomes unavailable.",
          },
          {
            question: "Does a favorable global card mean my target is workable?",
            answer:
              "No. Global indices are useful context, but a real path also depends on both endpoints, illumination, time, season, band, mode, antennas, and noise. Use PropSphere for path-aware analysis.",
          },
          {
            question: "What does Refresh visible data include?",
            answer:
              "It refreshes every registered source for groups currently visible on your viewport and reports partial failures. Closed mobile groups and unopened imagery do not start hidden work.",
          },
        ]}
      />
    </div>
  );
}
