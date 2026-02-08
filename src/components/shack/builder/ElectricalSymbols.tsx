/**
 * ElectricalSymbols -- Reusable SVG electrical/schematic symbols for the
 * station builder canvas. Each component renders a `<g>` group centered at
 * (cx, cy) so it can be dropped into any SVG context.
 */

import React from "react";
import type { AccessoryCategory, InlineComponentType } from "@/types/shack";
import type { ChainNode } from "@/types/stationChain";

// ---- Shared props interface ------------------------------------------------

export interface SymbolProps {
  cx: number;
  cy: number;
  color: string;
  size?: number; // default 24
}

// ---- 1. RadioSymbol --------------------------------------------------------
// Rectangle body with a sine wave arc on the right and two terminal dots on
// the left edge.

export const RadioSymbol: React.FC<SymbolProps> = ({
  cx,
  cy,
  color,
  size = 24,
}) => {
  const s = size / 24; // scale factor
  return (
    <g transform={`translate(${cx},${cy})`}>
      {/* Body rectangle */}
      <rect
        x={-6 * s}
        y={-4 * s}
        width={12 * s}
        height={8 * s}
        rx={1.5 * s}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
      />
      {/* Two terminal dots on left edge */}
      <circle cx={-6 * s} cy={-2 * s} r={1.2 * s} fill={color} />
      <circle cx={-6 * s} cy={2 * s} r={1.2 * s} fill={color} />
      {/* Sine wave arc emanating from the right */}
      <path
        d={`M${6 * s},0 Q${9 * s},${-4 * s} ${12 * s},0 Q${9 * s},${4 * s} ${6 * s},0`}
        fill="none"
        stroke={color}
        strokeWidth={1.2}
        strokeLinecap="round"
        opacity={0.7}
      />
    </g>
  );
};

// ---- 2. AntennaSymbol ------------------------------------------------------
// Vertical mast with two angled arms forming inverted V (standard dipole
// symbol). Small circle at feedpoint.

export const AntennaSymbol: React.FC<SymbolProps> = ({
  cx,
  cy,
  color,
  size = 24,
}) => {
  const s = size / 24;
  return (
    <g transform={`translate(${cx},${cy})`}>
      {/* Vertical mast */}
      <line
        x1={0}
        y1={-8 * s}
        x2={0}
        y2={6 * s}
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      {/* Left arm */}
      <line
        x1={0}
        y1={-8 * s}
        x2={-7 * s}
        y2={-2 * s}
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      {/* Right arm */}
      <line
        x1={0}
        y1={-8 * s}
        x2={7 * s}
        y2={-2 * s}
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      {/* Feedpoint circle */}
      <circle cx={0} cy={-8 * s} r={1.8 * s} fill={color} opacity={0.6} />
    </g>
  );
};

// ---- 3. TransmissionLineSymbol ---------------------------------------------
// Two parallel horizontal lines with 3 perpendicular cross marks between them
// (standard coax / transmission line symbol).

export const TransmissionLineSymbol: React.FC<SymbolProps> = ({
  cx,
  cy,
  color,
  size = 24,
}) => {
  const s = size / 24;
  const halfLen = 9 * s;
  const gap = 3 * s; // distance between the two parallel lines
  return (
    <g transform={`translate(${cx},${cy})`}>
      {/* Top line */}
      <line
        x1={-halfLen}
        y1={-gap}
        x2={halfLen}
        y2={-gap}
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      {/* Bottom line */}
      <line
        x1={-halfLen}
        y1={gap}
        x2={halfLen}
        y2={gap}
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      {/* Cross marks */}
      {[-5, 0, 5].map((xOff) => (
        <line
          key={xOff}
          x1={xOff * s}
          y1={-gap}
          x2={xOff * s}
          y2={gap}
          stroke={color}
          strokeWidth={1}
          opacity={0.5}
        />
      ))}
    </g>
  );
};

// ---- 4. AmplifierSymbol ----------------------------------------------------
// Right-pointing triangle (standard amp/buffer symbol). Stroked, not filled.

export const AmplifierSymbol: React.FC<SymbolProps> = ({
  cx,
  cy,
  color,
  size = 24,
}) => {
  const s = size / 24;
  // Triangle: left-center, top-left, bottom-left, right-center
  const pts = `${-7 * s},${-6 * s} ${-7 * s},${6 * s} ${8 * s},0`;
  return (
    <g transform={`translate(${cx},${cy})`}>
      <polygon
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </g>
  );
};

