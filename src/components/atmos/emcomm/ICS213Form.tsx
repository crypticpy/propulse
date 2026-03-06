import { useState } from "react";
import { useEmcommStore } from "@/stores/emcommStore";
import { generateICS213Text, generateICS213Html } from "@/lib/atmos/ics213";
import { downloadBlob } from "@/lib/utils/downloadBlob";
import type { ICS213Message } from "@/types/emcomm";

const PRIORITIES: ICS213Message["priority"][] = [
  "Routine",
  "Priority",
  "Immediate",
];

interface ICS213FormProps {
  onClose: () => void;
}

export function ICS213Form({ onClose }: ICS213FormProps) {
  const activeIncident = useEmcommStore((s) => s.activeIncident);
  const addICS213 = useEmcommStore((s) => s.addICS213);

  const [to, setTo] = useState("");
  const [toPosition, setToPosition] = useState("");
  const [from, setFrom] = useState("");
  const [fromPosition, setFromPosition] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] =
    useState<ICS213Message["priority"]>("Routine");
  const [approved, setApproved] = useState("");
  const [approvedPosition, setApprovedPosition] = useState("");
  const [incidentName, setIncidentName] = useState(activeIncident?.name ?? "");
  const [dateTime] = useState(() => new Date().toISOString());

  function buildMessage(): Omit<ICS213Message, "id"> {
    return {
      incidentName,
      to,
      toPosition,
      from,
      fromPosition,
      subject,
      message,
      priority,
      approved,
      approvedPosition,
      dateTime,
    };
  }

  function isValid(): boolean {
    return (
      to.trim() !== "" &&
      from.trim() !== "" &&
      subject.trim() !== "" &&
      message.trim() !== ""
    );
  }

  function handleSave() {
    if (!isValid()) return;
    addICS213(buildMessage());
    onClose();
  }

  function handleSaveAndExportText() {
    if (!isValid()) return;
    const msg = buildMessage();
    addICS213(msg);
    const full: ICS213Message = { ...msg, id: "export" };
    const text = generateICS213Text(full);
    const filename = `ICS213-${subject.replace(/\s+/g, "-").slice(0, 30)}-${new Date().toISOString().slice(0, 10)}.txt`;
    downloadBlob(text, filename, "text/plain");
    onClose();
  }

  function handleSaveAndExportHtml() {
    if (!isValid()) return;
    const msg = buildMessage();
    addICS213(msg);
    const full: ICS213Message = { ...msg, id: "export" };
    const html = generateICS213Html(full);
    const filename = `ICS213-${subject.replace(/\s+/g, "-").slice(0, 30)}-${new Date().toISOString().slice(0, 10)}.html`;
    downloadBlob(html, filename, "text/html");
    onClose();
  }

  return (
    <div className="space-y-4">
      {/* Incident Name */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">
          Incident Name
        </label>
        <input
          type="text"
          value={incidentName}
          onChange={(e) => setIncidentName(e.target.value)}
          className="w-full rounded bg-void-black border border-white/10 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-plasma-orange/50 focus:outline-none"
          placeholder="e.g., 2026 Hurricane Response"
        />
      </div>

      {/* Date/Time + Priority row */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Date/Time</label>
          <input
            type="text"
            value={new Date(dateTime).toLocaleString()}
            readOnly
            className="w-full rounded bg-void-black border border-white/10 px-3 py-2 text-sm text-gray-300 font-mono cursor-not-allowed"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Priority</label>
          <div className="flex gap-1">
            {PRIORITIES.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                className={`flex-1 rounded px-2 py-2 text-xs font-semibold transition-colors ${
                  priority === p
                    ? p === "Immediate"
                      ? "bg-alert-red/20 text-alert-red border border-alert-red/40"
                      : p === "Priority"
                        ? "bg-caution-amber/20 text-caution-amber border border-caution-amber/40"
                        : "bg-signal-green/20 text-signal-green border border-signal-green/40"
                    : "bg-void-black border border-white/10 text-gray-400 hover:border-white/20"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* To / To Position */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">To</label>
          <input
            type="text"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-full rounded bg-void-black border border-white/10 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-plasma-orange/50 focus:outline-none"
            placeholder="Name / Callsign"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">
            To Position/Title
          </label>
          <input
            type="text"
            value={toPosition}
            onChange={(e) => setToPosition(e.target.value)}
            className="w-full rounded bg-void-black border border-white/10 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-plasma-orange/50 focus:outline-none"
            placeholder="e.g., Net Control"
          />
        </div>
      </div>

      {/* From / From Position */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">From</label>
          <input
            type="text"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-full rounded bg-void-black border border-white/10 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-plasma-orange/50 focus:outline-none"
            placeholder="Name / Callsign"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">
            From Position/Title
          </label>
          <input
            type="text"
            value={fromPosition}
            onChange={(e) => setFromPosition(e.target.value)}
            className="w-full rounded bg-void-black border border-white/10 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-plasma-orange/50 focus:outline-none"
            placeholder="e.g., Section Emergency Coordinator"
          />
        </div>
      </div>

      {/* Subject */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">Subject</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full rounded bg-void-black border border-white/10 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-plasma-orange/50 focus:outline-none"
          placeholder="Message subject"
        />
      </div>

      {/* Message body */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">Message</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={6}
          className="w-full rounded bg-void-black border border-white/10 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-plasma-orange/50 focus:outline-none resize-y"
          placeholder="Enter message content..."
        />
      </div>

      {/* Approved By / Position */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">
            Approved By
          </label>
          <input
            type="text"
            value={approved}
            onChange={(e) => setApproved(e.target.value)}
            className="w-full rounded bg-void-black border border-white/10 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-plasma-orange/50 focus:outline-none"
            placeholder="Approving official"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">
            Approved Position
          </label>
          <input
            type="text"
            value={approvedPosition}
            onChange={(e) => setApprovedPosition(e.target.value)}
            className="w-full rounded bg-void-black border border-white/10 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-plasma-orange/50 focus:outline-none"
            placeholder="Position/Title"
          />
        </div>
      </div>

      {/* Validation hint */}
      {!isValid() && (to || from || subject || message) && (
        <p className="text-xs text-caution-amber">
          To, From, Subject, and Message are required.
        </p>
      )}

      {/* Action buttons */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
        <button
          type="button"
          onClick={onClose}
          className="rounded px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!isValid()}
          className="rounded px-4 py-2 text-sm font-semibold bg-white/10 text-white hover:bg-white/15 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Save
        </button>
        <button
          type="button"
          onClick={handleSaveAndExportText}
          disabled={!isValid()}
          className="rounded px-4 py-2 text-sm font-semibold bg-plasma-orange/20 text-plasma-orange hover:bg-plasma-orange/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Save & Export TXT
        </button>
        <button
          type="button"
          onClick={handleSaveAndExportHtml}
          disabled={!isValid()}
          className="rounded px-4 py-2 text-sm font-semibold bg-nebula-blue/20 text-nebula-blue hover:bg-nebula-blue/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Save & Export HTML
        </button>
      </div>
    </div>
  );
}
