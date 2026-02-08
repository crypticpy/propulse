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
  // Rotator
  rotatorType: "azimuth" | "elevation" | "az_el";
  speedDegPerSec: string;
  // Keyer
  keyerType:
    | "paddle"
    | "straight_key"
    | "bug"
    | "electronic_keyer"
    | "keyboard";
  speedMin: string;
  speedMax: string;
  // Audio DSP
  dspType:
    | "external_speaker"
    | "headphones"
    | "dsp_filter"
    | "audio_processor"
    | "voice_keyer";
  noiseReduction: boolean;
  notchFilter: boolean;
}

interface AccessoryCategoryFieldsProps<
  F extends AccessoryCategoryForm = AccessoryCategoryForm,
> {
  category: AccessoryCategory;
  form: F;
  setForm: (updater: (prev: F) => F) => void;
}

// ─── Shared input classes ────────────────────────────────────────────────────

const INPUT_CLASS =
  "w-full bg-void-black border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:border-plasma-orange/50 focus:outline-none";

const BAND_BTN_ACTIVE =
  "bg-plasma-orange/20 text-plasma-orange border border-plasma-orange/50";
const BAND_BTN_INACTIVE =
  "bg-white/5 text-gray-400 border border-white/10 hover:text-gray-200 hover:bg-white/10";

// ─── Component ───────────────────────────────────────────────────────────────

export function AccessoryCategoryFields<F extends AccessoryCategoryForm>({
  category,
  form,
  setForm,
}: AccessoryCategoryFieldsProps<F>) {
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

    case "rotator":
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">
              Rotator Type
            </label>
            <select
              value={form.rotatorType}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  rotatorType: e.target.value as typeof form.rotatorType,
                }))
              }
              className={INPUT_CLASS}
            >
              <option value="azimuth">Azimuth Only</option>
              <option value="elevation">Elevation Only</option>
              <option value="az_el">Az/El</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">
              Speed (degrees/sec, optional)
            </label>
            <input
              inputMode="decimal"
              value={form.speedDegPerSec}
              onChange={(e) =>
                setForm((p) => ({ ...p, speedDegPerSec: e.target.value }))
              }
              placeholder="e.g., 1.5"
              className={INPUT_CLASS}
            />
          </div>
        </div>
      );

    case "keyer":
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">
              Keyer Type
            </label>
            <select
              value={form.keyerType}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  keyerType: e.target.value as typeof form.keyerType,
                }))
              }
              className={INPUT_CLASS}
            >
              <option value="paddle">Paddle</option>
              <option value="straight_key">Straight Key</option>
              <option value="bug">Bug</option>
              <option value="electronic_keyer">Electronic Keyer</option>
              <option value="keyboard">Keyboard</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-1">
                Min Speed (WPM)
              </label>
              <input
                inputMode="numeric"
                value={form.speedMin}
                onChange={(e) =>
                  setForm((p) => ({ ...p, speedMin: e.target.value }))
                }
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-1">
                Max Speed (WPM)
              </label>
              <input
                inputMode="numeric"
                value={form.speedMax}
                onChange={(e) =>
                  setForm((p) => ({ ...p, speedMax: e.target.value }))
                }
                className={INPUT_CLASS}
              />
            </div>
          </div>
        </div>
      );

    case "audio_dsp":
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">
              DSP Type
            </label>
            <select
              value={form.dspType}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  dspType: e.target.value as typeof form.dspType,
                }))
              }
              className={INPUT_CLASS}
            >
              <option value="external_speaker">External Speaker</option>
              <option value="headphones">Headphones</option>
              <option value="dsp_filter">DSP Filter</option>
              <option value="audio_processor">Audio Processor</option>
              <option value="voice_keyer">Voice Keyer</option>
            </select>
          </div>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.noiseReduction}
                onChange={(e) =>
                  setForm((p) => ({ ...p, noiseReduction: e.target.checked }))
                }
                className="accent-plasma-orange"
              />
              <span className="text-sm text-gray-200">Noise Reduction</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.notchFilter}
                onChange={(e) =>
                  setForm((p) => ({ ...p, notchFilter: e.target.checked }))
                }
                className="accent-plasma-orange"
              />
              <span className="text-sm text-gray-200">Notch Filter</span>
            </label>
          </div>
        </div>
      );

    default: {
      const _exhaustive: never = category;
      void _exhaustive;
      return null;
    }
  }
}