// ---- 5. TunerSymbol --------------------------------------------------------
// 3-4 inductor bumps (sine wave shape) with a diagonal arrow through them
// (variable inductor / antenna tuner symbol).

export const TunerSymbol: React.FC<SymbolProps> = ({
  cx,
  cy,
  color,
  size = 24,
}) => {
  const s = size / 24;
  return (
    <g transform={`translate(${cx},${cy})`}>
      {/* Inductor bumps */}
      <path
        d={`M${-9 * s},0
            Q${-7 * s},${-5 * s} ${-5 * s},0
            Q${-3 * s},${-5 * s} ${-1 * s},0
            Q${1 * s},${-5 * s} ${3 * s},0
            Q${5 * s},${-5 * s} ${7 * s},0`}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      {/* Diagonal arrow (variable) */}
      <line
        x1={-6 * s}
        y1={5 * s}
        x2={6 * s}
        y2={-6 * s}
        stroke={color}
        strokeWidth={1.2}
        opacity={0.7}
      />
      {/* Arrowhead */}
      <polygon
        points={`${6 * s},${-6 * s} ${3 * s},${-4.5 * s} ${4.5 * s},${-3 * s}`}
        fill={color}
        opacity={0.7}
      />
    </g>
  );
};

// ---- 6. FilterSymbol -------------------------------------------------------
// Inductor bumps on top with two parallel capacitor plates below (L-C filter).

export const FilterSymbol: React.FC<SymbolProps> = ({
  cx,
  cy,
  color,
  size = 24,
}) => {
  const s = size / 24;
  return (
    <g transform={`translate(${cx},${cy})`}>
      {/* Inductor bumps (top half) */}
      <path
        d={`M${-7 * s},${-2 * s}
            Q${-5 * s},${-7 * s} ${-3 * s},${-2 * s}
            Q${-1 * s},${-7 * s} ${1 * s},${-2 * s}
            Q${3 * s},${-7 * s} ${5 * s},${-2 * s}`}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      {/* Capacitor plates (bottom half) */}
      <line
        x1={-4 * s}
        y1={2 * s}
        x2={4 * s}
        y2={2 * s}
        stroke={color}
        strokeWidth={1.5}
      />
      <line
        x1={-4 * s}
        y1={5 * s}
        x2={4 * s}
        y2={5 * s}
        stroke={color}
        strokeWidth={1.5}
      />
      {/* Connecting leads */}
      <line
        x1={0}
        y1={-2 * s}
        x2={0}
        y2={2 * s}
        stroke={color}
        strokeWidth={1}
        opacity={0.5}
      />
    </g>
  );
};

// ---- 7. SwitchSymbol -------------------------------------------------------
// Fixed contact dot with angled arm and open contact position (SPDT switch).

export const SwitchSymbol: React.FC<SymbolProps> = ({
  cx,
  cy,
  color,
  size = 24,
}) => {
  const s = size / 24;
  return (
    <g transform={`translate(${cx},${cy})`}>
      {/* Fixed contact (left) */}
      <circle cx={-7 * s} cy={2 * s} r={1.5 * s} fill={color} />
      {/* Angled switching arm */}
      <line
        x1={-7 * s}
        y1={2 * s}
        x2={5 * s}
        y2={-5 * s}
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      {/* Open contact (top-right) */}
      <circle
        cx={7 * s}
        cy={-5 * s}
        r={1.5 * s}
        fill="none"
        stroke={color}
        strokeWidth={1.2}
      />
      {/* Closed contact (right) */}
      <circle
        cx={7 * s}
        cy={2 * s}
        r={1.5 * s}
        fill="none"
        stroke={color}
        strokeWidth={1.2}
      />
      {/* Lead wires */}
      <line
        x1={-10 * s}
        y1={2 * s}
        x2={-7 * s}
        y2={2 * s}
        stroke={color}
        strokeWidth={1.2}
      />
      <line
        x1={7 * s}
        y1={2 * s}
        x2={10 * s}
        y2={2 * s}
        stroke={color}
        strokeWidth={1.2}
      />
    </g>
  );
};

// ---- 8. ChokeBalunSymbol ---------------------------------------------------
// Toroid ring (ellipse) with lines entering/exiting on both sides.

