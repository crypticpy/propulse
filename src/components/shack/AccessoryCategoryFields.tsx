/**
 * AccessoryCategoryFields — Category-specific form fields for accessories.
 *
 * Extracted from AccessoryManager to reduce file size.
 * Renders different fields depending on the selected accessory category.
 */

import type { AccessoryCategory } from "@/types/shack";
import { ALL_BANDS } from "@/types/user";
import {
  Button,
  Checkbox,
  TextField,
  SelectField,
} from "@/components/station-ui";

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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <TextField
                label="Max Power (watts)"
                inputMode="decimal"
                value={form.maxPowerWatts}
                onChange={(e) =>
                  setForm((p) => ({ ...p, maxPowerWatts: e.target.value }))
                }
              />
            </div>
            <div>
              <TextField
                label="Gain (dB)"
                inputMode="decimal"
                value={form.gainDb}
                onChange={(e) =>
                  setForm((p) => ({ ...p, gainDb: e.target.value }))
                }
              />
            </div>
          </div>
          <div>
            <p className="su-hint">Bands (optional)</p>
            <div
              className="su-inline"
              role="group"
              aria-label="Supported bands"
            >
              {ALL_BANDS.map((band) => {
                const selected = form.bands.has(band);
                return (
                  <Button
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
                    aria-pressed={selected}
                    variant={selected ? "primary" : "secondary"}
                  >
                    {band}
                  </Button>
                );
              })}
            </div>
          </div>
        </div>
      );

    case "tuner":
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <SelectField
              label="Type"
              value={form.tunerType}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  tunerType: e.target.value as "manual" | "automatic",
                }))
              }
            >
              <option value="manual">Manual</option>
              <option value="automatic">Automatic</option>
            </SelectField>
          </div>
          <div>
            <TextField
              label="Max Power (watts)"
              inputMode="decimal"
              value={form.tunerMaxPower}
              onChange={(e) =>
                setForm((p) => ({ ...p, tunerMaxPower: e.target.value }))
              }
            />
          </div>
          <div>
            <TextField
              label="Insertion Loss (dB, optional)"
              inputMode="decimal"
              value={form.tunerInsertionLoss}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  tunerInsertionLoss: e.target.value,
                }))
              }
              placeholder="e.g., 0.5"
            />
          </div>
        </div>
      );

    case "filter":
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <SelectField
                label="Filter Type"
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
              >
                {Object.entries(FILTER_TYPE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </SelectField>
            </div>
            <div>
              <TextField
                label="Insertion Loss (dB)"
                inputMode="decimal"
                value={form.filterInsertionLoss}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    filterInsertionLoss: e.target.value,
                  }))
                }
              />
            </div>
          </div>
          <div>
            <p className="su-hint">Bands (optional)</p>
            <div
              className="su-inline"
              role="group"
              aria-label="Supported bands"
            >
              {ALL_BANDS.map((band) => {
                const selected = form.filterBands.has(band);
                return (
                  <Button
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
                    aria-pressed={selected}
                    variant={selected ? "primary" : "secondary"}
                  >
                    {band}
                  </Button>
                );
              })}
            </div>
          </div>
        </div>
      );

    case "switch":
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <TextField
              label="Ports"
              inputMode="numeric"
              value={form.ports}
              onChange={(e) =>
                setForm((p) => ({ ...p, ports: e.target.value }))
              }
            />
          </div>
          <div>
            <TextField
              label="Insertion Loss (dB)"
              inputMode="decimal"
              value={form.switchInsertionLoss}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  switchInsertionLoss: e.target.value,
                }))
              }
            />
          </div>
        </div>
      );

    case "power_supply":
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <TextField
              label="Voltage Output (V)"
              inputMode="decimal"
              value={form.voltageOutput}
              onChange={(e) =>
                setForm((p) => ({ ...p, voltageOutput: e.target.value }))
              }
            />
          </div>
          <div>
            <TextField
              label="Max Current (amps)"
              inputMode="decimal"
              value={form.maxCurrentAmps}
              onChange={(e) =>
                setForm((p) => ({ ...p, maxCurrentAmps: e.target.value }))
              }
            />
          </div>
        </div>
      );

    case "grounding":
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <SelectField
              label="Ground Type"
              value={form.groundType}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  groundType: e.target.value as typeof form.groundType,
                }))
              }
            >
              {Object.entries(GROUND_TYPE_LABELS).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </SelectField>
          </div>
          {(form.groundType === "radial_system" ||
            form.groundType === "counterpoise") && (
            <div>
              <TextField
                label="Radial Count"
                inputMode="numeric"
                value={form.radialCount}
                onChange={(e) =>
                  setForm((p) => ({ ...p, radialCount: e.target.value }))
                }
                placeholder="e.g., 32"
              />
            </div>
          )}
        </div>
      );

    case "rotator":
      return (
        <div className="space-y-4">
          <div>
            <SelectField
              label="Rotator Type"
              value={form.rotatorType}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  rotatorType: e.target.value as typeof form.rotatorType,
                }))
              }
            >
              <option value="azimuth">Azimuth Only</option>
              <option value="elevation">Elevation Only</option>
              <option value="az_el">Az/El</option>
            </SelectField>
          </div>
          <div>
            <TextField
              label="Speed (degrees/sec, optional)"
              inputMode="decimal"
              value={form.speedDegPerSec}
              onChange={(e) =>
                setForm((p) => ({ ...p, speedDegPerSec: e.target.value }))
              }
              placeholder="e.g., 1.5"
            />
          </div>
        </div>
      );

    case "keyer":
      return (
        <div className="space-y-4">
          <div>
            <SelectField
              label="Keyer Type"
              value={form.keyerType}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  keyerType: e.target.value as typeof form.keyerType,
                }))
              }
            >
              <option value="paddle">Paddle</option>
              <option value="straight_key">Straight Key</option>
              <option value="bug">Bug</option>
              <option value="electronic_keyer">Electronic Keyer</option>
              <option value="keyboard">Keyboard</option>
            </SelectField>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <TextField
                label="Min Speed (WPM)"
                inputMode="numeric"
                value={form.speedMin}
                onChange={(e) =>
                  setForm((p) => ({ ...p, speedMin: e.target.value }))
                }
              />
            </div>
            <div>
              <TextField
                label="Max Speed (WPM)"
                inputMode="numeric"
                value={form.speedMax}
                onChange={(e) =>
                  setForm((p) => ({ ...p, speedMax: e.target.value }))
                }
              />
            </div>
          </div>
        </div>
      );

    case "audio_dsp":
      return (
        <div className="space-y-4">
          <div>
            <SelectField
              label="DSP Type"
              value={form.dspType}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  dspType: e.target.value as typeof form.dspType,
                }))
              }
            >
              <option value="external_speaker">External Speaker</option>
              <option value="headphones">Headphones</option>
              <option value="dsp_filter">DSP Filter</option>
              <option value="audio_processor">Audio Processor</option>
              <option value="voice_keyer">Voice Keyer</option>
            </SelectField>
          </div>
          <div className="su-inline">
            <Checkbox
              label="Noise reduction"
              checked={form.noiseReduction}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  noiseReduction: event.target.checked,
                }))
              }
            />
            <Checkbox
              label="Notch filter"
              checked={form.notchFilter}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  notchFilter: event.target.checked,
                }))
              }
            />
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
