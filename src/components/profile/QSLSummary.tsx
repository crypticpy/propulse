/**
 * Compact QSL service status cards.
 * Shows connection status for LoTW, eQSL, QRZ Logbook, and ClubLog.
 * Currently display-only; configuration comes in a later commit.
 */

// ─── QSL Service definitions ────────────────────────────────────────────────

interface QSLService {
  key: string;
  name: string;
  shortName: string;
  icon: string;
}

const QSL_SERVICES: QSLService[] = [
  {
    key: "lotw",
    name: "Logbook of The World",
    shortName: "LoTW",
    icon: "\u{1F4E1}", // satellite antenna
  },
  {
    key: "eqsl",
    name: "eQSL.cc",
    shortName: "eQSL",
    icon: "\u{1F4E8}", // incoming envelope
  },
  {
    key: "qrz",
    name: "QRZ Logbook",
    shortName: "QRZ",
    icon: "\u{1F4D6}", // open book
  },
  {
    key: "clublog",
    name: "Club Log",
    shortName: "ClubLog",
    icon: "\u{1F30D}", // globe
  },
];

// ─── Component ──────────────────────────────────────────────────────────────

export function QSLSummary() {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
        QSL Services
      </h3>

      <div className="grid grid-cols-2 gap-3">
        {QSL_SERVICES.map((service) => (
          <div
            key={service.key}
            className="bg-panel/30 border border-white/5 rounded-lg p-3 flex items-start gap-3"
          >
            {/* Icon */}
            <span className="text-lg leading-none mt-0.5" aria-hidden="true">
              {service.icon}
            </span>

            <div className="min-w-0 flex-1">
              {/* Name + status dot */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-200 truncate">
                  {service.shortName}
                </span>
                <span
                  className="inline-block w-2 h-2 rounded-full flex-shrink-0 bg-gray-600"
                  title="Not configured"
                />
              </div>

              {/* Status text */}
              <p className="text-xs text-gray-500 mt-0.5 truncate">
                Not configured
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Setup hint */}
      <p className="text-xs text-gray-600 mt-3 text-center">
        QSL service integration coming soon. Configure in Settings.
      </p>
    </div>
  );
}
