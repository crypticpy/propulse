/**
 * CustomTLEDialog Component
 *
 * Centered modal dialog for importing custom Two-Line Element sets.
 * Supports pasting TLE text in 3-line format and importing from .tle files.
 * Validates TLE checksums before accepting.
 *
 * Uses portal-based rendering, backdrop click dismiss, and escape key close.
 */

import { useState, useEffect, useId, useRef, useCallback } from "react";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
import { useCustomTLEStore } from "@/stores/customTLEStore";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CustomTLEDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Callback to close the dialog */
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Quick-check: count how many valid-looking 3-line TLE groups are in the text.
 * Does NOT validate checksums — just structural check for preview.
 */
function previewTLEText(
  text: string,
): Array<{ name: string; noradId: number }> {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const results: Array<{ name: string; noradId: number }> = [];

  for (let i = 0; i <= lines.length - 3; i += 3) {
    const name = lines[i];
    const line1 = lines[i + 1];
    const line2 = lines[i + 2];

    if (!line1.startsWith("1 ") || !line2.startsWith("2 ")) {
      continue;
    }

    const noradId = parseInt(line1.substring(2, 7).trim(), 10);
    if (!isNaN(noradId)) {
      results.push({ name: name.trim(), noradId });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CustomTLEDialog({ isOpen, onClose }: CustomTLEDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();

  const importFromText = useCustomTLEStore((s) => s.importFromText);

  const [tleText, setTleText] = useState("");
  const [source, setSource] = useState("");
  const [preview, setPreview] = useState<
    Array<{ name: string; noradId: number }>
  >([]);
  const [result, setResult] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Update preview when text changes
  useEffect(() => {
    if (tleText.trim().length > 0) {
      setPreview(previewTLEText(tleText));
    } else {
      setPreview([]);
    }
    // Clear previous result when text changes
    setResult(null);
  }, [tleText]);

  // Focus textarea on open
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      // Small delay to ensure portal is rendered
      const timer = setTimeout(() => textareaRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Import handler
  const handleImport = useCallback(() => {
    if (tleText.trim().length === 0) {
      setResult({ type: "error", message: "No TLE text to import." });
      return;
    }

    const count = importFromText(tleText, source || undefined);

    if (count > 0) {
      setResult({
        type: "success",
        message: `Imported ${count} satellite${count !== 1 ? "s" : ""}.`,
      });
      // Clear text after successful import
      setTleText("");
      setSource("");
    } else {
      setResult({
        type: "error",
        message:
          "No valid TLEs found. Check that each entry is in 3-line format (name, line 1, line 2) with valid checksums.",
      });
    }
  }, [tleText, source, importFromText]);

  // File import handler
  const handleFileImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target?.result;
        if (typeof text === "string") {
          setTleText(text);
          // Auto-set source from filename (without extension)
          if (!source) {
            const nameWithoutExt = file.name.replace(/\.[^.]+$/, "");
            setSource(nameWithoutExt);
          }
        }
      };
      reader.readAsText(file);

      // Reset file input so the same file can be re-selected
      e.target.value = "";
    },
    [source],
  );

  return (
    <AccessibleDialog
      open={isOpen}
      onClose={onClose}
      title="Import Custom TLEs"
      chrome="bare"
      labelledBy={titleId}
      panelProps={{
        className:
          "bg-su-canvas border border-su-line/40 rounded-2xl shadow-2xl overflow-hidden",
        style: {
          maxWidth: 520,
          maxHeight: "85vh",
          width: "90vw",
        },
      }}
    >
      <div className="overflow-y-auto" style={{ maxHeight: "85vh" }}>
        {/* Header */}
        <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-su-line/40">
          <div className="flex items-center gap-2">
            <svg
              className="w-5 h-5 text-cyan-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <h2 id={titleId} className="text-su-text font-bold text-base">
              Import Custom TLEs
            </h2>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="p-1 hover:bg-su-line/20 rounded-lg transition-colors"
            aria-label="Close dialog"
          >
            <svg
              className="w-5 h-5 text-su-muted"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
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

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Instructions */}
          <p className="text-xs text-su-muted leading-relaxed">
            Paste TLE data in standard 3-line format. Each satellite entry
            should have a name line followed by TLE lines 1 and 2. Checksums
            are validated before import.
          </p>

          {/* TLE text area */}
          <div>
            <label
              htmlFor="tle-input"
              className="block text-[10px] text-su-muted uppercase tracking-wider mb-1 font-semibold"
            >
              TLE Data
            </label>
            <textarea
              ref={textareaRef}
              id="tle-input"
              value={tleText}
              onChange={(e) => setTleText(e.target.value)}
              placeholder={`ISS (ZARYA)\n1 25544U 98067A   24020.54842296  .00011842  00000+0  21418-3 0  9994\n2 25544  51.6412 290.4332 0004460  43.4590  51.3729 15.49594862437036`}
              className="w-full h-36 px-3 py-2 bg-void-black border border-su-line/40 rounded-lg text-xs font-mono text-su-text placeholder:text-su-muted/80 focus:border-cyan-400/50 focus:outline-none focus:ring-1 focus:ring-cyan-400/30 resize-none scrollbar-hide"
              spellCheck={false}
            />
          </div>

          {/* Source label */}
          <div>
            <label
              htmlFor="tle-source"
              className="block text-[10px] text-su-muted uppercase tracking-wider mb-1 font-semibold"
            >
              Source Label{" "}
              <span className="text-su-muted normal-case">(optional)</span>
            </label>
            <input
              id="tle-source"
              type="text"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="e.g. New launch, Classified, AMSAT"
              className="w-full px-3 py-1.5 bg-void-black border border-su-line/40 rounded-lg text-xs text-su-text placeholder:text-su-muted/80 focus:border-cyan-400/50 focus:outline-none focus:ring-1 focus:ring-cyan-400/30"
            />
          </div>

          {/* Preview */}
          {preview.length > 0 && (
            <div className="bg-su-line/10 border border-su-line/40 rounded-lg px-3 py-2">
              <div className="text-[10px] text-su-muted uppercase tracking-wider mb-1.5 font-semibold">
                Preview ({preview.length} satellite
                {preview.length !== 1 ? "s" : ""} detected)
              </div>
              <div className="space-y-0.5 max-h-24 overflow-y-auto scrollbar-hide">
                {preview.map((sat, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="text-su-muted font-mono truncate">
                      {sat.name}
                    </span>
                    <span className="text-su-muted font-mono text-[10px] ml-2 flex-shrink-0">
                      #{sat.noradId}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Result feedback */}
          {result && (
            <div
              className={`px-3 py-2 rounded-lg text-xs ${
                result.type === "success"
                  ? "bg-green-400/10 border border-green-400/20 text-green-400"
                  : "bg-red-400/10 border border-red-400/20 text-red-400"
              }`}
            >
              {result.message}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-5 pb-4 flex items-center justify-between gap-3">
          {/* File import */}
          <button
            onClick={handleFileImport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-su-muted hover:text-su-text bg-su-line/10 hover:bg-su-line/20 rounded-lg transition-colors"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
              />
            </svg>
            Import from file
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".tle,.txt,.3le"
            onChange={handleFileChange}
            className="hidden"
            aria-hidden="true"
          />

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-su-muted hover:text-su-text bg-su-line/10 hover:bg-su-line/20 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={tleText.trim().length === 0}
              className="px-4 py-1.5 text-xs font-medium text-su-text bg-cyan-500/80 hover:bg-cyan-500 disabled:bg-su-input disabled:text-su-muted rounded-lg transition-colors"
            >
              Import
            </button>
          </div>
        </div>
      </div>
    </AccessibleDialog>
  );
}

export default CustomTLEDialog;
