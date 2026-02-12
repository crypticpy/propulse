/**
 * ActivationFields — Collapsible section for POTA/SOTA/IOTA and contest fields.
 *
 * Supports MY_SIG/SIG programs and serial exchange fields.
 */

import { useState } from "react";

export interface ActivationFieldsProps {
  mySig: string;
  mySigInfo: string;
  sig: string;
  sigInfo: string;
  contestId: string;
  stx: string;
  srx: string;
  onFieldChange: (
    field:
      | "mySig"
      | "mySigInfo"
      | "sig"
      | "sigInfo"
      | "contestId"
      | "stx"
      | "srx",
    value: string,
  ) => void;
}

const SIG_OPTIONS = ["", "POTA", "SOTA", "IOTA", "WWFF"];

export function ActivationFields({
  mySig,
  mySigInfo,
  sig,
  sigInfo,
  contestId,
  stx,
  srx,
  onFieldChange,
}: ActivationFieldsProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Auto-open if any activation field has a value
  const hasValues =
    mySig || mySigInfo || sig || sigInfo || contestId || stx || srx;

  const isExpanded = isOpen || Boolean(hasValues);

  return (
    <div className="border border-white/5 rounded-lg overflow-hidden">
      {/* Disclosure toggle */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isExpanded}
        aria-controls="activation-fields-content"
        className="
          w-full flex items-center gap-2 px-3 py-2.5
          text-sm text-gray-400 hover:text-gray-200
          transition-colors
        "
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          className={`transition-transform ${isExpanded ? "rotate-90" : ""}`}
          aria-hidden="true"
        >
          <path
            d="M3 1L7 5L3 9"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Activation &amp; Contest
        {hasValues && (
          <span className="ml-1 w-1.5 h-1.5 rounded-full bg-plasma-orange" />
        )}
      </button>

      {/* Collapsible content */}
      {isExpanded && (
        <div id="activation-fields-content" className="px-3 pb-3 space-y-3">
          {/* Activation programs */}
          <div className="grid grid-cols-2 gap-3">
            {/* My activation */}
            <div>
              <label
                htmlFor="qso-my-sig"
                className="block text-xs text-gray-500 mb-1"
              >
                My Program
              </label>
              <select
                id="qso-my-sig"
                aria-label="My activation program"
                value={mySig}
                onChange={(e) => onFieldChange("mySig", e.target.value)}
                className="
                  w-full h-9 px-2
                  bg-white/5 border border-white/10 rounded-lg
                  text-white text-sm font-mono
                  focus:border-plasma-orange/50 focus:ring-1 focus:ring-plasma-orange/30
                  focus:outline-none appearance-none cursor-pointer
                "
              >
                {SIG_OPTIONS.map((opt) => (
                  <option
                    key={opt}
                    value={opt}
                    className="bg-deep-space text-white"
                  >
                    {opt || "None"}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="qso-my-sig-info"
                className="block text-xs text-gray-500 mb-1"
              >
                My Reference
              </label>
              <input
                id="qso-my-sig-info"
                aria-label="My activation reference"
                type="text"
                value={mySigInfo}
                onChange={(e) =>
                  onFieldChange("mySigInfo", e.target.value.toUpperCase())
                }
                placeholder="K-1234"
                className="
                  w-full h-9 px-2
                  bg-white/5 border border-white/10 rounded-lg
                  text-white text-sm font-mono
                  placeholder-gray-500
                  focus:border-plasma-orange/50 focus:ring-1 focus:ring-plasma-orange/30
                  focus:outline-none
                "
              />
            </div>
          </div>

          {/* Their activation */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="qso-sig"
                className="block text-xs text-gray-500 mb-1"
              >
                Their Program
              </label>
              <select
                id="qso-sig"
                aria-label="Their activation program"
                value={sig}
                onChange={(e) => onFieldChange("sig", e.target.value)}
                className="
                  w-full h-9 px-2
                  bg-white/5 border border-white/10 rounded-lg
                  text-white text-sm font-mono
                  focus:border-plasma-orange/50 focus:ring-1 focus:ring-plasma-orange/30
                  focus:outline-none appearance-none cursor-pointer
                "
              >
                {SIG_OPTIONS.map((opt) => (
                  <option
                    key={opt}
                    value={opt}
                    className="bg-deep-space text-white"
                  >
                    {opt || "None"}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="qso-sig-info"
                className="block text-xs text-gray-500 mb-1"
              >
                Their Reference
              </label>
              <input
                id="qso-sig-info"
                aria-label="Their activation reference"
                type="text"
                value={sigInfo}
                onChange={(e) =>
                  onFieldChange("sigInfo", e.target.value.toUpperCase())
                }
                placeholder="K-5678"
                className="
                  w-full h-9 px-2
                  bg-white/5 border border-white/10 rounded-lg
                  text-white text-sm font-mono
                  placeholder-gray-500
                  focus:border-plasma-orange/50 focus:ring-1 focus:ring-plasma-orange/30
                  focus:outline-none
                "
              />
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-white/5" />

          {/* Contest fields */}
          <div>
            <label
              htmlFor="qso-contest-id"
              className="block text-xs text-gray-500 mb-1"
            >
              Contest ID
            </label>
            <input
              id="qso-contest-id"
              aria-label="Contest ID"
              type="text"
              value={contestId}
              onChange={(e) =>
                onFieldChange("contestId", e.target.value.toUpperCase())
              }
              placeholder="CQ-WW-SSB"
              className="
                w-full h-9 px-2
                bg-white/5 border border-white/10 rounded-lg
                text-white text-sm font-mono
                placeholder-gray-500
                focus:border-plasma-orange/50 focus:ring-1 focus:ring-plasma-orange/30
                focus:outline-none
              "
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="qso-stx"
                className="block text-xs text-gray-500 mb-1"
              >
                Serial Sent
              </label>
              <input
                id="qso-stx"
                aria-label="Serial sent"
                type="text"
                inputMode="numeric"
                value={stx}
                onChange={(e) => onFieldChange("stx", e.target.value)}
                placeholder="001"
                className="
                  w-full h-9 px-2
                  bg-white/5 border border-white/10 rounded-lg
                  text-white text-sm font-mono text-center
                  placeholder-gray-500
                  focus:border-plasma-orange/50 focus:ring-1 focus:ring-plasma-orange/30
                  focus:outline-none
                "
              />
            </div>
            <div>
              <label
                htmlFor="qso-srx"
                className="block text-xs text-gray-500 mb-1"
              >
                Serial Rcvd
              </label>
              <input
                id="qso-srx"
                aria-label="Serial received"
                type="text"
                inputMode="numeric"
                value={srx}
                onChange={(e) => onFieldChange("srx", e.target.value)}
                placeholder="001"
                className="
                  w-full h-9 px-2
                  bg-white/5 border border-white/10 rounded-lg
                  text-white text-sm font-mono text-center
                  placeholder-gray-500
                  focus:border-plasma-orange/50 focus:ring-1 focus:ring-plasma-orange/30
                  focus:outline-none
                "
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
