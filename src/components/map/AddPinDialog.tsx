/**
 * AddPinDialog Component
 *
 * Modal dialog for adding or editing pins with support for categories,
 * colors, notes, and expiration dates (for DXpeditions).
 * Uses glassmorphism styling and renders via React portal.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import type { MapPin, PinCategory } from "../../types/pin";
import { PIN_CATEGORIES, getCategoryMeta } from "../../types/pin";
import { usePinStore } from "../../stores/pinStore";

export interface AddPinDialogProps {
  /** Whether the dialog is visible */
  visible: boolean;
  /** Mode: add a new pin or edit existing */
  mode: "add" | "edit";
  /** Location data for new pin (required for add mode) */
  location?: {
    lat: number;
    lon: number;
    grid: string;
  };
  /** Existing pin data for editing (required for edit mode) */
  pin?: MapPin;
  /** Callback when dialog is closed */
  onClose: () => void;
  /** Callback when pin is saved successfully */
  onSave?: (pin: MapPin) => void;
}

/** Preset color options for custom category */
const PRESET_COLORS = [
  "#22D3EE", // cyan (default)
  "#FF6B35", // orange
  "#4CAF50", // green
  "#9C27B0", // purple
  "#F44336", // red
  "#3B82F6", // blue
  "#F59E0B", // amber
  "#EC4899", // pink
];

/**
 * AddPinDialog Component
 *
 * Provides a form for creating or editing pins with full customization options.
 */
