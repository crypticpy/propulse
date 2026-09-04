import { HelpAccordion } from "@/components/help/HelpAccordion";
import { HelpCallout } from "@/components/help/HelpCallout";
import { HelpFAQ } from "@/components/help/HelpFAQ";

export function DXWizardSection() {
  return (
    <div className="space-y-6">
      {/* Overview */}
      <p className="text-sm leading-relaxed text-gray-300">
        The DX Wizard provides actionable transmit guidance for reaching a
        specific target station. Enter a target location and your station
        parameters, and it recommends the best band, mode, and power level based
        on current propagation conditions.
      </p>

      {/* Target Selection */}
      <HelpAccordion
        id="target-selection"
        title="Target Selection"
        summary="Enter your target by grid, callsign, coordinates, or location name"
      >
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>
            The wizard accepts several input formats so you can identify your
            target however is most convenient:
          </p>

          <ul className="list-disc list-inside space-y-1.5 pl-1">
            <li>
              <strong>Grid square</strong> (e.g., FN31pr) — Validated Maidenhead
              format. Four- or six-character locators are accepted and
              automatically converted to coordinates.
            </li>
            <li>
              <strong>Callsign</strong> — Enter a callsign in the dedicated
              lookup field and click Lookup. The wizard queries callsign APIs
              (Callook for US calls) to resolve the station's grid square and
              coordinates automatically.
            </li>
            <li>
              <strong>Coordinates</strong> — Direct latitude/longitude entry in
              decimal degrees (e.g., 40.7128, -74.0060). The wizard parses
              common coordinate formats including signed decimals and
              degree-minute-second notation.
            </li>
            <li>
              <strong>Location name</strong> — Plain-text place names (e.g.,
              "Tokyo, Japan") are geocoded to coordinates using Propulse's
              geocoding service.
            </li>
            <li>
              <strong>Recent targets dropdown</strong> — Quick access to
              previous targets from PropSphere. If you have clicked locations on
              the map, they appear here for one-click reuse.
            </li>
          </ul>

          <HelpCallout type="tip">
            Targets set on PropSphere appear under Recent targets and are
            auto-loaded when you open DX Wizard if a map target is active. You
            can also deep-link with{" "}
            <code className="text-plasma-orange">/dx?grid=FN31</code> or{" "}
            <code className="text-plasma-orange">/dx?call=JA1ABC</code>.
          </HelpCallout>
        </div>
      </HelpAccordion>

      {/* Operator Settings */}
      <HelpAccordion
        id="operator-settings"
        title="Operator Settings"
        summary="Configure your mode, license, radio, path, and power"
      >
        <div className="space-y-4 text-sm text-gray-300 leading-relaxed">
          <div>
            <h4 className="text-white font-semibold mb-1">Mode</h4>
            <p>
              Choose from <strong>FT8</strong>, <strong>FT4</strong>,{" "}
              <strong>CW</strong>, <strong>SSB</strong>, or{" "}
              <strong>RTTY</strong>. The selected mode sets the SNR target used
              for power estimates and which band-plan segments are suggested.
              FT8 (-18 dB) and FT4 (-17 dB) are best for marginal paths; CW
              needs about -12 dB, RTTY about -8 dB, and SSB about -6 dB.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1">Short / Long path</h4>
            <p>
              Toggle short-path vs long-path geometry for bearing, distance, and
              antenna-gain distance. Use long path for near-antipodal DX when
              the short path is closed or polar.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1">License Class</h4>
            <p>
              Select your license class: <strong>Technician</strong>,{" "}
              <strong>General</strong>, <strong>Extra</strong>,{" "}
              <strong>Advanced</strong>, or <strong>Novice</strong>. This
              restricts the available frequency segments — the wizard will only
              recommend frequencies and power levels you are authorized to use
              under your license privileges.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1">ITU Region</h4>
            <p>
              Choose your ITU region: <strong>ITU1</strong> (Europe, Africa,
              Middle East), <strong>ITU2</strong> (Americas), or{" "}
              <strong>ITU3</strong> (Asia, Pacific, Oceania). This affects band
              plan allocations and frequency recommendations, since different
              regions have different band plans and frequency allocations for
              each mode.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1">Radio Selection</h4>
            <p>
              Choose from the built-in radio database or your saved radio
              profiles. The selected radio's characteristics (maximum power
              output, supported modes) affect which recommendations are viable.
              If you have configured radios in Radio Shack with custom power
              limits, those limits are respected here.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1">TX Power Ceiling</h4>
            <p>
              A 1-1500W slider that sets your maximum transmit power. The wizard
              will not recommend power above this limit. The slider's maximum is
              capped by your selected radio's maximum power output and any
              custom power limits you've set. The ceiling is also bounded by the
              band plan's legal maximum for your license class and mode.
            </p>
          </div>
        </div>
      </HelpAccordion>

      {/* How Recommendations Work */}
      <HelpAccordion
        id="recommendations"
        title="How Recommendations Work"
        summary="Band scoring, power estimation, and ranking algorithm"
      >
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>
            The wizard evaluates every HF band (160 m through 10 m) using
            current propagation conditions. Here is the step-by-step process:
          </p>

          <ol className="list-decimal list-inside space-y-2 pl-1">
            <li>
              <strong>Estimate baseline SNR</strong> — Calculates the
              Signal-to-Noise Ratio you would achieve at 100W on each band using
              the enhanced propagation model. This model factors in path
              distance, number of ionospheric hops, D-layer absorption, time of
              day, antenna gain, and your noise environment.
            </li>
            <li>
              <strong>Apply solar indices</strong> — Factors in the current SFI
              (ionization level) and Kp (geomagnetic disturbance). Higher SFI
              benefits upper bands; higher Kp degrades all bands.
            </li>
            <li>
              <strong>Calculate required power</strong> — For your chosen mode,
              determines how much power you need to reach the mode's minimum SNR
              threshold:
              <ul className="list-disc list-inside space-y-1 pl-4 mt-1.5">
                <li>SSB needs -6 dB SNR (strongest signal requirement)</li>
                <li>CW needs -12 dB SNR (narrower bandwidth helps)</li>
                <li>FT8 needs -18 dB SNR (digital processing advantage)</li>
              </ul>
            </li>
            <li>
              <strong>Power formula</strong> —{" "}
              <code className="text-xs font-mono text-gray-200 bg-white/5 px-1.5 py-0.5 rounded">
                RequiredWatts = 100W x 10^((targetSNR - snrAt100W) / 10)
              </code>
              . If the baseline SNR already exceeds the target, only 10W is
              needed. If the gap is large, more power is required — up to 1500W
              maximum.
            </li>
            <li>
              <strong>Rank and filter</strong> — Bands are filtered to those
              where your license class has authorized frequency segments. Open
              bands within your power ceiling are ranked first, sorted by best
              SNR. Bands that require power above your ceiling are shown but
              flagged as "exceeds."
            </li>
          </ol>

          <HelpCallout type="note">
            The power estimate is theoretical — real-world conditions (local
            noise floor, antenna efficiency, feedline loss, terrain) will vary.
            Use it as a starting point, not an absolute guide.
          </HelpCallout>
        </div>
      </HelpAccordion>

      {/* Mode-Specific Tips */}
      <HelpAccordion
        id="mode-tips"
        title="Mode-Specific Tips"
        summary="Operating advice for FT8, CW, and SSB"
      >
        <div className="space-y-4 text-sm text-gray-300 leading-relaxed">
          <div>
            <h4 className="text-white font-semibold mb-1.5">FT8</h4>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>
                Use a 50 Hz filter if your radio supports it — as narrow as your
                frequency stability allows.
              </li>
              <li>
                Keep power steady — avoid ALC pumping, which distorts the
                transmitted waveform and reduces decode success at the receiving
                end.
              </li>
              <li>
                Signal reports are automated, so focus on clean audio and stable
                frequency. Ensure your computer clock is synchronized (NTP) for
                proper time-slot alignment.
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1.5">CW</h4>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>
                Set your receive filter to 300-500 Hz bandwidth. Narrower
                filters improve SNR by rejecting adjacent signals and noise.
              </li>
              <li>
                Match your RX/TX sidetone pitch to the peak of your filter
                passband for maximum signal clarity.
              </li>
              <li>
                Slow down when conditions are noisy — the receiving station may
                be struggling to copy your signal. Shorter calls with fewer
                repeats are more effective than long CQs.
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1.5">SSB</h4>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>
                Set your filter to 2.1-2.4 kHz bandwidth. Narrow the passband
                further if the band is crowded or noisy.
              </li>
              <li>
                Use moderate speech processing (compression). Too much
                processing causes distortion that reduces intelligibility.
              </li>
              <li>
                Listen between overs for other callers. On marginal paths,
                consider switching to CW or FT8 for a better chance of
                completing the contact.
              </li>
            </ul>
          </div>
        </div>
      </HelpAccordion>

      {/* FAQ */}
      <HelpFAQ
        items={[
          {
            question: "Why does it recommend a band I can't hear anything on?",
            answer:
              "The wizard estimates propagation based on solar indices, path geometry, and ionospheric models, but it cannot account for your local receive conditions. Your local noise floor, antenna type, feedline loss, and nearby interference sources may prevent you from hearing signals on a band that is theoretically open. Try adding your equipment details in Radio Shack for more accurate estimates, and check that your antenna covers the recommended band.",
          },
          {
            question: "How accurate is the power estimate?",
            answer:
              "It is a ballpark based on propagation models and standard noise levels. Real-world factors — local noise, antenna efficiency, terrain, ionospheric variability, and ground conductivity — mean actual required power may vary by 6-10 dB (a factor of 4 to 10 in watts). Treat it as guidance rather than gospel. If the wizard says 50W, you might need anywhere from 15W to 200W depending on your specific station setup.",
          },
        ]}
      />
    </div>
  );
}
