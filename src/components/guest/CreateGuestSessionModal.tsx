/**
 * CreateGuestSessionModal - Modal for station owner to create a guest session
 */

import { useState, useCallback } from "react";
import { Card } from "@/components/ui";
import { useGuestStore } from "@/stores/guestStore";
import { useUserStore } from "@/stores/userStore";
import { QRCodeDisplay } from "./QRCodeDisplay";

export interface CreateGuestSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Duration = 1 | 4 | 24;

const DURATION_OPTIONS: { value: Duration; label: string }[] = [
  { value: 1, label: "1 hour" },
  { value: 4, label: "4 hours" },
  { value: 24, label: "24 hours" },
];

export function CreateGuestSessionModal({
  isOpen,
  onClose,
}: CreateGuestSessionModalProps) {
  const { activeSession, createSession, endSession } = useGuestStore();
  const { station } = useUserStore();

  const [duration, setDuration] = useState<Duration>(4);
  const [copied, setCopied] = useState(false);

  const stationCallsign = station?.callsign || "UNKNOWN";

  const handleGenerateCode = useCallback(() => {
    createSession(stationCallsign, duration);
  }, [createSession, stationCallsign, duration]);

  const handleCopyCode = useCallback(async () => {
    if (!activeSession) return;

    try {
      await navigator.clipboard.writeText(activeSession.shareCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for browsers without clipboard API
      const textArea = document.createElement("textarea");
      textArea.value = activeSession.shareCode;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [activeSession]);

  const handleEndSession = useCallback(() => {
    if (activeSession) {
      endSession(activeSession.id);
    }
  }, [activeSession, endSession]);

  const handleClose = useCallback(() => {
    setCopied(false);
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  const hasActiveSession = !!activeSession;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <Card
        className="relative z-10 w-full max-w-md p-6 max-h-[calc(100dvh-2rem)] overflow-y-auto"
        animate
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-orbitron text-xl font-bold text-gradient-orange">
            Host Guest Session
          </h2>
          <button
            onClick={handleClose}
            className="p-1 text-gray-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <svg
              className="w-6 h-6"
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

        {!hasActiveSession ? (
          <>
            {/* Station Info */}
            <div className="mb-6 p-3 bg-nebula-blue rounded-lg border border-white/10">
              <p className="text-sm text-gray-400">Station</p>
              <p className="font-mono font-bold text-white">
                {stationCallsign}
              </p>
            </div>

            {/* Duration Selector */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Session Duration
              </label>
              <div className="flex gap-2">
                {DURATION_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setDuration(opt.value)}
                    className={`
                      flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                      ${
                        duration === opt.value
                          ? "bg-plasma-orange/20 text-plasma-orange border border-plasma-orange/50"
                          : "bg-nebula-blue text-gray-300 border border-white/10 hover:border-white/20"
                      }
                    `}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Generate Button */}
            <button
              onClick={handleGenerateCode}
              className="w-full px-4 py-3 bg-plasma-orange/20 border border-plasma-orange/50 rounded-lg
                         text-plasma-orange hover:bg-plasma-orange/30
                         transition-colors font-medium text-lg"
            >
              Generate Share Code
            </button>

            {/* Info Text */}
            <p className="mt-4 text-sm text-gray-500 text-center">
              Share the code with guests to allow them to log contacts on your
              behalf.
            </p>
          </>
        ) : (
          <>
            {/* Active Session Display */}
            <div className="flex flex-col items-center mb-6">
              <QRCodeDisplay
                code={activeSession.shareCode}
                stationCallsign={stationCallsign}
                size={180}
              />
            </div>

            {/* Session Info */}
            <div className="mb-4 p-3 bg-nebula-blue rounded-lg border border-white/10 space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-400">Station</span>
                <span className="font-mono font-medium text-white">
                  {stationCallsign}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-400">Expires</span>
                <span className="text-sm text-gray-300">
                  {new Date(activeSession.expiresAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-400">Entries</span>
                <span className="text-sm text-gray-300">
                  {activeSession.entryCount}
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleCopyCode}
                className={`
                  flex-1 px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2
                  ${
                    copied
                      ? "bg-signal-green/20 text-signal-green border border-signal-green/50"
                      : "bg-nebula-blue text-gray-300 border border-white/10 hover:border-white/20"
                  }
                `}
              >
                {copied ? (
                  <>
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
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    Copied!
                  </>
                ) : (
                  <>
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
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                    Copy Code
                  </>
                )}
              </button>
              <button
                onClick={handleEndSession}
                className="flex-1 px-4 py-2 bg-alert-red/20 border border-alert-red/50 rounded-lg
                           text-alert-red hover:bg-alert-red/30
                           transition-colors font-medium"
              >
                End Session
              </button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

export default CreateGuestSessionModal;
