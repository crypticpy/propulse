/**
 * ContestAlertProfiles — Profile management UI for contest alert throttling.
 *
 * Displays a card-based list of alert profiles with radio selection,
 * auto-switch toggle, and inline rule editing. Built-in profiles cannot
 * be deleted but their rules can be customized.
 *
 * Uses a centered card layout (NOT a flyout panel) per UX rules.
 *
 * @module components/alerts/ContestAlertProfiles
 */

import React, { useState, useCallback, useMemo } from "react";
import { useSettingsStore } from "@/stores/settingsStore";
import {
  BUILT_IN_PROFILES,
  type AlertProfile,
  type ProfileRule,
  type ProfileCondition,
  type ProfileAction,
} from "@/lib/alerts/contestAlertLogic";

// ─── Constants ──────────────────────────────────────────────────────────────

const CONDITION_LABELS: Record<ProfileCondition, string> = {
  new_dxcc: "New DXCC Entity",
  new_band: "New Band Slot",
  new_mode: "New Mode",
  any_match: "Any Match",
};

const ACTION_LABELS: Record<ProfileAction, string> = {
  allow: "Allow",
  suppress: "Suppress",
  throttle: "Throttle",
};

const ACTION_COLORS: Record<ProfileAction, string> = {
  allow: "text-signal-green",
  suppress: "text-alert-red",
  throttle: "text-caution-amber",
};

const THROTTLE_MULTIPLIER_OPTIONS = [
  { value: 2, label: "2x (10 min)" },
  { value: 4, label: "4x (20 min)" },
  { value: 6, label: "6x (30 min)" },
  { value: 12, label: "12x (60 min)" },
];

// ─── Props ──────────────────────────────────────────────────────────────────

export interface ContestAlertProfilesProps {
  className?: string;
}

// ─── Component ──────────────────────────────────────────────────────────────

