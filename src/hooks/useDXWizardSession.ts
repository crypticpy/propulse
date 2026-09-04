/**
 * useDXWizardSession — shared state + recommendation pipeline for desktop
 * and mobile DX Wizard surfaces.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { latLonToGrid } from "@/lib/utils/grid";
import { useKIndex, useSolarFlux } from "@/hooks/useSolarData";
import {
  useActiveRadio,
  useUserStore,
  useUserRadios,
} from "@/stores/userStore";
import { useMapStore } from "@/stores/mapStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { RADIO_DATABASE } from "@/lib/data/radios";
import type { ITURegion, LicenseClass } from "@/types/bandplan";
import type { RadioEquipment } from "@/types/radio";
import { getCredential, isUnlocked } from "@/lib/db/credentialStore";
import {
  WIZARD_MODES,
  type ResolvedTarget,
  type WizardMode,
  type WizardPathMode,
  buildWizardRecommendation,
  resolveAntennaGainDbi,
  resolveTargetQuery,
  resolveCallsignTarget,
  targetFromMapLocation,
  parseWizardDeepLink,
  buildWizardSearchParams,
  bandPlannerHrefForTarget,
  computeNextWindow,
  buildPathSummary,
  getModeTips,
  clampCeilingToKit,
  snrMarginDb,
} from "@/lib/dxwizard";

const DEFAULT_KP = 3;
const DEFAULT_SFI = 100;

function getRadioLabel(radio: RadioEquipment, nickname?: string) {
  const base =
    radio.displayName?.trim() || `${radio.manufacturer} ${radio.model}`;
  return nickname?.trim() ? `${nickname} — ${base}` : base;
}

export function useDXWizardSession() {
  const station = useUserStore((s) => s.station);
  const preferences = useUserStore((s) => s.preferences);
  const activeUserRadio = useUserStore((s) => {
    const id = s.preferences.activeRadioId;
    if (!id) return null;
    return (s.preferences.radios || []).find((r) => r.id === id) ?? null;
  });
  const userRadios = useUserRadios();
  const activeRadio = useActiveRadio();
  const customRadios = useUserStore((s) => s.preferences.customRadios || []);
  const radioInstances = useUserStore((s) => s.preferences.radios || []);
  const antennaType = useUserStore(
    (s) => s.preferences.antennaType ?? "isotropic",
  );
  const noiseEnvironment = useSettingsStore((s) => s.noiseEnvironment);

  const mapTarget = useMapStore((s) => s.target);
  const recentTargets = useMapStore((s) => s.recentTargets);

  const [searchParams, setSearchParams] = useSearchParams();

  const [targetQuery, setTargetQuery] = useState("");
  const [targetError, setTargetError] = useState<string | null>(null);
  const [targetResolving, setTargetResolving] = useState(false);
  const [target, setTarget] = useState<ResolvedTarget | null>(null);

  const [callsignInput, setCallsignInput] = useState("");
  const [callsignLoading, setCallsignLoading] = useState(false);
  const [callsignError, setCallsignError] = useState<string | null>(null);

  const [showRecentDropdown, setShowRecentDropdown] = useState(false);
  const recentDropdownRef = useRef<HTMLDivElement>(null);

  const [mode, setMode] = useState<WizardMode>("FT8");
  const [pathMode, setPathMode] = useState<WizardPathMode>("short");
  const [licenseClass, setLicenseClass] = useState<LicenseClass>(
    (preferences.licenseClass ?? "GENERAL") as LicenseClass,
  );
  const [ituRegion, setItuRegion] = useState<ITURegion>(
    (preferences.ituRegion ?? "ITU2") as ITURegion,
  );

  const [selectedRadioId, setSelectedRadioId] = useState<string | null>(null);
  const [showRadioPicker, setShowRadioPicker] = useState(false);
  const [txPowerCeilingWatts, setTxPowerCeilingWatts] = useState(100);

  const hydratedRef = useRef(false);

  // Close recent targets dropdown on click-outside or Escape
  useEffect(() => {
    if (!showRecentDropdown) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (
        recentDropdownRef.current &&
        !recentDropdownRef.current.contains(e.target as Node)
      ) {
        setShowRecentDropdown(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowRecentDropdown(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showRecentDropdown]);

  // One-shot hydrate: URL deep-link → map target → leave empty
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    const deep = parseWizardDeepLink(searchParams);
    if (deep.mode) setMode(deep.mode);
    if (deep.pathMode) setPathMode(deep.pathMode);
    if (deep.callsign) setCallsignInput(deep.callsign);

    if (deep.target) {
      setTarget(deep.target);
      setTargetQuery(deep.target.grid);
      return;
    }

    if (deep.callsign) {
      // Async resolve callsign from URL without blocking paint
      void (async () => {
        setCallsignLoading(true);
        try {
          let qrzKey: string | undefined;
          try {
            if (isUnlocked()) {
              const cred = await getCredential("qrz");
              qrzKey = cred?.password || undefined;
            }
          } catch {
            // vault locked / missing — continue without QRZ
          }
          const result = await resolveCallsignTarget(deep.callsign!, qrzKey);
          if (result.ok) {
            setTarget(result.target);
            setTargetQuery(result.target.grid);
          } else {
            setCallsignError(result.error);
          }
        } finally {
          setCallsignLoading(false);
        }
      })();
      return;
    }

    if (mapTarget) {
      const resolved = targetFromMapLocation({
        lat: mapTarget.lat,
        lon: mapTarget.lon,
        grid: mapTarget.grid,
        name: mapTarget.name,
      });
      setTarget(resolved);
      setTargetQuery(resolved.grid);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once on mount
  }, []);

  // Keep URL in sync when target/mode/path change (after hydrate)
  useEffect(() => {
    if (!hydratedRef.current) return;
    const next = buildWizardSearchParams({ target, mode, pathMode });
    const current = searchParams.toString();
    const upcoming = next.toString();
    if (current !== upcoming) {
      setSearchParams(next, { replace: true });
    }
  }, [target, mode, pathMode, searchParams, setSearchParams]);

  const {
    data: kIndexData,
    isError: kIndexError,
    dataUpdatedAt: kUpdatedAt,
    refetch: refetchK,
    isRefetching: kRefetching,
  } = useKIndex();
  const {
    data: solarFluxData,
    isError: solarFluxError,
    dataUpdatedAt: fluxUpdatedAt,
    refetch: refetchFlux,
    isRefetching: fluxRefetching,
  } = useSolarFlux();

  const wizardDataUpdatedAt =
    Math.max(kUpdatedAt || 0, fluxUpdatedAt || 0) || undefined;
  const wizardIsRefetching = kRefetching || fluxRefetching;
  const refetchWizardData = useCallback(() => {
    refetchK();
    refetchFlux();
  }, [refetchK, refetchFlux]);

  const currentKp = useMemo(() => {
    if (!kIndexData || kIndexData.length === 0) return DEFAULT_KP;
    return kIndexData[kIndexData.length - 1].kp_index;
  }, [kIndexData]);

  const currentSfi = useMemo(() => {
    if (!solarFluxData || solarFluxData.length === 0) return DEFAULT_SFI;
    return solarFluxData[solarFluxData.length - 1].flux;
  }, [solarFluxData]);

  const selectedRadio = useMemo(() => {
    if (selectedRadioId === null) return activeRadio;
    const fromInstance =
      radioInstances.find((r) => r.id === selectedRadioId) ?? null;
    const selectedEquipmentId = fromInstance?.equipmentId ?? selectedRadioId;
    const fromProfile =
      userRadios.find((r) => r.userRadio.equipmentId === selectedEquipmentId)
        ?.equipment ?? null;
    const fromCustom =
      customRadios.find((r) => r.id === selectedEquipmentId) ?? null;
    const fromDb =
      RADIO_DATABASE.find((r) => r.id === selectedEquipmentId) ?? null;
    return fromProfile ?? fromCustom ?? fromDb;
  }, [activeRadio, customRadios, radioInstances, selectedRadioId, userRadios]);

  const selectedRadioInstance = useMemo(() => {
    if (selectedRadioId === null) return null;
    return radioInstances.find((r) => r.id === selectedRadioId) ?? null;
  }, [radioInstances, selectedRadioId]);

  const effectiveMaxPower = useMemo(() => {
    const max = selectedRadio?.maxPower ?? 1500;
    const limit = selectedRadioInstance?.customPowerLimit;
    if (typeof limit === "number" && Number.isFinite(limit) && limit > 0) {
      return Math.max(1, Math.min(max, Math.round(limit)));
    }
    return max;
  }, [selectedRadio?.maxPower, selectedRadioInstance?.customPowerLimit]);

  // Clamp ceiling whenever kit max shrinks
  useEffect(() => {
    setTxPowerCeilingWatts((prev) => clampCeilingToKit(prev, effectiveMaxPower));
  }, [effectiveMaxPower]);

  const applyTarget = useCallback((next: ResolvedTarget) => {
    setTarget(next);
    setTargetQuery(next.grid);
    setTargetError(null);
  }, []);

  const resolveTarget = useCallback(async () => {
    setTargetError(null);
    setTargetResolving(true);
    try {
      const result = await resolveTargetQuery(targetQuery);
      if (!result.ok) {
        setTargetError(result.error);
        return;
      }
      applyTarget(result.target);
    } finally {
      setTargetResolving(false);
    }
  }, [applyTarget, targetQuery]);

  const handleLookupCallsign = useCallback(async () => {
    setCallsignError(null);
    setCallsignLoading(true);
    try {
      let qrzKey: string | undefined;
      try {
        if (isUnlocked()) {
          const cred = await getCredential("qrz");
          qrzKey = cred?.password || undefined;
        }
      } catch {
        // ignore vault errors
      }
      const result = await resolveCallsignTarget(callsignInput, qrzKey);
      if (!result.ok) {
        setCallsignError(result.error);
        return;
      }
      applyTarget(result.target);
    } finally {
      setCallsignLoading(false);
    }
  }, [applyTarget, callsignInput]);

  const selectRecentTarget = useCallback(
    (rt: { lat: number; lon: number; grid?: string; name?: string }) => {
      const grid = rt.grid ?? latLonToGrid(rt.lat, rt.lon);
      applyTarget({
        label: rt.name ?? grid,
        grid,
        lat: rt.lat,
        lon: rt.lon,
        source: "map",
      });
      setShowRecentDropdown(false);
    },
    [applyTarget],
  );

  const antennaGainDbi = useMemo(() => {
    if (!station || !target) return 0;
    return resolveAntennaGainDbi({
      antennaType,
      homeLat: station.lat,
      homeLon: station.lon,
      targetLat: target.lat,
      targetLon: target.lon,
      pathMode,
    });
  }, [antennaType, pathMode, station, target]);

  const recommendation = useMemo(() => {
    if (!station || !target) return null;
    return buildWizardRecommendation({
      station: {
        lat: station.lat,
        lon: station.lon,
        grid: station.grid,
        callsign: station.callsign,
      },
      target,
      mode,
      ituRegion,
      licenseClass,
      currentKp,
      currentSfi,
      txPowerCeilingWatts,
      kitMaxPowerWatts: selectedRadio?.maxPower ?? txPowerCeilingWatts,
      antennaGainDbi,
      noiseEnvironment,
      pathMode,
    });
  }, [
    antennaGainDbi,
    currentKp,
    currentSfi,
    ituRegion,
    licenseClass,
    mode,
    noiseEnvironment,
    pathMode,
    selectedRadio?.maxPower,
    station,
    target,
    txPowerCeilingWatts,
  ]);

  const pathSummary = useMemo(() => {
    if (!station || !target) return null;
    const bestFreqMHz =
      recommendation?.type === "ok"
        ? Number.parseFloat(recommendation.best.frequency)
        : undefined;
    return buildPathSummary({
      homeLat: station.lat,
      homeLon: station.lon,
      targetLat: target.lat,
      targetLon: target.lon,
      pathMode,
      mode,
      sfi: currentSfi,
      kp: currentKp,
      frequencyMHz:
        Number.isFinite(bestFreqMHz) && bestFreqMHz! > 0
          ? bestFreqMHz
          : undefined,
    });
  }, [currentKp, currentSfi, mode, pathMode, recommendation, station, target]);

  const nextWindow = useMemo(() => {
    if (!station || !target) return null;
    return computeNextWindow({
      station: { lat: station.lat, lon: station.lon },
      target,
      currentKp,
      currentSfi,
      mode,
    });
  }, [currentKp, currentSfi, mode, station, target]);

  const tips = useMemo(() => getModeTips(mode), [mode]);

  const bestMarginDb = useMemo(() => {
    if (!recommendation || recommendation.type !== "ok") return null;
    return snrMarginDb(recommendation.best.snrEstimate, mode);
  }, [mode, recommendation]);

  const bandPlannerHref = useMemo(() => {
    if (!target) return "/planner";
    return bandPlannerHrefForTarget(target.grid);
  }, [target]);

  const radioLabel = useMemo(() => {
    if (!selectedRadio) return "";
    return getRadioLabel(
      selectedRadio,
      selectedRadioId === null
        ? activeUserRadio?.nickname
        : selectedRadioInstance?.nickname,
    );
  }, [
    selectedRadio,
    selectedRadioId,
    activeUserRadio?.nickname,
    selectedRadioInstance?.nickname,
  ]);

  const targetBandsForContest = useMemo(() => {
    if (!recommendation || recommendation.type === "none") return [];
    return recommendation.bands
      .filter((b) => b.status !== "closed")
      .map((b) => b.band);
  }, [recommendation]);

  return {
    // station / solar
    station,
    currentKp,
    currentSfi,
    kIndexError,
    solarFluxError,
    wizardDataUpdatedAt,
    wizardIsRefetching,
    refetchWizardData,

    // target
    targetQuery,
    setTargetQuery,
    targetError,
    targetResolving,
    target,
    resolveTarget,
    callsignInput,
    setCallsignInput,
    callsignLoading,
    callsignError,
    handleLookupCallsign,
    recentTargets,
    showRecentDropdown,
    setShowRecentDropdown,
    recentDropdownRef,
    selectRecentTarget,

    // constraints
    mode,
    setMode,
    modes: WIZARD_MODES,
    pathMode,
    setPathMode,
    licenseClass,
    setLicenseClass,
    ituRegion,
    setItuRegion,
    selectedRadioId,
    setSelectedRadioId,
    showRadioPicker,
    setShowRadioPicker,
    selectedRadio,
    selectedRadioInstance,
    activeUserRadio,
    radioLabel,
    txPowerCeilingWatts,
    setTxPowerCeilingWatts,
    effectiveMaxPower,

    // results
    recommendation,
    pathSummary,
    nextWindow,
    tips,
    bestMarginDb,
    antennaGainDbi,
    bandPlannerHref,
    targetBandsForContest,
    getRadioLabel,
  };
}

export type DXWizardSession = ReturnType<typeof useDXWizardSession>;
