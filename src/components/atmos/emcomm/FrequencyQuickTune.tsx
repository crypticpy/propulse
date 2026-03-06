import { useEmcommStore } from "@/stores/emcommStore";
import { useRigStore } from "@/stores/rigStore";
import type { FrequencyPlanEntry } from "@/types/emcomm";

/**
 * Emergency frequencies from the SPECIAL_FREQUENCIES database in regulatory.ts.
 * Extracted here as a static list so we don't depend on the Map internals.
 * Frequencies in kHz, converted to Hz for rig control.
 */
const EMERGENCY_FREQUENCIES: {
  label: string;
  frequencyKHz: number;
  mode: string;
  description: string;
}[] = [
  {
    label: "Global Emergency",
    frequencyKHz: 14300,
    mode: "USB",
    description: "Global emergency frequency (14.300 MHz)",
  },
  {
    label: "Regional Emergency",
    frequencyKHz: 7060,
    mode: "LSB",
    description: "Regional emergency frequency (7.060 MHz)",
  },
  {
    label: "ARES/RACES 80m",
    frequencyKHz: 3985,
    mode: "LSB",
    description: "ARES/RACES frequency (3.985 MHz)",
  },
  {
    label: "ARES/RACES 40m",
    frequencyKHz: 7231,
    mode: "LSB",
    description: "ARES/RACES frequency (7.231 MHz)",
  },
  {
    label: "IARU Region 2",
    frequencyKHz: 7240,
    mode: "LSB",
    description: "IARU Region 2 emergency center (7.240 MHz)",
  },
  {
    label: "Maritime/Aero",
    frequencyKHz: 14346,
    mode: "USB",
    description: "Maritime/aeronautical emergency (14.346 MHz)",
  },
];

function formatMHz(hz: number): string {
  return (hz / 1_000_000).toFixed(3);
}

function TuneButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 px-2.5 py-1 rounded text-[10px] font-mono font-bold tracking-wider bg-plasma-orange/15 text-plasma-orange hover:bg-plasma-orange/25 border border-plasma-orange/20 transition-colors"
    >
      TUNE
    </button>
  );
}

function ModeBadge({ mode }: { mode: string }) {
  return (
    <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold bg-white/5 text-gray-400 border border-white/5">
      {mode}
    </span>
  );
}

function FrequencyRow({ entry }: { entry: FrequencyPlanEntry }) {
  const tune = () => {
    useRigStore.getState().setPendingFrequency(entry.frequencyHz);
    useRigStore.getState().setPendingMode(entry.mode);
  };

  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-white/5 hover:bg-white/[0.03] transition-colors">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono text-white">
            {formatMHz(entry.frequencyHz)} MHz
          </span>
          <ModeBadge mode={entry.mode} />
        </div>
        <p className="text-[11px] text-gray-500 truncate mt-0.5">
          {entry.purpose}
        </p>
      </div>
      <TuneButton onClick={tune} />
    </div>
  );
}

function EmergencyFrequencyRow({
  freq,
}: {
  freq: (typeof EMERGENCY_FREQUENCIES)[number];
}) {
  const tune = () => {
    useRigStore.getState().setPendingFrequency(freq.frequencyKHz * 1000);
    useRigStore.getState().setPendingMode(freq.mode);
  };

  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-white/5 hover:bg-white/[0.03] transition-colors">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono text-white">
            {(freq.frequencyKHz / 1000).toFixed(3)} MHz
          </span>
          <ModeBadge mode={freq.mode} />
        </div>
        <p className="text-[11px] text-gray-500 truncate mt-0.5">
          {freq.description}
        </p>
      </div>
      <TuneButton onClick={tune} />
    </div>
  );
}

export function FrequencyQuickTune() {
  const selectedPlanId = useEmcommStore((s) => s.selectedPlanId);
  const frequencyPlans = useEmcommStore((s) => s.frequencyPlans);

  const activePlan = selectedPlanId
    ? frequencyPlans.find((p) => p.id === selectedPlanId)
    : null;

  return (
    <div className="space-y-3">
      {/* Active frequency plan entries */}
      <div>
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 px-3 mb-1">
          Frequency Plan
        </h4>
        {activePlan ? (
          <div className="rounded-md border border-white/5 bg-void-black/30 overflow-hidden">
            {activePlan.entries.map((entry, i) => (
              <FrequencyRow key={`${entry.frequencyHz}-${i}`} entry={entry} />
            ))}
            {activePlan.entries.length === 0 && (
              <p className="px-3 py-3 text-xs text-gray-500 italic">
                No frequencies in this plan
              </p>
            )}
          </div>
        ) : (
          <p className="px-3 text-xs text-gray-500 italic">
            No frequency plan selected
          </p>
        )}
      </div>

      {/* Emergency frequencies */}
      <div>
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 px-3 mb-1">
          Emergency Frequencies
        </h4>
        <div className="rounded-md border border-white/5 bg-void-black/30 overflow-hidden">
          {EMERGENCY_FREQUENCIES.map((freq) => (
            <EmergencyFrequencyRow key={freq.frequencyKHz} freq={freq} />
          ))}
        </div>
      </div>
    </div>
  );
}
