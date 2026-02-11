import { HelpAccordion } from "@/components/help/HelpAccordion";
import { HelpCallout } from "@/components/help/HelpCallout";
import { HelpShortcutTable } from "@/components/help/HelpShortcutTable";
import { HelpFAQ } from "@/components/help/HelpFAQ";

export function ContestSection() {
  return (
    <div className="space-y-6">
      {/* Overview */}
      <p className="text-sm leading-relaxed text-gray-300">
        The Contest module is a high-speed contest logging system with real-time
        scoring, multiplier tracking, rate analysis, and off-time management —
        designed for keyboard-first operation during contests. It supports
        built-in contest definitions, Cabrillo export, CAT radio integration,
        and WSJT-X auto-logging.
      </p>

      {/* Getting Started */}
      <HelpAccordion
        id="contest-start"
        title="Getting Started"
        summary="Selecting a contest, setting exchange, and choosing categories"
      >
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>
            Before the contest begins, configure your session so you can start
            logging the moment the contest opens.
          </p>

          <ol className="list-decimal list-inside space-y-1.5 pl-1">
            <li>
              Click <strong>Start Contest</strong> to open the configuration
              modal.
            </li>
            <li>
              <strong>Select a contest</strong> from the built-in contest
              database (CQ WW, ARRL Sweepstakes, Field Day, etc.).
            </li>
            <li>
              <strong>Set your contest exchange</strong> — for example,{" "}
              <code className="text-xs bg-white/10 px-1 py-0.5 rounded">
                59 OR
              </code>{" "}
              for CQ WW from Oregon, or{" "}
              <code className="text-xs bg-white/10 px-1 py-0.5 rounded">
                1A OR
              </code>{" "}
              for Sweepstakes.
            </li>
            <li>
              <strong>Choose your category</strong>: Single Operator,
              Multi-Operator, Assisted, etc.
            </li>
            <li>
              <strong>Cabrillo metadata</strong> (callsign, category, power
              class) is pre-filled from your station settings.
            </li>
          </ol>

          <HelpCallout type="tip">
            Set up your contest session before the contest starts. Having your
            exchange and category ready saves valuable time when the contest
            begins. You can always end and restart a session if needed.
          </HelpCallout>
        </div>
      </HelpAccordion>

      {/* One-Line Entry */}
      <HelpAccordion
        id="one-line-entry"
        title="One-Line Entry"
        summary="Keyboard-first QSO logging for maximum speed"
      >
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>
            The one-line entry field is the core of contest operation. It
            auto-focuses when you open the contest page, so you can start typing
            immediately without touching the mouse.
          </p>

          <div>
            <h4 className="text-white font-semibold mb-1.5">Entry Format</h4>
            <p>
              Type:{" "}
              <code className="text-xs bg-white/10 px-1.5 py-0.5 rounded">
                callsign
              </code>{" "}
              +{" "}
              <kbd className="px-1.5 py-0.5 text-xs bg-white/10 rounded border border-white/10">
                Tab
              </kbd>{" "}
              +{" "}
              <code className="text-xs bg-white/10 px-1.5 py-0.5 rounded">
                RST
              </code>{" "}
              +{" "}
              <kbd className="px-1.5 py-0.5 text-xs bg-white/10 rounded border border-white/10">
                Tab
              </kbd>{" "}
              +{" "}
              <code className="text-xs bg-white/10 px-1.5 py-0.5 rounded">
                exchange
              </code>{" "}
              +{" "}
              <kbd className="px-1.5 py-0.5 text-xs bg-white/10 rounded border border-white/10">
                Enter
              </kbd>
            </p>
          </div>

          <ul className="list-disc list-inside space-y-1.5 pl-1">
            <li>
              <strong>Real-time dupe check</strong> — As you type a callsign,
              the system checks for duplicates on the current band and mode.
              Dupes are flagged with a visual warning.
            </li>
            <li>
              <strong>New multiplier indicator</strong> — When the callsign
              represents a new multiplier, a "NEW MULT" badge appears so you
              know the contact is especially valuable.
            </li>
            <li>
              <strong>Input validation</strong> — The entry is validated before
              submission. If required fields are missing, you will see an inline
              error.
            </li>
            <li>
              <strong>Enter</strong> submits the QSO and clears the field for
              the next contact.
            </li>
            <li>
              <strong>Esc</strong> clears all input fields without logging.
            </li>
          </ul>

          <HelpCallout type="tip">
            Keep your hands on the keyboard. The one-line entry is designed so
            you never need to touch the mouse during a contest. Use Tab to
            advance between fields and Enter to log.
          </HelpCallout>
        </div>
      </HelpAccordion>

      {/* Keyboard Hotkeys */}
      <HelpAccordion
        id="contest-hotkeys"
        title="Keyboard Hotkeys"
        summary="Essential keyboard shortcuts for contest operation"
      >
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>
            Contest operation is keyboard-driven. These shortcuts work whenever
            a contest session is active and no modal is open.
          </p>

          <HelpShortcutTable
            shortcuts={[
              { key: "Enter", action: "Log the current QSO" },
              { key: "Esc", action: "Clear all input fields" },
              { key: "Ctrl+Z", action: "Undo (delete) the last logged QSO" },
              { key: "Ctrl+E", action: "Edit the last logged QSO" },
              { key: "Alt+1", action: "Select 160 m" },
              { key: "Alt+2", action: "Select 80 m" },
              { key: "Alt+3", action: "Select 40 m" },
              { key: "Alt+4", action: "Select 20 m" },
              { key: "Alt+5", action: "Select 15 m" },
              { key: "Alt+6", action: "Select 10 m" },
              { key: "Alt+7", action: "Select 6 m" },
              { key: "Alt+8", action: "Select 2 m" },
              { key: "Alt+9", action: "Select 70 cm" },
              {
                key: "F1-F12",
                action: "Macro keys (CQ, EXCH, TU, QRZ, AGN, etc.)",
              },
            ]}
          />

          <HelpCallout type="note">
            Band quick-select (Alt+1-9) maps to: 1=160m, 2=80m, 3=40m, 4=20m,
            5=15m, 6=10m, 7=6m, 8=2m, 9=70cm. When a rig is connected via CAT,
            band selectors are disabled and the band follows the radio
            automatically.
          </HelpCallout>
        </div>
      </HelpAccordion>

      {/* Live Scoring */}
      <HelpAccordion
        id="scoring"
        title="Live Scoring"
        summary="Real-time QSO count, points, and multiplier tracking"
      >
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>
            The scoreboard at the top of the contest page updates instantly as
            each QSO is logged. It provides both summary totals and advanced
            rate analytics for high-speed decision support.
          </p>

          <ul className="list-disc list-inside space-y-1.5 pl-1">
            <li>
              <strong>QSO Count</strong> — Total contacts logged in this
              session.
            </li>
            <li>
              <strong>Total Points</strong> — Running score calculated as QSOs
              multiplied by point values multiplied by multipliers.
            </li>
            <li>
              <strong>Multiplier Count</strong> — Current multiplier total and
              needed multipliers remaining.
            </li>
            <li>
              <strong>Rolling Rates</strong> — 10-minute and 60-minute QSO/hour
              rates with trend indicators (up, down, stable).
            </li>
            <li>
              <strong>Projection</strong> — Estimated final score based on
              elapsed time and current rate.
            </li>
            <li>
              <strong>Last-QSO Delta</strong> — Shows points added and new
              multipliers gained from the most recent contact.
            </li>
          </ul>

          <HelpCallout type="note">
            Point values and multiplier rules vary by contest. The system
            automatically applies the correct scoring formula for the selected
            contest definition — you do not need to configure scoring manually.
          </HelpCallout>
        </div>
      </HelpAccordion>

      {/* Rate Sheet */}
      <HelpAccordion
        id="rate-sheet"
        title="Rate Sheet"
        summary="Hour-by-hour QSO rates and performance analysis"
      >
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>
            The Rate Sheet appears below the QSO table once you have logged at
            least one contact. It provides a classic contest rate analysis in
            two views.
          </p>

          <ul className="list-disc list-inside space-y-1.5 pl-1">
            <li>
              <strong>Hourly view</strong> — QSO count, rate (QSOs/hour), points
              earned, and running total for each hour of operation.
            </li>
            <li>
              <strong>10-minute segments</strong> — Finer-grained view for
              identifying short bursts of activity and propagation peaks.
            </li>
            <li>
              <strong>Band-by-hour heatmap</strong> — Color-coded matrix showing
              which bands were most active during each hour, helping you
              identify propagation patterns.
            </li>
            <li>
              <strong>Peak highlighting</strong> — Your best-rate rows are
              highlighted so you can quickly see when you were most productive.
            </li>
          </ul>

          <HelpCallout type="tip">
            Track your rate to identify when propagation is best on each band.
            If your rate drops below 20/hour, consider changing bands or
            switching from S&amp;P to running (calling CQ) to pick up the pace.
          </HelpCallout>
        </div>
      </HelpAccordion>

      {/* Off-Time Rules */}
      <HelpAccordion
        id="off-time"
        title="Off-Time Rules"
        summary="Managing operating time limits in 48-hour and 30-hour contests"
      >
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>
            Many major contests have operating time limits for single-operator
            categories. The contest timer tracks your operating and off-time
            automatically.
          </p>

          <ul className="list-disc list-inside space-y-1.5 pl-1">
            <li>
              <strong>48-hour contests</strong> (e.g., CQ WW, CQ WPX) — Maximum
              36 hours of operating time in a 48-hour window. Minimum off-time
              period: 60 minutes.
            </li>
            <li>
              <strong>30-hour contests</strong> (e.g., ARRL Sweepstakes) —
              Maximum 24 hours of operating time in a 30-hour window. Minimum
              off-time period: 30 minutes.
            </li>
            <li>
              <strong>Timer display</strong> — Shows elapsed operating time,
              remaining allowed time, and total off-time taken. A compact timer
              is always visible in the header bar.
            </li>
          </ul>

          <p>
            Operating time is calculated from your first QSO to your last QSO in
            each operating period. Gaps shorter than the minimum off-time period
            do not count as off-time.
          </p>

          <HelpCallout type="warning">
            Plan your off-time strategically. Take breaks during low-rate
            periods (e.g., overnight when your target bands are closed) to
            maximize your operating time during peak propagation hours.
            Exceeding the time limit may result in score penalties depending on
            contest rules.
          </HelpCallout>
        </div>
      </HelpAccordion>

      {/* CAT Integration */}
      <HelpAccordion
        id="cat-integration"
        title="CAT Integration"
        summary="Automatic band and mode sync from your radio"
      >
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>
            When a rig is connected via CAT (Computer Aided Transceiver)
            control, the contest module automatically syncs band and mode from
            the radio. This eliminates manual band/mode selection and prevents
            logging errors.
          </p>

          <div>
            <h4 className="text-white font-semibold mb-1.5">Mode Mapping</h4>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>
                <strong>LSB / USB / AM / FM</strong> &rarr; SSB
              </li>
              <li>
                <strong>CW / CW-R</strong> &rarr; CW
              </li>
              <li>
                <strong>RTTY / RTTY-R</strong> &rarr; RTTY
              </li>
              <li>
                <strong>FT8 / FT4 / DATA / DATA-R / PSK</strong> &rarr; FT8
              </li>
            </ul>
          </div>

          <p>
            When CAT is active, the manual band and mode selectors in the header
            are disabled and display a green{" "}
            <code className="text-xs bg-white/10 px-1 py-0.5 rounded">CAT</code>{" "}
            badge. Band changes on the radio immediately update the contest UI.
          </p>
        </div>
      </HelpAccordion>

      {/* Multiplier Panel */}
      <HelpAccordion
        id="multipliers"
        title="Multiplier Panel"
        summary="Tracking needed multipliers for maximum score"
      >
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>
            The Multiplier Panel sits alongside the one-line entry and gives you
            a real-time view of your multiplier progress. It updates instantly
            as QSOs are logged.
          </p>

          <ul className="list-disc list-inside space-y-1.5 pl-1">
            <li>
              <strong>Worked (green)</strong> — Multipliers you have already
              confirmed on the current band.
            </li>
            <li>
              <strong>Needed (highlighted)</strong> — Multipliers you still
              need. These stand out so you can prioritize them.
            </li>
            <li>
              <strong>Not available (gray)</strong> — Multipliers that are not
              applicable to the current band or contest.
            </li>
            <li>
              <strong>Per-band visibility</strong> — See which multipliers you
              need on each band (e.g., "Need Wyoming on 20m").
            </li>
          </ul>

          <HelpCallout type="tip">
            Multipliers are often worth more than raw QSO count. A single new
            multiplier can be worth as much as dozens of routine contacts.
            Prioritize working new multipliers over running rate when you see
            them spotted in the cluster.
          </HelpCallout>
        </div>
      </HelpAccordion>

      {/* Score Sharing */}
      <HelpAccordion
        id="score-sharing"
        title="Score Sharing"
        summary="Export and share your contest results"
      >
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>
            The Score Summary panel appears at the bottom of the contest page
            once you have logged at least one QSO. It displays your current
            score, QSO count, multipliers, and operating time in a compact
            format.
          </p>

          <ul className="list-disc list-inside space-y-1.5 pl-1">
            <li>
              <strong>Share Score</strong> — Copy a formatted score summary to
              your clipboard for pasting into social media, email, or contest
              reflectors.
            </li>
            <li>
              <strong>Score breakdown</strong> — Shows score, QSO count,
              multiplier count, and operating time at a glance.
            </li>
          </ul>

          <p>
            When the contest ends, the session is saved to your contest history
            so you can review past performance.
          </p>
        </div>
      </HelpAccordion>

      {/* FAQ */}
      <HelpFAQ
        items={[
          {
            question: "How are points calculated?",
            answer:
              "Point values depend on the specific contest rules. For example, in CQ WW, contacts on the same continent are worth 1 point, different continents are 3 points, and the total is multiplied by (CQ zones worked x DXCC entities worked). The system automatically applies the correct formula for the selected contest — you never need to calculate manually.",
          },
          {
            question: "What happens when I run out of operating time?",
            answer:
              "The timer will warn you when you are approaching your limit. You can still log QSOs, but exceeding the time limit may result in score penalties depending on contest rules. Plan strategic off-periods during low-propagation hours to maximize your operating time when the bands are productive.",
          },
          {
            question: "Can I edit a logged QSO?",
            answer:
              "Yes. Press Ctrl+E to edit the last logged QSO, or click any row in the QSO table to edit it. Changes automatically recalculate scoring and multipliers so your totals stay accurate.",
          },
        ]}
      />
    </div>
  );
}
