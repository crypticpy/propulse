import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useDisplayStore } from "@/stores/displayStore";
import { useWakeLock } from "@/hooks/useWakeLock";

/**
 * DisplayViewPage — /display/:id
 *
 * Thin holding screen for a device that has been claimed but has no scene
 * config yet (or is momentarily between renders). useDisplaySync, running
 * once in Layout, is what actually flips this device into kiosk mode and
 * navigates away — this page is only ever visible while unassigned.
 */
export function DisplayViewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const displayId = useDisplayStore((s) => s.displayId);
  const pairedName = useDisplayStore((s) => s.pairedName);
  const setSyncActive = useDisplayStore((s) => s.setSyncActive);

  useWakeLock(true);

  useEffect(() => {
    if (!displayId || displayId !== id) {
      navigate("/display/pair", { replace: true });
      return;
    }
    setSyncActive(true);
  }, [displayId, id, navigate, setSyncActive]);

  const [utc, setUtc] = useState(() => formatUtc(new Date()));
  useEffect(() => {
    const timer = setInterval(() => setUtc(formatUtc(new Date())), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!displayId || displayId !== id) return null;

  return (
    <div className="fixed inset-0 bg-void-black flex flex-col items-center justify-center gap-4 select-none">
      <div className="font-mono text-3xl text-gray-500 tabular-nums tracking-widest">
        {utc} UTC
      </div>
      <div className="font-orbitron text-2xl text-white">
        {pairedName ?? "Display"}
      </div>
      <p className="text-gray-500 font-mono text-sm tracking-wide">
        Paired — waiting for a scene…
      </p>
    </div>
  );
}

function formatUtc(date: Date): string {
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
}
