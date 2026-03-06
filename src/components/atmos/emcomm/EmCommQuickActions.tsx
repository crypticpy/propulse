/**
 * EmCommQuickActions -- Floating action cluster for the map overlay.
 * Visible only when an EmComm activation is in progress. Positioned
 * bottom-right of the map viewport for fast operator access.
 */

import { useState } from "react";
import { useRigStore } from "@/stores/rigStore";
import { ICS213Modal } from "./ICS213Modal";

/**
 * Scroll the EmComm sidebar to the SitRep section by finding the first
 * element with the data attribute, or fall back to dispatching a custom event
 * that the sidebar can listen for.
 */
function scrollToSitRep() {
  const el = document.querySelector('[data-section="sitrep"]');
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  // Fallback: fire custom event the sidebar could pick up
  window.dispatchEvent(new CustomEvent("emcomm:open-sitrep"));
}

function tuneEmergencyFrequency() {
  useRigStore.getState().setPendingFrequency(14_300_000);
  useRigStore.getState().setPendingMode("USB");
}

export function EmCommQuickActions() {
  const [icsOpen, setIcsOpen] = useState(false);

  return (
    <>
      <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-2">
        <button
          type="button"
          onClick={scrollToSitRep}
          className="px-3 py-1.5 rounded-full text-[11px] font-mono font-bold tracking-wide bg-deep-space/80 text-gray-200 hover:text-white border border-white/10 hover:border-plasma-orange/40 backdrop-blur-sm transition-colors"
        >
          SitRep
        </button>

        <button
          type="button"
          onClick={() => setIcsOpen(true)}
          className="px-3 py-1.5 rounded-full text-[11px] font-mono font-bold tracking-wide bg-deep-space/80 text-gray-200 hover:text-white border border-white/10 hover:border-plasma-orange/40 backdrop-blur-sm transition-colors"
        >
          ICS-213
        </button>

        <button
          type="button"
          onClick={tuneEmergencyFrequency}
          className="px-3 py-1.5 rounded-full text-[11px] font-mono font-bold tracking-wide bg-alert-red/20 text-alert-red hover:bg-alert-red/30 border border-alert-red/30 backdrop-blur-sm transition-colors"
          title="Tune to 14.300 MHz (Global Emergency)"
        >
          14.300
        </button>
      </div>

      <ICS213Modal open={icsOpen} onClose={() => setIcsOpen(false)} />
    </>
  );
}
