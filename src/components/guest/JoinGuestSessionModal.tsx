/**
 * JoinGuestSessionModal - Modal for guests to join a session
 */

import { useState, useCallback, useEffect } from "react";
import { Card } from "@/components/ui";
import { useGuestStore } from "@/stores/guestStore";
import {
  isValidShareCode,
  checkRateLimit,
  recordFailedAttempt,
  resetRateLimit,
} from "@/lib/utils/shareCode";
import { ShareCodeInput } from "./ShareCodeInput";

export interface JoinGuestSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function JoinGuestSessionModal({
  isOpen,
  onClose,
}: JoinGuestSessionModalProps) {
  const { getSessionByCode, enterGuestMode, isSessionExpired } =
    useGuestStore();

  const [shareCode, setShareCode] = useState("");
  const [callsign, setCallsign] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [lockoutTime, setLockoutTime] = useState<number | null>(null);

  // Check rate limit on mount and when modal opens
  useEffect(() => {
    if (isOpen) {
      const rateLimit = checkRateLimit();
      if (!rateLimit.allowed && rateLimit.lockedUntil) {
        setIsLocked(true);
        setLockoutTime(rateLimit.lockedUntil);
      } else {
        setIsLocked(false);
        setLockoutTime(null);
      }
    }
  }, [isOpen]);

  // Update lockout countdown
  useEffect(() => {
    if (!lockoutTime) return;

    const interval = setInterval(() => {
      const remaining = lockoutTime - Date.now();
      if (remaining <= 0) {
        setIsLocked(false);
        setLockoutTime(null);
        resetRateLimit();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [lockoutTime]);

  const handleCallsignChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setCallsign(e.target.value.toUpperCase());
      setError(null);
    },
    [],
  );

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setName(e.target.value);
    },
    [],
  );

  const handleShareCodeChange = useCallback((value: string) => {
    setShareCode(value);
    setError(null);
  }, []);

  const handleJoin = useCallback(() => {
    // Validate rate limit
    const rateLimit = checkRateLimit();
    if (!rateLimit.allowed) {
      setIsLocked(true);
      setLockoutTime(rateLimit.lockedUntil || null);
      setError("Too many attempts. Please try again later.");
      return;
    }

    // Validate callsign
    if (!callsign.trim()) {
      setError("Please enter your callsign");
      return;
    }

    // Basic callsign format validation
    if (!/^[A-Z0-9]{3,10}$/.test(callsign.trim())) {
      setError("Please enter a valid callsign");
      return;
    }

    // Validate share code format
    if (!isValidShareCode(shareCode)) {
      setError("Invalid share code format");
      recordFailedAttempt();
      return;
    }

    // Look up session
    const session = getSessionByCode(shareCode);
    if (!session) {
      setError("Session not found. Check your code and try again.");
      recordFailedAttempt();
      return;
    }

    // Check if session is expired
    if (isSessionExpired(session)) {
      setError("This session has expired.");
      recordFailedAttempt();
      return;
    }

    // Check if session is active
    if (!session.isActive) {
      setError("This session has ended.");
      recordFailedAttempt();
      return;
    }

    // Success! Reset rate limit and enter guest mode
    resetRateLimit();
    enterGuestMode(session, callsign.trim(), name.trim() || undefined);
    onClose();
  }, [
    shareCode,
    callsign,
    name,
    getSessionByCode,
    isSessionExpired,
    enterGuestMode,
    onClose,
  ]);

  const handleClose = useCallback(() => {
    setShareCode("");
    setCallsign("");
    setName("");
    setError(null);
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  const getLockoutMessage = () => {
    if (!lockoutTime) return "";
    const remaining = Math.ceil((lockoutTime - Date.now()) / 1000);
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    return `Locked out. Try again in ${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const isFormValid = callsign.trim().length >= 3 && shareCode.length === 7;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <Card className="relative z-10 w-full max-w-md p-6" animate>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-orbitron text-xl font-bold text-gradient-cyan">
            Join as Guest
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

        {/* Share Code Input */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Share Code
          </label>
          <ShareCodeInput
            value={shareCode}
            onChange={handleShareCodeChange}
            error={
              error && error.includes("code")
                ? error
                : error && error.includes("Session")
                  ? error
                  : null
            }
            disabled={isLocked}
          />
        </div>

        {/* Callsign Input */}
        <div className="mb-4">
          <label
            htmlFor="guest-callsign"
            className="block text-sm font-medium text-gray-300 mb-2"
          >
            Your Callsign <span className="text-alert-red">*</span>
          </label>
          <input
            type="text"
            id="guest-callsign"
            value={callsign}
            onChange={handleCallsignChange}
            placeholder="N5XXX"
            maxLength={10}
            disabled={isLocked}
            className={`
              w-full px-3 py-2 bg-deep-space border rounded-lg
              text-white placeholder-gray-500 font-mono uppercase
              focus:outline-none focus:ring-2 focus:ring-offset-0
              disabled:opacity-50 disabled:cursor-not-allowed
              ${
                error && error.includes("callsign")
                  ? "border-alert-red/50 focus:border-alert-red focus:ring-alert-red/30"
                  : "border-white/10 focus:border-cosmic-cyan/50 focus:ring-cosmic-cyan/30"
              }
            `}
          />
          {error && error.includes("callsign") && (
            <p className="mt-1 text-sm text-alert-red">{error}</p>
          )}
        </div>

        {/* Name Input (Optional) */}
        <div className="mb-6">
          <label
            htmlFor="guest-name"
            className="block text-sm font-medium text-gray-300 mb-2"
          >
            Your Name{" "}
            <span className="text-gray-500 font-normal">(optional)</span>
          </label>
          <input
            type="text"
            id="guest-name"
            value={name}
            onChange={handleNameChange}
            placeholder="John"
            maxLength={50}
            disabled={isLocked}
            className="w-full px-3 py-2 bg-deep-space border border-white/10 rounded-lg
                       text-white placeholder-gray-500
                       focus:outline-none focus:ring-2 focus:ring-offset-0
                       focus:border-cosmic-cyan/50 focus:ring-cosmic-cyan/30
                       disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>

        {/* Error Display (general errors) */}
        {error &&
          !error.includes("callsign") &&
          !error.includes("code") &&
          !error.includes("Session") && (
            <div className="mb-4 p-3 bg-alert-red/10 border border-alert-red/30 rounded-lg">
              <p className="text-sm text-alert-red">{error}</p>
            </div>
          )}

        {/* Lockout Message */}
        {isLocked && (
          <div className="mb-4 p-3 bg-alert-red/10 border border-alert-red/30 rounded-lg">
            <p className="text-sm text-alert-red">{getLockoutMessage()}</p>
          </div>
        )}

        {/* Join Button */}
        <button
          onClick={handleJoin}
          disabled={!isFormValid || isLocked}
          className="w-full px-4 py-3 bg-cosmic-cyan/20 border border-cosmic-cyan/50 rounded-lg
                     text-cosmic-cyan hover:bg-cosmic-cyan/30
                     transition-colors font-medium text-lg
                     disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-cosmic-cyan/20"
        >
          Join Session
        </button>

        {/* Info Text */}
        <p className="mt-4 text-sm text-gray-500 text-center">
          Get the share code from the station owner to log contacts on their
          behalf.
        </p>
      </Card>
    </div>
  );
}

export default JoinGuestSessionModal;
