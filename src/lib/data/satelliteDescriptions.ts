/**
 * Satellite Descriptions & Metadata Database
 *
 * Human-friendly descriptions and metadata for amateur radio satellites.
 * Used in the Satellite Database detail modals.
 */

export type OrbitType = "LEO" | "MEO" | "GEO" | "HEO" | "SSO";
export type SatelliteStatus = "active" | "semi-active" | "inactive" | "unknown";

export interface SatelliteMetadata {
  /** Human-friendly description of what this satellite is/does (1-3 sentences) */
  description: string;
  /** Organization/operator that built or manages the satellite */
  operator: string;
  /** Approximate launch year */
  launchYear: number;
  /** Orbit type for display */
  orbitType: OrbitType;
  /** Primary purpose/use */
  purpose: string;
  /** Whether the satellite is currently operational for amateur radio use */
  status: SatelliteStatus;
}

// ---------------------------------------------------------------------------
// Database — keyed by NORAD ID
// ---------------------------------------------------------------------------

const SATELLITE_DESCRIPTIONS: Record<number, SatelliteMetadata> = {
  // ── ISS ──────────────────────────────────────────────────────────────────
  25544: {
    description:
      "International Space Station amateur radio station (NA1SS). Hosts cross-band FM repeater, APRS digipeater, and occasional SSTV events. Crew members participate in school contacts via the ARISS program.",
    operator: "NASA / Roscosmos / ARISS",
    launchYear: 1998,
    orbitType: "LEO",
    purpose: "FM repeater, APRS digipeater, SSTV, school contacts",
    status: "active",
  },

  // ── FM Repeaters ─────────────────────────────────────────────────────────
  27607: {
    description:
      "Saudi Arabian microsatellite carrying a V/U FM repeater. One of the most popular beginner satellites due to its strong signal and simple operation. Requires 67.0 Hz CTCSS tone on uplink; 74.4 Hz tone activates a 10-minute timer.",
    operator: "KACST (King Abdulaziz City for Science and Technology)",
    launchYear: 2002,
    orbitType: "LEO",
    purpose: "V/U FM voice repeater",
    status: "active",
  },

  43017: {
    description:
      "AMSAT Fox-1B CubeSat with a U/V FM transponder. Operates only during sunlit passes due to no battery charging on eclipse. Carries a Virginia Tech camera experiment and University of Iowa radiation experiment (RadFxSat).",
    operator: "AMSAT-NA",
    launchYear: 2018,
    orbitType: "SSO",
    purpose: "U/V FM voice repeater, radiation experiment",
    status: "semi-active",
  },

  43137: {
    description:
      "AMSAT Fox-1D CubeSat with a U/V FM transponder and an experimental L-band uplink capability. Carries a Virginia Tech camera experiment and AMSAT L-Band Downshifter. Requires 67.0 Hz CTCSS tone on uplink.",
    operator: "AMSAT-NA",
    launchYear: 2018,
    orbitType: "SSO",
    purpose: "U/V FM voice repeater, L-band experiment",
    status: "inactive",
  },

  57166: {
    description:
      "Italian 3U CubeSat built by Sapienza University of Rome for autonomous plant cultivation experiments in orbit. Carries a 70 cm digipeater operating at ~5,800 km MEO altitude, providing passes up to 90 minutes and enabling long-distance amateur contacts.",
    operator: "S5Lab / Sapienza University of Rome",
    launchYear: 2022,
    orbitType: "MEO",
    purpose: "UHF digipeater, biological laboratory",
    status: "inactive",
  },

  // TEVEL constellation — AMSAT-Israel
  50988: {
    description:
      "Part of the 8-satellite TEVEL constellation built by Israeli schools and the Herzliya Science Center. Each satellite carries an identical V/U FM repeater. Only one transponder activates at a time when footprints overlap.",
    operator: "Herzliya Science Center / AMSAT-Israel",
    launchYear: 2022,
    orbitType: "LEO",
    purpose: "V/U FM voice repeater",
    status: "active",
  },
  50989: {
    description:
      "TEVEL-8 — part of the 8-satellite TEVEL constellation built by Israeli schools. Carries a V/U FM repeater on 145.970 MHz uplink / 436.400 MHz downlink, shared across all TEVEL satellites.",
    operator: "Herzliya Science Center / AMSAT-Israel",
    launchYear: 2022,
    orbitType: "LEO",
    purpose: "V/U FM voice repeater",
    status: "active",
  },
  51013: {
    description:
      "TEVEL-1 — the first satellite in the TEVEL constellation by AMSAT-Israel. Carries a V/U FM repeater identical to its seven siblings. All eight were launched together on a SpaceX Transporter mission.",
    operator: "Herzliya Science Center / AMSAT-Israel",
    launchYear: 2022,
    orbitType: "LEO",
    purpose: "V/U FM voice repeater",
    status: "active",
  },
  51062: {
    description:
      "TEVEL-7 — part of the TEVEL constellation. Like its siblings, carries a V/U FM repeater for educational amateur radio outreach in Israel and worldwide.",
    operator: "Herzliya Science Center / AMSAT-Israel",
    launchYear: 2022,
    orbitType: "LEO",
    purpose: "V/U FM voice repeater",
    status: "active",
  },
  51063: {
    description:
      "TEVEL-4 — part of the TEVEL constellation. Carries a V/U FM repeater on standard TEVEL frequencies (145.970 up / 436.400 down).",
    operator: "Herzliya Science Center / AMSAT-Israel",
    launchYear: 2022,
    orbitType: "LEO",
    purpose: "V/U FM voice repeater",
    status: "active",
  },
  51069: {
    description:
      "TEVEL-2 — part of the TEVEL constellation by AMSAT-Israel. Carries a V/U FM repeater identical to the other TEVEL satellites.",
    operator: "Herzliya Science Center / AMSAT-Israel",
    launchYear: 2022,
    orbitType: "LEO",
    purpose: "V/U FM voice repeater",
    status: "active",
  },
  50998: {
    description:
      "TEVEL-5 — part of the TEVEL constellation. One of eight educational CubeSats carrying V/U FM repeaters, built by schools across Israel.",
    operator: "Herzliya Science Center / AMSAT-Israel",
    launchYear: 2022,
    orbitType: "LEO",
    purpose: "V/U FM voice repeater",
    status: "active",
  },
  50999: {
    description:
      "TEVEL-6 — part of the TEVEL constellation by AMSAT-Israel. Carries a V/U FM repeater for amateur radio communications and education.",
    operator: "Herzliya Science Center / AMSAT-Israel",
    launchYear: 2022,
    orbitType: "LEO",
    purpose: "V/U FM voice repeater",
    status: "active",
  },

  43678: {
    description:
      "Philippines microsatellite designated PO-101 (Philippines-OSCAR 101). Carries an FM voice repeater with 141.3 Hz CTCSS tone on uplink. Also serves as an Earth observation platform for disaster monitoring.",
    operator: "STAMINA4Space / DOST Philippines",
    launchYear: 2018,
    orbitType: "SSO",
    purpose: "FM voice repeater, Earth observation",
    status: "semi-active",
  },

  40931: {
    description:
      "Indonesian microsatellite (LAPAN-A2) in equatorial orbit, providing coverage between 30N and 30S. Carries a V/U FM voice repeater active on weekends and an APRS digipeater active on weekdays around noon UTC.",
    operator: "LAPAN (National Institute of Aeronautics and Space, Indonesia)",
    launchYear: 2015,
    orbitType: "LEO",
    purpose: "FM voice repeater, APRS digipeater",
    status: "semi-active",
  },

  // ── Linear Transponders ──────────────────────────────────────────────────
  44909: {
    description:
      "Russian amateur radio satellite in a high-inclination elliptical orbit (1,175 x 1,511 km). Carries a V/U linear inverting transponder for SSB/CW contacts. Built by ISS-Reshetnev and SibSAU students on the Yubileyniy platform.",
    operator: "ISS-Reshetnev / DOSAAF Russia",
    launchYear: 2019,
    orbitType: "LEO",
    purpose: "V/U linear transponder (SSB/CW)",
    status: "active",
  },

  43937: {
    description:
      "Japanese 1U CubeSat (NEXUS) built at Nihon University in collaboration with JAMSAT. Demonstrates next-generation amateur satellite communication technology with a mode V/U linear inverting transponder.",
    operator: "Nihon University / JAMSAT",
    launchYear: 2019,
    orbitType: "LEO",
    purpose: "V/U linear transponder (SSB/CW)",
    status: "active",
  },

  43700: {
    description:
      "First geostationary amateur radio satellite, hosted on Qatar's Es'hail-2 communications satellite at 25.9E. Carries a narrowband 250 kHz linear transponder for SSB/CW and an 8 MHz wideband transponder for digital/DATV. Coverage from Brazil to Thailand.",
    operator: "AMSAT-DL / Es'hailSat / QARS",
    launchYear: 2018,
    orbitType: "GEO",
    purpose: "Linear transponder (SSB/CW), wideband digital/DATV",
    status: "active",
  },

  44881: {
    description:
      "Chinese amateur radio satellite (ZHUHAI-1 OVS-1A) carrying a V/U linear inverting transponder with 20 kHz bandwidth. Part of the Zhuhai-1 Earth observation constellation. CW beacon on 435.200 MHz.",
    operator: "CAMSAT / Zhuhai Orbita Aerospace",
    launchYear: 2019,
    orbitType: "SSO",
    purpose: "V/U linear transponder (SSB/CW)",
    status: "active",
  },

  44884: {
    description:
      "Chinese amateur radio satellite (ZHUHAI-1 OVS-1B) carrying a V/U linear inverting transponder with 20 kHz bandwidth. Sister satellite to CAS-4A, also part of the Zhuhai-1 constellation. CW beacon on 435.260 MHz.",
    operator: "CAMSAT / Zhuhai Orbita Aerospace",
    launchYear: 2019,
    orbitType: "SSO",
    purpose: "V/U linear transponder (SSB/CW)",
    status: "active",
  },

  43803: {
    description:
      "Jordan's first CubeSat (JY1SAT), designated FUNcube-6. Carries a U/V linear inverting transponder and a 1200 bps BPSK FUNcube-compatible telemetry beacon on 145.840 MHz. Named in honor of King Hussein JY1.",
    operator: "Crown Prince Foundation Jordan / AMSAT-UK",
    launchYear: 2018,
    orbitType: "SSO",
    purpose: "U/V linear transponder (SSB/CW), FUNcube telemetry",
    status: "active",
  },

  7530: {
    description:
      "Launched in 1974, one of the oldest operational amateur satellites. Battery failed in 1981 but resumed operation in 2002 on solar power alone. Alternates between Mode A (V/HF linear) and Mode B (U/V linear) every 24 hours when sunlit.",
    operator: "AMSAT-NA",
    launchYear: 1974,
    orbitType: "LEO",
    purpose: "Dual-mode linear transponder (SSB/CW)",
    status: "semi-active",
  },

  // ── Digital ──────────────────────────────────────────────────────────────
  46287: {
    description:
      "US Naval Academy CubeSat (ParkinsonSAT-2) carrying an APRS digipeater on 145.825 MHz shared with ISS, PCSAT, and other APRS satellites. Also features an experimental DTMF command uplink on 145.980 MHz.",
    operator: "US Naval Academy (USNA)",
    launchYear: 2019,
    orbitType: "LEO",
    purpose: "APRS digipeater, DTMF experiment",
    status: "semi-active",
  },

  43768: {
    description:
      "Chinese amateur radio CubeSat (HELIANTHUS-1) carrying a linear transponder and digital telemetry. Part of the CAMSAT CAS series. Designated TO-108 (TEVEL-OSCAR 108). Features intermittent transponder activation.",
    operator: "CAMSAT",
    launchYear: 2018,
    orbitType: "SSO",
    purpose: "Linear transponder, digital telemetry",
    status: "semi-active",
  },

  // ── Weather Satellites (amateur-receivable) ──────────────────────────────
  25338: {
    description:
      "NOAA polar-orbiting weather satellite transmitting Automatic Picture Transmission (APT) imagery on 137.620 MHz. One of the easiest satellites for beginners to receive using a simple V-dipole antenna and free decoding software.",
    operator: "NOAA / NASA",
    launchYear: 1998,
    orbitType: "SSO",
    purpose: "Weather imagery (APT on 137.620 MHz)",
    status: "active",
  },

  28654: {
    description:
      "NOAA polar-orbiting weather satellite transmitting APT imagery on 137.9125 MHz. Part of the POES (Polar Operational Environmental Satellite) series providing continuous global weather coverage.",
    operator: "NOAA / NASA",
    launchYear: 2005,
    orbitType: "SSO",
    purpose: "Weather imagery (APT on 137.9125 MHz)",
    status: "active",
  },

  33591: {
    description:
      "NOAA polar-orbiting weather satellite and the last of the POES series. Transmits APT imagery on 137.100 MHz. Widely used by amateur radio operators and weather enthusiasts for real-time satellite weather image reception.",
    operator: "NOAA / NASA",
    launchYear: 2009,
    orbitType: "SSO",
    purpose: "Weather imagery (APT on 137.100 MHz)",
    status: "active",
  },

  // METEOR-M2-3 shares NORAD 57166 with GreenCube in the task spec — using
  // a separate entry here. Note: METEOR-M2-3 actual NORAD is 57166 but
  // GreenCube IO-117 also uses 57166 in this project's data. We store
  // METEOR-M2-3 under its correct NORAD 57166 in the name-based fallback.
  // Since NORAD 57166 is already taken by IO-117 above, METEOR-M2-3 will be
  // resolved via the name-based lookup below.

  44387: {
    description:
      "Russian Meteor-M series polar-orbiting weather satellite. Originally transmitted LRPT digital weather imagery on 137.100 MHz but lost 137 MHz capability after a micro-meteorite impact. L-band and X-band imagery still active in daylight.",
    operator: "Roscosmos / ROSHYDROMET",
    launchYear: 2019,
    orbitType: "SSO",
    purpose: "Weather imagery (LRPT/HRPT)",
    status: "semi-active",
  },
};

