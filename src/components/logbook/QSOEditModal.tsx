/**
 * QSOEditModal Component
 *
 * Modal for editing existing QSO records with save and delete functionality.
 */

import { useState, useCallback, useEffect } from "react";
import { DetailModal } from "@/components/ui";
import type { LogEntry } from "@/lib/db/types";

/** Available amateur bands */
const BANDS = [
  "160m",
  "80m",
  "40m",
  "30m",
  "20m",
  "17m",
  "15m",
  "12m",
  "10m",
  "6m",
  "2m",
  "70cm",
] as const;

/** Available operating modes */
const MODES = ["SSB", "CW", "FT8", "FT4", "RTTY", "PSK31", "AM", "FM"] as const;

/** Form field data */
interface FormData {
  callsign: string;
  date: string;
  time: string;
  band: string;
  mode: string;
  frequency: string;
  rstSent: string;
  rstRcvd: string;
  grid: string;
  name: string;
  notes: string;
}

/** Convert LogEntry to form data */
function entryToFormData(entry: LogEntry): FormData {
  return {
    callsign: entry.callsign,
    date: entry.date,
    time: entry.timeOn,
    band: entry.band,
    mode: entry.mode,
    frequency: entry.frequency ? entry.frequency.toString() : "",
    rstSent: entry.rstSent || "",
    rstRcvd: entry.rstRcvd || "",
    grid: entry.grid || "",
    name: entry.name || "",
    notes: entry.notes || "",
  };
}

/** Validate callsign format */
function isValidCallsign(callsign: string): boolean {
  if (!callsign || callsign.length < 2 || callsign.length > 10) {
    return false;
  }
  return /^[A-Z0-9/]+$/i.test(callsign);
}

export interface QSOEditModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when modal is closed */
  onClose: () => void;
  /** The entry being edited */
  entry: LogEntry | null;
  /** Callback when entry is saved */
  onSave: (
    id: string,
    updates: Partial<Omit<LogEntry, "id" | "createdAt">>,
  ) => Promise<void>;
  /** Callback when entry is deleted */
  onDelete: (id: string) => Promise<void>;
}

/**
 * QSOEditModal - Modal for editing existing QSO records
 */
