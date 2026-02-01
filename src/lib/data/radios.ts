/**
 * Predefined Radio Equipment Database
 *
 * Performance data is representative/approximated based on:
 * - Sherwood Engineering receiver test data (http://www.sherweng.com/table.html)
 * - Manufacturer specifications
 * - Community benchmarks
 *
 * Note: Actual performance may vary between individual units and conditions.
 */

import type { RadioEquipment } from "@/types/radio";

/**
 * Common HF amateur bands
 */
const HF_BANDS = [
  "160m",
  "80m",
  "60m",
  "40m",
  "30m",
  "20m",
  "17m",
  "15m",
  "12m",
  "10m",
];
const HF_VHF_BANDS = [...HF_BANDS, "6m"];
const ALL_BANDS = [...HF_VHF_BANDS, "2m", "70cm"];

/**
 * Common operating modes
 */
const BASIC_MODES: RadioEquipment["modes"] = ["CW", "SSB", "AM", "FM"];
const FULL_MODES: RadioEquipment["modes"] = [
  "CW",
  "SSB",
  "AM",
  "FM",
  "FT8",
  "FT4",
  "RTTY",
  "PSK31",
  "DATA",
];

/**
 * Predefined radio equipment database
 * Organized by manufacturer, sorted by tier within each
 */
