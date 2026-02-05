/**
 * ContestVoiceManager
 *
 * A non-visual, route-persistent manager for the (optional) voice entry pipeline.
 *
 * Responsibilities:
 * - Own the Web Speech recognition instance
 * - Respond to UI-issued start/stop commands via contestUIStore
 * - Update voice state and publish events
 * - Provide global hotkey for push-to-talk (toggle)
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useContestStore } from "@/stores/contestStore";
import { useContestUIEphemeralStore } from "@/stores/contestUIEphemeralStore";
import { useContestVoiceStore } from "@/stores/contestVoiceStore";
import { contestEventBus } from "@/lib/services/contestEventBus";
import {
  getSpeechRecognitionCtor,
  transcriptToOneLineCandidates,
  type SpeechRecognitionErrorEventLike,
  type SpeechRecognitionEventLike,
  type SpeechRecognitionLike,
} from "@/lib/contest/voice";

export function ContestVoiceManager() {
  const activeSessionId = useContestStore((s) => s.activeSession?.id ?? null);
  const voiceCommand = useContestUIEphemeralStore((s) => s.voiceCommand);
  const clearVoiceCommand = useContestUIEphemeralStore(
    (s) => s.clearVoiceCommand,
  );
  const issueVoiceCommand = useContestUIEphemeralStore(
    (s) => s.issueVoiceCommand,
  );
  const setVoiceState = useContestVoiceStore((s) => s.setVoiceState);
  const resetVoiceState = useContestVoiceStore((s) => s.resetVoiceState);

  const speechCtor = useMemo(() => getSpeechRecognitionCtor(), []);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalTranscriptRef = useRef<string>("");

  // Advertise availability for the current session
  useEffect(() => {
    if (!activeSessionId) {
      return;
    }
    if (!speechCtor) {
      setVoiceState(activeSessionId, {
        status: "unavailable",
        error: "Voice transcription unavailable in this browser.",
      });
      return;
    }
    // If we previously marked unavailable, reset to idle when ctor becomes available.
    const state =
      useContestVoiceStore.getState().voiceBySessionId[activeSessionId];
    if (state?.status === "unavailable") {
      resetVoiceState(activeSessionId);
    }
  }, [activeSessionId, resetVoiceState, setVoiceState, speechCtor]);

  const cleanupRecognition = useCallback(() => {
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    finalTranscriptRef.current = "";
    try {
      rec?.abort();
    } catch {
      // ignore
    }
  }, []);

  const stopRecognition = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    try {
      rec.stop();
    } catch {
      cleanupRecognition();
    }
  }, [cleanupRecognition]);

  const startRecognition = useCallback((sessionId: string) => {
    if (!speechCtor) {
      setVoiceState(sessionId, {
        status: "unavailable",
        error: "Voice transcription unavailable in this browser.",
        transcript: "",
        interimTranscript: "",
        candidates: [],
      });
      return;
    }

    // Stop any prior recording
    if (recognitionRef.current) {
      stopRecognition();
      cleanupRecognition();
    }

    finalTranscriptRef.current = "";

    const rec: SpeechRecognitionLike = new speechCtor();
    recognitionRef.current = rec;

    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "en-US";

    rec.onstart = () => {
      setVoiceState(sessionId, {
        status: "recording",
        transcript: "",
        interimTranscript: "",
        candidates: [],
        error: null,
      });
    };

    rec.onerror = (event: SpeechRecognitionErrorEventLike) => {
      const message =
        typeof event?.error === "string"
          ? `Voice error: ${event.error}`
          : "Voice error";
      setVoiceState(sessionId, { status: "error", error: message });
      contestEventBus.emit({
        type: "VOICE_ERROR",
        sessionId,
        message,
        ts: new Date().toISOString(),
      });
      cleanupRecognition();
    };

    rec.onresult = (event: SpeechRecognitionEventLike) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result?.[0]?.transcript ?? "";
        if (result.isFinal) {
          finalTranscriptRef.current += transcript;
        } else {
          interim += transcript;
        }
      }

      setVoiceState(sessionId, {
        interimTranscript: interim.trim(),
      });
    };

    rec.onend = () => {
      const transcript = `${finalTranscriptRef.current}`.trim();

      // If stop() was invoked, we expect onend. Either way, transition to candidates.
      if (!transcript) {
        setVoiceState(sessionId, {
          status: "idle",
          transcript: "",
          interimTranscript: "",
          candidates: [],
          error: null,
        });
        cleanupRecognition();
        return;
      }

      const candidates = transcriptToOneLineCandidates(transcript);
      setVoiceState(sessionId, {
        status: "candidates",
        transcript,
        interimTranscript: "",
        candidates,
        error: null,
      });
      contestEventBus.emit({
        type: "VOICE_CANDIDATES_READY",
        sessionId,
        transcript,
        candidates,
        ts: new Date().toISOString(),
      });
      cleanupRecognition();
    };

    try {
      setVoiceState(sessionId, { status: "processing" });
      rec.start();
    } catch {
      setVoiceState(sessionId, {
        status: "error",
        error: "Failed to start voice transcription.",
      });
      cleanupRecognition();
    }
  }, [cleanupRecognition, setVoiceState, speechCtor, stopRecognition]);

  // UI-issued start/stop commands
  useEffect(() => {
    if (!voiceCommand) {
      return;
    }
    // Always clear the command (one-shot)
    clearVoiceCommand();

    if (!voiceCommand.sessionId) {
      return;
    }

    if (voiceCommand.action === "start") {
      startRecognition(voiceCommand.sessionId);
      return;
    }

    if (voiceCommand.action === "stop") {
      const sessionId = voiceCommand.sessionId;
      setVoiceState(sessionId, { status: "processing", interimTranscript: "" });
      stopRecognition();
      return;
    }
  }, [
    clearVoiceCommand,
    setVoiceState,
    startRecognition,
    stopRecognition,
    voiceCommand,
  ]);

  // Global hotkey: Ctrl+Shift+. toggles recording
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!activeSessionId) {
        return;
      }

      if (event.ctrlKey && event.shiftKey && event.key === ".") {
        event.preventDefault();
        const voice =
          useContestVoiceStore.getState().voiceBySessionId[activeSessionId];
        const status = voice?.status ?? "idle";
        if (status === "recording" || status === "processing") {
          issueVoiceCommand("stop", activeSessionId);
        } else {
          issueVoiceCommand("start", activeSessionId);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeSessionId, issueVoiceCommand]);

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanupRecognition();
  }, [cleanupRecognition]);

  return null;
}
