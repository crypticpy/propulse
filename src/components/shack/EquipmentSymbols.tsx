/**
 * EquipmentSymbols -- Standalone SVG electrical schematic symbols for use in
 * UI cards, headers, lists, and badges. Unlike ElectricalSymbols (which render
 * <g> groups for canvas embedding), these render complete <svg> elements
 * styled via Tailwind classes and `currentColor`.
 *
 * Default size: 40x40. Override via className (e.g. "w-5 h-5" for 20x20).
 * All symbols are stroke-based for dark-theme visibility.
 */

import React from "react";

// ---------------------------------------------------------------------------
// Shared props & SVG wrapper
// ---------------------------------------------------------------------------

interface SymbolProps {
  className?: string;
}

const defaultSvgProps = {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 40 40",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

// ---------------------------------------------------------------------------
// 1. RadioSymbol
// Rectangle body (transceiver) with sine wave emission arcs on the right.
// ---------------------------------------------------------------------------

export const RadioSymbol: React.FC<SymbolProps> = ({ className }) => (
  <svg {...defaultSvgProps} className={className ?? "w-10 h-10"}>
    {/* Transceiver body */}
    <rect x="8" y="12" width="16" height="16" rx="2" />
    {/* Speaker grille lines */}
    <line x1="12" y1="16" x2="12" y2="24" strokeWidth="1" opacity="0.4" />
    <line x1="15" y1="16" x2="15" y2="24" strokeWidth="1" opacity="0.4" />
    {/* Dial knob */}
    <circle cx="20" cy="20" r="2.5" strokeWidth="1" />
    {/* RF emission arcs */}
    <path d="M26 17 Q29 20 26 23" strokeWidth="1.2" opacity="0.7" />
    <path d="M29 14 Q33 20 29 26" strokeWidth="1.2" opacity="0.5" />
    <path d="M32 11 Q37 20 32 29" strokeWidth="1.2" opacity="0.3" />
  </svg>
);

// ---------------------------------------------------------------------------
// 2. AntennaSymbol
// Vertical element with angled dipole arms, small ground mark at bottom.
// ---------------------------------------------------------------------------

export const AntennaSymbol: React.FC<SymbolProps> = ({ className }) => (
  <svg {...defaultSvgProps} className={className ?? "w-10 h-10"}>
    {/* Left dipole arm */}
    <line x1="20" y1="8" x2="10" y2="16" />
    {/* Right dipole arm */}
    <line x1="20" y1="8" x2="30" y2="16" />
    {/* Vertical mast */}
    <line x1="20" y1="8" x2="20" y2="32" />
    {/* Feedpoint dot */}
    <circle cx="20" cy="8" r="1.5" fill="currentColor" stroke="none" />
    {/* Ground lines */}
    <line x1="14" y1="32" x2="26" y2="32" />
    <line x1="16" y1="35" x2="24" y2="35" strokeWidth="1.2" />
    <line x1="18" y1="38" x2="22" y2="38" strokeWidth="1" />
  </svg>
);

// ---------------------------------------------------------------------------
// 3. FeedlineSymbol
// Two parallel horizontal lines (transmission line / coax) with shield marks.
// ---------------------------------------------------------------------------

export const FeedlineSymbol: React.FC<SymbolProps> = ({ className }) => (
  <svg {...defaultSvgProps} className={className ?? "w-10 h-10"}>
    {/* Center conductor (top line) */}
    <line x1="4" y1="16" x2="36" y2="16" />
    {/* Shield / return (bottom line) */}
    <line x1="4" y1="24" x2="36" y2="24" />
    {/* Cross-hatching marks (coax shield indication) */}
    <line x1="12" y1="16" x2="12" y2="24" strokeWidth="1" opacity="0.4" />
    <line x1="20" y1="16" x2="20" y2="24" strokeWidth="1" opacity="0.4" />
    <line x1="28" y1="16" x2="28" y2="24" strokeWidth="1" opacity="0.4" />
    {/* Terminal dots */}
    <circle cx="4" cy="16" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="4" cy="24" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="36" cy="16" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="36" cy="24" r="1.5" fill="currentColor" stroke="none" />
  </svg>
);

// ---------------------------------------------------------------------------
// 4. AmplifierSymbol
// Right-pointing triangle (standard amplifier symbol) with input/output leads.
// ---------------------------------------------------------------------------

export const AmplifierSymbol: React.FC<SymbolProps> = ({ className }) => (
  <svg {...defaultSvgProps} className={className ?? "w-10 h-10"}>
    {/* Amplifier triangle body */}
    <polygon points="8,10 8,30 32,20" fill="none" />
    {/* Input lead */}
    <line x1="2" y1="20" x2="8" y2="20" />
    {/* Output lead */}
    <line x1="32" y1="20" x2="38" y2="20" />
    {/* Plus sign (gain indicator) */}
    <line x1="15" y1="20" x2="21" y2="20" strokeWidth="1" opacity="0.5" />
    <line x1="18" y1="17" x2="18" y2="23" strokeWidth="1" opacity="0.5" />
  </svg>
);

// ---------------------------------------------------------------------------
// 5. TunerSymbol
// Variable capacitor: two parallel plates with diagonal arrow through them.
// ---------------------------------------------------------------------------

export const TunerSymbol: React.FC<SymbolProps> = ({ className }) => (
  <svg {...defaultSvgProps} className={className ?? "w-10 h-10"}>
    {/* Left lead */}
    <line x1="4" y1="20" x2="14" y2="20" />
    {/* Top plate */}
    <line x1="14" y1="12" x2="14" y2="28" />
    {/* Bottom plate */}
    <line x1="22" y1="12" x2="22" y2="28" />
    {/* Right lead */}
    <line x1="22" y1="20" x2="32" y2="20" />
    {/* Curved plate (variable capacitor indication) */}
    <path d="M18 12 Q20 20 18 28" strokeWidth="1.2" opacity="0.5" />
    {/* Diagonal arrow (variable) */}
    <line x1="10" y1="30" x2="30" y2="8" strokeWidth="1.2" />
    {/* Arrowhead */}
    <polyline points="26,8 30,8 30,12" strokeWidth="1.2" fill="none" />
  </svg>
);

// ---------------------------------------------------------------------------
// 6. FilterSymbol
// Inductor coil (wavy line) in series with capacitor plates (bandpass).
// ---------------------------------------------------------------------------

export const FilterSymbol: React.FC<SymbolProps> = ({ className }) => (
  <svg {...defaultSvgProps} className={className ?? "w-10 h-10"}>
    {/* Input lead */}
    <line x1="2" y1="14" x2="6" y2="14" />
    {/* Inductor bumps (top path) */}
    <path d="M6 14 Q9 6 12 14 Q15 6 18 14 Q21 6 24 14" fill="none" />
    {/* Lead from inductor to junction */}
    <line x1="24" y1="14" x2="34" y2="14" />
    {/* Output lead */}
    <line x1="34" y1="14" x2="38" y2="14" />
    {/* Capacitor to ground (shunt) */}
    <line x1="20" y1="14" x2="20" y2="22" strokeWidth="1.2" />
    {/* Capacitor plates */}
    <line x1="15" y1="22" x2="25" y2="22" />
    <line x1="15" y1="26" x2="25" y2="26" />
    {/* Ground connection */}
    <line x1="20" y1="26" x2="20" y2="30" strokeWidth="1.2" />
    <line x1="16" y1="30" x2="24" y2="30" strokeWidth="1" />
    <line x1="17.5" y1="32" x2="22.5" y2="32" strokeWidth="0.8" opacity="0.7" />
    <line x1="19" y1="34" x2="21" y2="34" strokeWidth="0.6" opacity="0.5" />
  </svg>
);

// ---------------------------------------------------------------------------
// 7. SwitchSymbol
// One terminal with arm raised to open position, second terminal.
// ---------------------------------------------------------------------------

export const SwitchSymbol: React.FC<SymbolProps> = ({ className }) => (
  <svg {...defaultSvgProps} className={className ?? "w-10 h-10"}>
    {/* Left lead */}
    <line x1="4" y1="24" x2="12" y2="24" />
    {/* Pivot contact (left terminal) */}
    <circle cx="12" cy="24" r="2" fill="currentColor" stroke="none" />
    {/* Switching arm (open position) */}
    <line x1="12" y1="24" x2="28" y2="14" />
    {/* Open contact (right terminal) */}
    <circle cx="28" cy="24" r="2" fill="none" />
    {/* Right lead */}
    <line x1="30" y1="24" x2="36" y2="24" />
    {/* Gap indicator (small arc) */}
    <path
      d="M25 16 Q27 18 28 22"
      strokeWidth="1"
      strokeDasharray="1.5 1.5"
      opacity="0.4"
    />
  </svg>
);

// ---------------------------------------------------------------------------
// 8. PowerSupplySymbol
// Circle (DC source) with + and - markings, output leads.
// ---------------------------------------------------------------------------

export const PowerSupplySymbol: React.FC<SymbolProps> = ({ className }) => (
  <svg {...defaultSvgProps} className={className ?? "w-10 h-10"}>
    {/* Source circle */}
    <circle cx="20" cy="20" r="10" />
    {/* Plus symbol */}
    <line x1="16" y1="16" x2="20" y2="16" strokeWidth="1.2" />
    <line x1="18" y1="14" x2="18" y2="18" strokeWidth="1.2" />
    {/* Minus symbol */}
    <line x1="20" y1="24" x2="24" y2="24" strokeWidth="1.2" />
    {/* Left lead (positive) */}
    <line x1="2" y1="20" x2="10" y2="20" />
    {/* Right lead (negative) */}
    <line x1="30" y1="20" x2="38" y2="20" />
    {/* Polarity dots */}
    <circle
      cx="6"
      cy="18"
      r="0.8"
      fill="currentColor"
      stroke="none"
      opacity="0.5"
    />
  </svg>
);

// ---------------------------------------------------------------------------
// 9. GroundSymbol
// Standard earth ground: vertical line down to 3 horizontal lines of
// decreasing width.
// ---------------------------------------------------------------------------

export const GroundSymbol: React.FC<SymbolProps> = ({ className }) => (
  <svg {...defaultSvgProps} className={className ?? "w-10 h-10"}>
    {/* Vertical stem */}
    <line x1="20" y1="4" x2="20" y2="16" />
    {/* Top line (widest) */}
    <line x1="8" y1="16" x2="32" y2="16" strokeWidth="1.8" />
    {/* Middle line */}
    <line x1="12" y1="22" x2="28" y2="22" strokeWidth="1.5" />
    {/* Bottom line (narrowest) */}
    <line x1="16" y1="28" x2="24" y2="28" strokeWidth="1.2" />
    {/* Earth hatch marks */}
    <line x1="17" y1="32" x2="15" y2="36" strokeWidth="0.8" opacity="0.4" />
    <line x1="20" y1="32" x2="18" y2="36" strokeWidth="0.8" opacity="0.4" />
    <line x1="23" y1="32" x2="21" y2="36" strokeWidth="0.8" opacity="0.4" />
  </svg>
);

// ---------------------------------------------------------------------------
// 10. AdapterSymbol
// Two different-sized connectors joined together (plug adapter).
// ---------------------------------------------------------------------------

export const AdapterSymbol: React.FC<SymbolProps> = ({ className }) => (
  <svg {...defaultSvgProps} className={className ?? "w-10 h-10"}>
    {/* Left connector (larger) */}
    <rect x="4" y="13" width="12" height="14" rx="1.5" />
    {/* Left pin */}
    <line x1="10" y1="18" x2="10" y2="22" strokeWidth="1" opacity="0.5" />
    {/* Right connector (smaller) */}
    <rect x="22" y="15" width="10" height="10" rx="1.5" />
    {/* Right pin */}
    <circle cx="27" cy="20" r="1.5" strokeWidth="1" opacity="0.5" />
    {/* Junction bridge */}
    <line x1="16" y1="17" x2="22" y2="17" />
    <line x1="16" y1="23" x2="22" y2="23" />
    {/* Leads */}
    <line x1="1" y1="20" x2="4" y2="20" />
    <line x1="32" y1="20" x2="38" y2="20" />
    {/* Transition chevron */}
    <polyline
      points="18,15 20,20 18,25"
      strokeWidth="1"
      opacity="0.4"
      fill="none"
    />
  </svg>
);

// ---------------------------------------------------------------------------
// 11. BalunSymbol
// Transformer coils: two inductor loops magnetically coupled (standard
// transformer schematic symbol).
// ---------------------------------------------------------------------------

export const BalunSymbol: React.FC<SymbolProps> = ({ className }) => (
  <svg {...defaultSvgProps} className={className ?? "w-10 h-10"}>
    {/* Primary winding (left) - 3 arcs */}
    <path
      d="M14 8 Q8 11 14 14 Q8 17 14 20 Q8 23 14 26 Q8 29 14 32"
      fill="none"
    />
    {/* Secondary winding (right) - 3 arcs */}
    <path
      d="M26 8 Q32 11 26 14 Q32 17 26 20 Q32 23 26 26 Q32 29 26 32"
      fill="none"
    />
    {/* Core lines (magnetic coupling) */}
    <line x1="18" y1="6" x2="18" y2="34" strokeWidth="1" opacity="0.4" />
    <line x1="22" y1="6" x2="22" y2="34" strokeWidth="1" opacity="0.4" />
    {/* Primary leads */}
    <line x1="4" y1="8" x2="14" y2="8" />
    <line x1="4" y1="32" x2="14" y2="32" />
    {/* Secondary leads */}
    <line x1="26" y1="8" x2="36" y2="8" />
    <line x1="26" y1="32" x2="36" y2="32" />
    {/* Dot convention markers */}
    <circle cx="12" cy="8" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="28" cy="8" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);

// ---------------------------------------------------------------------------
// Equipment type → symbol resolver
// ---------------------------------------------------------------------------

/**
 * Maps an equipment type or category string to the appropriate schematic
 * symbol component. Case-insensitive matching against common ham radio
 * equipment names.
 */
export function getEquipmentSymbol(
  type: string,
): React.ComponentType<SymbolProps> {
  const t = type.toLowerCase().replace(/[\s-]/g, "_");

  // Radio / transceiver
  if (/^(radio|transceiver|rig|hf|vhf|uhf|sdr)$/.test(t)) return RadioSymbol;

  // Antenna variants
  if (
    /^(antenna|yagi|dipole|vertical|wire|loop|beam|moxon|efhw|hex_beam|j_pole|mag_loop|end_fed|quarter_wave|ground_plane)$/.test(
      t,
    )
  )
    return AntennaSymbol;

  // Feedline / transmission line
  if (
    /^(feedline|coax|cable|hardline|ladder|ladder_line|twinlead|twin_lead|feedline_run)$/.test(
      t,
    )
  )
    return FeedlineSymbol;

  // Amplifier
  if (/^(amplifier|amp|pa|linear|preamp|pre_amp|lna)$/.test(t))
    return AmplifierSymbol;

  // Tuner / coupler
  if (/^(tuner|atu|coupler|matcher|antenna_tuner|auto_tuner)$/.test(t))
    return TunerSymbol;

  // Filter
  if (
    /^(filter|bandpass|lowpass|highpass|low_pass|high_pass|band_pass|notch|duplexer|triplexer)$/.test(
      t,
    )
  )
    return FilterSymbol;

  // Switch
  if (/^(switch|antenna_switch|coax_switch)$/.test(t)) return SwitchSymbol;

  // Power supply
  if (/^(power_supply|psu|battery|power|supply|dc_supply)$/.test(t))
    return PowerSupplySymbol;

  // Ground
  if (/^(ground|grounding|earth)$/.test(t)) return GroundSymbol;

  // Adapter / pigtail
  if (/^(adapter|pigtail|barrel|barrel_adapter|connector)$/.test(t))
    return AdapterSymbol;

  // Balun / transformer
  if (
    /^(balun|unun|transformer|choke|ferrite|toroid|common_mode_choke)$/.test(t)
  )
    return BalunSymbol;

  // Default fallback
  return RadioSymbol;
}

// ---------------------------------------------------------------------------
// Equipment type → Tailwind color map
// ---------------------------------------------------------------------------

/**
 * Semantic color tokens for each equipment category. Use these to tint
 * symbols, cards, borders, and glow effects consistently across the UI.
 *
 * Usage:
 *   const colors = EQUIPMENT_TYPE_COLORS.radio;
 *   <div className={`${colors.border} ${colors.glow}`}>
 *     <RadioSymbol className={`w-5 h-5 ${colors.text}`} />
 *   </div>
 */
export const EQUIPMENT_TYPE_COLORS = {
  radio: {
    accent: "bg-plasma-orange",
    text: "text-plasma-orange",
    border: "border-plasma-orange/30",
    glow: "shadow-[0_0_15px_rgba(249,115,22,0.3)]",
  },
  antenna: {
    accent: "bg-signal-green",
    text: "text-signal-green",
    border: "border-signal-green/30",
    glow: "shadow-[0_0_15px_rgba(34,197,94,0.3)]",
  },
  feedline: {
    accent: "bg-teal-500",
    text: "text-teal-400",
    border: "border-teal-500/30",
    glow: "shadow-[0_0_15px_rgba(20,184,166,0.3)]",
  },
  accessory: {
    accent: "bg-caution-amber",
    text: "text-caution-amber",
    border: "border-caution-amber/30",
    glow: "shadow-[0_0_15px_rgba(245,158,11,0.3)]",
  },
  inline: {
    accent: "bg-gray-500",
    text: "text-gray-400",
    border: "border-gray-500/30",
    glow: "shadow-[0_0_15px_rgba(107,114,128,0.3)]",
  },
} as const;

/** The available equipment color category keys. */
export type EquipmentColorCategory = keyof typeof EQUIPMENT_TYPE_COLORS;
