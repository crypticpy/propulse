import { HelpAccordion } from "@/components/help/HelpAccordion";
import { HelpCallout } from "@/components/help/HelpCallout";
import { HelpFAQ } from "@/components/help/HelpFAQ";

export function ShackSection() {
  return (
    <div className="space-y-6">
      {/* Overview */}
      <p className="text-sm leading-relaxed text-gray-300">
        The Radio Shack is your virtual equipment room — catalog your radios,
        antennas, feedlines, and accessories, build signal path diagrams, and
        analyze your station's performance characteristics. The page is
        organized into three tabs: Equipment, Diagram, and Performance.
      </p>

      {/* Equipment Management */}
      <HelpAccordion
        id="equipment"
        title="Equipment Management"
        summary="Adding and managing radios, antennas, feedlines, and accessories"
      >
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>
            The Equipment tab is the default view. It organizes your station
            gear into five categories, each with its own manager panel. A Setup
            Wizard guides you through initial equipment entry if your shack is
            empty.
          </p>

          <ul className="list-disc list-inside space-y-2 pl-1">
            <li>
              <strong>Radios</strong> — Your transceivers and receivers. Track
              manufacturer, model, display name, power output, supported modes,
              and frequency range. The first radio added becomes your "active"
              radio for performance analysis.
            </li>
            <li>
              <strong>Antennas</strong> — Antenna systems including type
              (dipole, Yagi, vertical, loop, etc.), gain, radiation pattern, and
              bands supported. Accurate gain data feeds directly into ERP
              calculations.
            </li>
            <li>
              <strong>Feedlines</strong> — Coaxial cables and transmission
              lines. Track cable type (RG-8, RG-213, LMR-400, etc.), length, and
              loss characteristics. Loss is calculated per frequency band using
              manufacturer specifications.
            </li>
            <li>
              <strong>Inline Components</strong> — Antenna tuners, amplifiers,
              coaxial switches, and other in-line devices. Track insertion loss
              or gain for each component so the signal path calculations are
              accurate.
            </li>
            <li>
              <strong>Accessories</strong> — Mounts, connectors, cables, and
              other informational items. These do not affect performance
              calculations but help you maintain a complete inventory.
            </li>
          </ul>

          <HelpCallout type="tip">
            Be accurate with feedline lengths and cable types — feedline loss is
            often the biggest performance factor in your station. A 100-foot run
            of RG-58 at 28 MHz loses over 6 dB, while LMR-400 loses only about 2
            dB over the same distance.
          </HelpCallout>
        </div>
      </HelpAccordion>

      {/* Signal Path Diagram */}
      <HelpAccordion
        id="signal-path"
        title="Signal Path Diagram"
        summary="Visual representation of your station's signal chain"
      >
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>
            The Diagram tab opens the <strong>Station Builder Lab</strong>, a
            visual canvas where you build signal chains connecting your
            equipment from radio to antenna. Multiple chains can represent
            different station configurations (e.g., HF station, VHF station,
            contest setup).
          </p>

          <div>
            <h4 className="text-white font-semibold mb-1.5">Canvas Controls</h4>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>
                <strong>Zoom</strong> — Mouse wheel or pinch gesture to zoom in
                and out.
              </li>
              <li>
                <strong>Pan</strong> — Click and drag the background to move
                around the canvas.
              </li>
              <li>
                <strong>Drag equipment</strong> — Drag components from the
                equipment drawer onto the canvas to add them to a chain.
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1.5">Chain Features</h4>
            <ul className="list-disc list-inside space-y-1.5 pl-1">
              <li>
                <strong>Nodes</strong> — Radio, antenna, feedline run, tuner,
                amplifier, and switch nodes connected in signal-flow order.
              </li>
              <li>
                <strong>Connection lines</strong> — Visual connections between
                components showing signal flow direction.
              </li>
              <li>
                <strong>Impedance labels</strong> — Shows impedance at each
                connection point to help identify mismatches.
              </li>
              <li>
                <strong>Loss Budget Bar</strong> — A visual summary of total
                path loss from radio output to antenna feed.
              </li>
              <li>
                <strong>Mismatch Warning Banner</strong> — Appears when
                impedance mismatches are detected in the chain, alerting you to
                potential SWR problems.
              </li>
            </ul>
          </div>

          <HelpCallout type="note">
            Think of the signal path like a plumbing diagram — every component
            between your radio and antenna either adds loss or gain. The diagram
            helps you visualize and optimize the entire chain. If the mismatch
            warning appears, consider adding a tuner or checking your connector
            types.
          </HelpCallout>
        </div>
      </HelpAccordion>

      {/* Performance Analysis */}
      <HelpAccordion
        id="performance"
        title="Performance Analysis"
        summary="Loss budget, ERP, SNR estimation, and band capability"
      >
        <div className="space-y-4 text-sm text-gray-300 leading-relaxed">
          <p>
            The Performance tab provides detailed analysis of your station's
            capabilities. It shows calculations for your active radio and
            currently selected signal chain.
          </p>

          {/* Loss Budget */}
          <div>
            <h4 className="text-white font-semibold mb-1.5">Loss Budget</h4>
            <p>
              Total signal loss from your radio's output to the antenna
              feedpoint, broken down by component:
            </p>
            <ul className="list-disc list-inside space-y-1 pl-1 mt-1.5">
              <li>
                <strong>Feedline loss</strong> — dB per foot (or meter)
                multiplied by cable run length. Varies significantly by
                frequency — higher bands have more loss.
              </li>
              <li>
                <strong>Connector loss</strong> — dB per connector pair (PL-259,
                N-type, BNC, etc.).
              </li>
              <li>
                <strong>Tuner insertion loss</strong> — dB added when an antenna
                tuner is in the signal path.
              </li>
              <li>
                <strong>Switch/splitter loss</strong> — dB per inline coaxial
                switch or splitter.
              </li>
            </ul>
          </div>

          {/* ERP */}
          <div>
            <h4 className="text-white font-semibold mb-1.5">
              Effective Radiated Power (ERP)
            </h4>
            <p>
              ERP represents what your station actually radiates in the
              antenna's favored direction. The formula:
            </p>
            <p className="mt-1.5 font-mono text-xs bg-white/[0.04] border border-white/5 rounded-lg px-3 py-2">
              ERP = TX Power (dBm) - Total Path Loss (dB) + Antenna Gain (dBi)
            </p>
            <p className="mt-1.5">
              <strong>Example:</strong> 100 W (50 dBm) - 3 dB feedline - 0.5 dB
              connectors + 8 dBi Yagi = 54.5 dBm ERP (about 282 W effective)
            </p>
          </div>

          {/* SNR */}
          <div>
            <h4 className="text-white font-semibold mb-1.5">SNR at Receiver</h4>
            <p>
              Estimated received signal strength for incoming signals. Your
              antenna gain improves receive sensitivity, while feedline loss and
              noise figure degrade it. This helps you understand both your
              transmit and receive capabilities.
            </p>
          </div>

          {/* Band Capability */}
          <div>
            <h4 className="text-white font-semibold mb-1.5">
              Band Capability Matrix
            </h4>
            <p>
              Shows which bands your station can operate on and at what
              effective power level. Bands with high feedline loss or
              unsupported antenna coverage are flagged so you can identify gaps
              in your station's capability.
            </p>
          </div>

          <HelpCallout type="tip">
            A station with 100 W and low-loss feedline can outperform a station
            with 1500 W and lossy feedline. ERP is what matters for making
            contacts, not raw power at the radio's output. Invest in good coax
            and connectors before buying a bigger amplifier.
          </HelpCallout>
        </div>
      </HelpAccordion>

      {/* What-If Simulator */}
      <HelpAccordion
        id="what-if"
        title="What-If Simulator"
        summary="Compare different equipment configurations"
      >
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>
            The What-If Simulator lives inside the Performance tab and lets you
            experiment with changes to your station without modifying your
            actual equipment list.
          </p>

          <ul className="list-disc list-inside space-y-1.5 pl-1">
            <li>
              <strong>Adjust parameters</strong> — Change transmit power (1 W to
              1500 W), feedline length (0 to 300 feet), SWR (1.0 to 5.0), and
              equipment selections to instantly see how per-band ERP changes.
            </li>
            <li>
              <strong>Swap components</strong> — Select different antennas or
              feedline types from your inventory and see the performance impact
              side by side.
            </li>
            <li>
              <strong>Preset comparison</strong> — Compare saved station presets
              (e.g., "HF All-Rounder" vs. "6m Optimized") to see differences
              across all bands.
            </li>
          </ul>

          <p>
            This is especially useful when making purchasing decisions — see
            exactly how a new antenna, amplifier, or lower-loss feedline would
            improve your station before you buy.
          </p>
        </div>
      </HelpAccordion>

      {/* Equipment Database */}
      <HelpAccordion
        id="equipment-database"
        title="Equipment Database"
        summary="Pre-loaded radio and antenna models"
      >
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>
            Propulse includes a built-in database of common ham radio equipment
            with manufacturer-provided specifications. When adding gear to your
            shack, you can select from the database to auto-fill specifications.
          </p>

          <ul className="list-disc list-inside space-y-1.5 pl-1">
            <li>
              <strong>Radios</strong> — Power output, receive sensitivity,
              supported modes, and frequency coverage from the manufacturer's
              spec sheet.
            </li>
            <li>
              <strong>Antennas</strong> — Gain patterns, impedance, and band
              coverage for accurate signal path calculations.
            </li>
            <li>
              <strong>Feedlines</strong> — Loss-per-length characteristics at
              multiple frequencies for common cable types (RG-58, RG-8X, RG-213,
              LMR-400, Belden series, etc.).
            </li>
          </ul>

          <HelpCallout type="note">
            If your exact equipment is not in the database, choose a similar
            model or enter custom specifications manually. You can set exact
            power, gain, loss characteristics, and frequency range to ensure
            accurate performance calculations for your specific setup.
          </HelpCallout>
        </div>
      </HelpAccordion>

      {/* FAQ */}
      <HelpFAQ
        items={[
          {
            question: "How is feedline loss calculated?",
            answer:
              "Loss is calculated using the cable manufacturer's specified loss per 100 feet (or per meter) at each frequency. Higher frequencies have more loss. For example, RG-8X at 28 MHz loses about 5.3 dB per 100 feet, while at 3.5 MHz it's only 1.5 dB per 100 feet. The total is: loss-per-unit multiplied by length. SWR mismatch adds additional loss on top of the matched-line loss.",
          },
          {
            question: "What's ERP?",
            answer:
              "Effective Radiated Power is the actual power your antenna system radiates in its favored direction. It combines your transmitter power, minus all losses (feedline, connectors, switches), plus your antenna gain. A 100 W station with a 3-element Yagi and low-loss feedline can have a higher ERP than a 500 W station with a dipole and lossy coax. ERP is the number that determines how strong your signal is at the receiving end.",
          },
          {
            question: "Can I add custom equipment?",
            answer:
              "Yes. If your equipment is not in the built-in database, you can manually enter all specifications including power, gain, loss characteristics, and frequency range. This ensures accurate performance calculations for your specific setup. Custom entries work identically to database entries in all calculations and diagrams.",
          },
        ]}
      />
    </div>
  );
}
