/**
 * ContestVoiceControls
 *
 * UI controls for the optional voice entry pipeline.
 * The underlying recognition lifecycle is managed by ContestVoiceManager.
 */

import { useCallback, useMemo } from "react";
import { useContestUIStore } from "@/stores/contestUIStore";
import { useContestUIEphemeralStore } from "@/stores/contestUIEphemeralStore";
import { useContestVoiceStore } from "@/stores/contestVoiceStore";

export interface ContestVoiceControlsProps {
  sessionId: string;
  className?: string;
}

function formatHotkey(label: string) {
  return (
    <kbd className="px-1 py-0.5 bg-su-line/20 rounded text-xs text-su-muted">
      {label}
    </kbd>
  );
}

export function ContestVoiceControls({
  sessionId,
  className = "",
}: ContestVoiceControlsProps) {
  const voice = useContestVoiceStore((s) => s.voiceBySessionId[sessionId] ?? null);
  const resetVoiceState = useContestVoiceStore((s) => s.resetVoiceState);
  const issueVoiceCommand = useContestUIEphemeralStore((s) => s.issueVoiceCommand);
  const setDraft = useContestUIStore((s) => s.setDraft);
  const requestEntryFocus = useContestUIEphemeralStore((s) => s.requestEntryFocus);

  const status = voice?.status ?? "idle";
  const transcript = voice?.transcript ?? "";
  const interim = voice?.interimTranscript ?? "";
  const candidates = voice?.candidates ?? [];
  const error = voice?.error ?? null;

  const isUnavailable = status === "unavailable";
  const isRecording = status === "recording";
  const isBusy = status === "processing";

  const buttonLabel = useMemo(() => {
    if (isUnavailable) return "Voice N/A";
    if (isBusy) return "Processing…";
    if (isRecording) return "Stop";
    return "Record";
  }, [isBusy, isRecording, isUnavailable]);

  const handleToggle = useCallback(() => {
    if (isUnavailable || isBusy) {
      return;
    }
    issueVoiceCommand(isRecording ? "stop" : "start", sessionId);
  }, [isBusy, isRecording, isUnavailable, issueVoiceCommand, sessionId]);

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={isUnavailable || isBusy}
          onClick={handleToggle}
          className={`
            px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors
            ${
              isUnavailable
                ? "bg-su-line/10 text-su-muted border-su-line/40 cursor-not-allowed"
                : isRecording
                  ? "bg-alert-red/20 text-alert-red border-alert-red/50 hover:bg-alert-red/30"
                  : "bg-cosmic-cyan/15 text-cosmic-cyan border-cosmic-cyan/40 hover:bg-cosmic-cyan/20"
            }
          `}
          title="Voice toggle"
        >
          {buttonLabel}
        </button>

        <div className="text-xs text-su-muted flex items-center gap-1">
          <span>Hotkey</span>
          {formatHotkey("Ctrl")}
          {formatHotkey("Shift")}
          {formatHotkey(".")}
        </div>

        {error && (
          <span className="ml-auto text-xs text-alert-red">{error}</span>
        )}

        {status === "unavailable" && (
          <span className="ml-auto text-xs text-su-muted">
            Web Speech unsupported
          </span>
        )}
      </div>

      {/* Live transcript line while recording */}
      {(isRecording || isBusy) && (
        <div className="px-3 py-2 rounded-lg bg-su-line/10 border border-su-line/40 text-xs text-su-muted">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-su-muted uppercase tracking-wide">
              {isRecording ? "Listening" : "Processing"}
            </span>
            <button
              type="button"
              onClick={() => resetVoiceState(sessionId)}
              className="text-xs text-su-muted hover:text-su-text transition-colors"
              title="Clear voice state"
            >
              Clear
            </button>
          </div>
          <div className="font-mono text-xs">
            {interim || (isBusy ? "…" : "")}
          </div>
        </div>
      )}

      {/* Candidate review */}
      {status === "candidates" && (
        <div className="p-3 rounded-lg bg-su-line/10 border border-su-line/40 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-su-muted uppercase tracking-wide">
              Voice Candidates
            </span>
            <button
              type="button"
              onClick={() => resetVoiceState(sessionId)}
              className="text-xs text-su-muted hover:text-su-text transition-colors"
              title="Dismiss candidates"
            >
              Dismiss
            </button>
          </div>

          <div className="text-xs text-su-muted">
            <span className="text-su-muted">Transcript:</span>{" "}
            <span className="font-mono text-su-text">{transcript}</span>
          </div>

          <div className="space-y-1">
            {candidates.map((candidate) => (
              <div
                key={candidate}
                className="flex items-center gap-2 px-2 py-1 rounded bg-su-input border border-su-line/40"
              >
                <span className="flex-1 font-mono text-xs text-su-text">
                  {candidate}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(sessionId, candidate.toUpperCase());
                    requestEntryFocus();
                    resetVoiceState(sessionId);
                  }}
                  className="px-2 py-1 rounded text-xs font-bold bg-plasma-orange/15 text-su-text border border-plasma-orange/40 hover:bg-plasma-orange/20 transition-colors"
                  title="Apply to entry"
                >
                  Apply
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default ContestVoiceControls;
