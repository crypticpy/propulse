import { Link } from "react-router-dom";
import { HelpAccordion } from "@/components/help/HelpAccordion";
import { HelpCallout } from "@/components/help/HelpCallout";
import { HelpFAQ } from "@/components/help/HelpFAQ";

export function BandPlannerSection() {
  return (
    <div className="space-y-6">
      <p className="text-sm leading-relaxed text-gray-300">
        Band Planner creates a 24-hour station-to-target projection from a
        simplified ionospheric model and current solar inputs. It is an estimate,
        not a provider-issued forecast or a promise that a band will open.
      </p>

      <HelpAccordion
        id="heatmap"
        title="Reading the Heatmap"
        summary="Band-by-hour model output for the selected path"
      >
        <div className="space-y-3 text-sm leading-relaxed text-gray-300">
          <p>
            Rows are amateur bands and columns are UTC hours. Each cell shows a
            modeled status and signal-to-noise ratio (SNR) estimate for the path
            between your station and the target grid. The current UTC hour has
            an orange marker.
          </p>
          <HelpCallout type="tip">
            Enter both endpoints before interpreting the heatmap. The model uses
            path geometry and time, but actual results also depend on antennas,
            local noise, short-term ionospheric structure, and transmitter power.
          </HelpCallout>
        </div>
      </HelpAccordion>

      <HelpAccordion
        id="status-colors"
        title="Status Colors"
        summary="Qualitative categories derived from modeled SNR"
      >
        <div className="space-y-3 text-sm leading-relaxed text-gray-300">
          <p>
            Excellent, Good, Fair, Poor, and Closed are model buckets based on
            estimated SNR. They compare hours and bands within the projection;
            they are not observed reception reports.
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li><strong>Excellent / Good:</strong> stronger modeled support; compare with current spots.</li>
            <li><strong>Fair:</strong> marginal model support; weak-signal modes may be more practical.</li>
            <li><strong>Poor:</strong> low model support and greater sensitivity to local conditions.</li>
            <li><strong>Closed:</strong> modeled SNR is below the display threshold, not proof that communication is impossible.</li>
          </ul>
        </div>
      </HelpAccordion>

      <HelpAccordion
        id="best-windows"
        title="Best Windows"
        summary="Contiguous fair-or-better periods in the projection"
      >
        <div className="space-y-3 text-sm leading-relaxed text-gray-300">
          <p>
            A window is a consecutive run of hours where a band reaches at least
            the model’s Fair threshold. Windows are ordered as active, upcoming,
            then passed and show their modeled peak hour and SNR.
          </p>
          <p>
            Use windows to prioritize when to listen or call, then validate them
            with spots, beacons, or on-air observation.
          </p>
        </div>
      </HelpAccordion>

      <HelpAccordion
        id="storm-confidence"
        title="Storms & Evidence"
        summary="Why disturbed conditions reduce the usefulness of the projection"
      >
        <div className="space-y-3 text-sm leading-relaxed text-gray-300">
          <p>
            Projection Evidence is a qualitative coverage label, not a calibrated
            probability. It becomes weaker when required inputs are missing or
            geomagnetic conditions are changing rapidly.
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li><strong>Kp 4:</strong> unsettled global conditions; model output may change quickly.</li>
            <li><strong>Kp 5 or higher:</strong> an official geomagnetic-storm level; polar and high-latitude paths can be especially affected.</li>
            <li><strong>Bz below -5 nT:</strong> southward IMF favors coupling if sustained; watch duration and subsequent Kp rather than treating one sample as a forecast.</li>
          </ul>
          <HelpCallout type="warning">
            During disturbances, treat the heatmap as a rough comparison and
            rely more heavily on current reception evidence.
          </HelpCallout>
        </div>
      </HelpAccordion>

      <HelpAccordion
        id="operating-recommendations"
        title="Operating Recommendations"
        summary="How to use model output without over-interpreting it"
      >
        <div className="space-y-3 text-sm leading-relaxed text-gray-300">
          <p>
            Mode suggestions reflect the model’s SNR thresholds. Narrow-band
            digital modes and CW can remain usable at lower SNR than SSB, but
            legal power, antennas, interference, and operator technique still
            matter.
          </p>
          <p>
            A low-support result is a reason to compare another band or hour—not
            a reason to assume no contact is possible.
          </p>
        </div>
      </HelpAccordion>

      <HelpAccordion
        id="favorites-filter"
        title="Favorites Filter"
        summary="Reduce the heatmap to bands you use"
      >
        <p className="text-sm leading-relaxed text-gray-300">
          The star control switches the heatmap between all bands and your saved
          favorites. It changes presentation only; the model and Best Windows
          calculation keep the same inputs.
        </p>
      </HelpAccordion>

      <HelpAccordion
        id="data-sources-planner"
        title="Data Sources"
        summary="Observed inputs used by the local projection"
      >
        <div className="space-y-3 text-sm leading-relaxed text-gray-300">
          <p>
            The model uses source-aged NOAA observations including 10.7 cm solar
            flux, planetary Kp, and IMF Bz. A missing input remains missing; the
            UI does not silently substitute zero.
          </p>
          <p>
            See <Link to="/help/solar-pulse" className="text-plasma-orange hover:underline">Solar Pulse</Link>{" "}
            for provenance and freshness, and <Link to="/help/propsphere" className="text-plasma-orange hover:underline">PropSphere</Link>{" "}
            for map-based path context.
          </p>
        </div>
      </HelpAccordion>

      <HelpFAQ
        items={[
          {
            question: "Why does every band show low support?",
            answer: "The current inputs, path geometry, and time may all lower the modeled SNR. Check source freshness, try another hour or band, and compare with current spots or beacons before concluding the path is unusable.",
          },
          {
            question: "What makes Projection Evidence low?",
            answer: "Missing required observations, Kp at storm levels, or sustained southward Bz make a simplified model less dependable. The label is qualitative and is not a contact probability.",
          },
        ]}
      />
    </div>
  );
}
