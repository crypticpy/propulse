import { useEffect, useState } from "react";
import {
  getFlatMapDiagnosticsSnapshot,
  type FlatMapDiagnosticsSnapshot,
} from "@/lib/map/flatMapDiagnostics";

/**
 * Opt-in development HUD for retained-surface invalidations and tile bounds.
 * Enable it with `window.__propulseFlatMapDiagnostics.setTileBounds(true)`.
 * The production build removes the mount site entirely.
 */
export function FlatMapDiagnosticsOverlay() {
  const [snapshot, setSnapshot] = useState<FlatMapDiagnosticsSnapshot>(() =>
    getFlatMapDiagnosticsSnapshot(),
  );

  useEffect(() => {
    const timer = window.setInterval(
      () => setSnapshot(getFlatMapDiagnosticsSnapshot()),
      500,
    );
    return () => window.clearInterval(timer);
  }, []);

  if (!snapshot.debugTileBounds) return null;

  const tiles = snapshot.tiles;
  return (
    <div
      style={{
        position: "absolute",
        right: 8,
        top: 8,
        zIndex: 30,
        pointerEvents: "none",
        borderRadius: 4,
        border: "1px solid rgba(103, 232, 249, 0.6)",
        background: "rgba(0, 0, 0, 0.85)",
        padding: "4px 8px",
        color: "rgb(207, 250, 254)",
        fontFamily: "monospace",
        fontSize: 9,
        lineHeight: "16px",
      }}
    >
      <div>
        PAINT base:{snapshot.paints.base} sci:{snapshot.paints.science} live:
        {snapshot.paints.live} fx:{snapshot.paints.effects}
      </div>
      {tiles && (
        <div>
          z{tiles.zoom} vis {tiles.visible.xStart}-{tiles.visible.xEnd}/
          {tiles.visible.yStart}-{tiles.visible.yEnd} req {tiles.requested.xStart}-
          {tiles.requested.xEnd}/{tiles.requested.yStart}-
          {tiles.requested.yEnd} {tiles.navigationActive ? "MOVING" : "IDLE"}
        </div>
      )}
    </div>
  );
}
