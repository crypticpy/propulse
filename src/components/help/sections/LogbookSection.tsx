import { HelpAccordion } from "@/components/help/HelpAccordion";
import { HelpCallout } from "@/components/help/HelpCallout";
import { HelpFAQ } from "@/components/help/HelpFAQ";

export function LogbookSection() {
  return (
    <div className="space-y-6">
      {/* Overview */}
      <p className="text-sm leading-relaxed text-gray-300">
        The Logbook is your digital station log — record QSOs, track awards
        progress, import/export in ADIF format, and sync with external services
        like LoTW, eQSL, and ClubLog. All timestamps are stored in UTC, and
        every entry gets a unique ID with creation and update tracking.
      </p>

      {/* Logging a QSO */}
      <HelpAccordion
        id="logging-qso"
        title="Logging a QSO"
        summary="How to record contacts with fields and auto-population"
      >
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>
            Click the <strong>New QSO</strong> button or use the entry form at
            the top of the Logbook page. The form is designed for fast,
            repeatable data entry during an operating session.
          </p>

          <div>
            <h4 className="text-white font-semibold mb-1.5">Required Fields</h4>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>
                <strong>Callsign</strong> — The callsign of the station you
                contacted
              </li>
              <li>
                <strong>Band</strong> — Select from 160 m through 70 cm (all
                standard amateur allocations)
              </li>
              <li>
                <strong>Mode</strong> — SSB, CW, FT8, FT4, RTTY, PSK31, JS8, AM,
                FM, SSTV, OLIVIA, MFSK
              </li>
              <li>
                <strong>Date/Time</strong> — Automatically set to current UTC.
                You can adjust manually for back-logging.
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1.5">Optional Fields</h4>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>RST sent and received</li>
              <li>Frequency (kHz)</li>
              <li>Grid square (Maidenhead locator)</li>
              <li>Notes, power level, operator name</li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1.5">Auto-Population</h4>
            <p>
              When you enter a callsign, Propulse performs a lookup and
              automatically fills in available data such as the operator's grid
              square, name, and QTH. This saves time and improves log accuracy.
            </p>
          </div>

          <HelpCallout type="tip">
            Tab between fields for fast entry. The callsign field has
            auto-complete from previous contacts, so repeat QSOs are even
            faster.
          </HelpCallout>
        </div>
      </HelpAccordion>

      {/* ADIF Import/Export */}
      <HelpAccordion
        id="adif"
        title="ADIF Import/Export"
        summary="Import from and export to standard ADIF format"
      >
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <div>
            <h4 className="text-white font-semibold mb-1.5">Import</h4>
            <p>
              Click the <strong>Import</strong> button in the toolbar to open
              the import modal. You can either upload an{" "}
              <code className="text-xs bg-white/10 px-1 py-0.5 rounded">
                .adi
              </code>
              /
              <code className="text-xs bg-white/10 px-1 py-0.5 rounded">
                .adif
              </code>{" "}
              file directly, or paste raw ADIF text into the text area. The
              parser reads all standard ADIF fields and adds them to your log.
              Duplicate detection prevents re-importing the same QSO twice.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1.5">Export</h4>
            <p>
              Click <strong>Export</strong> to download your entire log as{" "}
              <code className="text-xs bg-white/10 px-1 py-0.5 rounded">
                propulse-log-YYYY-MM-DD.adi
              </code>
              . The file follows the ADIF 3.x standard and is compatible with
              LoTW, eQSL, ClubLog, N1MM, Log4OM, and virtually all other logging
              software.
            </p>
          </div>

          <HelpCallout type="note">
            ADIF (Amateur Data Interchange Format) is the universal standard for
            exchanging log data between ham radio software. Any logging program
            can import and export ADIF files, making it the safest format for
            backups and transfers.
          </HelpCallout>
        </div>
      </HelpAccordion>

      {/* Guest Mode */}
      <HelpAccordion
        id="guest-mode"
        title="Guest Mode"
        summary="Temporary operator sessions for shared stations or events"
      >
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>
            Guest mode lets a visiting operator log QSOs under their own
            callsign at your station. This is ideal for Field Day, club
            stations, or when a friend wants to operate from your shack.
          </p>

          <ul className="list-disc list-inside space-y-1.5 pl-1">
            <li>
              <strong>Create Session</strong> — Generate a unique session ID
              that you can share with a visiting operator. Your station callsign
              is associated with the session automatically.
            </li>
            <li>
              <strong>Join Session</strong> — Enter a session ID to join as a
              guest operator. All QSOs logged during the session are tagged with
              your guest callsign.
            </li>
            <li>
              <strong>Separate Storage</strong> — Guest QSOs are stored in a
              separate session and do not appear in your main log. Your personal
              log data is never affected.
            </li>
          </ul>

          <HelpCallout type="tip">
            Guest mode is perfect for Field Day, club stations, or when a friend
            wants to operate from your shack. The guest operator can export
            their session QSOs independently when they are done.
          </HelpCallout>
        </div>
      </HelpAccordion>

      {/* Awards Tracker */}
      <HelpAccordion
        id="awards"
        title="Awards Tracker"
        summary="Track progress toward WAS, DXCC, and other achievements"
      >
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>
            The Awards Tracker automatically scans your log entries and
            calculates progress toward popular amateur radio awards. Toggle it
            on or off with the <strong>Awards</strong> button in the toolbar.
          </p>

          <ul className="list-disc list-inside space-y-1.5 pl-1">
            <li>
              <strong>WAS (Worked All States)</strong> — Tracks confirmed
              contacts with all 50 US states. The tracker uses callsign prefix
              analysis to identify state-side contacts.
            </li>
            <li>
              <strong>DXCC</strong> — Tracks confirmed contacts with distinct
              DXCC entities (countries/territories). Callsign prefixes are
              mapped to DXCC entities using a built-in prefix database.
            </li>
          </ul>

          <p>
            Progress is displayed with visual indicators showing confirmed,
            unconfirmed, and needed entities or states. Band-by-band breakdowns
            let you see which bands you still need for band-specific awards. The
            tracker updates automatically whenever new QSOs are logged.
          </p>
        </div>
      </HelpAccordion>

      {/* External Services */}
      <HelpAccordion
        id="external-services"
        title="External Services"
        summary="Sync with LoTW, eQSL, and ClubLog"
      >
        <div className="space-y-4 text-sm text-gray-300 leading-relaxed">
          <p>
            Use the <strong>Upload</strong> button to open the upload modal,
            where you can push your log entries to external services. You can
            filter uploads by date range (all, last 7 days, last 30 days, or a
            custom range).
          </p>

          <div>
            <h4 className="text-white font-semibold mb-1">
              LoTW (Logbook of The World)
            </h4>
            <p>
              The ARRL's electronic QSL confirmation system. Propulse exports a
              standard ADIF file formatted for LoTW upload. Requires an ARRL
              LoTW account and TQ6 certificate. Configure credentials in{" "}
              <strong>Settings &rarr; Connections</strong>.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1">eQSL</h4>
            <p>
              Electronic QSL card exchange service. Upload logs directly from
              Propulse to send and receive virtual QSL cards. Configure your
              eQSL username and password in{" "}
              <strong>Settings &rarr; Connections</strong>.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1">ClubLog</h4>
            <p>
              DXCC tracking and analysis service run by Michael Wells, G7VJR.
              Upload logs for expedition tracking and DXCC credit analysis.
              Configure your ClubLog API key in{" "}
              <strong>Settings &rarr; Connections</strong>.
            </p>
          </div>

          <HelpCallout type="note">
            All external service credentials are stored locally and transmitted
            securely. Propulse never stores your passwords on any server.
          </HelpCallout>
        </div>
      </HelpAccordion>

      {/* Local vs Cloud Storage */}
      <HelpAccordion
        id="storage"
        title="Local vs Cloud Storage"
        summary="Understanding where your log data lives"
      >
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <ul className="list-disc list-inside space-y-2 pl-1">
            <li>
              <strong>No Account</strong> — All QSOs are stored in your
              browser's localStorage/IndexedDB. Data exists only on this browser
              and device. If you clear browser data, your log is gone.
            </li>
            <li>
              <strong>Free Account</strong> — Basic cloud sync. Your log is
              backed up to Supabase servers so you can access it from any device
              and recover it if browser data is lost.
            </li>
            <li>
              <strong>Pro Account</strong> — Full cloud sync with extended
              storage limits, plus integration with external upload services
              (eQSL, ClubLog).
            </li>
          </ul>

          <HelpCallout type="warning">
            Without an account, clearing your browser data will permanently
            delete your log. Create at least a free account to back up your data
            and enable cross-device access.
          </HelpCallout>

          <HelpCallout type="pro">
            Pro users get automatic cloud backup of their entire logbook with
            cross-device sync and priority support.
          </HelpCallout>
        </div>
      </HelpAccordion>

      {/* FAQ */}
      <HelpFAQ
        items={[
          {
            question: "Can I import my old logbook?",
            answer:
              "Yes! Export your existing log as ADIF from any logging software (N1MM, Log4OM, HRD, etc.) and import it into Propulse. Most standard ADIF fields are supported. Duplicate detection prevents the same QSO from being imported twice.",
          },
          {
            question: "What format does export use?",
            answer:
              "ADIF 3.x standard (.adi file). This is compatible with virtually all ham radio logging software including LoTW, eQSL, ClubLog, N1MM, Log4OM, and more.",
          },
          {
            question: "Does guest mode affect my log?",
            answer:
              "No. Guest QSOs are stored in a separate session and do not appear in your main log. The guest operator can export their session QSOs independently when the session ends.",
          },
        ]}
      />
    </div>
  );
}
