/**
 * ContestQslBatch — Post-contest batch QSL upload UI
 *
 * Provides a centered panel for selecting a past contest session,
 * choosing QSL services (LoTW, eQSL, QRZ), and executing batch uploads
 * with real-time progress bars. Shows confirmation rate after upload.
 *
 * Dark theme, centered layout (not a flyout panel).
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useContestStore } from "@/stores/contestStore";
import { getContestById } from "@/lib/data/contests";
import {
  createBatchUpload,
  executeBatchUpload,
  type QslService,
  type BatchUploadProgress,
} from "@/lib/contest/postContestBatch";
import {
  getContestConfirmationRate,
  type ConfirmationRate,
} from "@/lib/contest/contestConfirmationTracker";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ServiceOption {
  id: QslService;
  label: string;
  available: boolean;
  description: string;
}

const SERVICES: ServiceOption[] = [
  {
    id: "lotw",
    label: "LoTW",
    available: true,
    description: "Generate ADIF for TQSL signing",
  },
  {
    id: "eqsl",
    label: "eQSL",
    available: true,
    description: "Upload contest QSOs directly to eQSL.cc",
  },
  {
    id: "qrz",
    label: "QRZ",
    available: true,
    description: "Upload contest QSOs directly to QRZ Logbook",
  },
];

// ─── Component ──────────────────────────────────────────────────────────────

export function ContestQslBatch() {
  const sessionHistory = useContestStore((s) => s.sessionHistory);

  // State
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [selectedServices, setSelectedServices] = useState<Set<QslService>>(
    new Set(["lotw"]),
  );
  const [uploading, setUploading] = useState(false);
  const [progressMap, setProgressMap] = useState<
    Map<QslService, BatchUploadProgress>
  >(new Map());
  const [confirmationRate, setConfirmationRate] =
    useState<ConfirmationRate | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  const abortRef = useRef(false);

  // Auto-select the most recent session
  useEffect(() => {
    if (sessionHistory.length > 0 && !selectedSessionId) {
      const recent = sessionHistory.find((s) => s.qsos.length > 0);
      if (recent) {
        setSelectedSessionId(recent.id);
      }
    }
  }, [sessionHistory, selectedSessionId]);

  // Load confirmation rate when session changes
  useEffect(() => {
    if (!selectedSessionId) {
      setConfirmationRate(null);
      return;
    }

    let cancelled = false;
    getContestConfirmationRate(selectedSessionId).then((rate) => {
      if (!cancelled) setConfirmationRate(rate);
    });

    return () => {
      cancelled = true;
    };
  }, [selectedSessionId]);

  const toggleService = useCallback((service: QslService) => {
    setSelectedServices((prev) => {
      const next = new Set(prev);
      if (next.has(service)) {
        next.delete(service);
      } else {
        next.add(service);
      }
      return next;
    });
  }, []);

  const handleUpload = useCallback(async () => {
    if (!selectedSessionId || selectedServices.size === 0) return;

    abortRef.current = false;
    setUploading(true);
    setProgressMap(new Map());
    setShowErrors(false);

    try {
      const job = await createBatchUpload(selectedSessionId, [
        ...selectedServices,
      ]);

      for await (const progress of executeBatchUpload(job)) {
        if (abortRef.current) break;
        setProgressMap((prev) => {
          const next = new Map(prev);
          next.set(progress.service, progress);
          return next;
        });
      }

      // Refresh confirmation rate after upload
      const rate = await getContestConfirmationRate(selectedSessionId);
      setConfirmationRate(rate);
    } catch (err) {
      console.error("[ContestQslBatch] Upload failed:", err);
    } finally {
      setUploading(false);
    }
  }, [selectedSessionId, selectedServices]);

  // Get all errors across services
  const allErrors = [...progressMap.values()].flatMap((p) => p.errors);
  const hasErrors = allErrors.length > 0;

  // Get selected session info
  const selectedSession = sessionHistory.find(
    (s) => s.id === selectedSessionId,
  );
  const contestDef = selectedSession
    ? getContestById(selectedSession.contestId)
    : null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Session picker */}
      <div>
        <label
          htmlFor="contest-session-select"
          className="block text-sm font-medium text-gray-300 mb-2"
        >
          Contest Session
        </label>
        <select
          id="contest-session-select"
          value={selectedSessionId}
          onChange={(e) => setSelectedSessionId(e.target.value)}
          disabled={uploading}
          className="
            w-full px-3 py-2 rounded-lg
            bg-void-black border border-white/10
            text-white text-sm
            focus:outline-none focus:ring-2 focus:ring-plasma-orange/50
            disabled:opacity-50
          "
        >
          <option value="">Select a contest session...</option>
          {sessionHistory
            .filter((s) => s.qsos.length > 0)
            .map((session) => {
              const def = getContestById(session.contestId);
              const date = session.startTime.slice(0, 10);
              return (
                <option key={session.id} value={session.id}>
                  {def?.name ?? session.contestId} — {date} (
                  {session.qsos.length} QSOs)
                </option>
              );
            })}
        </select>
      </div>

      {/* Service checkboxes */}
      {selectedSessionId && (
        <div>
          <p className="text-sm font-medium text-gray-300 mb-2">
            Upload Services
          </p>
          <div className="space-y-2">
            {SERVICES.map((service) => (
              <label
                key={service.id}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-lg
                  border transition-colors cursor-pointer
                  ${
                    service.available
                      ? selectedServices.has(service.id)
                        ? "border-plasma-orange/30 bg-plasma-orange/5"
                        : "border-white/10 bg-white/[0.02] hover:bg-white/[0.04]"
                      : "border-white/5 bg-white/[0.01] opacity-50 cursor-not-allowed"
                  }
                `}
              >
                <input
                  type="checkbox"
                  checked={selectedServices.has(service.id)}
                  onChange={() => toggleService(service.id)}
                  disabled={!service.available || uploading}
                  className="
                    w-4 h-4 rounded border-gray-600
                    text-plasma-orange focus:ring-plasma-orange/50
                    bg-void-black
                  "
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">
                      {service.label}
                    </span>
                    {!service.available && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-caution-amber/20 text-caution-amber">
                        Coming Soon
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-500">
                    {service.description}
                  </span>
                </div>

                {/* Progress bar for this service */}
                {progressMap.has(service.id) && (
                  <ProgressIndicator progress={progressMap.get(service.id)!} />
                )}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Start upload button */}
      {selectedSessionId && (
        <button
          onClick={handleUpload}
          disabled={uploading || selectedServices.size === 0}
          className="
            w-full px-4 py-2.5 rounded-lg
            bg-plasma-orange text-void-black font-semibold text-sm
            hover:bg-plasma-orange/90 transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        >
          {uploading ? "Uploading..." : "Start Upload"}
        </button>
      )}

      {/* Error log */}
      {hasErrors && (
        <div className="rounded-lg border border-alert-red/20 bg-alert-red/5 overflow-hidden">
          <button
            onClick={() => setShowErrors((prev) => !prev)}
            className="
              w-full flex items-center justify-between
              px-3 py-2 text-left text-sm
              hover:bg-alert-red/5 transition-colors
            "
          >
            <span className="text-alert-red font-medium">
              {allErrors.length} error{allErrors.length !== 1 ? "s" : ""}
            </span>
            <svg
              className={`w-4 h-4 text-alert-red transition-transform ${showErrors ? "rotate-180" : ""}`}
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          {showErrors && (
            <div className="px-3 pb-3 space-y-1">
              {allErrors.map((error, i) => (
                <p key={i} className="text-xs text-alert-red/80 font-mono">
                  {error}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Confirmation rate card */}
      {confirmationRate && confirmationRate.total > 0 && (
        <div className="rounded-lg border border-white/10 bg-deep-space/50 p-4">
          <h3 className="text-sm font-semibold text-white mb-3">
            Confirmation Rate
            {contestDef && (
              <span className="text-gray-400 font-normal ml-2">
                {contestDef.name}
              </span>
            )}
          </h3>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <ConfirmationStat
              label="LoTW"
              confirmed={confirmationRate.lotwConfirmed}
              total={confirmationRate.total}
              color="text-signal-green"
            />
            <ConfirmationStat
              label="eQSL"
              confirmed={confirmationRate.eqslConfirmed}
              total={confirmationRate.total}
              color="text-nebula-blue"
            />
            <ConfirmationStat
              label="QRZ"
              confirmed={confirmationRate.qrzConfirmed}
              total={confirmationRate.total}
              color="text-plasma-orange"
            />
            <ConfirmationStat
              label="Card"
              confirmed={confirmationRate.cardConfirmed}
              total={confirmationRate.total}
              color="text-caution-amber"
            />
          </div>

          <div className="mt-3 text-xs text-gray-500">
            {confirmationRate.unconfirmed} of {confirmationRate.total} QSOs
            unconfirmed
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function ProgressIndicator({ progress }: { progress: BatchUploadProgress }) {
  const pct =
    progress.total > 0
      ? Math.round(
          ((progress.completed + progress.failed) / progress.total) * 100,
        )
      : 0;

  return (
    <div className="w-20 shrink-0">
      {progress.done ? (
        <span
          className={`text-xs font-medium ${
            progress.failed > 0 ? "text-alert-red" : "text-signal-green"
          }`}
        >
          {progress.failed > 0
            ? `${progress.failed} failed`
            : `${progress.completed} done`}
        </span>
      ) : (
        <div className="space-y-1">
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-plasma-orange transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-[10px] text-gray-500">{pct}%</span>
        </div>
      )}
    </div>
  );
}

function ConfirmationStat({
  label,
  confirmed,
  total,
  color,
}: {
  label: string;
  confirmed: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((confirmed / total) * 100) : 0;

  return (
    <div className="text-center">
      <div className={`text-lg font-bold ${color}`}>{pct}%</div>
      <div className="text-xs text-gray-500">
        {confirmed}/{total}
      </div>
      <div className="text-[10px] text-gray-600 uppercase tracking-wider">
        {label}
      </div>
    </div>
  );
}
