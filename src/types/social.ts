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
}

export const DEFAULT_VISIBILITY: VisibilitySettings = {
  stats: "public",
  awards: "public",
  equipment: "friends",
  activity: "friends",
  location: "private",
};