export const RADIO_DATABASE: RadioEquipment[] = [
  // ============ ICOM ============
  {
    id: "icom-ic7300",
    manufacturer: "Icom",
    model: "IC-7300",
    receiver: {
      rmdr: 89,
      imdr3: 99,
      blockingGain: 128,
      sensitivity: 0.16,
    },
    maxPower: 100,
    minPower: 5,
    modes: FULL_MODES,
    bands: HF_VHF_BANDS,
    tier: "midrange",
    releaseYear: 2016,
  },
  {
    id: "icom-ic7610",
    manufacturer: "Icom",
    model: "IC-7610",
    receiver: {
      rmdr: 104,
      imdr3: 102,
      blockingGain: 137,
      sensitivity: 0.13,
    },
    maxPower: 100,
    minPower: 5,
    modes: FULL_MODES,
    bands: HF_VHF_BANDS,
    tier: "highend",
    releaseYear: 2017,
  },
  {
    id: "icom-ic7851",
    manufacturer: "Icom",
    model: "IC-7851",
    receiver: {
      rmdr: 110,
      imdr3: 106,
      blockingGain: 142,
      sensitivity: 0.11,
    },
    maxPower: 200,
    minPower: 5,
    modes: FULL_MODES,
    bands: HF_VHF_BANDS,
    tier: "flagship",
    releaseYear: 2014,
  },
  {
    id: "icom-ic705",
    manufacturer: "Icom",
    model: "IC-705",
    receiver: {
      rmdr: 86,
      imdr3: 94,
      blockingGain: 120,
      sensitivity: 0.18,
    },
    maxPower: 10,
    minPower: 0.5,
    modes: FULL_MODES,
    bands: ALL_BANDS,
    tier: "midrange",
    releaseYear: 2020,
  },
  {
    id: "icom-ic9700",
    manufacturer: "Icom",
    model: "IC-9700",
    receiver: {
      rmdr: 85,
      imdr3: 93,
      blockingGain: 118,
      sensitivity: 0.14,
    },
    maxPower: 100,
    minPower: 5,
    modes: FULL_MODES,
    bands: ["2m", "70cm", "23cm"],
    tier: "highend",
    releaseYear: 2019,
  },

  // ============ YAESU ============
  {
    id: "yaesu-ft991a",
    manufacturer: "Yaesu",
    model: "FT-991A",
    receiver: {
      rmdr: 83,
      imdr3: 91,
      blockingGain: 123,
      sensitivity: 0.17,
    },
    maxPower: 100,
    minPower: 5,
    modes: FULL_MODES,
    bands: ALL_BANDS,
    tier: "midrange",
    releaseYear: 2016,
  },
  {
    id: "yaesu-ftdx10",
    manufacturer: "Yaesu",
    model: "FTDX10",
    receiver: {
      rmdr: 91,
      imdr3: 98,
      blockingGain: 129,
      sensitivity: 0.14,
    },
    maxPower: 100,
    minPower: 5,
    modes: FULL_MODES,
    bands: HF_VHF_BANDS,
    tier: "midrange",
    releaseYear: 2020,
  },
  {
    id: "yaesu-ftdx101d",
    manufacturer: "Yaesu",
    model: "FTDX101D",
    receiver: {
      rmdr: 106,
      imdr3: 104,
      blockingGain: 138,
      sensitivity: 0.12,
    },
    maxPower: 100,
    minPower: 5,
    modes: FULL_MODES,
    bands: HF_VHF_BANDS,
    tier: "highend",
    releaseYear: 2019,
  },
  {
    id: "yaesu-ftdx101mp",
    manufacturer: "Yaesu",
    model: "FTDX101MP",
    receiver: {
      rmdr: 106,
      imdr3: 104,
      blockingGain: 138,
      sensitivity: 0.12,
    },
    maxPower: 200,
    minPower: 5,
    modes: FULL_MODES,
    bands: HF_VHF_BANDS,
    tier: "flagship",
    releaseYear: 2019,
  },
  {
    id: "yaesu-ft710",
    manufacturer: "Yaesu",
    model: "FT-710",
    receiver: {
      rmdr: 88,
      imdr3: 96,
      blockingGain: 126,
      sensitivity: 0.15,
    },
    maxPower: 100,
    minPower: 5,
    modes: FULL_MODES,
    bands: HF_VHF_BANDS,
    tier: "midrange",
    releaseYear: 2022,
  },
  {
    id: "yaesu-ft818",
    manufacturer: "Yaesu",
    model: "FT-818ND",
    receiver: {
      rmdr: 72,
      imdr3: 82,
      blockingGain: 105,
      sensitivity: 0.22,
    },
    maxPower: 6,
    minPower: 0.5,
    modes: BASIC_MODES,
    bands: ALL_BANDS,
    tier: "entry",
    releaseYear: 2018,
  },

  // ============ KENWOOD ============
  {
    id: "kenwood-ts590sg",
    manufacturer: "Kenwood",
    model: "TS-590SG",
    receiver: {
      rmdr: 96,
      imdr3: 100,
      blockingGain: 131,
      sensitivity: 0.14,
    },
    maxPower: 100,
    minPower: 5,
    modes: FULL_MODES,
    bands: HF_VHF_BANDS,
    tier: "midrange",
    releaseYear: 2014,
  },
  {
    id: "kenwood-ts890s",
    manufacturer: "Kenwood",
    model: "TS-890S",
    receiver: {
      rmdr: 108,
      imdr3: 105,
      blockingGain: 140,
      sensitivity: 0.11,
    },
    maxPower: 100,
    minPower: 5,
    modes: FULL_MODES,
    bands: HF_VHF_BANDS,
    tier: "flagship",
    releaseYear: 2018,
  },
  {
    id: "kenwood-ts480sat",
    manufacturer: "Kenwood",
    model: "TS-480SAT",
    receiver: {
      rmdr: 78,
      imdr3: 88,
      blockingGain: 115,
      sensitivity: 0.19,
    },
    maxPower: 100,
    minPower: 5,
    modes: FULL_MODES,
    bands: HF_VHF_BANDS,
    tier: "entry",
    releaseYear: 2004,
  },

  // ============ ELECRAFT ============
  {
    id: "elecraft-kx3",
    manufacturer: "Elecraft",
    model: "KX3",
    receiver: {
      rmdr: 100,
      imdr3: 104,
      blockingGain: 135,
      sensitivity: 0.12,
    },
    maxPower: 15,
    minPower: 0.1,
    modes: FULL_MODES,
    bands: HF_VHF_BANDS,
    tier: "highend",
    releaseYear: 2012,
  },
  {
    id: "elecraft-kx2",
    manufacturer: "Elecraft",
    model: "KX2",
    receiver: {
      rmdr: 98,
      imdr3: 102,
      blockingGain: 133,
      sensitivity: 0.13,
    },
    maxPower: 12,
    minPower: 0.1,
    modes: FULL_MODES,
    bands: HF_BANDS,
    tier: "highend",
    releaseYear: 2016,
  },
  {
    id: "elecraft-k3s",
    manufacturer: "Elecraft",
    model: "K3S",
    receiver: {
      rmdr: 107,
      imdr3: 106,
      blockingGain: 141,
      sensitivity: 0.1,
    },
    maxPower: 100,
    minPower: 0.1,
    modes: FULL_MODES,
    bands: HF_VHF_BANDS,
    tier: "flagship",
    releaseYear: 2015,
  },
  {
    id: "elecraft-k4",
    manufacturer: "Elecraft",
    model: "K4",
    receiver: {
      rmdr: 112,
      imdr3: 108,
      blockingGain: 144,
      sensitivity: 0.09,
    },
    maxPower: 100,
    minPower: 0.1,
    modes: FULL_MODES,
    bands: HF_VHF_BANDS,
    tier: "flagship",
    releaseYear: 2020,
  },

  // ============ FLEX RADIO ============
  {
    id: "flex-6400",
    manufacturer: "FlexRadio",
    model: "FLEX-6400",
    receiver: {
      rmdr: 93,
      imdr3: 97,
      blockingGain: 130,
      sensitivity: 0.14,
    },
    maxPower: 100,
    minPower: 1,
    modes: FULL_MODES,
    bands: HF_VHF_BANDS,
    tier: "midrange",
    releaseYear: 2017,
  },
  {
    id: "flex-6600",
    manufacturer: "FlexRadio",
    model: "FLEX-6600",
    receiver: {
      rmdr: 101,
      imdr3: 102,
      blockingGain: 136,
      sensitivity: 0.12,
    },
    maxPower: 100,
    minPower: 1,
    modes: FULL_MODES,
    bands: HF_VHF_BANDS,
    tier: "highend",
    releaseYear: 2017,
  },
  {
    id: "flex-6700",
    manufacturer: "FlexRadio",
    model: "FLEX-6700",
    receiver: {
      rmdr: 105,
      imdr3: 104,
      blockingGain: 139,
      sensitivity: 0.11,
    },
    maxPower: 100,
    minPower: 1,
    modes: FULL_MODES,
    bands: HF_VHF_BANDS,
    tier: "flagship",
    releaseYear: 2013,
  },

  // ============ XIEGU ============
  {
    id: "xiegu-g90",
    manufacturer: "Xiegu",
    model: "G90",
    receiver: {
      rmdr: 70,
      imdr3: 80,
      blockingGain: 102,
      sensitivity: 0.25,
    },
    maxPower: 20,
    minPower: 1,
    modes: ["CW", "SSB", "AM", "DATA"],
    bands: HF_BANDS,
    tier: "entry",
    releaseYear: 2019,
  },
  {
    id: "xiegu-x6100",
    manufacturer: "Xiegu",
    model: "X6100",
    receiver: {
      rmdr: 75,
      imdr3: 84,
      blockingGain: 108,
      sensitivity: 0.22,
    },
    maxPower: 10,
    minPower: 0.5,
    modes: FULL_MODES,
    bands: HF_VHF_BANDS,
    tier: "entry",
    releaseYear: 2021,
  },

  // ============ QRP LABS ============
  {
    id: "qrplabs-qmx",
    manufacturer: "QRP Labs",
    model: "QMX",
    receiver: {
      rmdr: 65,
      imdr3: 75,
      blockingGain: 95,
      sensitivity: 0.3,
    },
    maxPower: 5,
    minPower: 0.1,
    modes: ["CW", "FT8", "FT4", "JS8"],
    bands: HF_BANDS,
    tier: "entry",
    releaseYear: 2023,
  },
];

