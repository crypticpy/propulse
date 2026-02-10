import type { RankTier, CardBackground } from "../../types/rank";

export const RANK_THRESHOLDS: Record<RankTier, number> = {
  novice: 0,
  apprentice: 400,
  journeyman: 1500,
  expert: 4000,
  master: 10000,
  legendary: 25000,
  ethereal: 50000,
};

export const RANK_COLORS: Record<RankTier, string> = {
  novice: "#9CA3AF",
  apprentice: "#38BDF8",
  journeyman: "#34D399",
  expert: "#A78BFA",
  master: "#FCD34D",
  legendary: "#FFD700",
  ethereal: "#A78BFA", // static fallback; cycles at runtime
};

export const RANK_LABELS: Record<RankTier, string> = {
  novice: "Novice",
  apprentice: "Apprentice",
  journeyman: "Journeyman",
  expert: "Expert",
  master: "Master",
  legendary: "Legendary",
  ethereal: "Ethereal",
};

export const RANK_TITLES: Record<RankTier, string> = {
  novice: "Welcome to the Bands",
  apprentice: "Signal Rising",
  journeyman: "Steady Signal",
  expert: "Strong Copy",
  master: "Full Quieting",
  legendary: "DX Commander",
  ethereal: "The Infinite Signal",
};

export const RANK_ICONS: Record<RankTier, string> = {
  novice: "",
  apprentice: "~",
  journeyman: "\u224B", // ≋
  expert: "\u26A1", // ⚡
  master: "\u265B", // ♛
  legendary: "\u25C6", // ◆
  ethereal: "\u2726", // ✦
};

export const RANK_ORDER: RankTier[] = [
  "novice",
  "apprentice",
  "journeyman",
  "expert",
  "master",
  "legendary",
  "ethereal",
];

export const BACKGROUNDS_BY_RANK: Record<RankTier, CardBackground[]> = {
  novice: ["schematic"],
  apprentice: ["schematic", "topographic"],
  journeyman: ["schematic", "topographic", "circuit"],
  expert: ["schematic", "topographic", "circuit", "constellation"],
  master: [
    "schematic",
    "topographic",
    "circuit",
    "constellation",
    "propagation",
  ],
  legendary: [
    "schematic",
    "topographic",
    "circuit",
    "constellation",
    "propagation",
    "aurora",
  ],
  ethereal: [
    "schematic",
    "topographic",
    "circuit",
    "constellation",
    "propagation",
    "aurora",
    "living-signal",
  ],
};

export const RANK_RP_SCORING = {
  achievementBronze: 50,
  achievementSilver: 100,
  achievementGold: 200,
  achievementPlatinum: 500,
  qsoLogged: 1,
  uniqueDxccEntity: 25,
  uniqueBandModeSlot: 10,
  contestParticipated: 100,
  contestTop10: 500,
  loginStreak7: 25,
  loginStreak30: 150,
  loginStreak365: 2000,
  equipmentRegistered: 5,
  signalPathCompleted: 15,
  profileComplete100: 100,
  sharedProfileCard: 10,
  elmerSession: 50,
} as const;

/** Badge styling classes per rank tier */
export const RANK_BADGE_STYLES: Record<
  RankTier,
  { bg: string; text: string; border: string; font?: string }
> = {
  novice: {
    bg: "bg-gray-800",
    text: "text-gray-400",
    border: "border-gray-700",
  },
  apprentice: {
    bg: "bg-sky-900/30",
    text: "text-sky-400",
    border: "border-sky-500/20",
  },
  journeyman: {
    bg: "bg-emerald-900/30",
    text: "text-emerald-400",
    border: "border-emerald-500/30",
  },
  expert: {
    bg: "bg-violet-900/30",
    text: "text-violet-400",
    border: "border-violet-500/30",
  },
  master: {
    bg: "bg-amber-900/40",
    text: "text-amber-300",
    border: "border-amber-500/40",
  },
  legendary: {
    bg: "bg-yellow-900/40",
    text: "text-yellow-300",
    border: "border-yellow-500/40",
    font: "font-orbitron",
  },
  ethereal: {
    bg: "bg-violet-900/40",
    text: "text-violet-300",
    border: "border-violet-500/40",
    font: "font-orbitron",
  },
};

/** Index lookup for rank comparison */
export function getRankIndex(rank: RankTier): number {
  return RANK_ORDER.indexOf(rank);
}

/** Check if a rank meets a minimum threshold */
export function isRankAtLeast(rank: RankTier, minimum: RankTier): boolean {
  return getRankIndex(rank) >= getRankIndex(minimum);
}
