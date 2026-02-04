/**
 * ExportModal Component
 *
 * Modal for exporting path analysis data in various formats:
 * - ADIF (.adi) - For logging software
 * - Cabrillo (.log) - For contest submissions
 * - CSV (.csv) - Simple spreadsheet format
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card } from "@/components/ui";
import { generateADIF, pathToADIF } from "@/lib/export/adif";
import { generateCabrillo, modeToCabrillo } from "@/lib/export/cabrillo";
import type {
  ADIFOptions,
  PathExportData,
  CabrilloHeader,
  CabrilloQSO,
} from "@/lib/export/types";

// ============================================================================
// Types
// ============================================================================

export interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  pathData: {
    homeCall?: string;
    homeGrid: string;
    homeLat: number;
    homeLon: number;
    targetCall?: string;
    targetGrid?: string;
    targetLat: number;
    targetLon: number;
    distance: number;
    bearing: number;
    muf?: number;
    fot?: number;
    luf?: number;
    bestBand?: string;
    sfi?: number;
    kIndex?: number;
  };
}

type ExportFormat = "adif" | "cabrillo" | "csv";

interface ADIFExportOptions {
  includePropagation: boolean;
  includePath: boolean;
  addComment: boolean;
}

interface CabrilloExportOptions {
  contest: string;
  callsign: string;
  categoryOperator: CabrilloHeader["CATEGORY_OPERATOR"];
  categoryBand: CabrilloHeader["CATEGORY_BAND"];
  categoryPower: CabrilloHeader["CATEGORY_POWER"];
  categoryMode: CabrilloHeader["CATEGORY_MODE"];
}

// ============================================================================
// Constants
// ============================================================================

const COMMON_CONTESTS = [
  { value: "CQ-WW-SSB", label: "CQ WW SSB" },
  { value: "CQ-WW-CW", label: "CQ WW CW" },
  { value: "CQ-WPX-SSB", label: "CQ WPX SSB" },
  { value: "CQ-WPX-CW", label: "CQ WPX CW" },
  { value: "ARRL-DX-SSB", label: "ARRL DX SSB" },
  { value: "ARRL-DX-CW", label: "ARRL DX CW" },
  { value: "ARRL-SS-SSB", label: "ARRL Sweepstakes SSB" },
  { value: "ARRL-SS-CW", label: "ARRL Sweepstakes CW" },
  { value: "ARRL-FD", label: "ARRL Field Day" },
  { value: "IARU-HF", label: "IARU HF Championship" },
  { value: "CQMM", label: "CQ Marathon" },
  { value: "OTHER", label: "Other (Custom)" },
];

const CATEGORY_OPERATORS: Array<{
  value: CabrilloHeader["CATEGORY_OPERATOR"];
  label: string;
}> = [
  { value: "SINGLE-OP", label: "Single Operator" },
  { value: "MULTI-OP", label: "Multi Operator" },
  { value: "CHECKLOG", label: "Checklog" },
];

const CATEGORY_BANDS: Array<{
  value: CabrilloHeader["CATEGORY_BAND"];
  label: string;
}> = [
  { value: "ALL", label: "All Bands" },
  { value: "160M", label: "160m" },
  { value: "80M", label: "80m" },
  { value: "40M", label: "40m" },
  { value: "20M", label: "20m" },
  { value: "15M", label: "15m" },
  { value: "10M", label: "10m" },
];

const CATEGORY_POWERS: Array<{
  value: CabrilloHeader["CATEGORY_POWER"];
  label: string;
}> = [
  { value: "HIGH", label: "High (>100W)" },
  { value: "LOW", label: "Low (<=100W)" },
  { value: "QRP", label: "QRP (<=5W)" },
];

const CATEGORY_MODES: Array<{
  value: CabrilloHeader["CATEGORY_MODE"];
  label: string;
}> = [
  { value: "SSB", label: "SSB" },
  { value: "CW", label: "CW" },
  { value: "RTTY", label: "RTTY/Digital" },
  { value: "MIXED", label: "Mixed" },
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert path data to ADIF format with options
 */
