import { useState } from "react";
import { Card } from "@/components/ui";

interface BandInfo {
  name: string;
  frequency: string;
  bestFor: string;
  peakHours: string;
  characteristics: string[];
  popularModes: string[];
  beginnerTips: string[];
  dayCondition: "excellent" | "good" | "fair" | "poor" | "closed";
  nightCondition: "excellent" | "good" | "fair" | "poor" | "closed";
}

const BANDS: BandInfo[] = [
  {
    name: "160 meters",
    frequency: "1.8 - 2.0 MHz",
    bestFor: "Regional to continental DX",
    peakHours: "Night only (after sunset)",
    characteristics: [
      'Known as the "Top Band" or "Gentleman\'s Band"',
      "Very challenging due to high noise levels",
      "Completely absorbed by D layer during day",
      "Long skip distances at night (1000+ miles)",
      "Seasonal - best in winter when nights are long",
    ],
    popularModes: [
      "CW (1.800-1.840 MHz)",
      "FT8 (1.840 MHz)",
      "SSB (1.840-2.000 MHz)",
    ],
    beginnerTips: [
      "This is an advanced band - master the basics elsewhere first",
      "Requires large antennas (80+ feet for a dipole)",
      "High atmospheric noise in summer - stick to winter",
      "Gray line propagation can be spectacular",
    ],
    dayCondition: "closed",
    nightCondition: "good",
  },
  {
    name: "80 meters",
    frequency: "3.5 - 4.0 MHz",
    bestFor: "Regional nets, NVIS, night DX",
    peakHours: "Evening through morning",
    characteristics: [
      "Reliable regional coverage via NVIS",
      "Worldwide DX possible at night",
      "High noise levels, especially in summer",
      "Good for emergency communications",
      "Popular for nets and ragchewing",
    ],
    popularModes: [
      "CW (3.500-3.600 MHz)",
      "FT8 (3.573 MHz)",
      "SSB (3.600-4.000 MHz)",
    ],
    beginnerTips: [
      "Great for local/regional contacts any time",
      "Listen for DX in early morning hours (3-6 AM local)",
      "Summer nights can be noisy - be patient",
      "Good band to practice CW",
    ],
    dayCondition: "fair",
    nightCondition: "excellent",
  },
  {
    name: "60 meters",
    frequency: "5.3 MHz (channelized)",
    bestFor: "NVIS and regional coverage",
    peakHours: "Daytime and evening",
    characteristics: [
      "Channelized operation (5 channels in US)",
      "Maximum 100W ERP, USB only",
      "Excellent NVIS coverage (300 mile radius)",
      "Shared with government services",
      "Good propagation day and night",
    ],
    popularModes: [
      "USB only",
      "FT8 (Channel 3, 5.357 MHz)",
      "CW permitted on some channels",
    ],
    beginnerTips: [
      "Know the channel frequencies and power limits",
      "USB mode required (not LSB like other low bands)",
      "Great for emergency preparedness",
      "Listen before transmitting - shared allocation",
    ],
    dayCondition: "good",
    nightCondition: "good",
  },
  {
    name: "40 meters",
    frequency: "7.0 - 7.3 MHz",
    bestFor: "Day regional, night DX",
    peakHours: "24 hours (varies by distance)",
    characteristics: [
      "The most versatile band",
      "Regional coverage during day",
      "Excellent worldwide DX at night",
      'Known as the "workhorse" band',
      "Good balance of antenna size and performance",
    ],
    popularModes: [
      "CW (7.000-7.125 MHz)",
      "FT8 (7.074 MHz)",
      "SSB (7.125-7.300 MHz)",
    ],
    beginnerTips: [
      "Great first band for DX",
      "Listen around 7.074 MHz for FT8 signals",
      "Band can be busy - find a clear frequency",
      "DX usually appears after local sunset",
    ],
    dayCondition: "good",
    nightCondition: "excellent",
  },
  {
    name: "30 meters",
    frequency: "10.1 - 10.15 MHz",
    bestFor: "DX, especially digital modes",
    peakHours: "Daytime and early evening",
    characteristics: [
      "CW and digital modes only (no phone)",
      "Narrow band - only 50 kHz wide",
      "Excellent propagation characteristics",
      "Less crowded than 20m or 40m",
      "Works well day and night",
    ],
    popularModes: ["CW (10.100-10.130 MHz)", "FT8 (10.136 MHz)"],
    beginnerTips: [
      "Perfect for FT8 - active and less congested",
      "Learn CW to fully use this band",
      "Maximum 200W in US",
      "Great band when 20m is crowded",
    ],
    dayCondition: "excellent",
    nightCondition: "good",
  },
  {
    name: "20 meters",
    frequency: "14.0 - 14.35 MHz",
    bestFor: "Worldwide DX",
    peakHours: "Daytime (often 24 hours)",
    characteristics: [
      "The most popular DX band",
      "Works well during solar max",
      "Often open 24 hours during high solar activity",
      "First band to open, last to close",
      "Reliable worldwide propagation",
    ],
    popularModes: [
      "FT8 (14.074 MHz)",
      "CW (14.000-14.070 MHz)",
      "SSB (14.150-14.350 MHz)",
    ],
    beginnerTips: [
      "Start here for your first DX contact",
      "Listen around 14.074 for FT8 signals",
      "Best propagation: mid-morning to early evening",
      "Check band conditions on Propulse before operating",
    ],
    dayCondition: "excellent",
    nightCondition: "good",
  },
  {
    name: "17 meters",
    frequency: "18.068 - 18.168 MHz",
    bestFor: "DX with less crowding",
    peakHours: "Daytime",
    characteristics: [
      "WARC band - no contests",
      "Similar propagation to 20m but less crowded",
      "Opens slightly later than 20m",
      "Excellent for working rare DX",
      "Narrow band - 100 kHz",
    ],
    popularModes: [
      "FT8 (18.100 MHz)",
      "CW (18.068-18.095 MHz)",
      "SSB (18.110-18.168 MHz)",
    ],
    beginnerTips: [
      "Try here when 20m is too crowded",
      "Smaller antennas work well",
      "DXpeditions often operate here",
      "Opens later and closes earlier than 20m",
    ],
    dayCondition: "excellent",
    nightCondition: "fair",
  },
  {
    name: "15 meters",
    frequency: "21.0 - 21.45 MHz",
    bestFor: "Worldwide DX",
    peakHours: "Mid-morning to late afternoon",
    characteristics: [
      "Excellent DX when open",
      "Very dependent on solar activity",
      "Can be completely dead during solar minimum",
      "Shorter skip distance than 20m",
      "Often has strong, clear signals",
    ],
    popularModes: [
      "FT8 (21.074 MHz)",
      "CW (21.000-21.070 MHz)",
      "SSB (21.200-21.450 MHz)",
    ],
    beginnerTips: [
      "Check SFI - needs higher solar flux",
      "Great band during solar maximum",
      "Smaller antennas than 20m",
      "Watch for sudden openings",
    ],
    dayCondition: "good",
    nightCondition: "poor",
  },
  {
    name: "12 meters",
    frequency: "24.89 - 24.99 MHz",
    bestFor: "DX during high solar activity",
    peakHours: "Midday (when open)",
    characteristics: [
      "WARC band - no contests",
      "Very solar-sensitive",
      "Excellent when open, often closed",
      "Short skip rare, mostly DX",
      "Narrow band - 100 kHz",
    ],
    popularModes: [
      "FT8 (24.915 MHz)",
      "CW (24.890-24.920 MHz)",
      "SSB (24.930-24.990 MHz)",
    ],
    beginnerTips: [
      "Worth checking during high SFI periods",
      "Can have amazing openings unexpectedly",
      "Small, simple antennas work",
      "Good for working DXpeditions",
    ],
    dayCondition: "fair",
    nightCondition: "poor",
  },
  {
    name: "10 meters",
    frequency: "28.0 - 29.7 MHz",
    bestFor: "DX and sporadic E",
    peakHours: "Midday (solar) / Anytime (Es)",
    characteristics: [
      "Widest HF band (1.7 MHz)",
      "Spectacular during solar maximum",
      "Can be completely dead during solar minimum",
      "Sporadic E provides summer openings",
      "Supports FM operation",
    ],
    popularModes: [
      "FT8 (28.074 MHz)",
      "CW (28.000-28.070 MHz)",
      "SSB (28.300-28.600 MHz)",
      "FM (29.600 MHz simplex)",
    ],
    beginnerTips: [
      "Monitor 28.074 MHz FT8 for band openings",
      "Summer sporadic E can produce amazing openings",
      "Very small antennas work well",
      "During solar max, can work worldwide with low power",
    ],
    dayCondition: "fair",
    nightCondition: "poor",
  },
  {
    name: "6 meters",
    frequency: "50 - 54 MHz",
    bestFor: "Sporadic E, meteor scatter",
    peakHours: "Variable (Es events unpredictable)",
    characteristics: [
      'Known as the "Magic Band"',
      "Sporadic E provides exciting openings",
      "Can be dead for weeks, then suddenly open",
      "Meteor scatter enables brief contacts",
      "Sometimes F2 propagation during solar max",
    ],
    popularModes: [
      "FT8 (50.313 MHz)",
      "CW (50.000-50.100 MHz)",
      "SSB (50.125 MHz calling)",
    ],
    beginnerTips: [
      "Watch FT8 on 50.313 MHz for activity",
      "Summer is prime sporadic E season",
      "Be ready to operate when band opens",
      "Openings can last minutes to hours",
    ],
    dayCondition: "poor",
    nightCondition: "poor",
  },
];

