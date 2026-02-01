/**
 * GuestModeToggle - Header indicator showing current mode (owner vs guest)
 */

import { useGuestStore } from "@/stores/guestStore";

export interface GuestModeToggleProps {
  onCreateSession: () => void;
  onJoinSession: () => void;
}

export function GuestModeToggle({
  onCreateSession,
  onJoinSession,
}: GuestModeToggleProps) {
  const { activeSession, guestInfo, isGuestMode, endSession, exitGuestMode } =
    useGuestStore();

  // Hosting a guest session
  if (activeSession && !isGuestMode) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-signal-green/15 border border-signal-green/30">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-signal-green opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-signal-green" />
        </span>
        <span className="text-sm text-gray-300">Guest Session:</span>
        <span className="font-mono font-bold text-signal-green">
          {activeSession.shareCode}
        </span>
        <button
          onClick={() => endSession(activeSession.id)}
          className="ml-2 px-2 py-1 text-xs font-medium rounded bg-alert-red/20 text-alert-red border border-alert-red/30 hover:bg-alert-red/30 transition-colors"
        >
          End
        </button>
      </div>
    );
  }

  // In guest mode
  if (isGuestMode && guestInfo) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cosmic-cyan/15 border border-cosmic-cyan/30">
        <svg
          className="w-4 h-4 text-cosmic-cyan"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
          />
        </svg>
        <span className="text-sm text-gray-300">Guest:</span>
        <span className="font-mono font-bold text-cosmic-cyan">
          {guestInfo.callsign}
        </span>
        <button
          onClick={exitGuestMode}
          className="ml-2 px-2 py-1 text-xs font-medium rounded bg-gray-700 text-gray-300 border border-gray-600 hover:bg-gray-600 transition-colors"
        >
          Exit
        </button>
      </div>
    );
  }

  // Default - show dropdown menu
  return (
    <div className="relative group">
      <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-nebula-blue border border-white/10 text-gray-400 hover:text-gray-200 hover:border-white/20 transition-colors">
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
            d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
          />
        </svg>
        <span className="text-sm font-medium">Guest Mode</span>
        <svg
          className="w-3 h-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      <div className="absolute right-0 top-full mt-1 w-48 py-1 bg-deep-space border border-white/10 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
        <button
          onClick={onCreateSession}
          className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors flex items-center gap-2"
        >
          <svg
            className="w-4 h-4 text-plasma-orange"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Host Guest Session
        </button>
        <button
          onClick={onJoinSession}
          className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors flex items-center gap-2"
        >
          <svg
            className="w-4 h-4 text-cosmic-cyan"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"
            />
          </svg>
          Join as Guest
        </button>
      </div>
    </div>
  );
}

export default GuestModeToggle;
