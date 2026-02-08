import { useEffect, useRef } from "react";

type AudioFrame = { sampleRate: number; samples: Int16Array };

export function useAudioStreamPlayer(enabled: boolean, frame: AudioFrame | null) {
  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const nextTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) {
      if (ctxRef.current) {
        ctxRef.current.close().catch(() => undefined);
      }
      ctxRef.current = null;
      gainRef.current = null;
      nextTimeRef.current = 0;
      return;
    }

    if (!ctxRef.current) {
      const ctx = new AudioContext();
      const gain = ctx.createGain();
      gain.gain.value = 0.8;
      gain.connect(ctx.destination);
      ctxRef.current = ctx;
      gainRef.current = gain;
      nextTimeRef.current = ctx.currentTime;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const ctx = ctxRef.current;
    const gain = gainRef.current;
    if (!ctx || !gain || !frame) return;

    // Ensure audio context is running (autoplay policies may suspend it until user gesture).
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => undefined);
    }

    // Convert PCM i16 -> float32
    const float = new Float32Array(frame.samples.length);
    for (let i = 0; i < frame.samples.length; i++) {
      float[i] = frame.samples[i] / 32768;
    }

    const buf = ctx.createBuffer(1, float.length, frame.sampleRate);
    buf.copyToChannel(float, 0);

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(gain);

    const now = ctx.currentTime;
    const startAt = Math.max(now, nextTimeRef.current);
    src.start(startAt);
    nextTimeRef.current = startAt + buf.duration;
  }, [enabled, frame]);
}

