import { useEffect, useMemo, useState } from "react";
import {
  readDisplayQualityEnvironment,
  resolveDisplayQuality,
  type DisplayQualityEnvironment,
  type DisplayQualitySettings,
} from "@/lib/map/displayQuality";
import type { DisplayQuality } from "@/stores/displayQualityStore";

interface NetworkInformationLike extends EventTarget {
  saveData?: boolean;
}

function environmentsMatch(
  left: DisplayQualityEnvironment,
  right: DisplayQualityEnvironment,
): boolean {
  return (
    left.cssWidth === right.cssWidth &&
    left.cssHeight === right.cssHeight &&
    left.devicePixelRatio === right.devicePixelRatio &&
    left.saveData === right.saveData
  );
}

/**
 * Resolves the selected map quality and keeps Auto synchronized with the
 * physical display and Save-Data preference while the application is open.
 */
export function useResolvedDisplayQuality(
  requested: DisplayQuality,
): DisplayQualitySettings {
  const [environment, setEnvironment] = useState<DisplayQualityEnvironment>(
    readDisplayQualityEnvironment,
  );

  useEffect(() => {
    if (requested !== "auto" || typeof window === "undefined") return;

    const connection = (
      navigator as Navigator & { connection?: NetworkInformationLike }
    ).connection;
    let resolutionQuery: MediaQueryList | null = null;

    const refresh = () => {
      const next = readDisplayQualityEnvironment();
      setEnvironment((current) =>
        environmentsMatch(current, next) ? current : next,
      );
    };
    const handleResolutionChange = () => {
      resolutionQuery?.removeEventListener("change", handleResolutionChange);
      resolutionQuery = null;
      refresh();
      armResolutionQuery();
    };
    const armResolutionQuery = () => {
      if (typeof window.matchMedia !== "function") return;
      resolutionQuery = window.matchMedia(
        `(resolution: ${window.devicePixelRatio || 1}dppx)`,
      );
      resolutionQuery.addEventListener("change", handleResolutionChange);
    };

    window.addEventListener("resize", refresh);
    window.visualViewport?.addEventListener("resize", refresh);
    connection?.addEventListener("change", refresh);
    armResolutionQuery();
    refresh();

    return () => {
      window.removeEventListener("resize", refresh);
      window.visualViewport?.removeEventListener("resize", refresh);
      connection?.removeEventListener("change", refresh);
      resolutionQuery?.removeEventListener("change", handleResolutionChange);
    };
  }, [requested]);

  return useMemo(
    () => resolveDisplayQuality(requested, environment),
    [environment, requested],
  );
}
