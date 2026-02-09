/**
 * equipmentCardTypes — Shared types, constants, color maps, and utilities
 * for the equipment card size system (S / M / L / XL).
 *
 * Single source of truth — imported by EquipmentCard (L), EquipmentCardSm (S),
 * EquipmentCardMd (M), and EquipmentHeroCard (XL).
 */

import type { ReactNode } from "react";

// ─── Core Types ──────────────────────────────────────────────────────────────

export type EquipmentType =
  | "radio"
  | "antenna"
  | "feedline"
  | "accessory"
  | "inline";

export type EquipmentTier = "entry" | "midrange" | "highend" | "flagship";

export type EquipmentCardSize = "sm" | "md" | "lg" | "xl";

export type StatIcon =
  | "power"
  | "frequency"
  | "gain"
  | "loss"
  | "score"
  | "length"
  | "impedance"
  | "connector"
  | "bands";

export type BadgeColor = "orange" | "green" | "amber" | "red" | "blue" | "gray";

export type CapabilityCategory = "band" | "mode" | "feature";

// ─── Data Interfaces ─────────────────────────────────────────────────────────

export interface EquipmentCardBadge {
  label: string;
  color?: BadgeColor;
}

export interface EquipmentCardStat {
  icon: StatIcon;
  label: string;
  value: string;
}

export interface EquipmentCardCapability {
  label: string;
  category: CapabilityCategory;
}

export interface EquipmentDetailField {
  label: string;
  value: string | number | boolean | undefined;
  unit?: string;
}

export interface EquipmentDetailGroup {
  heading: string;
  fields: EquipmentDetailField[];
}

// ─── Badge with hex color (for EquipmentDetailModal / HeroCard) ──────────────

export interface EquipmentHexBadge {
  label: string;
  color?: string;
}

// ─── Color Constants ─────────────────────────────────────────────────────────

/** Hex accent colors per equipment type (used in inline styles) */
export const ACCENT_HEX: Record<EquipmentType, string> = {
  radio: "#F97316",
  antenna: "#22C55E",
  feedline: "#14B8A6",
  accessory: "#F59E0B",
  inline: "#6B7280",
};

/** Tailwind background classes per equipment type */
export const ACCENT_BG: Record<EquipmentType, string> = {
  radio: "bg-[#F97316]",
  antenna: "bg-[#22C55E]",
  feedline: "bg-[#14B8A6]",
  accessory: "bg-[#F59E0B]",
  inline: "bg-[#6B7280]",
};

/** Tailwind text classes per equipment type */
export const ACCENT_TEXT: Record<EquipmentType, string> = {
  radio: "text-[#F97316]",
  antenna: "text-[#22C55E]",
  feedline: "text-[#14B8A6]",
  accessory: "text-[#F59E0B]",
  inline: "text-[#9CA3AF]",
};

/** Tier display labels */
export const TIER_LABELS: Record<EquipmentTier, string> = {
  entry: "Entry",
  midrange: "Mid-Range",
  highend: "High-End",
  flagship: "Flagship",
};

/** Hover glow shadow per type */
export const GLOW_SHADOW: Record<EquipmentType, string> = {
  radio: "shadow-[0_4px_30px_rgba(249,115,22,0.25)]",
  antenna: "shadow-[0_4px_30px_rgba(34,197,94,0.25)]",
  feedline: "shadow-[0_4px_30px_rgba(20,184,166,0.25)]",
  accessory: "shadow-[0_4px_30px_rgba(245,158,11,0.25)]",
  inline: "shadow-[0_4px_30px_rgba(107,114,128,0.25)]",
};

/** Badge color map — Tailwind classes */
export const BADGE_STYLES: Record<BadgeColor, string> = {
  orange: "bg-plasma-orange/15 text-plasma-orange",
  green: "bg-signal-green/15 text-signal-green",
  amber: "bg-caution-amber/15 text-caution-amber",
  red: "bg-alert-red/15 text-alert-red",
  blue: "bg-blue-500/15 text-blue-400",
  gray: "bg-gray-700 text-gray-300",
};

/** Band pill colors — HF warm, VHF/UHF cool */
export const BAND_PILL_COLORS: Record<string, string> = {
  "160m": "bg-red-900/40 text-red-300 border-red-700/40",
  "80m": "bg-orange-900/40 text-orange-300 border-orange-700/40",
  "60m": "bg-amber-900/40 text-amber-300 border-amber-700/40",
  "40m": "bg-yellow-900/40 text-yellow-300 border-yellow-700/40",
  "30m": "bg-lime-900/40 text-lime-300 border-lime-700/40",
  "20m": "bg-green-900/40 text-green-300 border-green-700/40",
  "17m": "bg-emerald-900/40 text-emerald-300 border-emerald-700/40",
  "15m": "bg-teal-900/40 text-teal-300 border-teal-700/40",
  "12m": "bg-cyan-900/40 text-cyan-300 border-cyan-700/40",
  "10m": "bg-sky-900/40 text-sky-300 border-sky-700/40",
  "6m": "bg-blue-900/40 text-blue-300 border-blue-700/40",
  "2m": "bg-indigo-900/40 text-indigo-300 border-indigo-700/40",
  "70cm": "bg-violet-900/40 text-violet-300 border-violet-700/40",
  "23cm": "bg-purple-900/40 text-purple-300 border-purple-700/40",
};

export const DEFAULT_BAND_PILL =
  "bg-gray-800/50 text-gray-400 border-gray-600/40";

/** Capability category pill styles */
export const CAPABILITY_STYLES: Record<CapabilityCategory, string> = {
  band: "", // handled per-band via BAND_PILL_COLORS
  mode: "bg-indigo-900/40 text-indigo-300 border-indigo-700/40",
  feature: "bg-cyan-900/40 text-cyan-300 border-cyan-700/40",
};

// ─── Utility Functions ───────────────────────────────────────────────────────

/** Format a detail field value for display — handles boolean, undefined, units */
export function formatFieldValue(
  value: string | number | boolean | undefined,
  unit?: string,
): string {
  if (value === undefined || value === null) return "\u2014";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const str = typeof value === "number" ? String(value) : value;
  return unit ? `${str} ${unit}` : str;
}

/** Check if a field value looks numeric (for styling with font-mono bold) */
export function isNumericValue(
  value: string | number | boolean | undefined,
): boolean {
  if (typeof value === "number") return true;
  if (typeof value === "string") return /^-?\d+(\.\d+)?$/.test(value.trim());
  return false;
}

/** Get the Tailwind pill class for a capability */
export function getCapabilityPillStyle(cap: EquipmentCardCapability): string {
  if (cap.category === "band") {
    return BAND_PILL_COLORS[cap.label] ?? DEFAULT_BAND_PILL;
  }
  return CAPABILITY_STYLES[cap.category];
}

// ─── Shared Props Base ───────────────────────────────────────────────────────

/** Base props shared across all card sizes — data-only, no callbacks */
export interface EquipmentCardData {
  title: string;
  subtitle?: string;
  equipmentType: EquipmentType;
  typeLabel?: string;
  tier?: EquipmentTier;
  badges?: EquipmentCardBadge[];
  stats?: EquipmentCardStat[];
  capabilities?: EquipmentCardCapability[];
  visualization?: ReactNode;
  isActive?: boolean;
  /** UUID referencing a stored image in IndexedDB */
  imageId?: string;
}