export function QSOEditModal({
  isOpen,
  onClose,
  entry,
  onSave,
  onDelete,
}: QSOEditModalProps) {
  const [formData, setFormData] = useState<FormData>({
    callsign: "",
    date: "",
    time: "",
    band: "20m",
    mode: "SSB",
    frequency: "",
    rstSent: "",
    rstRcvd: "",
    grid: "",
    name: "",
    notes: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>(
    {},
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Reset form when entry changes
  useEffect(() => {
    if (entry) {
      setFormData(entryToFormData(entry));
      setErrors({});
      setShowDeleteConfirm(false);
    }
  }, [entry]);

  // Handle form field changes
  const handleChange = useCallback(
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >,
    ) => {
      const { name, value } = e.target;
      setFormData((prev) => ({ ...prev, [name]: value }));

      // Clear error for this field
      if (errors[name as keyof FormData]) {
        setErrors((prev) => ({ ...prev, [name]: undefined }));
      }
    },
    [errors],
  );

  // Validate form
  const validate = useCallback((): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};

    if (!formData.callsign.trim()) {
      newErrors.callsign = "Callsign is required";
    } else if (!isValidCallsign(formData.callsign)) {
      newErrors.callsign = "Invalid callsign format";
    }

    if (!formData.date) {
      newErrors.date = "Date is required";
    }

    if (!formData.time) {
      newErrors.time = "Time is required";
    }

    if (formData.frequency && isNaN(parseFloat(formData.frequency))) {
      newErrors.frequency = "Frequency must be a number";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  // Handle save
  const handleSave = useCallback(async () => {
    if (!entry || !validate()) {
      return;
    }

    setSaving(true);
    try {
      const updates: Partial<Omit<LogEntry, "id" | "createdAt">> = {
        callsign: formData.callsign.toUpperCase().trim(),
        date: formData.date,
        timeOn: formData.time,
        band: formData.band.toLowerCase(),
        mode: formData.mode.toUpperCase(),
        frequency: formData.frequency ? parseFloat(formData.frequency) : 0,
        rstSent: formData.rstSent || undefined,
        rstRcvd: formData.rstRcvd || undefined,
        grid: formData.grid.toUpperCase().trim() || undefined,
        name: formData.name.trim() || undefined,
        notes: formData.notes.trim() || undefined,
      };

      await onSave(entry.id, updates);
      onClose();
    } catch (err) {
      setErrors({
        callsign: err instanceof Error ? err.message : "Failed to save",
      });
    } finally {
      setSaving(false);
    }
  }, [entry, formData, validate, onSave, onClose]);

  // Handle delete
  const handleDelete = useCallback(async () => {
    if (!entry) return;

    setDeleting(true);
    try {
      await onDelete(entry.id);
      onClose();
    } catch (err) {
      console.error("Failed to delete:", err);
    } finally {
      setDeleting(false);
    }
  }, [entry, onDelete, onClose]);

  const isSubmitting = saving || deleting;

  if (!entry) return null;

  return (
    <DetailModal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit QSO"
      subtitle={`${entry.callsign} on ${entry.date}`}
      size="lg"
    >
      <div className="space-y-4">
        {/* Row 1: Callsign, Date, Time */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Callsign */}
          <div>
            <label
              htmlFor="edit-callsign"
              className="block text-xs font-medium text-gray-400 mb-1"
            >
              Callsign *
            </label>
            <input
              type="text"
              id="edit-callsign"
              name="callsign"
              value={formData.callsign}
              onChange={handleChange}
              className={`w-full bg-white/5 border rounded-lg px-3 py-2 text-white font-mono uppercase placeholder-gray-500 focus:outline-none focus:border-plasma-orange/50 ${
                errors.callsign ? "border-alert-red/50" : "border-white/10"
              }`}
              disabled={isSubmitting}
            />
            {errors.callsign && (
              <p className="mt-1 text-xs text-alert-red">{errors.callsign}</p>
            )}
          </div>

          {/* Date */}
          <div>
            <label
              htmlFor="edit-date"
              className="block text-xs font-medium text-gray-400 mb-1"
            >
              Date (UTC) *
            </label>
            <input
              type="date"
              id="edit-date"
              name="date"
              value={formData.date}
              onChange={handleChange}
              className={`w-full bg-white/5 border rounded-lg px-3 py-2 text-white focus:outline-none focus:border-plasma-orange/50 ${
                errors.date ? "border-alert-red/50" : "border-white/10"
              }`}
              disabled={isSubmitting}
            />
            {errors.date && (
              <p className="mt-1 text-xs text-alert-red">{errors.date}</p>
            )}
          </div>

          {/* Time */}
          <div>
            <label
              htmlFor="edit-time"
              className="block text-xs font-medium text-gray-400 mb-1"
            >
              Time (UTC) *
            </label>
            <input
              type="time"
              id="edit-time"
              name="time"
              value={formData.time}
              onChange={handleChange}
              className={`w-full bg-white/5 border rounded-lg px-3 py-2 text-white focus:outline-none focus:border-plasma-orange/50 ${
                errors.time ? "border-alert-red/50" : "border-white/10"
              }`}
              disabled={isSubmitting}
            />
            {errors.time && (
              <p className="mt-1 text-xs text-alert-red">{errors.time}</p>
            )}
          </div>
        </div>

        {/* Row 2: Band, Mode, Frequency */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Band */}
          <div>
            <label
              htmlFor="edit-band"
              className="block text-xs font-medium text-gray-400 mb-1"
            >
              Band
            </label>
            <select
              id="edit-band"
              name="band"
              value={formData.band}
              onChange={handleChange}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-plasma-orange/50"
              disabled={isSubmitting}
            >
              {BANDS.map((band) => (
                <option key={band} value={band} className="bg-gray-900">
                  {band}
                </option>
              ))}
            </select>
          </div>

          {/* Mode */}
          <div>
            <label
              htmlFor="edit-mode"
              className="block text-xs font-medium text-gray-400 mb-1"
            >
              Mode
            </label>
            <select
              id="edit-mode"
              name="mode"
              value={formData.mode}
              onChange={handleChange}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-plasma-orange/50"
              disabled={isSubmitting}
            >
              {MODES.map((mode) => (
                <option key={mode} value={mode} className="bg-gray-900">
                  {mode}
                </option>
              ))}
            </select>
          </div>

          {/* Frequency */}
          <div>
            <label
              htmlFor="edit-frequency"
              className="block text-xs font-medium text-gray-400 mb-1"
            >
              Frequency (kHz)
            </label>
            <input
              type="text"
              id="edit-frequency"
              name="frequency"
              value={formData.frequency}
              onChange={handleChange}
              placeholder="14074"
              className={`w-full bg-white/5 border rounded-lg px-3 py-2 text-white font-mono placeholder-gray-500 focus:outline-none focus:border-plasma-orange/50 ${
                errors.frequency ? "border-alert-red/50" : "border-white/10"
              }`}
              disabled={isSubmitting}
            />
            {errors.frequency && (
              <p className="mt-1 text-xs text-alert-red">{errors.frequency}</p>
            )}
          </div>
        </div>

        {/* Row 3: RST Sent, RST Rcvd, Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* RST Sent */}
          <div>
            <label
              htmlFor="edit-rstSent"
              className="block text-xs font-medium text-gray-400 mb-1"
            >
              RST Sent
            </label>
            <input
              type="text"
              id="edit-rstSent"
              name="rstSent"
              value={formData.rstSent}
              onChange={handleChange}
              placeholder="59"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white font-mono placeholder-gray-500 focus:outline-none focus:border-plasma-orange/50"
              disabled={isSubmitting}
            />
          </div>

          {/* RST Rcvd */}
          <div>
            <label
              htmlFor="edit-rstRcvd"
              className="block text-xs font-medium text-gray-400 mb-1"
            >
              RST Received
            </label>
            <input
              type="text"
              id="edit-rstRcvd"
              name="rstRcvd"
              value={formData.rstRcvd}
              onChange={handleChange}
              placeholder="59"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white font-mono placeholder-gray-500 focus:outline-none focus:border-plasma-orange/50"
              disabled={isSubmitting}
            />
          </div>

          {/* Grid */}
          <div>
            <label
              htmlFor="edit-grid"
              className="block text-xs font-medium text-gray-400 mb-1"
            >
              Grid Locator
            </label>
            <input
              type="text"
              id="edit-grid"
              name="grid"
              value={formData.grid}
              onChange={handleChange}
              placeholder="FN42"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white font-mono uppercase placeholder-gray-500 focus:outline-none focus:border-plasma-orange/50"
              disabled={isSubmitting}
            />
          </div>
        </div>

        {/* Row 4: Name, Notes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Name */}
          <div>
            <label
              htmlFor="edit-name"
              className="block text-xs font-medium text-gray-400 mb-1"
            >
              Operator Name
            </label>
            <input
              type="text"
              id="edit-name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="John"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-plasma-orange/50"
              disabled={isSubmitting}
            />
          </div>

          {/* Notes */}
          <div>
            <label
              htmlFor="edit-notes"
              className="block text-xs font-medium text-gray-400 mb-1"
            >
              Notes
            </label>
            <textarea
              id="edit-notes"
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={2}
              placeholder="Additional notes..."
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-plasma-orange/50 resize-none"
              disabled={isSubmitting}
            />
          </div>
        </div>

        {/* Metadata */}
        <div className="pt-4 border-t border-white/10 text-xs text-gray-500">
          <p>Created: {new Date(entry.createdAt).toLocaleString()}</p>
          <p>Updated: {new Date(entry.updatedAt).toLocaleString()}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-white/10">
          {/* Delete button */}
          <div>
            {showDeleteConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-alert-red">Delete this QSO?</span>
                <button
                  onClick={handleDelete}
                  disabled={isSubmitting}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-alert-red hover:bg-alert-red/80 text-white transition-colors disabled:opacity-50"
                >
                  {deleting ? "Deleting..." : "Yes, Delete"}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isSubmitting}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isSubmitting}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-alert-red hover:bg-alert-red/10 transition-colors disabled:opacity-50"
              >
                Delete QSO
              </button>
            )}
          </div>

          {/* Save/Cancel buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSubmitting}
              className={`px-6 py-2 rounded-lg font-medium transition-all ${
                isSubmitting
                  ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                  : "bg-plasma-orange hover:bg-plasma-orange/80 text-white"
              }`}
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </DetailModal>
  );
}

QSOEditModal.displayName = "QSOEditModal";

export default QSOEditModal;
