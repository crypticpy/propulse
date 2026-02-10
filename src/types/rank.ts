// Operator Rank System -- Type Definitions

export type RankTier =
  | "novice"
  | "apprentice"
  | "journeyman"
  | "expert"
  | "master"
  | "legendary"
  | "ethereal";

export type CardBackground =
  | "schematic"
  | "topographic"
  | "circuit"
  | "constellation"
  | "propagation"
  | "aurora"
  | "living-signal";

export interface RankPreferences {
  selectedBackground: CardBackground;
  enableParticles: boolean;
  enableSound: boolean;
  enableMouseTilt: boolean;
}

export interface RankTransition {
  from: RankTier;
  to: RankTier;
  timestamp: string; // ISO-8601
  pointsAtTransition: number;
}

export interface OperatorRank {
  currentRank: RankTier;
  rankPoints: number;
  rankHistory: RankTransition[];
  unlockedBackgrounds: CardBackground[];
  cardSignature?: string; // Legendary+ only, max 40 chars
  preferences: RankPreferences;
}

export interface RankPointBreakdown {
  achievements: number;
  qsos: number;
  dxcc: number;
  bandModeSlots: number;
  contests: number;
  loginStreaks: number;
  equipment: number;
  signalPaths: number;
  profileComplete: number;
  shares: number;
  elmerSessions: number;
  total: number;
}

export interface RankPointInput {
  achievements: { tier: "bronze" | "silver" | "gold" | "platinum" }[];
  totalQSOs: number;
  uniqueDxccEntities: number;
  uniqueBandModeSlots: number;
  contestsEntered: number;
  contestTop10Finishes: number;
  loginStreakDays: number;
  equipmentCount: number;
  signalPathCount: number;
  profileComplete: boolean;
  shareCount: number;
  elmerSessionCount: number;
}

export const DEFAULT_OPERATOR_RANK: OperatorRank = {
  currentRank: "novice",
  rankPoints: 0,
  rankHistory: [],
  unlockedBackgrounds: ["schematic"],
  preferences: {
    selectedBackground: "schematic",
    enableParticles: true,
    enableSound: false,
    enableMouseTilt: true,
  },
};
