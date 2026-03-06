import { useState, useEffect } from "react";
import { DetailModal } from "@/components/ui/DetailModal";
import { useEmcommStore } from "@/stores/emcommStore";
import { useWeatherAlerts } from "@/hooks/useWeatherAlerts";
import type { ActivationLevel } from "@/types/emcomm";

interface ActivationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const LEVELS: { value: ActivationLevel; label: string; color: string }[] = [
  {
    value: "monitoring",
    label: "Monitoring",
    color: "bg-nebula-blue/20 text-nebula-blue border-nebula-blue/30",
  },
  {
    value: "standby",
    label: "Standby",
    color: "bg-caution-amber/20 text-caution-amber border-caution-amber/30",
  },
  {
    value: "partial",
    label: "Partial",
    color: "bg-plasma-orange/20 text-plasma-orange border-plasma-orange/30",
  },
  {
    value: "full",
    label: "Full",
    color: "bg-alert-red/20 text-alert-red border-alert-red/30",
  },
];

const inputClasses =
  "w-full bg-void-black/60 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-plasma-orange/50 transition-colors";

const labelClasses = "block text-xs font-medium text-gray-400 mb-1";

export function ActivationModal({ isOpen, onClose }: ActivationModalProps) {
  const activeIncident = useEmcommStore((s) => s.activeIncident);
  const frequencyPlans = useEmcommStore((s) => s.frequencyPlans);
  const startActivation = useEmcommStore((s) => s.startActivation);
  const updateActiveIncident = useEmcommStore((s) => s.updateActiveIncident);
  const pinAlert = useEmcommStore((s) => s.pinAlert);
  const unpinAlert = useEmcommStore((s) => s.unpinAlert);
  const { alerts } = useWeatherAlerts();

  const isEditing = !!activeIncident;

  // Form state
  const [name, setName] = useState("");
  const [level, setLevelState] = useState<ActivationLevel>("monitoring");
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [frequencyPlanId, setFrequencyPlanId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  // Populate form when editing an existing incident
  useEffect(() => {
    if (!isOpen) return;
    if (activeIncident) {
      setName(activeIncident.name);
      setLevelState(activeIncident.level);
      setPinnedIds(new Set(activeIncident.pinnedAlertIds));
      setFrequencyPlanId(activeIncident.frequencyPlanId);
      setNotes(activeIncident.notes);
    } else {
      setName("");
      setLevelState("monitoring");
      setPinnedIds(new Set());
      setFrequencyPlanId(null);
      setNotes("");
    }
  }, [isOpen, activeIncident]);

  const togglePin = (alertId: string) => {
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(alertId)) {
        next.delete(alertId);
      } else {
        next.add(alertId);
      }
      return next;
    });
  };

  const handleSubmit = () => {
    if (!name.trim()) return;

    if (isEditing) {
      // Update existing incident — persist level, notes, and frequency plan
      updateActiveIncident({
        level,
        notes: notes.trim(),
        frequencyPlanId,
      });
      // Sync pinned alerts
      const currentPinned = new Set(activeIncident!.pinnedAlertIds);
      for (const id of pinnedIds) {
        if (!currentPinned.has(id)) pinAlert(id);
      }
      for (const id of currentPinned) {
        if (!pinnedIds.has(id)) unpinAlert(id);
      }
    } else {
      // Create new activation
      startActivation({
        name: name.trim(),
        level,
        pinnedAlertIds: [...pinnedIds],
        notes: notes.trim(),
        frequencyPlanId,
      });
    }

    onClose();
  };

  return (
    <DetailModal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? "Edit Activation" : "Start EmComm Activation"}
      subtitle={
        isEditing
          ? `Active since ${new Date(activeIncident!.startedAt).toLocaleString()}`
          : "Configure and activate emergency communications"
      }
      size="lg"
    >
      <div className="space-y-5">
        {/* Incident Name */}
        <div>
          <label className={labelClasses}>Incident Name *</label>
          <input
            type="text"
            className={inputClasses}
            placeholder="e.g., 2026 Tornado Outbreak"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isEditing}
          />
        </div>

        {/* Activation Level */}
        <div>
          <label className={labelClasses}>Activation Level</label>
          <div className="grid grid-cols-4 gap-2">
            {LEVELS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setLevelState(opt.value)}
                className={`px-3 py-2 rounded-md text-xs font-semibold border transition-all ${
                  level === opt.value
                    ? opt.color
                    : "bg-void-black/30 text-gray-500 border-white/5 hover:border-white/10"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Pin Alerts */}
        <div>
          <label className={labelClasses}>Pin Alerts</label>
          {alerts.length === 0 ? (
            <p className="text-xs text-gray-500 italic">
              No active weather alerts
            </p>
          ) : (
            <div className="max-h-40 overflow-y-auto space-y-1 rounded-md border border-white/5 bg-void-black/30 p-2">
              {alerts.map((alert) => (
                <label
                  key={alert.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={pinnedIds.has(alert.id)}
                    onChange={() => togglePin(alert.id)}
                    className="w-3.5 h-3.5 rounded border-white/20 bg-void-black/60 text-plasma-orange focus:ring-0 focus:ring-offset-0"
                  />
                  <span className="text-xs text-white truncate">
                    {alert.event}
                    <span className="text-gray-500 ml-1">
                      - {alert.areaDesc}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Frequency Plan */}
        <div>
          <label className={labelClasses}>Frequency Plan</label>
          {frequencyPlans.length === 0 ? (
            <p className="text-xs text-gray-500 italic">
              No frequency plans configured
            </p>
          ) : (
            <select
              value={frequencyPlanId ?? ""}
              onChange={(e) => setFrequencyPlanId(e.target.value || null)}
              className={inputClasses}
            >
              <option value="">None</option>
              {frequencyPlans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} ({plan.entries.length} freq
                  {plan.entries.length !== 1 ? "s" : ""})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className={labelClasses}>Notes</label>
          <textarea
            className={`${inputClasses} resize-none`}
            rows={3}
            placeholder="Additional notes..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim()}
            className="px-5 py-2 rounded-md text-sm font-semibold bg-plasma-orange text-void-black hover:bg-plasma-orange/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isEditing ? "Update" : "Activate"}
          </button>
        </div>
      </div>
    </DetailModal>
  );
}
