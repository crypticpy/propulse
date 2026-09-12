/**
 * ManagerRoster -- Add/remove net managers with role badges.
 *
 * Only the net owner sees the add-manager form and remove buttons.
 * Each manager row displays callsign (or truncated userId), role badge,
 * and an inline confirm before removal.
 */

import { useState, useCallback } from "react";
import type { NetManager, NetManagerRole } from "@/types/net";

// ── Props ────────────────────────────────────────────────────────────────────

export interface ManagerRosterProps {
  netId: string;
  managers: NetManager[];
  /** true when the authenticated user created this net */
  isOwner: boolean;
  onAddManager: (callsign: string, role: NetManagerRole) => void;
  onRemoveManager: (userId: string) => void;
}

// ── Role styling ─────────────────────────────────────────────────────────────

const ROLE_STYLES: Record<NetManagerRole, string> = {
  owner: "bg-amber-500/20 text-amber-400",
  manager: "bg-blue-500/20 text-blue-400",
  ncs: "bg-emerald-500/20 text-emerald-400",
};

// ── Component ────────────────────────────────────────────────────────────────

export function ManagerRoster({
  managers,
  isOwner,
  onAddManager,
  onRemoveManager,
}: ManagerRosterProps) {
  // Add-manager form state
  const [callsign, setCallsign] = useState("");
  const [role, setRole] = useState<"manager" | "ncs">("manager");
  const [validationMsg, setValidationMsg] = useState("");

  // Inline-confirm state: userId being confirmed for removal
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleAdd = useCallback(() => {
    const trimmed = callsign.trim().toUpperCase();
    if (!trimmed) {
      setValidationMsg("Enter a callsign");
      return;
    }
    setValidationMsg("");
    onAddManager(trimmed, role);
    setCallsign("");
  }, [callsign, role, onAddManager]);

  const handleConfirmRemove = useCallback(
    (userId: string) => {
      onRemoveManager(userId);
      setConfirmingId(null);
    },
    [onRemoveManager],
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="bg-panel/30 border border-su-line/20 rounded-2xl p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-xs uppercase tracking-widest text-su-muted">
          Net Managers
        </h3>
        <span className="text-xs tabular-nums text-su-muted bg-su-line/10 rounded-full px-1.5 py-0.5">
          {managers.length}
        </span>
      </div>

      {/* Manager list */}
      <div>
        {managers.length === 0 ? (
          <p className="text-sm text-su-muted italic">
            No managers assigned yet.
          </p>
        ) : (
          managers.map((m) => {
            const isOwnerRow = m.role === "owner";
            const isSelf = false; // owner can't remove themselves via this UI
            const canRemove = isOwner && !isOwnerRow && !isSelf;

            return (
              <div
                key={`${m.netId}-${m.userId}`}
                className="flex items-center gap-3 py-2 border-b border-su-line/20 last:border-0"
              >
                {/* Callsign */}
                <span className="font-mono text-sm text-su-text flex-1 truncate">
                  {m.callsign || m.userId.slice(0, 8)}
                </span>

                {/* Role badge */}
                <span
                  className={`text-xs font-medium uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${ROLE_STYLES[m.role]}`}
                >
                  {m.role}
                </span>

                {/* Remove / confirm */}
                {canRemove && (
                  <>
                    {confirmingId === m.userId ? (
                      <span className="flex items-center gap-1 shrink-0">
                        <span className="text-xs text-su-muted">
                          Remove?
                        </span>
                        <button
                          type="button"
                          onClick={() => handleConfirmRemove(m.userId)}
                          className="text-xs text-red-400 hover:text-red-300 font-medium"
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingId(null)}
                          className="text-xs text-su-muted hover:text-su-text font-medium"
                        >
                          No
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmingId(m.userId)}
                        className="text-su-muted hover:text-red-400 transition-colors shrink-0"
                        aria-label={`Remove ${m.callsign || m.userId}`}
                      >
                        <svg
                          className="w-3.5 h-3.5"
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
                    )}
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Add manager form (owner only) */}
      {isOwner && (
        <div className="mt-4 pt-3 border-t border-su-line/20 space-y-2">
          <div className="flex gap-2">
            {/* Callsign input */}
            <input
              type="text"
              value={callsign}
              onChange={(e) => {
                setCallsign(e.target.value.toUpperCase());
                if (validationMsg) setValidationMsg("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
              }}
              placeholder="Callsign"
              className="flex-1 min-w-0 bg-void/50 border border-su-line/40 rounded-lg px-3 py-1.5 text-sm font-mono text-su-text placeholder:text-su-muted focus:outline-none focus:border-plasma-orange/50"
            />

            {/* Role dropdown */}
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "manager" | "ncs")}
              className="bg-void/50 border border-su-line/40 rounded-lg px-2 py-1.5 text-sm text-su-muted focus:outline-none focus:border-plasma-orange/50 appearance-none cursor-pointer"
            >
              <option value="manager">Manager</option>
              <option value="ncs">NCS</option>
            </select>

            {/* Add button */}
            <button
              type="button"
              onClick={handleAdd}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-plasma-orange/15 text-su-text border border-plasma-orange/30 hover:bg-plasma-orange/20 transition-colors shrink-0"
            >
              Add
            </button>
          </div>

          {/* Validation message */}
          {validationMsg && (
            <p className="text-xs text-red-400">{validationMsg}</p>
          )}
        </div>
      )}
    </div>
  );
}
