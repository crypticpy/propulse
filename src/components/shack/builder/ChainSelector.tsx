/**
 * ChainSelector — Dropdown to switch between station chains.
 *
 * Displays the active chain name, opens a dropdown list of all chains,
 * and provides create / duplicate / delete actions.
 */

import { useState, useEffect, useRef } from "react";
import type { StationChain } from "@/types/stationChain";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ChainSelectorProps {
  activeChain: StationChain | null;
  chains: StationChain[];
  onSelect: (chainId: string) => void;
  onCreate: () => void;
  onDelete: (chainId: string) => void;
  onDuplicate: (chainId: string) => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ChainSelector({
  activeChain,
  chains,
  onSelect,
  onCreate,
  onDelete,
  onDuplicate,
}: ChainSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuChainId, setMenuChainId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setMenuChainId(null);
      }
    }

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsOpen(false);
        setMenuChainId(null);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="
          flex items-center gap-2 px-3 py-2 rounded-xl
          bg-panel/30 backdrop-blur-sm border border-white/5
          hover:border-white/10 transition-colors duration-150
          text-left w-full min-w-0
        "
      >
        <span className="flex-1 min-w-0 truncate text-sm font-medium text-gray-200">
          {activeChain?.name ?? "No signal path selected"}
        </span>
        <svg
          className={`w-4 h-4 text-gray-400 shrink-0 transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          className="
            absolute top-full left-0 right-0 mt-1 z-50
            bg-void-black/95 backdrop-blur-md border border-white/10
            rounded-xl shadow-xl overflow-hidden
          "
        >
          {/* Chain list */}
          <div className="max-h-60 overflow-y-auto py-1">
            {chains.length === 0 && (
              <p className="text-xs text-gray-500 italic text-center py-4 px-3">
                No signal paths yet
              </p>
            )}

            {chains.map((chain) => {
              const isActive = chain.id === activeChain?.id;
              const isMenuOpen = menuChainId === chain.id;

              return (
                <div key={chain.id} className="relative">
                  <button
                    onClick={() => {
                      onSelect(chain.id);
                      setIsOpen(false);
                      setMenuChainId(null);
                    }}
                    className={`
                      w-full flex items-center gap-2 px-3 py-2 text-left
                      transition-colors duration-100
                      ${isActive ? "bg-plasma-orange/10 text-gray-100" : "text-gray-300 hover:bg-white/5"}
                    `}
                  >
                    <span className="flex-1 min-w-0 truncate text-sm">
                      {chain.name}
                    </span>
                    <span className="shrink-0 text-[10px] text-gray-500">
                      {chain.nodes.length} node
                      {chain.nodes.length !== 1 ? "s" : ""}
                    </span>
                    {isActive && (
                      <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-plasma-orange/20 text-plasma-orange">
                        Active
                      </span>
                    )}

                    {/* Three-dot menu trigger */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuChainId(isMenuOpen ? null : chain.id);
                      }}
                      className="shrink-0 p-1 rounded hover:bg-white/10 text-gray-400 hover:text-gray-200"
                      aria-label="Signal path actions"
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <circle cx="10" cy="4" r="1.5" />
                        <circle cx="10" cy="10" r="1.5" />
                        <circle cx="10" cy="16" r="1.5" />
                      </svg>
                    </button>
                  </button>

                  {/* Context menu */}
                  {isMenuOpen && (
                    <div className="absolute right-2 top-full z-10 mt-0.5 bg-void-black border border-white/10 rounded-lg shadow-lg overflow-hidden">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDuplicate(chain.id);
                          setMenuChainId(null);
                        }}
                        className="w-full px-3 py-1.5 text-xs text-gray-300 hover:bg-white/5 text-left"
                      >
                        Duplicate
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(chain.id);
                          setMenuChainId(null);
                          setIsOpen(false);
                        }}
                        className="w-full px-3 py-1.5 text-xs text-alert-red hover:bg-alert-red/10 text-left"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* New chain button */}
          <div className="border-t border-white/5 p-1">
            <button
              onClick={() => {
                onCreate();
                setIsOpen(false);
              }}
              className="
                w-full flex items-center gap-2 px-3 py-2 rounded-lg
                text-sm text-gray-300 hover:bg-white/5 transition-colors duration-100
              "
            >
              <svg
                className="w-4 h-4 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4v16m8-8H4"
                />
              </svg>
              New Signal Path
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
