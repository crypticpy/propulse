import { Link } from "react-router-dom";
import { Card } from "@/components/ui";
import { ContestOneLineEntry } from "@/components/contest";
import { ContestVoiceControls } from "@/components/contest/ContestVoiceControls";
import { useContestUIEphemeralStore } from "@/stores/contestUIEphemeralStore";

export interface ContestLiteHudSheetProps {
  sessionId: string;
  contestName: string | null;
  band: string;
  mode: string;
  onClose: () => void;
}

export function ContestLiteHudSheet({
  sessionId,
  contestName,
  band,
  mode,
  onClose,
}: ContestLiteHudSheetProps) {
  const requestEntryFocus = useContestUIEphemeralStore(
    (s) => s.requestEntryFocus,
  );

  return (
    <div className="fixed inset-0 z-[130] flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative w-full max-h-[70dvh] bg-deep-space/95 backdrop-blur-md border-t border-white/10 rounded-t-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-orbitron text-sm font-bold text-white truncate">
              {contestName ?? "Contest"}
            </span>
            <Link
              to="/contest"
              className="text-[10px] text-cosmic-cyan hover:text-cosmic-cyan/80 transition-colors"
              title="Open full Contest view"
            >
              Full view →
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                requestEntryFocus();
              }}
              className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-colors text-xs"
            >
              Close
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          <ContestOneLineEntry band={band} mode={mode} />
          <ContestVoiceControls sessionId={sessionId} />

          <Card className="p-3">
            <div className="text-[11px] text-gray-400">
              Focus entry: <span className="font-mono text-white">Alt+E</span> •
              Voice toggle:{" "}
              <span className="font-mono text-white">Ctrl+Shift+.</span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default ContestLiteHudSheet;