// ---------------------------------------------------------------------------
// Name-based fallback entries (for satellites with NORAD ID conflicts or
// where name lookup is preferred)
// ---------------------------------------------------------------------------

const NAME_DESCRIPTIONS: Record<string, SatelliteMetadata> = {
  "METEOR-M2-3": {
    description:
      "Russian Meteor-M series polar-orbiting weather satellite launched in 2023. Transmits LRPT digital weather imagery on 137.9 MHz and HRPT on 1700 MHz. Popular among amateur weather satellite enthusiasts for high-quality imagery.",
    operator: "Roscosmos / ROSHYDROMET",
    launchYear: 2023,
    orbitType: "SSO",
    purpose: "Weather imagery (LRPT on 137.9 MHz, HRPT on 1700 MHz)",
    status: "active",
  },
};

// ---------------------------------------------------------------------------
// Lookup maps
// ---------------------------------------------------------------------------

const _byName = new Map<string, SatelliteMetadata>();

// Populate name map from NORAD-keyed entries with well-known names
const NORAD_TO_NAME: Record<number, string[]> = {
  25544: ["ISS", "ISS (ZARYA)", "ZARYA"],
  27607: ["SO-50", "SAUDISAT-1C"],
  43017: ["AO-91", "RADFXSAT", "FOX-1B"],
  43137: ["AO-92", "FOX-1D"],
  57166: ["IO-117", "GREENCUBE"],
  50988: ["TEVEL-3"],
  50989: ["TEVEL-8"],
  51013: ["TEVEL-1"],
  51062: ["TEVEL-7"],
  51063: ["TEVEL-4"],
  51069: ["TEVEL-2"],
  50998: ["TEVEL-5"],
  50999: ["TEVEL-6"],
  43678: ["PO-101", "DIWATA-2"],
  40931: ["IO-86", "LAPAN-A2"],
  44909: ["RS-44", "DOSAAF-85"],
  43937: ["FO-99", "NEXUS", "FUJI-OSCAR 99"],
  43700: ["QO-100", "ES'HAIL-2", "ESHAIL-2"],
  44881: ["CAS-4A", "ZHUHAI-1 OVS-1A"],
  44884: ["CAS-4B", "ZHUHAI-1 OVS-1B"],
  43803: ["JO-97", "JY1SAT", "FUNCUBE-6"],
  7530: ["AO-7", "AMSAT-OSCAR 7", "OSCAR 7"],
  46287: ["PSAT-2", "NO-104", "PARKINSONSAT-2"],
  43768: ["CAS-6", "HELIANTHUS-1", "TO-108"],
  25338: ["NOAA-15", "NOAA 15"],
  28654: ["NOAA-18", "NOAA 18"],
  33591: ["NOAA-19", "NOAA 19"],
  44387: ["METEOR-M2-2", "METEOR M2-2", "METEOR-M N2-2"],
};

