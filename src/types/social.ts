/**
 * Social feature types for Operator Profile
 *
 * Defines visibility controls, activity feed events, follow relationships,
 * and the public-facing profile shape used for profile sharing and discovery.
 */

export type VisibilityLevel = "public" | "friends" | "private";

export interface VisibilitySettings {
  stats: VisibilityLevel;
  awards: VisibilityLevel;
  equipment: VisibilityLevel;
  activity: VisibilityLevel;
  location: VisibilityLevel;
}

export type ActivityEventType =
  | "qso_milestone"
  | "award_earned"
  | "achievement_unlocked"
  | "new_dxcc"
  | "contest_result"
  | "equipment_change"
  | "location_change";

export interface ActivityEvent {
  id: string;
  userId: string;
  type: ActivityEventType;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface FollowRelation {
  followerId: string;
  followingId: string;
  createdAt: string;
}

// ─── Interest Tags ────────────────────────────────────────────────────────────

export type InterestCategory =
  | "operating"
  | "modes"
  | "technical"
  | "community";

export interface InterestTag {
  category: InterestCategory;
  tag: string;
}

// ─── On Air Status ────────────────────────────────────────────────────────────

export type OnAirState = "on_air" | "listening" | "offline";

export interface OnAirStatus {
  status: OnAirState;
  band?: string;
  mode?: string;
  frequency?: string;
  notes?: string;
  location?: string;
  expiresAt?: string; // ISO timestamp
}

// ─── Schedule / Availability ──────────────────────────────────────────────────

export type SkedAvailability = "open" | "busy" | "offline";

export interface FavoriteFrequency {
  id: string;
  band: string;
  frequency: string;
  mode?: string;
  notes?: string;
}

export interface PublicProfile {
  id: string;
  callsign: string;
  operatorName?: string;
  bio?: string;
  avatarUrl?: string;
  grid?: string;
  licenseClass?: string;
  country?: string;
  socialLinks?: { type: string; url: string }[];
  statsCache?: Record<string, unknown>;
  visibilitySettings?: VisibilitySettings;
  lastActiveAt?: string;
  interests?: InterestTag[];
  onAirStatus?: OnAirStatus | null;
  skedAvailability?: SkedAvailability;
  favoriteFreqs?: FavoriteFrequency[];
  operatingHours?: number[]; // 24-element UTC hour distribution
  operatorRank?: string;
  rankPoints?: number;
  lat?: number;
  lon?: number;
}

export const DEFAULT_VISIBILITY: VisibilitySettings = {
  stats: "public",
  awards: "public",
  equipment: "friends",
  activity: "friends",
  location: "private",
};
