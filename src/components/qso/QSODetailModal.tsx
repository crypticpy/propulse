/**
 * QSODetailModal — Full QSO detail view in a centered modal
 *
 * Shows all fields of a QSO grouped into sections.
 * Uses createPortal, z-[500], backdrop, escape-to-close, body scroll lock.
 * Includes Edit and Delete actions with ConfirmDialog.
 */

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import type { LogEntry } from "@/lib/db/types";
import { useQSOStore } from "@/stores/qsoStore";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

// ── Section Component ───────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
        {title}
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2">
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | number | boolean | undefined | null;
  mono?: boolean;
}) {
  if (value == null || value === "") return null;
  const display =
    typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className={`text-sm text-white ${mono ? "font-mono" : ""}`}>
        {display}
      </dd>
    </div>
  );
}

// ── Props ───────────────────────────────────────────────────────────────────

interface QSODetailModalProps {
  entry: LogEntry | null;
  onClose: () => void;
  onEdit?: (entry: LogEntry) => void;
}

// ── Main Component ──────────────────────────────────────────────────────────

export function QSODetailModal({
  entry,
  onClose,
  onEdit,
}: QSODetailModalProps) {
  const deleteQSO = useQSOStore((s) => s.deleteQSO);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // ESC handler
  useEffect(() => {
    if (!entry) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [entry, onClose]);

  // Body scroll lock
  useEffect(() => {
    if (!entry) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [entry]);

  const handleDelete = useCallback(async () => {
    if (!entry) return;
    await deleteQSO(entry.id);
    setConfirmDelete(false);
    onClose();
  }, [entry, deleteQSO, onClose]);

  if (!entry) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-void-black/80 animate-in fade-in"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-2xl max-h-[calc(100vh-2rem)] bg-deep-space border border-white/10 rounded-2xl shadow-2xl flex flex-col animate-in zoom-in-95">
        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-4 border-b border-white/5 flex-shrink-0">
          <div>
            <h2 className="font-mono text-2xl font-bold text-white">
              {entry.callsign}
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              {entry.date} at {entry.timeOn} UTC
              {entry.band && ` on ${entry.band}`}
              {entry.mode && ` ${entry.mode}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            aria-label="Close modal"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 min-h-0 p-6">
          <dl>
            {/* Core */}
            <Section title="Core">
              <Field label="Callsign" value={entry.callsign} mono />
              <Field
                label="Frequency"
                value={
                  entry.frequency > 0
                    ? `${(entry.frequency / 1000).toFixed(3)} MHz`
                    : undefined
                }
                mono
              />
              <Field label="Band" value={entry.band} mono />
              <Field label="Mode" value={entry.mode} mono />
              <Field label="Date" value={entry.date} />
              <Field label="Time On" value={entry.timeOn} mono />
              <Field label="Time Off" value={entry.timeOff} mono />
              <Field
                label="TX Power"
                value={entry.txPower != null ? `${entry.txPower}W` : undefined}
              />
            </Section>

            {/* Location */}
            <Section title="Location">
              <Field label="Grid" value={entry.grid} mono />
              <Field label="Name" value={entry.name} />
              <Field label="QTH" value={entry.qth} />
              <Field label="Country" value={entry.country} />
              <Field label="DXCC" value={entry.dxcc} mono />
              <Field label="CQ Zone" value={entry.cqZone} />
              <Field label="ITU Zone" value={entry.ituZone} />
              <Field label="Continent" value={entry.continent} />
            </Section>

            {/* Exchange */}
            <Section title="Exchange">
              <Field label="RST Sent" value={entry.rstSent} mono />
              <Field label="RST Rcvd" value={entry.rstRcvd} mono />
              <Field label="Serial Sent" value={entry.stx} mono />
              <Field label="Serial Rcvd" value={entry.srx} mono />
              <Field label="Exch Sent" value={entry.stxString} />
              <Field label="Exch Rcvd" value={entry.srxString} />
            </Section>

            {/* Activation */}
            {(entry.mySig || entry.contestId) && (
              <Section title="Activation / Contest">
                <Field label="My Program" value={entry.mySig} />
                <Field label="My Reference" value={entry.mySigInfo} />
                <Field label="Their Program" value={entry.sig} />
                <Field label="Their Reference" value={entry.sigInfo} />
                <Field label="Contest" value={entry.contestId} />
              </Section>
            )}

            {/* Confirmations */}
            <Section title="Confirmations">
              <Field label="QSL Sent" value={entry.qslSent} />
              <Field label="QSL Rcvd" value={entry.qslRcvd} />
              <Field label="LoTW" value={entry.lotw} />
              <Field label="eQSL" value={entry.eqsl} />
              <Field label="LoTW QSL Sent" value={entry.lotwQslSent} />
              <Field label="LoTW QSL Rcvd" value={entry.lotwQslRcvd} />
              <Field label="ClubLog" value={entry.clublogStatus} />
              <Field label="QRZ.com" value={entry.qrzcomStatus} />
            </Section>

            {/* Propagation */}
            {(entry.propMode || entry.satName) && (
              <Section title="Propagation">
                <Field label="Prop Mode" value={entry.propMode} />
                <Field label="Satellite" value={entry.satName} />
                <Field label="Sat Mode" value={entry.satMode} />
              </Section>
            )}

            {/* Station */}
            {(entry.myGrid || entry.myRig || entry.stationCallsign) && (
              <Section title="My Station">
                <Field
                  label="Station Call"
                  value={entry.stationCallsign}
                  mono
                />
                <Field label="Operator" value={entry.operatorCallsign} mono />
                <Field label="My Grid" value={entry.myGrid} mono />
                <Field label="My Rig" value={entry.myRig} />
                <Field label="My Antenna" value={entry.myAntenna} />
              </Section>
            )}

            {/* Metadata */}
            <Section title="Metadata">
              <Field label="Created" value={entry.createdAt} />
              <Field label="Updated" value={entry.updatedAt} />
              <Field label="Version" value={entry.version} />
              <Field label="Device" value={entry.lastDeviceId} />
              <Field label="Notes" value={entry.notes} />
            </Section>
          </dl>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 pt-4 border-t border-white/5 flex-shrink-0">
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="px-4 py-2 text-sm font-medium rounded-lg transition-colors bg-alert-red/20 text-alert-red hover:bg-alert-red/30 border border-alert-red/30"
          >
            Delete
          </button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-lg transition-colors bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10"
            >
              Close
            </button>
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(entry)}
                className="px-4 py-2 text-sm font-medium rounded-lg transition-colors bg-plasma-orange hover:bg-plasma-orange/80 text-white"
              >
                Edit
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={confirmDelete}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
        title="Delete QSO?"
        message={`This will permanently delete the QSO with ${entry.callsign} on ${entry.date}. This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
      />
    </div>,
    document.body,
  );
}
