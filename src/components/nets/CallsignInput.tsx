/**
 * CallsignInput -- Focused text input for NCS to log callsigns heard on the air.
 *
 * Auto-uppercases input, submits on Enter, clears and refocuses after submit.
 * When a netId is provided, fetches callsign history from past sessions and
 * displays an auto-complete dropdown as the operator types (>=2 chars).
 *
 * Keyboard: Tab accepts top suggestion, Arrow keys navigate, Enter fills+submits,
 * Escape closes the dropdown.
 */

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useNetStore } from "@/stores/netStore";

interface CallsignInputProps {
  onSubmit: (callsign: string) => void;
  disabled?: boolean;
  netId?: string;
}

export function CallsignInput({
  onSubmit,
  disabled,
  netId,
}: CallsignInputProps) {
  const [value, setValue] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const callsignHistory = useNetStore((s) => s.callsignHistory);
  const fetchCallsignHistory = useNetStore((s) => s.fetchCallsignHistory);

  // Fetch callsign history on mount when netId is provided
  useEffect(() => {
    if (netId) {
      fetchCallsignHistory(netId);
    }
  }, [netId, fetchCallsignHistory]);

  // Filter suggestions based on current input (min 2 chars)
  const suggestions = useMemo(() => {
    const upper = value.trim().toUpperCase();
    if (upper.length < 2) return [];
    return callsignHistory
      .filter((cs) => cs.toUpperCase().includes(upper))
      .slice(0, 6);
  }, [value, callsignHistory]);

  // Show/hide dropdown based on suggestions
  useEffect(() => {
    setIsOpen(suggestions.length > 0);
    setHighlightIndex(-1);
  }, [suggestions]);

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
    setHighlightIndex(-1);
  }, []);

  const handleSubmit = useCallback(
    (callsign?: string) => {
      const trimmed = (callsign ?? value).trim().toUpperCase();
      if (!trimmed) return;
      onSubmit(trimmed);
      setValue("");
      closeDropdown();
      // Refocus after submit
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    [value, onSubmit, closeDropdown],
  );

  const acceptSuggestion = useCallback(
    (callsign: string, submit: boolean) => {
      setValue(callsign);
      closeDropdown();
      if (submit) {
        // Defer submit so state updates propagate
        requestAnimationFrame(() => {
          onSubmit(callsign.trim().toUpperCase());
          setValue("");
          requestAnimationFrame(() => inputRef.current?.focus());
        });
      } else {
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    },
    [onSubmit, closeDropdown],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!isOpen) {
        // No dropdown open — Enter submits directly
        if (e.key === "Enter") {
          e.preventDefault();
          handleSubmit();
        }
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setHighlightIndex((prev) =>
            prev < suggestions.length - 1 ? prev + 1 : 0,
          );
          break;

        case "ArrowUp":
          e.preventDefault();
          setHighlightIndex((prev) =>
            prev > 0 ? prev - 1 : suggestions.length - 1,
          );
          break;

        case "Tab":
          // Accept top suggestion (or highlighted) but don't submit
          e.preventDefault();
          {
            const idx = highlightIndex >= 0 ? highlightIndex : 0;
            if (suggestions[idx]) {
              acceptSuggestion(suggestions[idx], false);
            }
          }
          break;

        case "Enter":
          e.preventDefault();
          if (highlightIndex >= 0 && suggestions[highlightIndex]) {
            // Fill + submit the highlighted suggestion
            acceptSuggestion(suggestions[highlightIndex], true);
          } else {
            // Submit the raw input
            handleSubmit();
          }
          break;

        case "Escape":
          e.preventDefault();
          closeDropdown();
          break;
      }
    },
    [
      isOpen,
      suggestions,
      highlightIndex,
      handleSubmit,
      acceptSuggestion,
      closeDropdown,
    ],
  );

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        closeDropdown();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [closeDropdown]);

  // Highlight matching portion of a callsign
  const renderHighlighted = (callsign: string) => {
    const upper = value.trim().toUpperCase();
    const idx = callsign.toUpperCase().indexOf(upper);
    if (idx === -1) return <span>{callsign}</span>;

    return (
      <span>
        {callsign.slice(0, idx)}
        <span className="text-plasma-orange font-semibold">
          {callsign.slice(idx, idx + upper.length)}
        </span>
        {callsign.slice(idx + upper.length)}
      </span>
    );
  };

  return (
    <div className="relative flex items-center gap-2" data-callsign-input>
      <div className="relative flex-1">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value.toUpperCase())}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="Type callsign + Enter..."
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-activedescendant={
            highlightIndex >= 0
              ? `callsign-option-${highlightIndex}`
              : undefined
          }
          className="w-full bg-white/5 border border-white/20 rounded-xl text-base py-3 px-4 text-gray-200 font-mono placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-plasma-orange/70 focus:border-plasma-orange/50 focus:bg-white/[0.06] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        />

        {/* Auto-complete dropdown */}
        {isOpen && (
          <div
            ref={dropdownRef}
            role="listbox"
            className="absolute left-0 right-0 top-full mt-1 z-50 bg-deep-space/95 backdrop-blur-md border border-white/15 rounded-xl shadow-2xl overflow-hidden animate-in slide-in-from-top-1"
          >
            {suggestions.map((cs, i) => (
              <div
                key={cs}
                id={`callsign-option-${i}`}
                role="option"
                aria-selected={i === highlightIndex}
                onMouseDown={(e) => {
                  e.preventDefault();
                  acceptSuggestion(cs, true);
                }}
                onMouseEnter={() => setHighlightIndex(i)}
                className={`py-2.5 px-4 text-sm font-mono cursor-pointer transition-colors ${
                  i === highlightIndex
                    ? "bg-white/15 text-gray-100 border-l-2 border-l-plasma-orange"
                    : "text-gray-300 hover:bg-white/[0.10] border-l-2 border-l-transparent"
                }`}
              >
                {renderHighlighted(cs)}
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => handleSubmit()}
        disabled={disabled || !value.trim()}
        className="shrink-0 px-4 py-3 min-h-[44px] text-sm font-medium rounded-xl bg-plasma-orange/20 text-plasma-orange border border-plasma-orange/30 hover:bg-plasma-orange/30 hover:brightness-110 hover:shadow-[0_0_12px_rgba(255,107,53,0.2)] active:scale-[0.98] transition-all will-change-transform disabled:opacity-60 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-plasma-orange/70 focus-visible:outline-none"
      >
        Add
      </button>
    </div>
  );
}
