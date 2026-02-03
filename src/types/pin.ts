/**
 * Pin/Bookmark types for globe locations
 *
 * Pins allow users to save and quickly access locations on the PropSphere globe.
 * The structure is designed for localStorage persistence now with easy migration
 * to Supabase in the future.
 */

/**
 * Pin category for organizational grouping
 */
export type PinCategory =
  | "dxpedition"
  | "friend"
  | "beacon"
  | "contest"
  | "custom";

/**
 * Category metadata for display and styling
 */
export interface PinCategoryMeta {
  id: PinCategory;
  label: string;
  icon: string;
  color: string;
}

/**
 * Category configuration with preset colors and icons
 */
export const PIN_CATEGORIES: PinCategoryMeta[] = [
  { id: "dxpedition", label: "DXpedition", icon: "🌍", color: "#FF6B35" },
  { id: "friend", label: "Friend", icon: "👤", color: "#4CAF50" },
  { id: "beacon", label: "Beacon", icon: "📡", color: "#9C27B0" },
  { id: "contest", label: "Contest", icon: "🏆", color: "#F44336" },
  { id: "custom", label: "Custom", icon: "📍", color: "#22D3EE" },
];

/**
 * Get category metadata by ID
 */
export function getCategoryMeta(
  category: PinCategory | undefined,
): PinCategoryMeta {
  return (
    PIN_CATEGORIES.find((c) => c.id === category) ||
    PIN_CATEGORIES.find((c) => c.id === "custom")!
  );
}

/**
 * A saved pin/bookmark for a globe location
 */
export interface MapPin {
  /** Unique identifier for this pin */
  id: string;
  /** Latitude in decimal degrees (-90 to 90) */
  lat: number;
  /** Longitude in decimal degrees (-180 to 180) */
  lon: number;
  /** Maidenhead grid locator (e.g., "CN87ML") */
  grid: string;
  /** User-provided label for the pin */
  name?: string;
  /** Optional custom color for the pin marker */
  color?: string;
  /** Pin category for organizational grouping */
  category?: PinCategory;
  /** Optional notes/description for context */
  notes?: string;
  /** ISO timestamp when the pin expires (for DXpeditions) */
  expiresAt?: string;
  /** ISO timestamp when the pin was created */
  createdAt: string;
  /** ISO timestamp of last sync with backend (future Supabase integration) */
  syncedAt?: string;
  /** User ID from backend (future Supabase integration) */
  userId?: string;
}

/**
 * Pin action types for logging and analytics
 */
export type PinAction = "add" | "remove" | "clear" | "update";

/**
 * Partial pin data for updates (excludes immutable fields)
 */
export type PinUpdate = Partial<
  Pick<MapPin, "name" | "color" | "category" | "notes" | "expiresAt">
>;