function pathDataToADIF(
  data: ExportModalProps["pathData"],
  options: ADIFExportOptions,
): string {
  const now = new Date();

  // Build the export data
  const exportData: PathExportData = {
    homeCall: data.homeCall,
    homeGrid: data.homeGrid,
    homeLat: data.homeLat,
    homeLon: data.homeLon,
    targetCall: data.targetCall,
    targetGrid: data.targetGrid,
    targetLat: data.targetLat,
    targetLon: data.targetLon,
    distance: data.distance,
    bearing: data.bearing,
    muf: data.muf,
    fot: data.fot,
    luf: data.luf,
    bestBand: data.bestBand,
    timestamp: now.toISOString(),
    sfi: data.sfi,
    kIndex: data.kIndex,
  };

  // Generate base record
  const record = pathToADIF(exportData);

  // Customize based on options
  if (!options.includePropagation) {
    delete record.SFI;
    delete record.K_INDEX;
    delete record.PROP_MODE;
  }

  if (options.includePath) {
    // Add distance and bearing as part of the comment
    const pathInfo = `Distance: ${Math.round(data.distance)}km, Bearing: ${Math.round(data.bearing)}deg`;
    if (options.addComment) {
      record.COMMENT = `${record.COMMENT || ""} | ${pathInfo}`;
    } else {
      record.COMMENT = pathInfo;
    }
  }

  if (!options.addComment && !options.includePath) {
    delete record.COMMENT;
  }

  const adifOptions: ADIFOptions = {
    programId: "PropSphere",
    programVersion: "1.0.0",
    includeHeader: true,
  };

  return generateADIF([record], adifOptions);
}

/**
 * Convert path data to Cabrillo format
 */
function pathDataToCabrillo(
  data: ExportModalProps["pathData"],
  options: CabrilloExportOptions,
): string {
  const now = new Date();

  // Build header
  const header: CabrilloHeader = {
    CONTEST: options.contest,
    CALLSIGN: options.callsign || data.homeCall || "N0CALL",
    CATEGORY_OPERATOR: options.categoryOperator,
    CATEGORY_ASSISTED: "ASSISTED",
    CATEGORY_BAND: options.categoryBand,
    CATEGORY_POWER: options.categoryPower,
    CATEGORY_MODE: options.categoryMode,
    CATEGORY_TRANSMITTER: "ONE",
    LOCATION: data.homeGrid,
    SOAPBOX: [
      `Generated by PropSphere`,
      `Path analysis: ${Math.round(data.distance)}km at ${Math.round(data.bearing)}deg`,
      data.muf ? `MUF: ${data.muf.toFixed(1)} MHz` : "",
    ].filter(Boolean),
  };

  // Build sample QSO
  const qso: CabrilloQSO = {
    frequency: bandToFrequency(data.bestBand || "20m"),
    mode: modeToCabrillo(
      options.categoryMode === "MIXED" ? "SSB" : options.categoryMode,
    ),
    date: now.toISOString().slice(0, 10),
    time: now.toISOString().slice(11, 16).replace(":", ""),
    callSent: options.callsign || data.homeCall || "N0CALL",
    rstSent: "59",
    exchangeSent: data.homeGrid?.slice(0, 4) || "0000",
    callReceived: data.targetCall || "DX",
    rstReceived: "59",
    exchangeReceived: data.targetGrid?.slice(0, 4) || "0000",
  };

  return generateCabrillo(header, [qso]);
}

/**
 * Convert path data to CSV format
 */
function pathDataToCSV(data: ExportModalProps["pathData"]): string {
  const now = new Date();
  const headers = [
    "Timestamp",
    "Home Callsign",
    "Home Grid",
    "Home Lat",
    "Home Lon",
    "Target Callsign",
    "Target Grid",
    "Target Lat",
    "Target Lon",
    "Distance (km)",
    "Bearing (deg)",
    "MUF (MHz)",
    "FOT (MHz)",
    "LUF (MHz)",
    "Best Band",
    "SFI",
    "K-Index",
  ];

  const values = [
    now.toISOString(),
    data.homeCall || "",
    data.homeGrid,
    data.homeLat.toFixed(4),
    data.homeLon.toFixed(4),
    data.targetCall || "",
    data.targetGrid || "",
    data.targetLat.toFixed(4),
    data.targetLon.toFixed(4),
    data.distance.toFixed(1),
    data.bearing.toFixed(1),
    data.muf?.toFixed(1) || "",
    data.fot?.toFixed(1) || "",
    data.luf?.toFixed(1) || "",
    data.bestBand || "",
    data.sfi?.toString() || "",
    data.kIndex?.toString() || "",
  ];

  return `${headers.join(",")}\n${values.join(",")}`;
}

/**
 * Convert band name to frequency in kHz for Cabrillo
 */