export const ChokeBalunSymbol: React.FC<SymbolProps> = ({
  cx,
  cy,
  color,
  size = 24,
}) => {
  const s = size / 24;
  return (
    <g transform={`translate(${cx},${cy})`}>
      {/* Toroid ring */}
      <ellipse
        cx={0}
        cy={0}
        rx={6 * s}
        ry={5 * s}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
      />
      {/* Lead line left */}
      <line
        x1={-10 * s}
        y1={0}
        x2={-6 * s}
        y2={0}
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      {/* Lead line right */}
      <line
        x1={6 * s}
        y1={0}
        x2={10 * s}
        y2={0}
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </g>
  );
};

// ---- 9. FerriteSymbol ------------------------------------------------------
// Small rounded rectangle (cylinder representation) with a line passing
// through the center.

export const FerriteSymbol: React.FC<SymbolProps> = ({
  cx,
  cy,
  color,
  size = 24,
}) => {
  const s = size / 24;
  return (
    <g transform={`translate(${cx},${cy})`}>
      {/* Cylinder body */}
      <rect
        x={-5 * s}
        y={-4 * s}
        width={10 * s}
        height={8 * s}
        rx={2 * s}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
      />
      {/* Through-line left */}
      <line
        x1={-10 * s}
        y1={0}
        x2={-5 * s}
        y2={0}
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      {/* Through-line right */}
      <line
        x1={5 * s}
        y1={0}
        x2={10 * s}
        y2={0}
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </g>
  );
};

// ---- 10. GroundSymbol ------------------------------------------------------
// 3 descending horizontal lines of decreasing width (standard earth ground).

export const GroundSymbol: React.FC<SymbolProps> = ({
  cx,
  cy,
  color,
  size = 24,
}) => {
  const s = size / 24;
  return (
    <g transform={`translate(${cx},${cy})`}>
      {/* Vertical stem */}
      <line
        x1={0}
        y1={-6 * s}
        x2={0}
        y2={-1 * s}
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      {/* Top (widest) line */}
      <line
        x1={-7 * s}
        y1={-1 * s}
        x2={7 * s}
        y2={-1 * s}
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      {/* Middle line */}
      <line
        x1={-4.5 * s}
        y1={2 * s}
        x2={4.5 * s}
        y2={2 * s}
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      {/* Bottom (narrowest) line */}
      <line
        x1={-2 * s}
        y1={5 * s}
        x2={2 * s}
        y2={5 * s}
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </g>
  );
};

// ---- 11. GenericAccessorySymbol -------------------------------------------
// Lightning bolt — fallback for unknown categories.

export const GenericAccessorySymbol: React.FC<SymbolProps> = ({
  cx,
  cy,
  color,
  size = 24,
}) => {
  const s = size / 24;
  return (
    <g transform={`translate(${cx},${cy})`}>
      <path
        d={`M${1 * s},${-8 * s}
            L${-4 * s},${1 * s}
            L${0 * s},${1 * s}
            L${-1 * s},${8 * s}
            L${4 * s},${-1 * s}
            L${0 * s},${-1 * s}
            Z`}
        fill={color}
        stroke="none"
      />
    </g>
  );
};

// ---- Resolver function -----------------------------------------------------

/**
 * Returns the appropriate electrical symbol component for a given chain node
 * type, with optional specialization for accessory categories and inline
 * component types.
 */
export function getElectricalSymbol(
  nodeType: ChainNode["type"],
  accessoryCategory?: AccessoryCategory,
  inlineComponentType?: InlineComponentType,
): React.FC<SymbolProps> {
  switch (nodeType) {
    case "radio":
      return RadioSymbol;
    case "antenna":
      return AntennaSymbol;
    case "feedline_run":
      return TransmissionLineSymbol;
    case "accessory":
      switch (accessoryCategory) {
        case "amplifier":
          return AmplifierSymbol;
        case "tuner":
          return TunerSymbol;
        case "filter":
          return FilterSymbol;
        case "switch":
          return SwitchSymbol;
        case "grounding":
          return GroundSymbol;
        default:
          return GenericAccessorySymbol;
      }
    default:
      // For inline components or unknown types
      if (inlineComponentType) {
        switch (inlineComponentType) {
          case "choke":
          case "balun":
            return ChokeBalunSymbol;
          case "ferrite":
            return FerriteSymbol;
          case "adapter":
          case "pigtail":
            return GenericAccessorySymbol;
        }
      }
      return GenericAccessorySymbol;
  }
}
