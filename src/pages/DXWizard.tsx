import { useCallback, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { DataFreshnessIndicator } from "@/components/ui";
import { useIsMobile } from "@/hooks/useIsMobile";
import { MobileDXWizard } from "@/components/mobile/MobileDXWizard";
import {
  useActiveRadio,
  useUserStore,
  useUserRadios,
} from "@/stores/userStore";
import { isValidGrid, gridToLatLon, latLonToGrid } from "@/lib/utils/grid";
import { geocodeAddress, parseCoordinateString } from "@/lib/api/geocoding";
import { useKIndex, useSolarFlux } from "@/hooks/useSolarData";
import {
  getEnhancedBandConditions,
  getPathStatusColor,
  calculateGreatCircleDistance,
} from "@/lib/utils/bands";
import { getAntennaGainForPath } from "@/lib/data/antennas";
import { getAvailableSegments } from "@/lib/data/bandplans";
import { RADIO_DATABASE } from "@/lib/data/radios";
import { RadioPickerModal } from "@/components/radio/RadioPickerModal";
import type { ITURegion, LicenseClass, BandMode } from "@/types/bandplan";
import type { RadioEquipment } from "@/types/radio";

type WizardMode = "SSB" | "CW" | "FT8";

interface ResolvedTarget {
  label: string;
  grid: string;
  lat: number;
  lon: number;
  source: "grid" | "coords" | "geocode" | "callsign";
  callsign?: string;
}

interface CallsignLookupResult {
  callsign: string;
  name?: string;
  grid?: string;
  lat?: number;
  lon?: number;
  source: string;
}

const DEFAULT_KP = 3;
const DEFAULT_SFI = 100;

const MODE_TO_BANDPLAN: Record<WizardMode, BandMode> = {
  SSB: "PHONE",
  CW: "CW",
  FT8: "DATA",
};

const MODE_SNR_TARGET_DB: Record<WizardMode, number> = {
  SSB: -6,
  CW: -12,
  FT8: -18,
};

const DEFAULT_FREQS_KHZ: Record<string, Record<WizardMode, number[]>> = {
  "160m": { FT8: [1840], CW: [1825], SSB: [1900] },
  "80m": { FT8: [3573], CW: [3530], SSB: [3790] },
  "60m": { FT8: [5357], CW: [5350], SSB: [5371] },
  "40m": { FT8: [7074], CW: [7025], SSB: [7185] },
  "30m": { FT8: [10136], CW: [10120], SSB: [10130] },
  "20m": { FT8: [14074], CW: [14025], SSB: [14200] },
  "17m": { FT8: [18100], CW: [18080], SSB: [18130] },
  "15m": { FT8: [21074], CW: [21025], SSB: [21250] },
  "12m": { FT8: [24915], CW: [24910], SSB: [24950] },
  "10m": { FT8: [28074], CW: [28025], SSB: [28350] },
};

function formatKHz(khz: number): string {
  if (khz >= 1000) {
    return `${(khz / 1000).toFixed(3)} MHz`;
  }
  return `${khz} kHz`;
}

function clampWatts(value: number): number {
  if (!Number.isFinite(value)) {
    return 100;
  }
  return Math.max(1, Math.min(1500, Math.round(value)));
}

function estimateRequiredPowerWatts(
  snrAt100W: number,
  targetSnr: number,
): number {
  const deltaDb = targetSnr - snrAt100W;
  if (deltaDb <= 0) {
    return 10;
  }
  const scale = Math.pow(10, deltaDb / 10);
  return clampWatts(100 * scale);
}

function getModeTips(
  mode: WizardMode,
): Array<{ label: string; value: string }> {
  switch (mode) {
    case "FT8":
      return [
        { label: "Bandwidth", value: "50 Hz filter (as narrow as stable)" },
        { label: "Power", value: "Run steady power (avoid ALC pumping)" },
        { label: "Audio", value: "Keep TX audio clean; avoid clipping" },
      ];
    case "CW":
      return [
        { label: "Bandwidth", value: "300–500 Hz filter" },
        { label: "Pitch", value: "Match RX/TX sidetone to your filter peak" },
        { label: "Timing", value: "Send slightly slower when QRN/QRQ" },
      ];
    case "SSB":
      return [
        { label: "Bandwidth", value: "2.1–2.4 kHz (narrower if noisy)" },
        {
          label: "Compression",
          value: "Moderate processing; avoid distortion",
        },
        { label: "Technique", value: "Short calls, listen between overs" },
      ];
  }
}

async function lookupCallsign(callsign: string): Promise<CallsignLookupResult> {
  const normalized = callsign.trim().toUpperCase();
  const res = await fetch(
    `/api/callsign/lookup?callsign=${encodeURIComponent(normalized)}`,
  );
  const data = (await res.json()) as unknown;
  if (!res.ok) {
    const message =
      typeof data === "object" && data && "error" in data
        ? String((data as { error: unknown }).error)
        : "Lookup failed";
    throw new Error(message);
  }
  return data as CallsignLookupResult;
}

function getRadioLabel(radio: RadioEquipment, nickname?: string) {
  const base =
    radio.displayName?.trim() || `${radio.manufacturer} ${radio.model}`;
  return nickname?.trim() ? `${nickname} — ${base}` : base;
}

function pickAllowedFrequenciesKHz(params: {
  band: string;
  mode: WizardMode;
  region: ITURegion;
  licenseClass: LicenseClass;
}): number[] {
  const { band, mode, region, licenseClass } = params;
  const planMode = MODE_TO_BANDPLAN[mode];
  const segments = getAvailableSegments(band, region, licenseClass, planMode);
  if (segments.length === 0) {
    return [];
  }

  const preferred = DEFAULT_FREQS_KHZ[band]?.[mode] ?? [];
  const allowedPreferred = preferred.filter((khz) =>
    segments.some((s) => khz >= s.startKHz && khz <= s.endKHz),
  );
  if (allowedPreferred.length > 0) {
    return allowedPreferred;
  }

  const primary = segments.find((s) => s.isPrimary) ?? segments[0];
  const mid = Math.round((primary.startKHz + primary.endKHz) / 2);
  return [mid];
}

function getMaxAllowedPowerWatts(params: {
  band: string;
  mode: WizardMode;
  region: ITURegion;
  licenseClass: LicenseClass;
}): number | null {
  const { band, mode, region, licenseClass } = params;
  const planMode = MODE_TO_BANDPLAN[mode];
  const segments = getAvailableSegments(band, region, licenseClass, planMode);
  if (segments.length === 0) {
    return null;
  }
  return Math.min(...segments.map((s) => s.maxPowerWatts));
}

export function DXWizard() {
  const station = useUserStore((s) => s.station);
  const preferences = useUserStore((s) => s.preferences);
  const activeUserRadio = useUserStore((s) => {
    const id = s.preferences.activeRadioId;
    if (!id) {
      return null;
    }
    return (s.preferences.radios || []).find((r) => r.id === id) ?? null;
  });
  const userRadios = useUserRadios();
  const activeRadio = useActiveRadio();
  const customRadios = useUserStore((s) => s.preferences.customRadios || []);
  const radioInstances = useUserStore((s) => s.preferences.radios || []);
  const antennaType = useUserStore(
    (s) => s.preferences.antennaType ?? "isotropic",
  );

  const [targetQuery, setTargetQuery] = useState("");
  const [targetError, setTargetError] = useState<string | null>(null);
  const [targetResolving, setTargetResolving] = useState(false);
  const [target, setTarget] = useState<ResolvedTarget | null>(null);

  const [callsignInput, setCallsignInput] = useState("");
  const [callsignLoading, setCallsignLoading] = useState(false);
  const [callsignError, setCallsignError] = useState<string | null>(null);

  const [mode, setMode] = useState<WizardMode>("FT8");
  const [licenseClass, setLicenseClass] = useState<LicenseClass>(
    (preferences.licenseClass ?? "GENERAL") as LicenseClass,
  );
  const [ituRegion, setItuRegion] = useState<ITURegion>(
    (preferences.ituRegion ?? "ITU2") as ITURegion,
  );

  const [selectedRadioId, setSelectedRadioId] = useState<string | null>(null);
  const [showRadioPicker, setShowRadioPicker] = useState(false);
  const [txPowerCeilingWatts, setTxPowerCeilingWatts] = useState<number>(100);

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
  const refetchWizardData = () => {
    refetchK();
    refetchFlux();
  };

  const currentKp = useMemo(() => {
    if (!kIndexData || kIndexData.length === 0) {
      return DEFAULT_KP;
    }
    return kIndexData[kIndexData.length - 1].kp_index;
  }, [kIndexData]);

  const currentSfi = useMemo(() => {
    if (!solarFluxData || solarFluxData.length === 0) {
      return DEFAULT_SFI;
    }
    return solarFluxData[solarFluxData.length - 1].flux;
  }, [solarFluxData]);

  const selectedRadio = useMemo(() => {
    if (selectedRadioId === null) {
      return activeRadio;
    }
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
    if (selectedRadioId === null) {
      return null;
    }
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

  const resolveTarget = useCallback(async () => {
    const raw = targetQuery.trim();
    setTargetError(null);
    setTarget(null);
    if (!raw) {
      setTargetError("Enter a grid square, coordinates, or a location name.");
      return;
    }

    setTargetResolving(true);
    try {
      if (isValidGrid(raw)) {
        const grid = raw.toUpperCase();
        const { lat, lon } = gridToLatLon(grid);
        setTarget({ label: grid, grid, lat, lon, source: "grid" });
        return;
      }

      const parsed = parseCoordinateString(raw);
      if (!("error" in parsed)) {
        const grid = latLonToGrid(parsed.lat, parsed.lon);
        setTarget({
          label: `${parsed.lat.toFixed(4)}, ${parsed.lon.toFixed(4)}`,
          grid,
          lat: parsed.lat,
          lon: parsed.lon,
          source: "coords",
        });
        return;
      }

      const geo = await geocodeAddress(raw, 1);
      if ("error" in geo) {
        setTargetError(geo.error.message);
        return;
      }
      const best = geo.results[0];
      const grid = latLonToGrid(best.lat, best.lon);
      setTarget({
        label: best.displayName,
        grid,
        lat: best.lat,
        lon: best.lon,
        source: "geocode",
      });
    } finally {
      setTargetResolving(false);
    }
  }, [targetQuery]);

  const handleLookupCallsign = useCallback(async () => {
    const cs = callsignInput.trim().toUpperCase();
    setCallsignError(null);
    if (!cs) {
      setCallsignError("Enter a callsign to look up.");
      return;
    }
    setCallsignLoading(true);
    try {
      const result = await lookupCallsign(cs);
      if (result.grid && isValidGrid(result.grid)) {
        const grid = result.grid.toUpperCase();
        const { lat, lon } = gridToLatLon(grid);
        setTarget({
          label: result.name
            ? `${result.callsign} — ${result.name}`
            : result.callsign,
          grid,
          lat,
          lon,
          source: "callsign",
          callsign: result.callsign,
        });
        setTargetQuery(grid);
        return;
      }
      if (typeof result.lat === "number" && typeof result.lon === "number") {
        const grid = latLonToGrid(result.lat, result.lon);
        setTarget({
          label: result.name
            ? `${result.callsign} — ${result.name}`
            : result.callsign,
          grid,
          lat: result.lat,
          lon: result.lon,
          source: "callsign",
          callsign: result.callsign,
        });
        setTargetQuery(grid);
        return;
      }
      setCallsignError("Lookup succeeded, but no location was returned.");
    } catch (e) {
      setCallsignError(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setCallsignLoading(false);
    }
  }, [callsignInput]);

  const recommendation = useMemo(() => {
    if (!station || !target) {
      return null;
    }

    const txPowerBaseline = 100;
    const distanceKm = calculateGreatCircleDistance(
      station.lat,
      station.lon,
      target.lat,
      target.lon,
    );
    const antennaGainDbi = getAntennaGainForPath(antennaType, distanceKm);
    const bands = getEnhancedBandConditions(
      station.lat,
      station.lon,
      target.lat,
      target.lon,
      currentKp,
      currentSfi,
      new Date(),
      txPowerBaseline,
      mode,
      antennaGainDbi,
    );

    const snrTarget = MODE_SNR_TARGET_DB[mode];

    const candidates = bands
      .filter((b) => b.status !== "closed")
      .map((b) => {
        const requiredWatts = estimateRequiredPowerWatts(
          b.snrEstimate,
          snrTarget,
        );
        const legalMax = getMaxAllowedPowerWatts({
          band: b.band,
          mode,
          region: ituRegion,
          licenseClass,
        });
        const kitMax =
          selectedRadio?.maxPower ??
          (typeof txPowerCeilingWatts === "number" ? txPowerCeilingWatts : 100);
        const ceiling = clampWatts(
          Math.min(
            txPowerCeilingWatts || 1500,
            kitMax || 1500,
            legalMax ?? 1500,
          ),
        );

        const withinCeiling = requiredWatts <= ceiling;
        const freqsKHz = pickAllowedFrequenciesKHz({
          band: b.band,
          mode,
          region: ituRegion,
          licenseClass,
        });

        return {
          ...b,
          requiredWatts,
          ceilingWatts: ceiling,
          withinCeiling,
          freqsKHz,
          legalMaxWatts: legalMax,
        };
      })
      .filter((b) => b.freqsKHz.length > 0);

    if (candidates.length === 0) {
      return { type: "none" as const, bands, antennaGainDbi };
    }

    const best = [...candidates].sort((a, b) => {
      if (a.withinCeiling !== b.withinCeiling) {
        return a.withinCeiling ? -1 : 1;
      }
      if (a.requiredWatts !== b.requiredWatts) {
        return a.requiredWatts - b.requiredWatts;
      }
      return b.snrEstimate - a.snrEstimate;
    })[0];

    return { type: "ok" as const, best, bands, antennaGainDbi };
  }, [
    station,
    target,
    currentKp,
    currentSfi,
    mode,
    ituRegion,
    licenseClass,
    selectedRadio?.maxPower,
    txPowerCeilingWatts,
    antennaType,
  ]);

  const tips = useMemo(() => getModeTips(mode), [mode]);

  const isMobile = useIsMobile();

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

  if (isMobile) {
    return (
      <>
        <MobileDXWizard
          targetQuery={targetQuery}
          onTargetQueryChange={setTargetQuery}
          resolvedTarget={target}
          isResolving={targetResolving}
          onResolveTarget={resolveTarget}
          targetError={targetError}
          callsignInput={callsignInput}
          onCallsignInputChange={setCallsignInput}
          onLookupCallsign={handleLookupCallsign}
          callsignLoading={callsignLoading}
          callsignError={callsignError}
          mode={mode}
          onModeChange={setMode}
          txPowerCeilingWatts={txPowerCeilingWatts}
          onPowerChange={setTxPowerCeilingWatts}
          effectiveMaxPower={effectiveMaxPower}
          licenseClass={licenseClass}
          onLicenseClassChange={setLicenseClass}
          ituRegion={ituRegion}
          onItuRegionChange={setItuRegion}
          station={station}
          recommendation={recommendation}
          tips={tips}
          selectedRadio={selectedRadio}
          onShowRadioPicker={() => setShowRadioPicker(true)}
          radioLabel={radioLabel}
          currentKp={currentKp}
          currentSfi={currentSfi}
          kIndexError={kIndexError}
          solarFluxError={solarFluxError}
          dataUpdatedAt={wizardDataUpdatedAt}
          isRefetching={wizardIsRefetching}
          onRefresh={refetchWizardData}
        />
        <RadioPickerModal
          isOpen={showRadioPicker}
          onClose={() => setShowRadioPicker(false)}
          value={{ radioId: selectedRadioId }}
          onChange={(next) => setSelectedRadioId(next.radioId)}
          title="DX Wizard Radio Profile"
        />
      </>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-orbitron text-2xl font-black text-gradient-orange tracking-wider">
              DX Wizard
            </h2>
            <p className="text-gray-400 text-sm">
              Enter a target, pick your mode and constraints, and get actionable
              transmit guidance.
            </p>
          </div>
          <div className="flex items-start gap-4">
            <DataFreshnessIndicator
              dataUpdatedAt={wizardDataUpdatedAt}
              onRefresh={refetchWizardData}
              isRefetching={wizardIsRefetching}
            />
            <div className="text-right text-xs text-gray-500">
              <div className="font-mono">
                Kp={currentKp} SFI={currentSfi}
              </div>
              {(kIndexError || solarFluxError) && (
                <div className="text-caution-amber mt-1">
                  Solar data fetch issue — using cached/demo values
                </div>
              )}
            </div>
          </div>
        </div>

        {!station && (
          <Card className="p-5" variant="alert">
            <div className="text-white font-semibold mb-1">Station not set</div>
            <div className="text-sm text-gray-200">
              Set your callsign and grid square in Settings to enable path
              calculations.
            </div>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.15fr] gap-4">
          {/* Inputs */}
          <div className="space-y-4">
            <Card className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white">
                  1) Target Station
                </h3>
                <span className="text-[10px] text-gray-400">
                  grid / coordinates / location
                </span>
              </div>

              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    value={targetQuery}
                    onChange={(e) => setTargetQuery(e.target.value)}
                    placeholder='e.g., "FN31pr", "Tokyo, Japan", or "40.7128, -74.0060"'
                    className="flex-1 px-3 py-2 bg-deep-space/70 border border-white/10 rounded-lg
                               text-white placeholder-gray-500
                               focus:outline-none focus:border-plasma-orange/50"
                  />
                  <button
                    type="button"
                    onClick={resolveTarget}
                    disabled={targetResolving}
                    className="w-full sm:w-auto px-4 py-2 bg-plasma-orange/20 border border-plasma-orange/50 rounded-lg
                               text-plasma-orange hover:bg-plasma-orange/30 transition-colors font-medium
                               disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {targetResolving ? "Resolving…" : "Resolve"}
                  </button>
                </div>
                {targetError && (
                  <div className="text-xs text-alert-red">{targetError}</div>
                )}

                <div className="pt-2 border-t border-white/10">
                  <div className="text-xs text-gray-400 mb-2">
                    Optional: look up a callsign (US via Callook)
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      value={callsignInput}
                      onChange={(e) => setCallsignInput(e.target.value)}
                      placeholder="e.g., W1AW"
                      className="flex-1 px-3 py-2 bg-deep-space/70 border border-white/10 rounded-lg
                                 text-white placeholder-gray-500 font-mono
                                 focus:outline-none focus:border-plasma-orange/50"
                    />
                    <button
                      type="button"
                      onClick={handleLookupCallsign}
                      disabled={callsignLoading}
                      className="w-full sm:w-auto px-4 py-2 bg-white/5 border border-white/10 rounded-lg
                                 text-gray-200 hover:bg-white/10 transition-colors font-medium
                                 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {callsignLoading ? "Looking…" : "Lookup"}
                    </button>
                  </div>
                  {callsignError && (
                    <div className="text-xs text-alert-red mt-2">
                      {callsignError}
                    </div>
                  )}
                </div>

                {target && (
                  <div className="mt-3 p-3 rounded-xl bg-white/5 border border-white/10">
                    <div className="text-xs text-gray-400">Resolved target</div>
                    <div className="text-white font-semibold truncate">
                      {target.label}
                    </div>
                    <div className="text-xs text-gray-300 font-mono mt-1">
                      {target.grid} • {target.lat.toFixed(3)}°,{" "}
                      {target.lon.toFixed(3)}°
                    </div>
                  </div>
                )}
              </div>
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white">
                  2) Operator Profile
                </h3>
                {station && (
                  <div className="text-[10px] text-gray-400 font-mono">
                    {station.callsign} • {station.grid}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-300 mb-1">
                    Mode
                  </label>
                  <div className="flex gap-1 p-1 bg-white/5 rounded-lg">
                    {(["FT8", "CW", "SSB"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMode(m)}
                        className={`flex-1 px-2 py-2 rounded-md text-xs font-semibold transition-colors ${
                          mode === m
                            ? "bg-plasma-orange text-white"
                            : "text-gray-300 hover:text-white hover:bg-white/5"
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-gray-300 mb-1">
                    License Class
                  </label>
                  <select
                    value={licenseClass}
                    onChange={(e) =>
                      setLicenseClass(e.target.value as LicenseClass)
                    }
                    className="w-full px-3 py-2 bg-deep-space/70 border border-white/10 rounded-lg
                               text-white text-sm focus:outline-none focus:border-plasma-orange/50"
                  >
                    {(
                      [
                        "TECHNICIAN",
                        "GENERAL",
                        "EXTRA",
                        "ADVANCED",
                        "NOVICE",
                      ] as const
                    ).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-gray-300 mb-1">
                    ITU Region
                  </label>
                  <select
                    value={ituRegion}
                    onChange={(e) => setItuRegion(e.target.value as ITURegion)}
                    className="w-full px-3 py-2 bg-deep-space/70 border border-white/10 rounded-lg
                               text-white text-sm focus:outline-none focus:border-plasma-orange/50"
                  >
                    {(["ITU1", "ITU2", "ITU3"] as const).map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-gray-300 mb-1">
                    Radio Profile
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowRadioPicker(true)}
                    className="w-full px-3 py-2 bg-deep-space/70 border border-white/10 rounded-lg
                               text-left text-white text-sm hover:border-white/20
                               focus:outline-none focus:border-plasma-orange/50 transition-colors"
                  >
                    {selectedRadio
                      ? getRadioLabel(
                          selectedRadio,
                          selectedRadioId === null
                            ? activeUserRadio?.nickname
                            : selectedRadioInstance?.nickname,
                        )
                      : "Select a radio…"}
                    {selectedRadioId === null && (
                      <span className="ml-2 text-[10px] text-gray-400">
                        (active)
                      </span>
                    )}
                  </button>
                  {selectedRadio && (
                    <div className="text-[10px] text-gray-400 mt-1">
                      Max power: {selectedRadio.maxPower}W • Modes:{" "}
                      {selectedRadio.modes.slice(0, 4).join(", ")}
                      {selectedRadio.modes.length > 4 ? "…" : ""}
                    </div>
                  )}
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs text-gray-300 mb-1">
                    TX power ceiling (watts)
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={1}
                      max={effectiveMaxPower}
                      value={txPowerCeilingWatts}
                      onChange={(e) =>
                        setTxPowerCeilingWatts(Number(e.target.value))
                      }
                      className="flex-1"
                    />
                    <div className="w-20 text-right font-mono text-sm text-white">
                      {txPowerCeilingWatts}W
                    </div>
                  </div>
                  <div className="text-[10px] text-gray-500 mt-1">
                    Ceiling is also capped by band plan limits for your
                    license/mode.
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Results */}
          <div className="space-y-4">
            <Card className="p-5">
              <h3 className="text-sm font-semibold text-white mb-3">
                3) Recommendations
              </h3>

              {!station || !target ? (
                <div className="text-sm text-gray-400">
                  {station
                    ? "Resolve a target to generate recommendations."
                    : "Set your station QTH in Settings to generate recommendations."}
                </div>
              ) : recommendation?.type === "none" ? (
                <div className="space-y-2">
                  <div className="text-alert-red font-semibold">
                    No viable band/mode options found
                  </div>
                  <div className="text-sm text-gray-300">
                    Try FT8, reduce constraints, or wait for improved
                    conditions.
                  </div>
                </div>
              ) : recommendation?.type === "ok" ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="bg-white/5 rounded-xl p-4">
                      <div className="text-[10px] text-gray-400 uppercase tracking-wide">
                        Band
                      </div>
                      <div
                        className={`text-2xl font-mono font-bold ${getPathStatusColor(
                          recommendation.best.status,
                        )}`}
                      >
                        {recommendation.best.band}
                      </div>
                      <div className="text-[10px] text-gray-400 mt-1">
                        {recommendation.best.frequency}
                      </div>
                    </div>
                    <div className="bg-white/5 rounded-xl p-4">
                      <div className="text-[10px] text-gray-400 uppercase tracking-wide">
                        Required TX Power
                      </div>
                      <div className="text-2xl font-mono font-bold text-plasma-orange">
                        {recommendation.best.requiredWatts}W
                      </div>
                      <div className="text-[10px] text-gray-400 mt-1">
                        Ceiling: {recommendation.best.ceilingWatts}W{" "}
                        {!recommendation.best.withinCeiling && (
                          <span className="text-alert-red">• exceeds</span>
                        )}
                      </div>
                    </div>
                    <div className="bg-white/5 rounded-xl p-4">
                      <div className="text-[10px] text-gray-400 uppercase tracking-wide">
                        Target Frequency
                      </div>
                      <div className="text-lg font-mono font-bold text-white">
                        {formatKHz(recommendation.best.freqsKHz[0])}
                      </div>
                      <div className="text-[10px] text-gray-400 mt-1">
                        Mode: {mode}
                      </div>
                    </div>
                  </div>

                  <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                    <div className="text-xs text-gray-300">
                      {recommendation.best.notes}
                    </div>
                    <div className="mt-2 text-[10px] text-gray-400 font-mono">
                      Est. SNR @100W: {recommendation.best.snrEstimate} dB
                      {recommendation.best.pathLoss !== undefined && (
                        <>
                          {" "}
                          • Path loss:{" "}
                          {Math.round(recommendation.best.pathLoss)} dB
                        </>
                      )}
                      {recommendation.best.absorptionLoss !== undefined && (
                        <>
                          {" "}
                          • Abs:{" "}
                          {Math.round(recommendation.best.absorptionLoss)} dB
                        </>
                      )}
                      {recommendation.antennaGainDbi !== 0 && (
                        <span className="text-gray-500 text-[10px] font-mono ml-1">
                          • Ant: {recommendation.antennaGainDbi > 0 ? "+" : ""}
                          {recommendation.antennaGainDbi.toFixed(1)} dBi
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="bg-white/5 rounded-xl p-4">
                      <div className="text-xs font-semibold text-white mb-2">
                        Alternate Frequencies
                      </div>
                      <div className="space-y-1 text-sm text-gray-200 font-mono">
                        {recommendation.best.freqsKHz.slice(0, 3).map((f) => (
                          <div key={f}>{formatKHz(f)}</div>
                        ))}
                      </div>
                      {recommendation.best.legalMaxWatts !== null && (
                        <div className="mt-2 text-[10px] text-gray-400">
                          Band plan max: {recommendation.best.legalMaxWatts}W
                        </div>
                      )}
                    </div>
                    <div className="bg-white/5 rounded-xl p-4">
                      <div className="text-xs font-semibold text-white mb-2">
                        DX Tips ({mode})
                      </div>
                      <div className="space-y-1 text-sm text-gray-200">
                        {tips.map((t) => (
                          <div key={t.label} className="flex gap-2">
                            <span className="text-gray-300 font-semibold w-28">
                              {t.label}
                            </span>
                            <span className="text-gray-200">{t.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-400">
                  Resolve a target and verify your constraints.
                </div>
              )}
            </Card>

            <Card className="p-5">
              <div className="text-xs text-gray-400">Notes</div>
              <div className="text-sm text-gray-300 mt-1">
                Recommendations are estimates based on current solar indices and
                a simplified path model. Always comply with your local
                regulations and band plans.
              </div>
            </Card>
          </div>
        </div>

        <RadioPickerModal
          isOpen={showRadioPicker}
          onClose={() => setShowRadioPicker(false)}
          value={{ radioId: selectedRadioId }}
          onChange={(next) => setSelectedRadioId(next.radioId)}
          title="DX Wizard Radio Profile"
        />
      </div>
    </div>
  );
}

export default DXWizard;