for (const [noradId, names] of Object.entries(NORAD_TO_NAME)) {
  const meta = SATELLITE_DESCRIPTIONS[Number(noradId)];
  if (meta) {
    for (const name of names) {
      _byName.set(name.toUpperCase(), meta);
    }
  }
}

// Add name-based fallback entries
for (const [name, meta] of Object.entries(NAME_DESCRIPTIONS)) {
  _byName.set(name.toUpperCase(), meta);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Look up satellite metadata by NORAD ID first, then by name (case-insensitive).
 */
export function getSatelliteDescription(
  nameOrNorad: string | number,
): SatelliteMetadata | null {
  if (typeof nameOrNorad === "number") {
    return SATELLITE_DESCRIPTIONS[nameOrNorad] ?? null;
  }
  const upper = nameOrNorad.trim().toUpperCase();
  // Try name map first
  const byName = _byName.get(upper);
  if (byName) return byName;
  // Try parsing as NORAD ID
  const parsed = parseInt(upper, 10);
  if (!isNaN(parsed)) return SATELLITE_DESCRIPTIONS[parsed] ?? null;
  return null;
}

/**
 * Get all satellite metadata entries as [noradId, metadata] pairs.
 */
export function getAllSatelliteDescriptions(): [number, SatelliteMetadata][] {
  return Object.entries(SATELLITE_DESCRIPTIONS).map(([id, meta]) => [
    Number(id),
    meta,
  ]);
}
