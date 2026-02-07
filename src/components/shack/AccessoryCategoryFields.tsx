/**
 * AccessoryCategoryFields — Category-specific form fields for accessories.
 *
 * Extracted from AccessoryManager to reduce file size.
 * Renders different fields depending on the selected accessory category.
 */

import type { AccessoryCategory } from "@/types/shack";
import { ALL_BANDS } from "@/types/user";

// ─── Labels ──────────────────────────────────────────────────────────────────

const GROUND_TYPE_LABELS: Record<string, string> = {
  rod: "Ground Rod",
  radial_system: "Radial System",
  counterpoise: "Counterpoise",
  water_pipe: "Water Pipe",
  other: "Other",
};

const FILTER_TYPE_LABELS: Record<string, string> = {
  bandpass: "Bandpass",
  lowpass: "Lowpass",
  highpass: "Highpass",
  notch: "Notch",
};

// ─── Form type (mirrors AccessoryManager's form) ─────────────────────────────

export interface AccessoryCategoryForm {
  // Amplifier
  maxPowerWatts: string;
  gainDb: string;
  bands: Set<string>;
  // Tuner
  tunerType: "manual" | "automatic";
  tunerMaxPower: string;
  tunerInsertionLoss: string;
  // Filter
  filterType: "bandpass" | "lowpass" | "highpass" | "notch";
  filterInsertionLoss: string;
  filterBands: Set<string>;
  // Switch
  ports: string;
  switchInsertionLoss: string;
  // Power supply
  voltageOutput: string;
  maxCurrentAmps: string;
  // Grounding
  groundType: "rod" | "radial_system" | "counterpoise" | "water_pipe" | "other";
  radialCount: string;
}

interface AccessoryCategoryFieldsProps {
  category: AccessoryCategory;
  form: AccessoryCategoryForm;
  setForm: (
    updater: (prev: AccessoryCategoryForm) => AccessoryCategoryForm,
  ) => void;
}

// ─── Shared input classes ────────────────────────────────────────────────────

const INPUT_CLASS =
  "w-full bg-void-black border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:border-plasma-orange/50 focus:outline-none";

const BAND_BTN_ACTIVE =
  "bg-plasma-orange/20 text-plasma-orange border border-plasma-orange/50";
const BAND_BTN_INACTIVE =
  "bg-white/5 text-gray-400 border border-white/10 hover:text-gray-200 hover:bg-white/10";

// ─── Component ───────────────────────────────────────────────────────────────

export function AccessoryCategoryFields({
  category,
  form,
  setForm,
}: AccessoryCategoryFieldsProps) {
  switch (category) {
    case "amplifier":
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-1">
                Max Power (watts)
              </label>
              <input
                inputMode="decimal"
                value={form.maxPowerWatts}
                onChange={(e) =>
                  setForm((p) => ({ ...p, maxPowerWatts: e.target.value }))
                }
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-1">
                Gain (dB)
              </label>
              <input
                inputMode="decimal"
                value={form.gainDb}
                onChange={(e) =>
                  setForm((p) => ({ ...p, gainDb: e.target.value }))
                }
                className={INPUT_CLASS}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-200 mb-2">
              Bands (optional)
            </label>
            <div className="flex flex-wrap gap-2">
              {ALL_BANDS.map((band) => {
                const selected = form.bands.has(band);
                return (
                  <button
                    key={band}
                    type="button"
                    onClick={() =>
                      setForm((p) => {
                        const next = new Set(p.bands);
                        if (next.has(band)) next.delete(band);
                        else next.add(band);
                        return { ...p, bands: next };
                      })
                    }
                    className={`px-2 py-1 text-xs rounded-lg transition-colors ${
                      selected ? BAND_BTN_ACTIVE : BAND_BTN_INACTIVE
                    }`}
                  >
                    {band}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      );

    case "tuner":
      return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">
              Type
            </label>
            <select
              value={form.tunerType}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  tunerType: e.target.value as "manual" | "automatic",
                }))
              }
              className={INPUT_CLASS}
            >
              <option value="manual">Manual</option>
              <option value="automatic">Automatic</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">
              Max Power (watts)
            </label>
            <input
              inputMode="decimal"
              value={form.tunerMaxPower}
              onChange={(e) =>
                setForm((p) => ({ ...p, tunerMaxPower: e.target.value }))
              }
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">
              Insertion Loss (dB, optional)
            </label>
            <input
              inputMode="decimal"
              value={form.tunerInsertionLoss}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  tunerInsertionLoss: e.target.value,
                }))
              }
              placeholder="e.g., 0.5"
              className={INPUT_CLASS}
            />
          </div>
        </div>
      );

    case "filter":
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-1">
                Filter Type
              </label>
              <select
                value={form.filterType}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    filterType: e.target.value as
                      | "bandpass"
                      | "lowpass"
                      | "highpass"
                      | "notch",
                  }))
                }
                className={INPUT_CLASS}
              >
                {Object.entries(FILTER_TYPE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-1">
                Insertion Loss (dB)
              </label>
              <input
                inputMode="decimal"
                value={form.filterInsertionLoss}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    filterInsertionLoss: e.target.value,
                  }))
                }
                className={INPUT_CLASS}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-200 mb-2">
              Bands (optional)
            </label>
            <div className="flex flex-wrap gap-2">
              {ALL_BANDS.map((band) => {
                const selected = form.filterBands.has(band);
                return (
                  <button
                    key={band}
                    type="button"
                    onClick={() =>
                      setForm((p) => {
                        const next = new Set(p.filterBands);
                        if (next.has(band)) next.delete(band);
                        else next.add(band);
                        return { ...p, filterBands: next };
                      })
                    }
                    className={`px-2 py-1 text-xs rounded-lg transition-colors ${
                      selected ? BAND_BTN_ACTIVE : BAND_BTN_INACTIVE
                    }`}
                  >
                    {band}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      );

    case "switch":
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">
              Ports
            </label>
            <input
              inputMode="numeric"
              value={form.ports}
              onChange={(e) =>
                setForm((p) => ({ ...p, ports: e.target.value }))
              }
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">
              Insertion Loss (dB)
            </label>
            <input
              inputMode="decimal"
              value={form.switchInsertionLoss}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  switchInsertionLoss: e.target.value,
                }))
              }
              className={INPUT_CLASS}
            />
          </div>
        </div>
      );

    case "power_supply":
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">
              Voltage Output (V)
            </label>
            <input
              inputMode="decimal"
              value={form.voltageOutput}
              onChange={(e) =>
                setForm((p) => ({ ...p, voltageOutput: e.target.value }))
              }
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">
              Max Current (amps)
            </label>
            <input
              inputMode="decimal"
              value={form.maxCurrentAmps}
              onChange={(e) =>
                setForm((p) => ({ ...p, maxCurrentAmps: e.target.value }))
              }
              className={INPUT_CLASS}
            />
          </div>
        </div>
      );

    case "grounding":
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">
              Ground Type
            </label>
            <select
              value={form.groundType}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  groundType: e.target.value as typeof form.groundType,
                }))
              }
              className={INPUT_CLASS}
            >
              {Object.entries(GROUND_TYPE_LABELS).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {(form.groundType === "radial_system" ||
            form.groundType === "counterpoise") && (
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-1">
                Radial Count
              </label>
              <input
                inputMode="numeric"
                value={form.radialCount}
                onChange={(e) =>
                  setForm((p) => ({ ...p, radialCount: e.target.value }))
                }
                placeholder="e.g., 32"
                className={INPUT_CLASS}
              />
            </div>
          )}
        </div>
      );
  }
}