export function AddPinDialog({
  visible,
  mode,
  location,
  pin,
  onClose,
  onSave,
}: AddPinDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const { addPin, updatePin } = usePinStore();

  // Form state
  const [name, setName] = useState("");
  const [category, setCategory] = useState<PinCategory>("custom");
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [notes, setNotes] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [useCustomColor, setUseCustomColor] = useState(false);

  // Initialize form when dialog opens or pin changes
  useEffect(() => {
    if (visible) {
      if (mode === "edit" && pin) {
        setName(pin.name || "");
        setCategory(pin.category || "custom");
        setColor(pin.color || getCategoryMeta(pin.category).color);
        setNotes(pin.notes || "");
        setExpiresAt(pin.expiresAt ? pin.expiresAt.split("T")[0] : "");
        // Check if color differs from category default
        const catMeta = getCategoryMeta(pin.category);
        setUseCustomColor(pin.color !== catMeta.color);
      } else {
        // Reset to defaults for add mode
        setName("");
        setCategory("custom");
        setColor(PRESET_COLORS[0]);
        setNotes("");
        setExpiresAt("");
        setUseCustomColor(false);
      }

      // Focus name input after a short delay
      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 100);
    }
  }, [visible, mode, pin]);

  // Update color when category changes (unless custom color is selected)
  useEffect(() => {
    if (!useCustomColor) {
      const catMeta = getCategoryMeta(category);
      setColor(catMeta.color);
    }
  }, [category, useCustomColor]);

  // Handle click outside to dismiss
  useEffect(() => {
    if (!visible) {
      return;
    }

    const handleClickOutside = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [visible, onClose]);

  // Handle Escape key to dismiss
  useEffect(() => {
    if (!visible) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [visible, onClose]);

  // Handle save
  const handleSave = useCallback(() => {
    if (mode === "add" && location) {
      const newPin = addPin({
        lat: location.lat,
        lon: location.lon,
        grid: location.grid,
        name: name.trim() || undefined,
        color,
        category,
        notes: notes.trim() || undefined,
        expiresAt:
          category === "dxpedition" && expiresAt
            ? new Date(expiresAt).toISOString()
            : undefined,
      });

      if (newPin) {
        onSave?.(newPin);
        onClose();
      }
    } else if (mode === "edit" && pin) {
      const success = updatePin(pin.id, {
        name: name.trim() || undefined,
        color,
        category,
        notes: notes.trim() || undefined,
        expiresAt:
          category === "dxpedition" && expiresAt
            ? new Date(expiresAt).toISOString()
            : undefined,
      });

      if (success) {
        onSave?.({ ...pin, name, color, category, notes, expiresAt });
        onClose();
      }
    }
  }, [
    mode,
    location,
    pin,
    name,
    color,
    category,
    notes,
    expiresAt,
    addPin,
    updatePin,
    onSave,
    onClose,
  ]);

  // Handle form submit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSave();
  };

  if (!visible) {
    return null;
  }

  const grid = mode === "edit" ? pin?.grid : location?.grid;
  const title = mode === "add" ? "Add Pin" : "Edit Pin";

  const dialogContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        ref={dialogRef}
        className="w-full max-w-md mx-4 bg-gray-900/90 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl"
        role="dialog"
        aria-labelledby="pin-dialog-title"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h2
            id="pin-dialog-title"
            className="text-lg font-semibold text-white"
          >
            {title}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-white/10"
            aria-label="Close dialog"
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Grid display */}
          <div className="text-center pb-2">
            <span className="font-mono text-xl font-bold text-cyan-400">
              {grid}
            </span>
          </div>

          {/* Name input */}
          <div>
            <label
              htmlFor="pin-name"
              className="block text-sm font-medium text-gray-300 mb-1"
            >
              Name (optional)
            </label>
            <input
              ref={nameInputRef}
              id="pin-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={grid || "Enter a name..."}
              className="w-full px-3 py-2 bg-gray-800/50 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              maxLength={50}
            />
          </div>

          {/* Category selector */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Category
            </label>
            <div className="grid grid-cols-5 gap-2">
              {PIN_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategory(cat.id)}
                  className={`
                    flex flex-col items-center justify-center p-2 rounded-lg border transition-all
                    ${
                      category === cat.id
                        ? "border-cyan-500 bg-cyan-500/20"
                        : "border-white/10 bg-gray-800/50 hover:bg-gray-700/50"
                    }
                  `}
                  title={cat.label}
                >
                  <span className="text-xl">{cat.icon}</span>
                  <span className="text-xs text-gray-400 mt-1 truncate w-full text-center">
                    {cat.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Color picker */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-300">
                Color
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-400">
                <input
                  type="checkbox"
                  checked={useCustomColor}
                  onChange={(e) => setUseCustomColor(e.target.checked)}
                  className="rounded border-gray-600 bg-gray-800 text-cyan-500 focus:ring-cyan-500"
                />
                Custom color
              </label>
            </div>
            <div className="flex gap-2 flex-wrap">
              {(useCustomColor
                ? PRESET_COLORS
                : [getCategoryMeta(category).color]
              ).map((presetColor) => (
                <button
                  key={presetColor}
                  type="button"
                  onClick={() => setColor(presetColor)}
                  className={`
                      w-8 h-8 rounded-full border-2 transition-all
                      ${
                        color === presetColor
                          ? "border-white scale-110"
                          : "border-transparent hover:border-white/50"
                      }
                    `}
                  style={{ backgroundColor: presetColor }}
                  title={presetColor}
                  aria-label={`Select color ${presetColor}`}
                />
              ))}
              {useCustomColor && (
                <>
                  {PRESET_COLORS.filter(
                    (c) => c !== getCategoryMeta(category).color,
                  ).map((presetColor) => (
                    <button
                      key={presetColor}
                      type="button"
                      onClick={() => setColor(presetColor)}
                      className={`
                        w-8 h-8 rounded-full border-2 transition-all
                        ${
                          color === presetColor
                            ? "border-white scale-110"
                            : "border-transparent hover:border-white/50"
                        }
                      `}
                      style={{ backgroundColor: presetColor }}
                      title={presetColor}
                      aria-label={`Select color ${presetColor}`}
                    />
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Expiration date for DXpeditions */}
          {category === "dxpedition" && (
            <div>
              <label
                htmlFor="pin-expires"
                className="block text-sm font-medium text-gray-300 mb-1"
              >
                End Date (optional)
              </label>
              <input
                id="pin-expires"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800/50 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                min={new Date().toISOString().split("T")[0]}
              />
            </div>
          )}

          {/* Notes textarea */}
          <div>
            <label
              htmlFor="pin-notes"
              className="block text-sm font-medium text-gray-300 mb-1"
            >
              Notes (optional)
            </label>
            <textarea
              id="pin-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes or context..."
              rows={3}
              className="w-full px-3 py-2 bg-gray-800/50 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-none"
              maxLength={500}
            />
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-700/50 hover:bg-gray-600/50 text-gray-300 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-medium rounded-lg transition-colors"
            >
              {mode === "add" ? "Add Pin" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(dialogContent, document.body);
}

AddPinDialog.displayName = "AddPinDialog";

export default AddPinDialog;