export const ContestAlertProfiles: React.FC<ContestAlertProfilesProps> = ({
  className,
}) => {
  const contestAlertProfileId = useSettingsStore(
    (s) => s.contestAlertProfileId ?? "normal",
  );
  const autoSwitch = useSettingsStore(
    (s) => s.autoSwitchContestProfile ?? true,
  );
  const throttleMultiplier = useSettingsStore(
    (s) => s.contestAlertThrottleMultiplier ?? 4,
  );
  const updatePreferences = useSettingsStore((s) => s.updatePreferences);

  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [customRules, setCustomRules] = useState<ProfileRule[]>([]);

  // ── Profile selection ──
  const handleSelectProfile = useCallback(
    (profileId: string) => {
      updatePreferences({ contestAlertProfileId: profileId });
    },
    [updatePreferences],
  );

  // ── Auto-switch toggle ──
  const handleToggleAutoSwitch = useCallback(() => {
    updatePreferences({ autoSwitchContestProfile: !autoSwitch });
  }, [autoSwitch, updatePreferences]);

  // ── Throttle multiplier ──
  const handleMultiplierChange = useCallback(
    (value: number) => {
      updatePreferences({ contestAlertThrottleMultiplier: value });
    },
    [updatePreferences],
  );

  // ── Editing ──
  const startEditing = useCallback((profile: AlertProfile) => {
    setEditingProfileId(profile.id);
    setCustomRules([...profile.rules]);
  }, []);

  const cancelEditing = useCallback(() => {
    setEditingProfileId(null);
    setCustomRules([]);
  }, []);

  const updateRuleAction = useCallback(
    (index: number, action: ProfileAction) => {
      setCustomRules((prev) =>
        prev.map((r, i) => (i === index ? { ...r, action } : r)),
      );
    },
    [],
  );

  const saveCustomRules = useCallback(() => {
    // For now, custom rules are stored in the profile selection
    // The profile ID tracks which built-in profile template is active
    // Future: persist custom rule overrides
    setEditingProfileId(null);
    setCustomRules([]);
  }, []);

  // ── Profiles list (always built-in for now) ──
  const profiles = useMemo(() => BUILT_IN_PROFILES, []);

  return (
    <div className={`space-y-4 ${className ?? ""}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-mono font-semibold text-white">
            Contest Alert Profiles
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Control how alerts behave during active contests
          </p>
        </div>
      </div>

      {/* Auto-switch toggle */}
      <div className="flex items-center justify-between rounded-lg border border-white/10 bg-deep-space px-4 py-3">
        <div>
          <p className="text-sm font-mono text-gray-200">
            Auto-switch during contests
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            Automatically activate the selected contest profile when a contest
            is detected
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={autoSwitch}
          onClick={handleToggleAutoSwitch}
          className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
            autoSwitch ? "bg-signal-green" : "bg-gray-600"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
              autoSwitch ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {/* Throttle multiplier */}
      <div className="rounded-lg border border-white/10 bg-deep-space px-4 py-3">
        <p className="text-sm font-mono text-gray-200 mb-2">Throttle Rate</p>
        <div className="flex flex-wrap gap-2">
          {THROTTLE_MULTIPLIER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleMultiplierChange(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors border ${
                throttleMultiplier === opt.value
                  ? "bg-plasma-orange/30 border-plasma-orange text-white"
                  : "bg-void-black border-white/10 text-gray-400 hover:border-white/20"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-1.5">
          When throttling, alerts are reduced by this factor instead of
          suppressed
        </p>
      </div>

      {/* Profile cards */}
      <div className="space-y-2">
        {profiles.map((profile) => {
          const isSelected = contestAlertProfileId === profile.id;
          const isEditing = editingProfileId === profile.id;
          const isNormal = profile.id === "normal";

          return (
            <div
              key={profile.id}
              className={`rounded-lg border transition-colors ${
                isSelected
                  ? "border-plasma-orange/50 bg-plasma-orange/5"
                  : "border-white/10 bg-space-900 hover:border-white/20"
              }`}
            >
              {/* Profile header with radio */}
              <button
                type="button"
                onClick={() => handleSelectProfile(profile.id)}
                className="w-full flex items-start gap-3 px-4 py-3 text-left"
              >
                {/* Radio indicator */}
                <span
                  className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                    isSelected ? "border-plasma-orange" : "border-gray-500"
                  }`}
                >
                  {isSelected && (
                    <span className="w-2 h-2 rounded-full bg-plasma-orange" />
                  )}
                </span>

                {/* Profile info */}
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-mono font-medium ${
                      isSelected ? "text-white" : "text-gray-300"
                    }`}
                  >
                    {profile.name}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {profile.description}
                  </p>
                </div>
              </button>

              {/* Rule list */}
              {isSelected && (
                <div className="px-4 pb-3 border-t border-white/5 pt-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono text-gray-400 uppercase tracking-wider">
                      Rules
                    </span>
                    {!isNormal && !isEditing && (
                      <button
                        type="button"
                        onClick={() => startEditing(profile)}
                        className="text-xs font-mono text-plasma-orange hover:text-plasma-orange/80 transition-colors"
                      >
                        Customize
                      </button>
                    )}
                    {isEditing && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={cancelEditing}
                          className="text-xs font-mono text-gray-400 hover:text-white transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={saveCustomRules}
                          className="text-xs font-mono text-signal-green hover:text-signal-green/80 transition-colors"
                        >
                          Save
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    {(isEditing ? customRules : profile.rules).map(
                      (rule, idx) => (
                        <div
                          key={`${rule.condition}-${idx}`}
                          className="flex items-center justify-between py-1.5 px-2 rounded bg-void-black/50"
                        >
                          <span className="text-xs font-mono text-gray-300">
                            {CONDITION_LABELS[rule.condition]}
                          </span>

                          {isEditing ? (
                            <select
                              value={rule.action}
                              onChange={(e) =>
                                updateRuleAction(
                                  idx,
                                  e.target.value as ProfileAction,
                                )
                              }
                              className="text-xs font-mono bg-deep-space border border-white/10 rounded px-2 py-1 text-white focus:outline-none focus:ring-1 focus:ring-plasma-orange/50"
                            >
                              <option value="allow">Allow</option>
                              <option value="suppress">Suppress</option>
                              <option value="throttle">Throttle</option>
                            </select>
                          ) : (
                            <span
                              className={`text-xs font-mono font-medium ${ACTION_COLORS[rule.action]}`}
                            >
                              {ACTION_LABELS[rule.action]}
                            </span>
                          )}
                        </div>
                      ),
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

ContestAlertProfiles.displayName = "ContestAlertProfiles";

export default ContestAlertProfiles;