/**
 * Get a radio by ID
 */
export function getRadioById(id: string): RadioEquipment | undefined {
  return RADIO_DATABASE.find((radio) => radio.id === id);
}

/**
 * Get radios grouped by manufacturer
 */
export function getRadiosByManufacturer(): Record<string, RadioEquipment[]> {
  const grouped: Record<string, RadioEquipment[]> = {};
  for (const radio of RADIO_DATABASE) {
    if (!grouped[radio.manufacturer]) {
      grouped[radio.manufacturer] = [];
    }
    grouped[radio.manufacturer].push(radio);
  }
  // Sort each manufacturer's radios by tier (flagship first) then model
  const tierOrder: Record<RadioEquipment["tier"], number> = {
    flagship: 0,
    highend: 1,
    midrange: 2,
    entry: 3,
  };
  for (const manufacturer in grouped) {
    grouped[manufacturer].sort((a, b) => {
      if (tierOrder[a.tier] !== tierOrder[b.tier]) {
        return tierOrder[a.tier] - tierOrder[b.tier];
      }
      return a.model.localeCompare(b.model);
    });
  }
  return grouped;
}

/**
 * Get all unique manufacturers
 */
export function getManufacturers(): string[] {
  const manufacturers = new Set<string>();
  for (const radio of RADIO_DATABASE) {
    manufacturers.add(radio.manufacturer);
  }
  return Array.from(manufacturers).sort();
}

/**
 * Search radios by text (manufacturer or model)
 */
export function searchRadios(query: string): RadioEquipment[] {
  const lower = query.toLowerCase();
  return RADIO_DATABASE.filter(
    (radio) =>
      radio.manufacturer.toLowerCase().includes(lower) ||
      radio.model.toLowerCase().includes(lower),
  );
}
