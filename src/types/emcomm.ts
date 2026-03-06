/** Activation severity levels */
export type ActivationLevel = "monitoring" | "standby" | "partial" | "full";

/** An EmComm activation incident */
export interface EmCommIncident {
  id: string;
  name: string; // e.g., "2026 Tornado Outbreak"
  level: ActivationLevel;
  startedAt: string; // ISO-8601
  endedAt?: string;
  pinnedAlertIds: string[]; // NWS alert IDs being tracked
  notes: string;
  frequencyPlanId: string | null;
}

/** A single frequency entry in a plan */
export interface FrequencyPlanEntry {
  label: string; // e.g., "Primary HF", "VHF Simplex"
  frequencyHz: number; // Hz (matches rig store convention)
  mode: string; // "USB" | "FM" | "CW" etc.
  tone?: string; // CTCSS if VHF repeater
  purpose: string; // "Net Primary" | "Tactical" | "Backup" etc.
}

/** A named frequency plan */
export interface FrequencyPlan {
  id: string;
  name: string; // e.g., "Region 5 ARES Standard"
  entries: FrequencyPlanEntry[];
}

/** Situation report entry */
export interface SitRepEntry {
  id: string;
  incidentId: string;
  timestamp: string; // ISO-8601
  author: string; // Callsign
  summary: string;
  conditions: string; // Propagation/weather conditions note
  netActivity: string;
  nextActions: string;
}

/** ICS-213 General Message */
export interface ICS213Message {
  id: string;
  incidentName: string;
  to: string;
  toPosition: string;
  from: string;
  fromPosition: string;
  subject: string;
  dateTime: string; // ISO-8601
  message: string;
  approved: string;
  approvedPosition: string;
  replyMessage?: string;
  replyDateTime?: string;
  priority: "Routine" | "Priority" | "Immediate";
}
