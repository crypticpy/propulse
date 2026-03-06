/**
 * Activation log export -- generates a plain text report from the full
 * activation record (incident metadata, SitReps, ICS-213 messages).
 */

import type {
  EmCommIncident,
  SitRepEntry,
  ICS213Message,
} from "@/types/emcomm";
import { downloadBlob } from "@/lib/utils/downloadBlob";

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function formatISO(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}Z`;
  } catch {
    return iso;
  }
}

function line(char: string, len: number): string {
  return char.repeat(len);
}

/**
 * Export the full activation log as a downloadable plain text file.
 */
export function exportActivationLog(
  incident: EmCommIncident,
  sitReps: SitRepEntry[],
  messages: ICS213Message[],
): void {
  const parts: string[] = [];

  // ── Header ──────────────────────────────────────────────────────────────
  parts.push(line("=", 60));
  parts.push("EMCOMM ACTIVATION LOG");
  parts.push(line("=", 60));
  parts.push("");
  parts.push(`Incident:  ${incident.name}`);
  parts.push(`Level:     ${incident.level.toUpperCase()}`);
  parts.push(`Started:   ${formatISO(incident.startedAt)}`);
  if (incident.endedAt) {
    parts.push(`Ended:     ${formatISO(incident.endedAt)}`);
  } else {
    parts.push(`Ended:     (still active)`);
  }
  if (incident.notes) {
    parts.push(`Notes:     ${incident.notes}`);
  }
  if (incident.pinnedAlertIds.length > 0) {
    parts.push(`Pinned Alerts: ${incident.pinnedAlertIds.join(", ")}`);
  }
  parts.push("");

  // ── SitRep Entries ──────────────────────────────────────────────────────
  parts.push(line("-", 60));
  parts.push("SITUATION REPORTS");
  parts.push(line("-", 60));
  parts.push("");

  if (sitReps.length === 0) {
    parts.push("  (no situation reports filed)");
    parts.push("");
  } else {
    // Chronological order
    const sorted = [...sitReps].sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
    for (const entry of sorted) {
      parts.push(`[${formatISO(entry.timestamp)}] ${entry.author}`);
      parts.push(`  Summary:    ${entry.summary}`);
      if (entry.conditions) {
        parts.push(`  Conditions: ${entry.conditions}`);
      }
      if (entry.netActivity) {
        parts.push(`  Net:        ${entry.netActivity}`);
      }
      if (entry.nextActions) {
        parts.push(`  Next:       ${entry.nextActions}`);
      }
      parts.push("");
    }
  }

  // ── ICS-213 Messages ────────────────────────────────────────────────────
  parts.push(line("-", 60));
  parts.push("ICS-213 GENERAL MESSAGES");
  parts.push(line("-", 60));
  parts.push("");

  if (messages.length === 0) {
    parts.push("  (no ICS-213 messages)");
    parts.push("");
  } else {
    const sortedMsgs = [...messages].sort(
      (a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime(),
    );
    for (const msg of sortedMsgs) {
      parts.push(`[${formatISO(msg.dateTime)}] ${msg.priority}`);
      parts.push(`  Subject:  ${msg.subject}`);
      parts.push(`  From:     ${msg.from} (${msg.fromPosition})`);
      parts.push(`  To:       ${msg.to} (${msg.toPosition})`);
      parts.push(`  Message:  ${msg.message}`);
      if (msg.approved) {
        parts.push(`  Approved: ${msg.approved} (${msg.approvedPosition})`);
      }
      if (msg.replyMessage) {
        parts.push(`  Reply:    ${msg.replyMessage}`);
        if (msg.replyDateTime) {
          parts.push(`  Reply At: ${formatISO(msg.replyDateTime)}`);
        }
      }
      parts.push("");
    }
  }

  // ── Footer ──────────────────────────────────────────────────────────────
  parts.push(line("=", 60));
  parts.push(`Generated: ${formatISO(new Date().toISOString())}`);
  parts.push("Propulse EmComm Suite");
  parts.push(line("=", 60));

  const text = parts.join("\n");
  const safeName = incident.name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
  const filename = `emcomm-log-${safeName}-${Date.now()}.txt`;

  downloadBlob(text, filename, "text/plain");
}
