/**
 * PreambleEditor -- Centered modal for editing a net's preamble template.
 *
 * Provides a textarea with clickable variable chips that insert template
 * variables at the cursor position, plus a live preview panel showing the
 * rendered preamble with placeholder values.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import type { Net } from "@/types/net";

// ── Template variable definitions ────────────────────────────────────────────

interface TemplateVariable {
  token: string;
  label: string;
  preview: string;
}

const TEMPLATE_VARIABLES: Omit<TemplateVariable, "preview">[] = [
  { token: "{{date}}", label: "Date" },
  { token: "{{ncs_callsign}}", label: "NCS Callsign" },
  { token: "{{net_name}}", label: "Net Name" },
  { token: "{{frequency}}", label: "Frequency" },
  { token: "{{mode}}", label: "Mode" },
];

/** Return fresh preview values (date recomputed on each call). */
function getPreviewValues(): Record<string, string> {
  return {
    "{{date}}": new Date().toLocaleDateString(),
    "{{ncs_callsign}}": "W1AW",
    "{{net_name}}": "Example Net",
    "{{frequency}}": "146.520 MHz",
    "{{mode}}": "FM",
  };
}

/** Replace template variables with human-readable preview values. */
function renderPreview(template: string): string {
  const previews = getPreviewValues();
  let result = template;
  for (const v of TEMPLATE_VARIABLES) {
    result = result.split(v.token).join(previews[v.token] ?? v.token);
  }
  return result;
}

// ── Props ────────────────────────────────────────────────────────────────────

interface PreambleEditorProps {
  net: Net;
  onClose: () => void;
  onSave: (template: string) => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export function PreambleEditor({ net, onClose, onSave }: PreambleEditorProps) {
  const [template, setTemplate] = useState(net.preambleTemplate ?? "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Body scroll lock
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  // Escape key closes
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () =>
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [onClose]);

  const handleCardClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  /** Insert a template variable at the current cursor position. */
  const insertVariable = useCallback((token: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const before = ta.value.slice(0, start);
    const after = ta.value.slice(end);
    const newValue = before + token + after;
    setTemplate(newValue);

    // Restore cursor position after the inserted token
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + token.length;
      ta.setSelectionRange(pos, pos);
    });
  }, []);

  const handleSave = useCallback(() => {
    onSave(template);
    onClose();
  }, [template, onSave, onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="preamble-editor-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-void-black/80 animate-in fade-in"
        onClick={onClose}
      />

      {/* Card */}
      <div
        className="relative z-10 bg-deep-space border border-white/15 rounded-2xl p-6 max-w-lg w-full shadow-2xl animate-in zoom-in-95"
        onClick={handleCardClick}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3
            id="preamble-editor-title"
            className="text-base font-semibold text-white"
          >
            Edit Preamble Template
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-300 hover:text-white hover:bg-white/15 transition-colors focus-visible:ring-2 focus-visible:ring-plasma-orange/70"
            aria-label="Close"
          >
            <svg
              className="w-5 h-5"
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

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          rows={8}
          placeholder="Enter your preamble template..."
          className="w-full bg-void border border-white/20 rounded-lg p-3 text-sm text-gray-200 font-mono placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-plasma-orange/70 resize-none"
        />

        {/* Variable chips */}
        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-1.5">
            Insert variable
          </p>
          <div className="flex flex-wrap gap-1.5">
            {TEMPLATE_VARIABLES.map((v) => (
              <button
                key={v.token}
                onClick={() => insertVariable(v.token)}
                className="px-2.5 py-1 text-xs font-mono rounded-full bg-white/5 text-gray-300 border border-white/15 hover:bg-plasma-orange/20 hover:text-plasma-orange hover:border-plasma-orange/40 hover:shadow-[0_0_8px_rgba(255,107,53,0.2)] active:scale-[0.98] transition-all will-change-transform focus-visible:ring-2 focus-visible:ring-plasma-orange/70 focus-visible:outline-none"
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* Preview */}
        {template.trim() && (
          <div className="mt-4">
            <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-1.5">
              Preview
            </p>
            <div className="bg-white/[0.06] border border-white/15 rounded-lg p-3">
              <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
                {renderPreview(template)}
              </p>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-plasma-orange text-white hover:bg-plasma-orange/90 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-plasma-orange/70 focus-visible:ring-offset-2 focus-visible:ring-offset-deep-space transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
