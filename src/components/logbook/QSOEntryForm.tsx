/**
 * QSOEntryForm Component
 *
 * Form for entering new QSO (contact) records into the logbook.
 * Features callsign duplicate detection and validation.
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import { Card } from "@/components/ui";
import { useCallsignLookup } from "@/hooks/useLogbook";
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

/** Get current UTC date in YYYY-MM-DD format */
function getCurrentUTCDate(): string {
  return new Date().toISOString().split("T")[0];
}

/** Get current UTC time in HH:MM format */
function getCurrentUTCTime(): string {
  return new Date().toISOString().substring(11, 16);
}

/** Initial form state */
function getInitialFormData(): FormData {
  return {
    callsign: "",
    date: getCurrentUTCDate(),
    time: getCurrentUTCTime(),
    band: "20m",
    mode: "SSB",
    frequency: "",
    rstSent: "59",
    rstRcvd: "59",
    grid: "",
    name: "",
    notes: "",
  };
}

/** Validate callsign format (2-7 chars, alphanumeric + /) */
function isValidCallsign(callsign: string): boolean {
  if (!callsign || callsign.length < 2 || callsign.length > 10) {
    return false;
  }
  // Allow alphanumeric and forward slash
  return /^[A-Z0-9/]+$/i.test(callsign);
}

export interface QSOEntryFormProps {
  /** Callback when a new entry is successfully saved */
  onSave: (
    entry: Omit<LogEntry, "id" | "createdAt" | "updatedAt">,
  ) => Promise<string>;
  /** Loading state */
  loading?: boolean;
}

/**
 * QSOEntryForm - Form for entering new QSO records
 */
export function QSOEntryForm({ onSave, loading = false }: QSOEntryFormProps) {
  const [formData, setFormData] = useState<FormData>(getInitialFormData);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>(
    {},
  );
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  // Debounced callsign for duplicate lookup
  const [debouncedCallsign, setDebouncedCallsign] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedCallsign(formData.callsign.toUpperCase().trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [formData.callsign]);

  // Duplicate detection via callsign lookup
  const {
    isWorked,
    lastQSO,
    workedBands,
    loading: lookupLoading,
  } = useCallsignLookup(debouncedCallsign);

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

      // Clear success message on any change
      if (successMessage) {
        setSuccessMessage("");
      }
    },
    [errors, successMessage],
  );

  // Validate form
  const validate = useCallback((): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};

    if (!formData.callsign.trim()) {
      newErrors.callsign = "Callsign is required";
    } else if (!isValidCallsign(formData.callsign)) {
      newErrors.callsign =
        "Invalid callsign format (2-10 chars, letters, numbers, /)";
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

  // Handle form submission
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!validate()) {
        return;
      }

      setSaving(true);
      try {
        const entry: Omit<LogEntry, "id" | "createdAt" | "updatedAt"> = {
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

        await onSave(entry);

        // Reset form with fresh date/time
        setFormData(getInitialFormData());
        setSuccessMessage(`QSO with ${entry.callsign} logged successfully!`);

        // Clear success message after 3 seconds
        setTimeout(() => setSuccessMessage(""), 3000);
      } catch (err) {
        setErrors({
          callsign: err instanceof Error ? err.message : "Failed to save QSO",
        });
      } finally {
        setSaving(false);
      }
    },
    [formData, validate, onSave],
  );

  // Build duplicate warning message
  const dupeWarning = useMemo(() => {
    if (!isWorked || !lastQSO) return null;

    const bandList = workedBands.join(", ");
    return `Already worked on ${lastQSO.date} (${bandList})`;
  }, [isWorked, lastQSO, workedBands]);

  const isSubmitting = saving || loading;

  return (
    <Card className="p-4 md:p-6">
      <h3 className="font-orbitron text-lg font-bold text-gradient-orange mb-4">
        Log New QSO
      </h3>

      {successMessage && (
        <div className="mb-4 p-3 bg-signal-green/10 border border-signal-green/30 rounded-lg text-signal-green text-sm">
          {successMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Row 1: Callsign, Date, Time */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Callsign */}
          <div>
            <label
              htmlFor="callsign"
              className="block text-xs font-medium text-gray-400 mb-1"
            >
              Callsign *
            </label>
            <input
              type="text"
              id="callsign"
              name="callsign"
              value={formData.callsign}
              onChange={handleChange}
              placeholder="W1ABC"
              className={`w-full bg-white/5 border rounded-lg px-3 py-2 text-white font-mono uppercase placeholder-gray-500 focus:outline-none focus:border-plasma-orange/50 ${
                errors.callsign ? "border-alert-red/50" : "border-white/10"
              }`}
              disabled={isSubmitting}
              autoComplete="off"
            />
            {errors.callsign && (
              <p className="mt-1 text-xs text-alert-red">{errors.callsign}</p>
            )}
            {dupeWarning && !errors.callsign && (
              <p className="mt-1 text-xs text-yellow-500 flex items-center gap-1">
                <svg
                  className="w-3 h-3"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                {dupeWarning}
              </p>
            )}
            {lookupLoading && debouncedCallsign.length >= 2 && (
              <p className="mt-1 text-xs text-gray-500">Checking...</p>
            )}
          </div>

          {/* Date */}
          <div>
            <label
              htmlFor="date"
              className="block text-xs font-medium text-gray-400 mb-1"
            >
              Date (UTC) *
            </label>
            <input
              type="date"
              id="date"
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
              htmlFor="time"
              className="block text-xs font-medium text-gray-400 mb-1"
            >
              Time (UTC) *
            </label>
            <input
              type="time"
              id="time"
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
              htmlFor="band"
              className="block text-xs font-medium text-gray-400 mb-1"
            >
              Band
            </label>
            <select
              id="band"
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
              htmlFor="mode"
              className="block text-xs font-medium text-gray-400 mb-1"
            >
              Mode
            </label>
            <select
              id="mode"
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
              htmlFor="frequency"
              className="block text-xs font-medium text-gray-400 mb-1"
            >
              Frequency (kHz)
            </label>
            <input
              type="text"
              id="frequency"
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
              htmlFor="rstSent"
              className="block text-xs font-medium text-gray-400 mb-1"
            >
              RST Sent
            </label>
            <input
              type="text"
              id="rstSent"
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
              htmlFor="rstRcvd"
              className="block text-xs font-medium text-gray-400 mb-1"
            >
              RST Received
            </label>
            <input
              type="text"
              id="rstRcvd"
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
              htmlFor="grid"
              className="block text-xs font-medium text-gray-400 mb-1"
            >
              Grid Locator
            </label>
            <input
              type="text"
              id="grid"
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
              htmlFor="name"
              className="block text-xs font-medium text-gray-400 mb-1"
            >
              Operator Name
            </label>
            <input
              type="text"
              id="name"
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
              htmlFor="notes"
              className="block text-xs font-medium text-gray-400 mb-1"
            >
              Notes
            </label>
            <input
              type="text"
              id="notes"
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              placeholder="Good signal, nice QSO"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-plasma-orange/50"
              disabled={isSubmitting}
            />
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSubmitting}
            className={`px-6 py-2 rounded-lg font-medium transition-all ${
              isSubmitting
                ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                : "bg-plasma-orange hover:bg-plasma-orange/80 text-white"
            }`}
          >
            {isSubmitting ? "Saving..." : "Log QSO"}
          </button>
        </div>
      </form>
    </Card>
  );
}

QSOEntryForm.displayName = "QSOEntryForm";

export default QSOEntryForm;
