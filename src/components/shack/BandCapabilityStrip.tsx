/**
 * BandCapabilityStrip — Horizontal band pills colored by capability.
 *
 * Green (<3 dB loss), amber (3-6 dB), red (>6 dB).
 * Shows band name in each pill with a tooltip showing loss value.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

interface BandLoss {
  band: string;
  lossDb: number;
}

interface BandCapabilityStripProps {
  bands: BandLoss[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getLossColor(lossDb: number): string {
  if (lossDb < 3) {
    return "bg-signal-green/20 text-signal-green border-signal-green/30";
  }
  if (lossDb <= 6) {
    return "bg-caution-yellow/20 text-caution-yellow border-caution-yellow/30";
  }
  return "bg-alert-red/20 text-alert-red border-alert-red/30";
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BandCapabilityStrip({ bands }: BandCapabilityStripProps) {
  if (bands.length === 0) {
    return <div className="text-xs text-gray-500 italic">No band data</div>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {bands.map(({ band, lossDb }) => (
        <span
          key={band}
          title={`${band}: ${lossDb.toFixed(1)} dB loss`}
          className={`px-2 py-0.5 rounded text-[10px] font-medium border cursor-default ${getLossColor(lossDb)}`}
        >
          {band}
        </span>
      ))}
    </div>
  );
}
