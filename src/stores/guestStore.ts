/**
 * Zustand store for guest logging session management
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { generateShareCode } from "../lib/utils/shareCode";

const MAX_SESSION_HISTORY = 10;
const DEFAULT_EXPIRY_HOURS = 24;

export interface GuestSession {
  id: string;
  shareCode: string;
  stationCallsign: string;
  createdAt: string;
  expiresAt: string;
  isActive: boolean;
  guestCallsign?: string;
  guestName?: string;
  entryCount: number;
}

export interface GuestInfo {
  callsign: string;
  name?: string;
  sessionId: string;
}

interface GuestStore {
  activeSession: GuestSession | null;
  sessionHistory: GuestSession[];
  isGuestMode: boolean;
  guestInfo: GuestInfo | null;

  createSession: (
    stationCallsign: string,
    expiryHours?: number,
  ) => GuestSession;
  endSession: (sessionId: string) => void;
  updateSessionEntryCount: (sessionId: string) => void;
  enterGuestMode: (
    session: GuestSession,
    callsign: string,
    name?: string,
  ) => void;
  exitGuestMode: () => void;
  getSessionByCode: (code: string) => GuestSession | null;
  isSessionExpired: (session: GuestSession) => boolean;
}

const GUEST_MODE_KEY = "propulse-guest-mode";

function loadGuestModeState(): {
  isGuestMode: boolean;
  guestInfo: GuestInfo | null;
} {
  try {
    const data = sessionStorage.getItem(GUEST_MODE_KEY);
    if (data) {
      return JSON.parse(data);
    }
  } catch {
    // Ignore
  }
  return { isGuestMode: false, guestInfo: null };
}

function saveGuestModeState(
  isGuestMode: boolean,
  guestInfo: GuestInfo | null,
): void {
  try {
    sessionStorage.setItem(
      GUEST_MODE_KEY,
      JSON.stringify({ isGuestMode, guestInfo }),
    );
  } catch {
    // Ignore
  }
}

function clearGuestModeState(): void {
  try {
    sessionStorage.removeItem(GUEST_MODE_KEY);
  } catch {
    // Ignore
  }
}

const initialGuestModeState = loadGuestModeState();

export const useGuestStore = create<GuestStore>()(
  persist(
    (set, get) => ({
      activeSession: null,
      sessionHistory: [],
      isGuestMode: initialGuestModeState.isGuestMode,
      guestInfo: initialGuestModeState.guestInfo,

      createSession: (stationCallsign, expiryHours = DEFAULT_EXPIRY_HOURS) => {
        const now = new Date();
        const expiresAt = new Date(
          now.getTime() + expiryHours * 60 * 60 * 1000,
        );

        const session: GuestSession = {
          id: crypto.randomUUID(),
          shareCode: generateShareCode(),
          stationCallsign: stationCallsign.toUpperCase(),
          createdAt: now.toISOString(),
          expiresAt: expiresAt.toISOString(),
          isActive: true,
          entryCount: 0,
        };

        set((state) => {
          let updatedHistory = [...state.sessionHistory];
          if (state.activeSession) {
            const endedSession = { ...state.activeSession, isActive: false };
            updatedHistory = [endedSession, ...updatedHistory];
          }
          if (updatedHistory.length > MAX_SESSION_HISTORY) {
            updatedHistory = updatedHistory.slice(0, MAX_SESSION_HISTORY);
          }
          return { activeSession: session, sessionHistory: updatedHistory };
        });

        return session;
      },

      endSession: (sessionId) => {
        set((state) => {
          if (state.activeSession?.id !== sessionId) {
            return state;
          }

          const endedSession = { ...state.activeSession, isActive: false };
          let updatedHistory = [endedSession, ...state.sessionHistory];
          if (updatedHistory.length > MAX_SESSION_HISTORY) {
            updatedHistory = updatedHistory.slice(0, MAX_SESSION_HISTORY);
          }
          return { activeSession: null, sessionHistory: updatedHistory };
        });
      },

      updateSessionEntryCount: (sessionId) => {
        set((state) => {
          if (state.activeSession?.id === sessionId) {
            return {
              activeSession: {
                ...state.activeSession,
                entryCount: state.activeSession.entryCount + 1,
              },
            };
          }
          return state;
        });
      },

      enterGuestMode: (session, callsign, name) => {
        const guestInfo: GuestInfo = {
          callsign: callsign.toUpperCase(),
          name,
          sessionId: session.id,
        };
        set({ isGuestMode: true, guestInfo });
        saveGuestModeState(true, guestInfo);
      },

      exitGuestMode: () => {
        set({ isGuestMode: false, guestInfo: null });
        clearGuestModeState();
      },

      getSessionByCode: (code) => {
        const state = get();
        const normalizedCode = code.toUpperCase().trim();
        if (state.activeSession?.shareCode === normalizedCode) {
          return state.activeSession;
        }
        return null;
      },

      isSessionExpired: (session) => {
        return new Date(session.expiresAt) < new Date();
      },
    }),
    {
      name: "propulse-guest-sessions",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        activeSession: state.activeSession,
        sessionHistory: state.sessionHistory,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          const guestModeState = loadGuestModeState();
          state.isGuestMode = guestModeState.isGuestMode;
          state.guestInfo = guestModeState.guestInfo;
        }
      },
    },
  ),
);
