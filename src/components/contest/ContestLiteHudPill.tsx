import type { QsoBadge } from "@/hooks/useQsoBadge";
import { formatDeltaSince } from "@/lib/utils/time";
import { useContestUIEphemeralStore } from "@/stores/contestUIEphemeralStore";
import { useContestVoiceStore } from "@/stores/contestVoiceStore";

export interface ContestLiteHudPillProps {
  sessionId: string;
  runMode: "run" | "sp";
  lastQsoTimestamp: string | null;
  badge: QsoBadge | null;
  onOpen: () => void;
  onDismiss: () => void;
}

export function ContestLiteHudPill({
  sessionId,
  runMode,
  lastQsoTimestamp,
  badge,
  onOpen,
  onDismiss,
}: ContestLiteHudPillProps) {
  const issueVoiceCommand = useContestUIEphemeralStore(
    (s) => s.issueVoiceCommand,
  );
  const voiceStatus = useContestVoiceStore(
    (s) => s.voiceBySessionId[sessionId]?.status ?? "idle",
  );
  const isRecording = voiceStatus === "recording";

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[120] pointer-events-auto">
      <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-black/70 backdrop-blur-md border border-white/10 shadow-lg">
        <button
          type="button"
          onClick={onOpen}
          className="text-xs font-bold text-white hover:text-plasma-orange transition-colors"
          title="Open contest entry"
        >
          Contest
        </button>

        <span className="text-[10px] text-gray-400 font-mono">
          {runMode.toUpperCase()}
        </span>

        {lastQsoTimestamp && (
          <span className="text-[10px] text-gray-400">
            Last{" "}
            <span className="text-white font-mono">
              {formatDeltaSince(lastQsoTimestamp)}
            </span>
          </span>
        )}

        {badge && (
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.classes}`}
          >
            {badge.label}
          </span>
        )}

        <button
          type="button"
          onClick={() =>
            issueVoiceCommand(isRecording ? "stop" : "start", sessionId)
          }
          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors ${
            isRecording
              ? "bg-alert-red/20 text-alert-red border-alert-red/40 hover:bg-alert-red/30"
              : "bg-cosmic-cyan/15 text-cosmic-cyan border-cosmic-cyan/40 hover:bg-cosmic-cyan/20"
          }`}
          title="Toggle voice (Ctrl+Shift+.)"
        >
          {isRecording ? "Stop" : "Rec"}
        </button>

        <button
          type="button"
          onClick={onDismiss}
          className="ml-1 text-gray-400 hover:text-white transition-colors"
          title="Hide contest HUD"
          aria-label="Hide contest HUD"
        >
          <svg
            className="w-4 h-4"
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
    </div>
  );
}

export default ContestLiteHudPill;