function bandToFrequency(band: string): number {
  const bandMap: Record<string, number> = {
    "160m": 1800,
    "80m": 3500,
    "40m": 7000,
    "30m": 10100,
    "20m": 14000,
    "17m": 18100,
    "15m": 21000,
    "12m": 24900,
    "10m": 28000,
    "6m": 50000,
  };
  return bandMap[band.toLowerCase()] || 14000;
}

/**
 * Download file helper
 */
function downloadFile(
  content: string,
  filename: string,
  mimeType: string,
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Copy to clipboard helper
 */
async function copyToClipboard(content: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(content);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Component
// ============================================================================

export function ExportModal({ isOpen, onClose, pathData }: ExportModalProps) {
  // Format selection
  const [format, setFormat] = useState<ExportFormat>("adif");

  // ADIF options
  const [adifOptions, setAdifOptions] = useState<ADIFExportOptions>({
    includePropagation: true,
    includePath: true,
    addComment: true,
  });

  // Cabrillo options
  const [cabrilloOptions, setCabrilloOptions] = useState<CabrilloExportOptions>(
    {
      contest: "CQ-WW-SSB",
      callsign: pathData.homeCall || "",
      categoryOperator: "SINGLE-OP",
      categoryBand: "ALL",
      categoryPower: "LOW",
      categoryMode: "SSB",
    },
  );

  // Feedback state
  const [copySuccess, setCopySuccess] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setCopySuccess(false);
      setCabrilloOptions((prev) => ({
        ...prev,
        callsign: pathData.homeCall || prev.callsign,
      }));
    }
  }, [isOpen, pathData.homeCall]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Generate preview content
  const previewContent = useMemo(() => {
    switch (format) {
      case "adif":
        return pathDataToADIF(pathData, adifOptions);
      case "cabrillo":
        return pathDataToCabrillo(pathData, cabrilloOptions);
      case "csv":
        return pathDataToCSV(pathData);
      default:
        return "";
    }
  }, [format, pathData, adifOptions, cabrilloOptions]);

  // Handle export
  const handleExport = useCallback(() => {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
    const callsign = pathData.homeCall || "export";

    let filename: string;
    let mimeType: string;

    switch (format) {
      case "adif":
        filename = `${callsign}_path_${dateStr}.adi`;
        mimeType = "text/plain;charset=utf-8";
        break;
      case "cabrillo":
        filename = `${callsign}_${cabrilloOptions.contest}_${dateStr}.log`;
        mimeType = "text/plain;charset=utf-8";
        break;
      case "csv":
        filename = `${callsign}_path_${dateStr}.csv`;
        mimeType = "text/csv;charset=utf-8";
        break;
    }

    downloadFile(previewContent, filename, mimeType);
  }, [format, pathData.homeCall, cabrilloOptions.contest, previewContent]);

  // Handle copy to clipboard
  const handleCopy = useCallback(async () => {
    const success = await copyToClipboard(previewContent);
    if (success) {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  }, [previewContent]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        role="presentation"
      />

      {/* Modal */}
      <Card
        className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6"
        animate
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-orbitron text-xl font-bold text-gradient-orange">
            Export Path Data
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Path Summary */}
        <div className="mb-6 p-3 bg-white/5 rounded-lg border border-white/10">
          <div className="flex items-center justify-between text-sm">
            <div className="text-gray-400">
              <span className="text-white font-mono">
                {pathData.homeCall || pathData.homeGrid}
              </span>
              {" to "}
              <span className="text-white font-mono">
                {pathData.targetCall || pathData.targetGrid || "Target"}
              </span>
            </div>
            <div className="text-gray-500 font-mono text-xs">
              {Math.round(pathData.distance)} km |{" "}
              {Math.round(pathData.bearing)}deg
            </div>
          </div>
        </div>

        {/* Format Selection */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Export Format
          </h3>
          <div className="flex gap-2">
            <FormatButton
              format="adif"
              currentFormat={format}
              onClick={() => setFormat("adif")}
              label="ADIF (.adi)"
              description="Logging software"
            />
            <FormatButton
              format="cabrillo"
              currentFormat={format}
              onClick={() => setFormat("cabrillo")}
              label="Cabrillo (.log)"
              description="Contest submissions"
            />
            <FormatButton
              format="csv"
              currentFormat={format}
              onClick={() => setFormat("csv")}
              label="CSV (.csv)"
              description="Spreadsheets"
            />
          </div>
        </div>

        {/* Format-specific Options */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Export Options
          </h3>

          {format === "adif" && (
            <ADIFOptionsSection
              options={adifOptions}
              onChange={setAdifOptions}
            />
          )}

          {format === "cabrillo" && (
            <CabrilloOptionsSection
              options={cabrilloOptions}
              onChange={setCabrilloOptions}
            />
          )}

          {format === "csv" && (
            <div className="p-3 bg-white/5 rounded-lg border border-white/10 text-sm text-gray-400">
              CSV export includes all path data fields with headers. No
              additional options available.
            </div>
          )}
        </div>

        {/* Preview Section */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Preview
          </h3>
          <div className="relative">
            <pre className="p-4 bg-deep-space rounded-lg border border-white/10 text-xs font-mono text-gray-300 overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap">
              {previewContent}
            </pre>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-nebula-blue border border-white/10 rounded-lg
                       text-gray-300 hover:text-white hover:border-white/20
                       transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleCopy}
            className={`flex-1 px-4 py-2.5 rounded-lg font-medium transition-colors
                       ${
                         copySuccess
                           ? "bg-signal-green/20 border border-signal-green/50 text-signal-green"
                           : "bg-nebula-blue border border-white/10 text-gray-300 hover:text-white hover:border-white/20"
                       }`}
          >
            {copySuccess ? "Copied!" : "Copy to Clipboard"}
          </button>
          <button
            onClick={handleExport}
            className="flex-1 px-4 py-2.5 bg-plasma-orange/20 border border-plasma-orange/50 rounded-lg
                       text-plasma-orange hover:bg-plasma-orange/30
                       transition-colors font-medium"
          >
            Export
          </button>
        </div>
      </Card>
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

/**
 * Format selection button
 */
function FormatButton({
  format,
  currentFormat,
  onClick,
  label,
  description,
}: {
  format: ExportFormat;
  currentFormat: ExportFormat;
  onClick: () => void;
  label: string;
  description: string;
}) {
  const isSelected = format === currentFormat;

  return (
    <button
      onClick={onClick}
      className={`flex-1 px-4 py-3 rounded-lg text-left transition-colors
                 ${
                   isSelected
                     ? "bg-plasma-orange/20 border border-plasma-orange/50"
                     : "bg-nebula-blue border border-white/10 hover:border-white/20"
                 }`}
    >
      <div
        className={`text-sm font-medium ${
          isSelected ? "text-plasma-orange" : "text-gray-300"
        }`}
      >
        {label}
      </div>
      <div className="text-xs text-gray-500 mt-0.5">{description}</div>
    </button>
  );
}

/**
 * ADIF export options section
 */
function ADIFOptionsSection({
  options,
  onChange,
}: {
  options: ADIFExportOptions;
  onChange: (options: ADIFExportOptions) => void;
}) {
  return (
    <div className="space-y-3 p-4 bg-white/5 rounded-lg border border-white/10">
      <CheckboxOption
        id="adif-propagation"
        checked={options.includePropagation}
        onChange={(checked) =>
          onChange({ ...options, includePropagation: checked })
        }
        label="Include propagation data"
        description="MUF, SFI, K-index values"
      />
      <CheckboxOption
        id="adif-path"
        checked={options.includePath}
        onChange={(checked) => onChange({ ...options, includePath: checked })}
        label="Include path data"
        description="Distance and bearing information"
      />
      <CheckboxOption
        id="adif-comment"
        checked={options.addComment}
        onChange={(checked) => onChange({ ...options, addComment: checked })}
        label="Add analysis summary"
        description="Include path analysis in comment field"
      />
    </div>
  );
}

/**
 * Cabrillo export options section
 */
function CabrilloOptionsSection({
  options,
  onChange,
}: {
  options: CabrilloExportOptions;
  onChange: (options: CabrilloExportOptions) => void;
}) {
  return (
    <div className="space-y-4 p-4 bg-white/5 rounded-lg border border-white/10">
      {/* Contest Selection */}
      <div>
        <label
          htmlFor="cabrillo-contest"
          className="block text-sm font-medium text-gray-300 mb-1"
        >
          Contest
        </label>
        <select
          id="cabrillo-contest"
          value={options.contest}
          onChange={(e) => onChange({ ...options, contest: e.target.value })}
          className="w-full px-3 py-2 bg-deep-space border border-white/10 rounded-lg
                     text-white focus:outline-none focus:border-plasma-orange/50"
        >
          {COMMON_CONTESTS.map((contest) => (
            <option key={contest.value} value={contest.value}>
              {contest.label}
            </option>
          ))}
        </select>
      </div>

      {/* Station Callsign */}
      <div>
        <label
          htmlFor="cabrillo-callsign"
          className="block text-sm font-medium text-gray-300 mb-1"
        >
          Station Callsign
        </label>
        <input
          type="text"
          id="cabrillo-callsign"
          value={options.callsign}
          onChange={(e) =>
            onChange({ ...options, callsign: e.target.value.toUpperCase() })
          }
          placeholder="N0CALL"
          className="w-full px-3 py-2 bg-deep-space border border-white/10 rounded-lg
                     text-white placeholder-gray-500 font-mono uppercase
                     focus:outline-none focus:border-plasma-orange/50"
        />
      </div>

      {/* Category Grid */}
      <div className="grid grid-cols-2 gap-4">
        {/* Operator Category */}
        <div>
          <label
            htmlFor="cabrillo-operator"
            className="block text-sm font-medium text-gray-300 mb-1"
          >
            Operator
          </label>
          <select
            id="cabrillo-operator"
            value={options.categoryOperator}
            onChange={(e) =>
              onChange({
                ...options,
                categoryOperator: e.target
                  .value as CabrilloHeader["CATEGORY_OPERATOR"],
              })
            }
            className="w-full px-3 py-2 bg-deep-space border border-white/10 rounded-lg
                       text-white text-sm focus:outline-none focus:border-plasma-orange/50"
          >
            {CATEGORY_OPERATORS.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>

        {/* Band Category */}
        <div>
          <label
            htmlFor="cabrillo-band"
            className="block text-sm font-medium text-gray-300 mb-1"
          >
            Band
          </label>
          <select
            id="cabrillo-band"
            value={options.categoryBand}
            onChange={(e) =>
              onChange({
                ...options,
                categoryBand: e.target.value as CabrilloHeader["CATEGORY_BAND"],
              })
            }
            className="w-full px-3 py-2 bg-deep-space border border-white/10 rounded-lg
                       text-white text-sm focus:outline-none focus:border-plasma-orange/50"
          >
            {CATEGORY_BANDS.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>

        {/* Power Category */}
        <div>
          <label
            htmlFor="cabrillo-power"
            className="block text-sm font-medium text-gray-300 mb-1"
          >
            Power
          </label>
          <select
            id="cabrillo-power"
            value={options.categoryPower}
            onChange={(e) =>
              onChange({
                ...options,
                categoryPower: e.target
                  .value as CabrilloHeader["CATEGORY_POWER"],
              })
            }
            className="w-full px-3 py-2 bg-deep-space border border-white/10 rounded-lg
                       text-white text-sm focus:outline-none focus:border-plasma-orange/50"
          >
            {CATEGORY_POWERS.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>

        {/* Mode Category */}
        <div>
          <label
            htmlFor="cabrillo-mode"
            className="block text-sm font-medium text-gray-300 mb-1"
          >
            Mode
          </label>
          <select
            id="cabrillo-mode"
            value={options.categoryMode}
            onChange={(e) =>
              onChange({
                ...options,
                categoryMode: e.target.value as CabrilloHeader["CATEGORY_MODE"],
              })
            }
            className="w-full px-3 py-2 bg-deep-space border border-white/10 rounded-lg
                       text-white text-sm focus:outline-none focus:border-plasma-orange/50"
          >
            {CATEGORY_MODES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

/**
 * Checkbox option component
 */
function CheckboxOption({
  id,
  checked,
  onChange,
  label,
  description,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <label htmlFor={id} className="flex items-start gap-3 cursor-pointer group">
      <div className="relative mt-0.5">
        <input
          type="checkbox"
          id={id}
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only peer"
        />
        <div
          className={`w-5 h-5 rounded border transition-colors
                     ${
                       checked
                         ? "bg-plasma-orange border-plasma-orange"
                         : "bg-deep-space border-white/20 group-hover:border-white/40"
                     }`}
        >
          {checked && (
            <svg
              className="w-5 h-5 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          )}
        </div>
      </div>
      <div>
        <div className="text-sm font-medium text-gray-200 group-hover:text-white transition-colors">
          {label}
        </div>
        <div className="text-xs text-gray-500">{description}</div>
      </div>
    </label>
  );
}

export default ExportModal;