function ConditionBadge({
  condition,
}: {
  condition: "excellent" | "good" | "fair" | "poor" | "closed";
}) {
  const styles = {
    excellent: "bg-signal-green/20 text-signal-green border-signal-green/30",
    good: "bg-good/20 text-good border-good/30",
    fair: "bg-caution-amber/20 text-caution-amber border-caution-amber/30",
    poor: "bg-alert-red/20 text-alert-red border-alert-red/30",
    closed: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  };

  return (
    <span
      className={`px-2 py-0.5 text-xs font-mono rounded border ${styles[condition]}`}
    >
      {condition}
    </span>
  );
}

interface BandCardProps {
  band: BandInfo;
}

function BandCard({ band }: BandCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full text-left"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-white">{band.name}</h3>
            <p className="text-sm text-plasma-orange font-mono">
              {band.frequency}
            </p>
          </div>
          <div className="flex flex-col gap-1 items-end">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Day:</span>
              <ConditionBadge condition={band.dayCondition} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Night:</span>
              <ConditionBadge condition={band.nightCondition} />
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <p className="text-sm text-gray-300">
            <span className="text-gray-500">Best for:</span> {band.bestFor}
          </p>
          <span
            className={`text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </span>
        </div>
      </button>

      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-white/10 space-y-4">
          <div>
            <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Peak Hours
            </h4>
            <p className="text-gray-300">{band.peakHours}</p>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Characteristics
            </h4>
            <ul className="space-y-1">
              {band.characteristics.map((item, i) => (
                <li
                  key={i}
                  className="text-sm text-gray-300 flex items-start gap-2"
                >
                  <span className="text-plasma-orange">-</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Popular Frequencies
            </h4>
            <div className="flex flex-wrap gap-2">
              {band.popularModes.map((mode, i) => (
                <span
                  key={i}
                  className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-gray-300 font-mono"
                >
                  {mode}
                </span>
              ))}
            </div>
          </div>

          <div className="bg-cosmic-cyan/10 border border-cosmic-cyan/30 rounded-lg p-3">
            <h4 className="text-sm font-semibold text-cosmic-cyan mb-2">
              Beginner Tips
            </h4>
            <ul className="space-y-1">
              {band.beginnerTips.map((tip, i) => (
                <li
                  key={i}
                  className="text-sm text-gray-300 flex items-start gap-2"
                >
                  <span className="text-cosmic-cyan">*</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Card>
  );
}

/**
 * BandGuide - Information about each amateur radio HF band
 */
export function BandGuide() {
  return (
    <div className="space-y-4">
      <Card className="mb-6">
        <p className="text-gray-300">
          Each amateur radio band has unique propagation characteristics. Lower
          bands work better at night, higher bands during the day. Click any
          band for detailed information.
        </p>

        {/* Quick reference legend */}
        <div className="mt-4 pt-4 border-t border-white/10">
          <div className="flex flex-wrap gap-4 text-xs">
            <div className="flex items-center gap-2">
              <ConditionBadge condition="excellent" />
              <span className="text-gray-400">Primary band for this time</span>
            </div>
            <div className="flex items-center gap-2">
              <ConditionBadge condition="good" />
              <span className="text-gray-400">Usually works well</span>
            </div>
            <div className="flex items-center gap-2">
              <ConditionBadge condition="fair" />
              <span className="text-gray-400">Variable conditions</span>
            </div>
            <div className="flex items-center gap-2">
              <ConditionBadge condition="poor" />
              <span className="text-gray-400">Rarely useful</span>
            </div>
            <div className="flex items-center gap-2">
              <ConditionBadge condition="closed" />
              <span className="text-gray-400">No propagation</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Band cards */}
      <div className="space-y-4">
        {BANDS.map((band) => (
          <BandCard key={band.name} band={band} />
        ))}
      </div>

      {/* Bottom tips */}
      <Card className="mt-6">
        <h3 className="text-lg font-semibold text-white mb-3">
          General Band Selection Tips
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white/5 rounded-lg p-3">
            <h4 className="font-medium text-plasma-orange mb-2">Morning</h4>
            <p className="text-sm text-gray-300">
              20m opens first, followed by 17m and 15m. Check 40m for lingering
              night-time DX.
            </p>
          </div>
          <div className="bg-white/5 rounded-lg p-3">
            <h4 className="font-medium text-plasma-orange mb-2">Midday</h4>
            <p className="text-sm text-gray-300">
              15m and 12m at their best (if open). 10m may have sporadic E or F2
              propagation.
            </p>
          </div>
          <div className="bg-white/5 rounded-lg p-3">
            <h4 className="font-medium text-cosmic-cyan mb-2">Evening</h4>
            <p className="text-sm text-gray-300">
              20m still good. 40m starts opening for DX. Gray line propagation
              peaks.
            </p>
          </div>
          <div className="bg-white/5 rounded-lg p-3">
            <h4 className="font-medium text-cosmic-cyan mb-2">Night</h4>
            <p className="text-sm text-gray-300">
              40m, 80m, and 160m shine. Long-distance DX on lower bands. Higher
              bands closed.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default BandGuide;
