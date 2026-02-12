/**
 * Interest tag vocabulary — predefined tags operators can select for their profile.
 * 4 categories, ~40 tags total. Used by InterestTagPicker and InterestTagDisplay.
 */

import type { InterestCategory } from "@/types/social";

export interface InterestCategoryDef {
  label: string;
  color: string; // hex color for pill styling
}

export const INTEREST_CATEGORIES: Record<
  InterestCategory,
  InterestCategoryDef
> = {
  operating: { label: "Operating Activities", color: "#4ade80" },
  modes: { label: "Modes", color: "#60a5fa" },
  technical: { label: "Technical Interests", color: "#f59e0b" },
  community: { label: "Community Roles", color: "#c084fc" },
};

export const INTEREST_TAGS: Record<InterestCategory, string[]> = {
  operating: [
    "DXing",
    "Contesting",
    "Ragchewing",
    "POTA",
    "SOTA",
    "IOTA",
    "Field Day",
    "EMCOMM / ARES",
    "Satellite",
    "EME",
    "SSTV",
    "Fox Hunting / ARDF",
    "Skywarn",
  ],
  modes: [
    "CW",
    "SSB",
    "FT8",
    "FT4",
    "RTTY",
    "JS8Call",
    "Packet",
    "APRS",
    "DMR",
    "D-STAR",
    "Winlink",
    "AM",
    "FM",
  ],
  technical: [
    "Antenna Building",
    "QRP",
    "SDR",
    "Homebrew",
    "RF Design",
    "Linux / Raspberry Pi",
    "MESH Networking",
    "Microwave",
    "VHF / UHF",
    "Remote Operating",
  ],
  community: [
    "Elmer / Mentor",
    "Club Officer",
    "Volunteer Examiner",
    "Net Control",
    "ARRL Member",
    "Contest Club",
  ],
};

/** Flat list of all tags for search/validation */
export const ALL_INTEREST_TAGS: string[] = Object.values(INTEREST_TAGS).flat();

/** Maximum number of interest tags per operator */
export const MAX_INTEREST_TAGS = 15;
