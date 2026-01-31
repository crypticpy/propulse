/**
 * ITU Band Plans Data
 * Comprehensive amateur radio HF band allocations for all ITU regions
 *
 * Data sources:
 * - ITU Radio Regulations
 * - IARU Region 1, 2, and 3 Band Plans
 * - FCC Part 97 (for US-specific allocations in ITU Region 2)
 *
 * Last updated: 2024
 */

import type {
  BandPlan,
  BandSegment,
  ITURegion,
  LicenseClass,
  BandMode,
} from "@/types/bandplan";

// =============================================================================
// ITU REGION 2 (Americas) Band Plans
// Based on FCC Part 97 for US allocations
// =============================================================================

const BAND_160M_ITU2: BandPlan = {
  band: "160m",
  region: "ITU2",
  name: "160 Meter Band",
  startMHz: 1.8,
  endMHz: 2.0,
  segments: [
    {
      startKHz: 1800,
      endKHz: 1800,
      modes: ["CW"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1500,
      isPrimary: true,
      notes: "CW only, shared with radiolocation",
    },
    {
      startKHz: 1800,
      endKHz: 1843,
      modes: ["CW", "RTTY", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1500,
      isPrimary: true,
      notes: "CW and digital modes",
    },
    {
      startKHz: 1843,
      endKHz: 2000,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1500,
      isPrimary: true,
      notes: "All modes, General class and above",
    },
  ],
};

const BAND_80M_ITU2: BandPlan = {
  band: "80m",
  region: "ITU2",
  name: "80 Meter Band",
  startMHz: 3.5,
  endMHz: 4.0,
  segments: [
    {
      startKHz: 3500,
      endKHz: 3525,
      modes: ["CW"],
      licenseClasses: ["EXTRA"],
      maxPowerWatts: 1500,
      isPrimary: true,
      notes: "Extra class only, CW",
    },
    {
      startKHz: 3525,
      endKHz: 3600,
      modes: ["CW", "RTTY", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1500,
      isPrimary: true,
      notes: "CW and data modes",
    },
    {
      startKHz: 3600,
      endKHz: 3700,
      modes: ["CW", "RTTY", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1500,
      isPrimary: true,
      notes: "CW and data modes, RTTY/Data calling 3.580-3.600",
    },
    {
      startKHz: 3700,
      endKHz: 3800,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["ADVANCED", "EXTRA"],
      maxPowerWatts: 1500,
      isPrimary: true,
      notes: "Advanced/Extra phone",
    },
    {
      startKHz: 3800,
      endKHz: 3900,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1500,
      isPrimary: true,
      notes: "General class and above",
    },
    {
      startKHz: 3900,
      endKHz: 4000,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1500,
      isPrimary: true,
      notes: "General class and above, 75m phone segment",
    },
  ],
};

const BAND_60M_ITU2: BandPlan = {
  band: "60m",
  region: "ITU2",
  name: "60 Meter Band",
  startMHz: 5.3305,
  endMHz: 5.4035,
  segments: [
    {
      startKHz: 5330.5,
      endKHz: 5330.5,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 100,
      isPrimary: false,
      notes:
        "Channel 1 - 5330.5 kHz USB dial, 2.8 kHz bandwidth, secondary allocation",
    },
    {
      startKHz: 5346.5,
      endKHz: 5346.5,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 100,
      isPrimary: false,
      notes:
        "Channel 2 - 5346.5 kHz USB dial, 2.8 kHz bandwidth, secondary allocation",
    },
    {
      startKHz: 5357.0,
      endKHz: 5357.0,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 100,
      isPrimary: false,
      notes:
        "Channel 3 - 5357.0 kHz USB dial, 2.8 kHz bandwidth, secondary allocation",
    },
    {
      startKHz: 5371.5,
      endKHz: 5371.5,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 100,
      isPrimary: false,
      notes:
        "Channel 4 - 5371.5 kHz USB dial, 2.8 kHz bandwidth, secondary allocation",
    },
    {
      startKHz: 5403.5,
      endKHz: 5403.5,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 100,
      isPrimary: false,
      notes:
        "Channel 5 - 5403.5 kHz USB dial, 2.8 kHz bandwidth, secondary allocation",
    },
  ],
};

const BAND_40M_ITU2: BandPlan = {
  band: "40m",
  region: "ITU2",
  name: "40 Meter Band",
  startMHz: 7.0,
  endMHz: 7.3,
  segments: [
    {
      startKHz: 7000,
      endKHz: 7025,
      modes: ["CW"],
      licenseClasses: ["EXTRA"],
      maxPowerWatts: 1500,
      isPrimary: true,
      notes: "Extra class only, CW",
    },
    {
      startKHz: 7025,
      endKHz: 7125,
      modes: ["CW", "RTTY", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1500,
      isPrimary: true,
      notes: "CW and data modes",
    },
    {
      startKHz: 7125,
      endKHz: 7175,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["EXTRA"],
      maxPowerWatts: 1500,
      isPrimary: true,
      notes: "Extra class phone",
    },
    {
      startKHz: 7175,
      endKHz: 7225,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["ADVANCED", "EXTRA"],
      maxPowerWatts: 1500,
      isPrimary: true,
      notes: "Advanced/Extra phone",
    },
    {
      startKHz: 7225,
      endKHz: 7300,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1500,
      isPrimary: true,
      notes: "General class and above",
    },
  ],
};

const BAND_30M_ITU2: BandPlan = {
  band: "30m",
  region: "ITU2",
  name: "30 Meter Band",
  startMHz: 10.1,
  endMHz: 10.15,
  segments: [
    {
      startKHz: 10100,
      endKHz: 10150,
      modes: ["CW", "RTTY", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 200,
      isPrimary: false,
      notes: "Secondary allocation, 200W max, no phone permitted",
    },
  ],
};

const BAND_20M_ITU2: BandPlan = {
  band: "20m",
  region: "ITU2",
  name: "20 Meter Band",
  startMHz: 14.0,
  endMHz: 14.35,
  segments: [
    {
      startKHz: 14000,
      endKHz: 14025,
      modes: ["CW"],
      licenseClasses: ["EXTRA"],
      maxPowerWatts: 1500,
      isPrimary: true,
      notes: "Extra class only, CW",
    },
    {
      startKHz: 14025,
      endKHz: 14150,
      modes: ["CW", "RTTY", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1500,
      isPrimary: true,
      notes: "CW and data modes",
    },
    {
      startKHz: 14150,
      endKHz: 14175,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["EXTRA"],
      maxPowerWatts: 1500,
      isPrimary: true,
      notes: "Extra class phone",
    },
    {
      startKHz: 14175,
      endKHz: 14225,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["ADVANCED", "EXTRA"],
      maxPowerWatts: 1500,
      isPrimary: true,
      notes: "Advanced/Extra phone",
    },
    {
      startKHz: 14225,
      endKHz: 14350,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1500,
      isPrimary: true,
      notes: "General class and above",
    },
  ],
};

const BAND_17M_ITU2: BandPlan = {
  band: "17m",
  region: "ITU2",
  name: "17 Meter Band",
  startMHz: 18.068,
  endMHz: 18.168,
  segments: [
    {
      startKHz: 18068,
      endKHz: 18110,
      modes: ["CW", "RTTY", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1500,
      isPrimary: true,
      notes: "CW and data modes",
    },
    {
      startKHz: 18110,
      endKHz: 18168,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1500,
      isPrimary: true,
      notes: "Phone, CW, and data modes",
    },
  ],
};

const BAND_15M_ITU2: BandPlan = {
  band: "15m",
  region: "ITU2",
  name: "15 Meter Band",
  startMHz: 21.0,
  endMHz: 21.45,
  segments: [
    {
      startKHz: 21000,
      endKHz: 21025,
      modes: ["CW"],
      licenseClasses: ["EXTRA"],
      maxPowerWatts: 1500,
      isPrimary: true,
      notes: "Extra class only, CW",
    },
    {
      startKHz: 21025,
      endKHz: 21200,
      modes: ["CW", "RTTY", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1500,
      isPrimary: true,
      notes: "CW and data modes",
    },
    {
      startKHz: 21200,
      endKHz: 21225,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["EXTRA"],
      maxPowerWatts: 1500,
      isPrimary: true,
      notes: "Extra class phone",
    },
    {
      startKHz: 21225,
      endKHz: 21275,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["ADVANCED", "EXTRA"],
      maxPowerWatts: 1500,
      isPrimary: true,
      notes: "Advanced/Extra phone",
    },
    {
      startKHz: 21275,
      endKHz: 21450,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1500,
      isPrimary: true,
      notes: "General class and above",
    },
  ],
};

const BAND_12M_ITU2: BandPlan = {
  band: "12m",
  region: "ITU2",
  name: "12 Meter Band",
  startMHz: 24.89,
  endMHz: 24.99,
  segments: [
    {
      startKHz: 24890,
      endKHz: 24930,
      modes: ["CW", "RTTY", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1500,
      isPrimary: true,
      notes: "CW and data modes",
    },
    {
      startKHz: 24930,
      endKHz: 24990,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1500,
      isPrimary: true,
      notes: "Phone, CW, and data modes",
    },
  ],
};

const BAND_10M_ITU2: BandPlan = {
  band: "10m",
  region: "ITU2",
  name: "10 Meter Band",
  startMHz: 28.0,
  endMHz: 29.7,
  segments: [
    {
      startKHz: 28000,
      endKHz: 28300,
      modes: ["CW", "RTTY", "DATA"],
      licenseClasses: ["TECHNICIAN", "GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1500,
      isPrimary: true,
      notes: "CW and data, Technician 200W max",
    },
    {
      startKHz: 28300,
      endKHz: 28500,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["TECHNICIAN", "GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1500,
      isPrimary: true,
      notes: "Phone and CW, Technician 200W max",
    },
    {
      startKHz: 28500,
      endKHz: 29000,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1500,
      isPrimary: true,
      notes: "General and above",
    },
    {
      startKHz: 29000,
      endKHz: 29200,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1500,
      isPrimary: true,
      notes: "General and above",
    },
    {
      startKHz: 29200,
      endKHz: 29300,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1500,
      isPrimary: true,
      notes: "General and above",
    },
    {
      startKHz: 29300,
      endKHz: 29510,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1500,
      isPrimary: true,
      notes: "Satellite downlinks 29.3-29.51 MHz",
    },
    {
      startKHz: 29510,
      endKHz: 29700,
      modes: ["CW", "PHONE", "FM"],
      licenseClasses: ["TECHNICIAN", "GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1500,
      isPrimary: true,
      notes: "FM repeater and simplex, 29.6 MHz FM calling",
    },
  ],
};

const BAND_6M_ITU2: BandPlan = {
  band: "6m",
  region: "ITU2",
  name: "6 Meter Band",
  startMHz: 50.0,
  endMHz: 54.0,
  segments: [
    {
      startKHz: 50000,
      endKHz: 50100,
      modes: ["CW"],
      licenseClasses: ["TECHNICIAN", "GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1500,
      isPrimary: true,
      notes: "CW only, beacons 50.06-50.08",
    },
    {
      startKHz: 50100,
      endKHz: 50300,
      modes: ["CW", "PHONE"],
      licenseClasses: ["TECHNICIAN", "GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1500,
      isPrimary: true,
      notes: "SSB/CW, DX window 50.1-50.125, calling 50.125",
    },
    {
      startKHz: 50300,
      endKHz: 50600,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["TECHNICIAN", "GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1500,
      isPrimary: true,
      notes: "All modes",
    },
    {
      startKHz: 50600,
      endKHz: 51000,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["TECHNICIAN", "GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1500,
      isPrimary: true,
      notes: "All modes, experimental",
    },
    {
      startKHz: 51000,
      endKHz: 52000,
      modes: ["CW", "PHONE", "FM"],
      licenseClasses: ["TECHNICIAN", "GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1500,
      isPrimary: true,
      notes: "FM simplex, Pacific DX window 51.0-51.1",
    },
    {
      startKHz: 52000,
      endKHz: 52500,
      modes: ["CW", "PHONE", "FM"],
      licenseClasses: ["TECHNICIAN", "GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1500,
      isPrimary: true,
      notes: "FM repeater outputs",
    },
    {
      startKHz: 52500,
      endKHz: 53000,
      modes: ["CW", "PHONE", "FM"],
      licenseClasses: ["TECHNICIAN", "GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1500,
      isPrimary: true,
      notes: "FM simplex, calling 52.525",
    },
    {
      startKHz: 53000,
      endKHz: 53500,
      modes: ["CW", "PHONE", "FM"],
      licenseClasses: ["TECHNICIAN", "GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1500,
      isPrimary: true,
      notes: "FM repeater inputs",
    },
    {
      startKHz: 53500,
      endKHz: 54000,
      modes: ["CW", "PHONE", "FM"],
      licenseClasses: ["TECHNICIAN", "GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1500,
      isPrimary: true,
      notes: "All modes",
    },
  ],
};

// =============================================================================
// ITU REGION 1 (Europe, Africa, Middle East, Northern Asia) Band Plans
// Based on IARU Region 1 Band Plan
// =============================================================================

const BAND_160M_ITU1: BandPlan = {
  band: "160m",
  region: "ITU1",
  name: "160 Meter Band",
  startMHz: 1.81,
  endMHz: 2.0,
  segments: [
    {
      startKHz: 1810,
      endKHz: 1838,
      modes: ["CW"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: false,
      notes: "CW only, secondary allocation in many countries",
    },
    {
      startKHz: 1838,
      endKHz: 1840,
      modes: ["CW", "RTTY", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: false,
      notes: "Narrow band modes",
    },
    {
      startKHz: 1840,
      endKHz: 1843,
      modes: ["CW", "RTTY", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: false,
      notes: "Digital modes",
    },
    {
      startKHz: 1843,
      endKHz: 2000,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: false,
      notes: "All modes, phone preferred 1843-2000",
    },
  ],
};

const BAND_80M_ITU1: BandPlan = {
  band: "80m",
  region: "ITU1",
  name: "80 Meter Band",
  startMHz: 3.5,
  endMHz: 3.8,
  segments: [
    {
      startKHz: 3500,
      endKHz: 3510,
      modes: ["CW"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "CW priority, intercontinental DX",
    },
    {
      startKHz: 3510,
      endKHz: 3560,
      modes: ["CW"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "CW, contest preferred",
    },
    {
      startKHz: 3560,
      endKHz: 3580,
      modes: ["CW"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "CW",
    },
    {
      startKHz: 3580,
      endKHz: 3600,
      modes: ["CW", "RTTY", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "Digimodes",
    },
    {
      startKHz: 3600,
      endKHz: 3650,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "All modes, SSB contest preferred",
    },
    {
      startKHz: 3650,
      endKHz: 3700,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "All modes",
    },
    {
      startKHz: 3700,
      endKHz: 3800,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "All modes, SSB preferred, DX window 3775-3800",
    },
  ],
};

const BAND_60M_ITU1: BandPlan = {
  band: "60m",
  region: "ITU1",
  name: "60 Meter Band",
  startMHz: 5.3515,
  endMHz: 5.3665,
  segments: [
    {
      startKHz: 5351.5,
      endKHz: 5366.5,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 15,
      isPrimary: false,
      notes: "15W EIRP max, secondary allocation, WRC-15 allocation",
    },
  ],
};

const BAND_40M_ITU1: BandPlan = {
  band: "40m",
  region: "ITU1",
  name: "40 Meter Band",
  startMHz: 7.0,
  endMHz: 7.2,
  segments: [
    {
      startKHz: 7000,
      endKHz: 7040,
      modes: ["CW"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "CW, DX 7000-7025, contest 7025-7040",
    },
    {
      startKHz: 7040,
      endKHz: 7047,
      modes: ["CW", "RTTY", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "Narrow band modes",
    },
    {
      startKHz: 7047,
      endKHz: 7050,
      modes: ["CW", "RTTY", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "Digital modes",
    },
    {
      startKHz: 7050,
      endKHz: 7053,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "All modes, digital voice",
    },
    {
      startKHz: 7053,
      endKHz: 7060,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "All modes",
    },
    {
      startKHz: 7060,
      endKHz: 7100,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "All modes, SSB contest",
    },
    {
      startKHz: 7100,
      endKHz: 7130,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "All modes",
    },
    {
      startKHz: 7130,
      endKHz: 7200,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "All modes, SSB preferred, intercontinental DX 7175-7200",
    },
  ],
};

const BAND_30M_ITU1: BandPlan = {
  band: "30m",
  region: "ITU1",
  name: "30 Meter Band",
  startMHz: 10.1,
  endMHz: 10.15,
  segments: [
    {
      startKHz: 10100,
      endKHz: 10140,
      modes: ["CW"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 150,
      isPrimary: false,
      notes: "CW, secondary allocation",
    },
    {
      startKHz: 10140,
      endKHz: 10150,
      modes: ["CW", "RTTY", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 150,
      isPrimary: false,
      notes: "Narrow band modes, secondary allocation",
    },
  ],
};

const BAND_20M_ITU1: BandPlan = {
  band: "20m",
  region: "ITU1",
  name: "20 Meter Band",
  startMHz: 14.0,
  endMHz: 14.35,
  segments: [
    {
      startKHz: 14000,
      endKHz: 14060,
      modes: ["CW"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "CW, contest 14000-14060",
    },
    {
      startKHz: 14060,
      endKHz: 14070,
      modes: ["CW"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "CW",
    },
    {
      startKHz: 14070,
      endKHz: 14099,
      modes: ["CW", "RTTY", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "Narrow band modes",
    },
    {
      startKHz: 14099,
      endKHz: 14101,
      modes: ["CW"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "IBP beacon network, no transmit",
    },
    {
      startKHz: 14101,
      endKHz: 14112,
      modes: ["CW", "RTTY", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "Digital modes",
    },
    {
      startKHz: 14112,
      endKHz: 14125,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "All modes",
    },
    {
      startKHz: 14125,
      endKHz: 14300,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "All modes, SSB contest, DX calling 14195, emergency 14300",
    },
    {
      startKHz: 14300,
      endKHz: 14350,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "All modes, global emergency 14300",
    },
  ],
};

const BAND_17M_ITU1: BandPlan = {
  band: "17m",
  region: "ITU1",
  name: "17 Meter Band",
  startMHz: 18.068,
  endMHz: 18.168,
  segments: [
    {
      startKHz: 18068,
      endKHz: 18095,
      modes: ["CW"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "CW",
    },
    {
      startKHz: 18095,
      endKHz: 18109,
      modes: ["CW", "RTTY", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "Narrow band modes",
    },
    {
      startKHz: 18109,
      endKHz: 18111,
      modes: ["CW"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "IBP beacon network, no transmit",
    },
    {
      startKHz: 18111,
      endKHz: 18120,
      modes: ["CW", "RTTY", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "Digital modes",
    },
    {
      startKHz: 18120,
      endKHz: 18168,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "All modes, SSB",
    },
  ],
};

const BAND_15M_ITU1: BandPlan = {
  band: "15m",
  region: "ITU1",
  name: "15 Meter Band",
  startMHz: 21.0,
  endMHz: 21.45,
  segments: [
    {
      startKHz: 21000,
      endKHz: 21070,
      modes: ["CW"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "CW",
    },
    {
      startKHz: 21070,
      endKHz: 21110,
      modes: ["CW", "RTTY", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "Narrow band modes",
    },
    {
      startKHz: 21110,
      endKHz: 21120,
      modes: ["CW", "RTTY", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "Digital modes excluding packet",
    },
    {
      startKHz: 21120,
      endKHz: 21149,
      modes: ["CW", "RTTY", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "Narrow band modes",
    },
    {
      startKHz: 21149,
      endKHz: 21151,
      modes: ["CW"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "IBP beacon network, no transmit",
    },
    {
      startKHz: 21151,
      endKHz: 21450,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "All modes, SSB QRP 21285",
    },
  ],
};

const BAND_12M_ITU1: BandPlan = {
  band: "12m",
  region: "ITU1",
  name: "12 Meter Band",
  startMHz: 24.89,
  endMHz: 24.99,
  segments: [
    {
      startKHz: 24890,
      endKHz: 24915,
      modes: ["CW"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "CW",
    },
    {
      startKHz: 24915,
      endKHz: 24929,
      modes: ["CW", "RTTY", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "Narrow band modes",
    },
    {
      startKHz: 24929,
      endKHz: 24931,
      modes: ["CW"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "IBP beacon network, no transmit",
    },
    {
      startKHz: 24931,
      endKHz: 24990,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "All modes",
    },
  ],
};

const BAND_10M_ITU1: BandPlan = {
  band: "10m",
  region: "ITU1",
  name: "10 Meter Band",
  startMHz: 28.0,
  endMHz: 29.7,
  segments: [
    {
      startKHz: 28000,
      endKHz: 28070,
      modes: ["CW"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "CW",
    },
    {
      startKHz: 28070,
      endKHz: 28120,
      modes: ["CW", "RTTY", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "Narrow band modes",
    },
    {
      startKHz: 28120,
      endKHz: 28150,
      modes: ["CW", "RTTY", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "Narrow band modes, robot packet",
    },
    {
      startKHz: 28150,
      endKHz: 28190,
      modes: ["CW", "RTTY", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "Narrow band modes",
    },
    {
      startKHz: 28190,
      endKHz: 28199,
      modes: ["CW"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "Regional beacons",
    },
    {
      startKHz: 28199,
      endKHz: 28201,
      modes: ["CW"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "IBP beacon network, no transmit",
    },
    {
      startKHz: 28201,
      endKHz: 28225,
      modes: ["CW"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "Continuous duty beacons",
    },
    {
      startKHz: 28225,
      endKHz: 28300,
      modes: ["CW"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "Beacons",
    },
    {
      startKHz: 28300,
      endKHz: 28320,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "All modes, digital voice",
    },
    {
      startKHz: 28320,
      endKHz: 29000,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "All modes",
    },
    {
      startKHz: 29000,
      endKHz: 29100,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "All modes",
    },
    {
      startKHz: 29100,
      endKHz: 29200,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "All modes, FM simplex",
    },
    {
      startKHz: 29200,
      endKHz: 29300,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "All modes, digital/packet",
    },
    {
      startKHz: 29300,
      endKHz: 29510,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "Satellite downlinks",
    },
    {
      startKHz: 29510,
      endKHz: 29520,
      modes: ["FM"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "Guard channel",
    },
    {
      startKHz: 29520,
      endKHz: 29700,
      modes: ["FM"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "FM repeaters and simplex, calling 29.6",
    },
  ],
};

const BAND_6M_ITU1: BandPlan = {
  band: "6m",
  region: "ITU1",
  name: "6 Meter Band",
  startMHz: 50.0,
  endMHz: 52.0,
  segments: [
    {
      startKHz: 50000,
      endKHz: 50100,
      modes: ["CW"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "CW only, beacons 50.0-50.03",
    },
    {
      startKHz: 50100,
      endKHz: 50130,
      modes: ["CW", "PHONE"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "Intercontinental DX, SSB calling 50.11",
    },
    {
      startKHz: 50130,
      endKHz: 50200,
      modes: ["CW", "PHONE"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "International, SSB calling 50.15",
    },
    {
      startKHz: 50200,
      endKHz: 50300,
      modes: ["CW", "PHONE"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "General use",
    },
    {
      startKHz: 50300,
      endKHz: 50400,
      modes: ["CW", "RTTY", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "Narrow band modes",
    },
    {
      startKHz: 50400,
      endKHz: 50500,
      modes: ["CW"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "Propagation beacons",
    },
    {
      startKHz: 50500,
      endKHz: 52000,
      modes: ["CW", "PHONE", "FM"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "All modes, FM calling 51.51",
    },
  ],
};

// =============================================================================
// ITU REGION 3 (Asia Pacific, Oceania) Band Plans
// Based on IARU Region 3 Band Plan
// =============================================================================

const BAND_160M_ITU3: BandPlan = {
  band: "160m",
  region: "ITU3",
  name: "160 Meter Band",
  startMHz: 1.8,
  endMHz: 2.0,
  segments: [
    {
      startKHz: 1800,
      endKHz: 1810,
      modes: ["CW"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: false,
      notes: "CW, secondary allocation in most countries",
    },
    {
      startKHz: 1810,
      endKHz: 1838,
      modes: ["CW"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: false,
      notes: "CW",
    },
    {
      startKHz: 1838,
      endKHz: 1843,
      modes: ["CW", "RTTY", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: false,
      notes: "Narrow band modes",
    },
    {
      startKHz: 1843,
      endKHz: 2000,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: false,
      notes: "All modes",
    },
  ],
};

const BAND_80M_ITU3: BandPlan = {
  band: "80m",
  region: "ITU3",
  name: "80 Meter Band",
  startMHz: 3.5,
  endMHz: 3.9,
  segments: [
    {
      startKHz: 3500,
      endKHz: 3510,
      modes: ["CW"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "CW DX",
    },
    {
      startKHz: 3510,
      endKHz: 3535,
      modes: ["CW"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "CW contest",
    },
    {
      startKHz: 3535,
      endKHz: 3560,
      modes: ["CW", "RTTY", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "Narrow band modes",
    },
    {
      startKHz: 3560,
      endKHz: 3580,
      modes: ["CW"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "CW",
    },
    {
      startKHz: 3580,
      endKHz: 3600,
      modes: ["CW", "RTTY", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "Digimodes",
    },
    {
      startKHz: 3600,
      endKHz: 3620,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "All modes, digital voice",
    },
    {
      startKHz: 3620,
      endKHz: 3650,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "All modes",
    },
    {
      startKHz: 3650,
      endKHz: 3700,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "All modes, SSB contest",
    },
    {
      startKHz: 3700,
      endKHz: 3776,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "All modes",
    },
    {
      startKHz: 3776,
      endKHz: 3800,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "All modes, DX window",
    },
    {
      startKHz: 3800,
      endKHz: 3900,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "All modes (where available)",
    },
  ],
};

const BAND_60M_ITU3: BandPlan = {
  band: "60m",
  region: "ITU3",
  name: "60 Meter Band",
  startMHz: 5.3515,
  endMHz: 5.3665,
  segments: [
    {
      startKHz: 5351.5,
      endKHz: 5366.5,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 15,
      isPrimary: false,
      notes: "15W EIRP max, secondary allocation, WRC-15",
    },
  ],
};

const BAND_40M_ITU3: BandPlan = {
  band: "40m",
  region: "ITU3",
  name: "40 Meter Band",
  startMHz: 7.0,
  endMHz: 7.2,
  segments: [
    {
      startKHz: 7000,
      endKHz: 7025,
      modes: ["CW"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "CW DX",
    },
    {
      startKHz: 7025,
      endKHz: 7040,
      modes: ["CW"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "CW contest",
    },
    {
      startKHz: 7040,
      endKHz: 7050,
      modes: ["CW", "RTTY", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "Narrow band modes",
    },
    {
      startKHz: 7050,
      endKHz: 7060,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "All modes",
    },
    {
      startKHz: 7060,
      endKHz: 7100,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "All modes, SSB contest",
    },
    {
      startKHz: 7100,
      endKHz: 7130,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "All modes",
    },
    {
      startKHz: 7130,
      endKHz: 7200,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "All modes, DX window 7175-7200",
    },
  ],
};

const BAND_30M_ITU3: BandPlan = {
  band: "30m",
  region: "ITU3",
  name: "30 Meter Band",
  startMHz: 10.1,
  endMHz: 10.15,
  segments: [
    {
      startKHz: 10100,
      endKHz: 10140,
      modes: ["CW"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 150,
      isPrimary: false,
      notes: "CW, secondary allocation",
    },
    {
      startKHz: 10140,
      endKHz: 10150,
      modes: ["CW", "RTTY", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 150,
      isPrimary: false,
      notes: "Narrow band modes, secondary allocation",
    },
  ],
};

const BAND_20M_ITU3: BandPlan = {
  band: "20m",
  region: "ITU3",
  name: "20 Meter Band",
  startMHz: 14.0,
  endMHz: 14.35,
  segments: [
    {
      startKHz: 14000,
      endKHz: 14025,
      modes: ["CW"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "CW DX",
    },
    {
      startKHz: 14025,
      endKHz: 14050,
      modes: ["CW"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "CW contest",
    },
    {
      startKHz: 14050,
      endKHz: 14070,
      modes: ["CW"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "CW",
    },
    {
      startKHz: 14070,
      endKHz: 14099,
      modes: ["CW", "RTTY", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "Narrow band modes",
    },
    {
      startKHz: 14099,
      endKHz: 14101,
      modes: ["CW"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "IBP beacons, no transmit",
    },
    {
      startKHz: 14101,
      endKHz: 14112,
      modes: ["CW", "RTTY", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "Narrow band modes",
    },
    {
      startKHz: 14112,
      endKHz: 14150,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "All modes",
    },
    {
      startKHz: 14150,
      endKHz: 14350,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "All modes, SSB, emergency 14.300",
    },
  ],
};

const BAND_17M_ITU3: BandPlan = {
  band: "17m",
  region: "ITU3",
  name: "17 Meter Band",
  startMHz: 18.068,
  endMHz: 18.168,
  segments: [
    {
      startKHz: 18068,
      endKHz: 18100,
      modes: ["CW"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "CW",
    },
    {
      startKHz: 18100,
      endKHz: 18109,
      modes: ["CW", "RTTY", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "Narrow band modes",
    },
    {
      startKHz: 18109,
      endKHz: 18111,
      modes: ["CW"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "IBP beacons, no transmit",
    },
    {
      startKHz: 18111,
      endKHz: 18120,
      modes: ["CW", "RTTY", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "Narrow band modes",
    },
    {
      startKHz: 18120,
      endKHz: 18168,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "All modes, SSB",
    },
  ],
};

const BAND_15M_ITU3: BandPlan = {
  band: "15m",
  region: "ITU3",
  name: "15 Meter Band",
  startMHz: 21.0,
  endMHz: 21.45,
  segments: [
    {
      startKHz: 21000,
      endKHz: 21025,
      modes: ["CW"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "CW DX",
    },
    {
      startKHz: 21025,
      endKHz: 21050,
      modes: ["CW"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "CW contest",
    },
    {
      startKHz: 21050,
      endKHz: 21070,
      modes: ["CW"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "CW",
    },
    {
      startKHz: 21070,
      endKHz: 21125,
      modes: ["CW", "RTTY", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "Narrow band modes",
    },
    {
      startKHz: 21125,
      endKHz: 21149,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "All modes",
    },
    {
      startKHz: 21149,
      endKHz: 21151,
      modes: ["CW"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "IBP beacons, no transmit",
    },
    {
      startKHz: 21151,
      endKHz: 21450,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "All modes, SSB",
    },
  ],
};

const BAND_12M_ITU3: BandPlan = {
  band: "12m",
  region: "ITU3",
  name: "12 Meter Band",
  startMHz: 24.89,
  endMHz: 24.99,
  segments: [
    {
      startKHz: 24890,
      endKHz: 24920,
      modes: ["CW"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "CW",
    },
    {
      startKHz: 24920,
      endKHz: 24929,
      modes: ["CW", "RTTY", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "Narrow band modes",
    },
    {
      startKHz: 24929,
      endKHz: 24931,
      modes: ["CW"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "IBP beacons, no transmit",
    },
    {
      startKHz: 24931,
      endKHz: 24990,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "All modes",
    },
  ],
};

const BAND_10M_ITU3: BandPlan = {
  band: "10m",
  region: "ITU3",
  name: "10 Meter Band",
  startMHz: 28.0,
  endMHz: 29.7,
  segments: [
    {
      startKHz: 28000,
      endKHz: 28050,
      modes: ["CW"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "CW DX",
    },
    {
      startKHz: 28050,
      endKHz: 28070,
      modes: ["CW"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "CW contest",
    },
    {
      startKHz: 28070,
      endKHz: 28150,
      modes: ["CW", "RTTY", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "Narrow band modes",
    },
    {
      startKHz: 28150,
      endKHz: 28190,
      modes: ["CW", "RTTY", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "Narrow band modes",
    },
    {
      startKHz: 28190,
      endKHz: 28199,
      modes: ["CW"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "Regional beacons",
    },
    {
      startKHz: 28199,
      endKHz: 28201,
      modes: ["CW"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "IBP beacons, no transmit",
    },
    {
      startKHz: 28201,
      endKHz: 28300,
      modes: ["CW"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "Beacons",
    },
    {
      startKHz: 28300,
      endKHz: 28500,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "All modes",
    },
    {
      startKHz: 28500,
      endKHz: 29000,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "All modes",
    },
    {
      startKHz: 29000,
      endKHz: 29300,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "All modes",
    },
    {
      startKHz: 29300,
      endKHz: 29510,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "Satellite downlinks",
    },
    {
      startKHz: 29510,
      endKHz: 29700,
      modes: ["FM"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "FM repeaters and simplex, calling 29.6",
    },
  ],
};

const BAND_6M_ITU3: BandPlan = {
  band: "6m",
  region: "ITU3",
  name: "6 Meter Band",
  startMHz: 50.0,
  endMHz: 54.0,
  segments: [
    {
      startKHz: 50000,
      endKHz: 50100,
      modes: ["CW"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "CW, beacons 50.0-50.1",
    },
    {
      startKHz: 50100,
      endKHz: 50120,
      modes: ["CW", "PHONE"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "DX window, calling 50.11",
    },
    {
      startKHz: 50120,
      endKHz: 50300,
      modes: ["CW", "PHONE"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "SSB",
    },
    {
      startKHz: 50300,
      endKHz: 50500,
      modes: ["CW", "RTTY", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "Narrow band modes",
    },
    {
      startKHz: 50500,
      endKHz: 51000,
      modes: ["CW", "PHONE", "DATA"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "All modes",
    },
    {
      startKHz: 51000,
      endKHz: 52000,
      modes: ["CW", "PHONE", "FM"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "FM and all modes",
    },
    {
      startKHz: 52000,
      endKHz: 54000,
      modes: ["CW", "PHONE", "FM"],
      licenseClasses: ["GENERAL", "ADVANCED", "EXTRA"],
      maxPowerWatts: 1000,
      isPrimary: true,
      notes: "FM repeaters and simplex (where available)",
    },
  ],
};

// =============================================================================
// Exported Band Plan Arrays
// =============================================================================

/**
 * ITU Region 2 (Americas) band plans
 * Based on FCC Part 97 regulations for US
 */
export const BAND_PLANS_ITU2: BandPlan[] = [
  BAND_160M_ITU2,
  BAND_80M_ITU2,
  BAND_60M_ITU2,
  BAND_40M_ITU2,
  BAND_30M_ITU2,
  BAND_20M_ITU2,
  BAND_17M_ITU2,
  BAND_15M_ITU2,
  BAND_12M_ITU2,
  BAND_10M_ITU2,
  BAND_6M_ITU2,
];

/**
 * ITU Region 1 (Europe, Africa, Middle East, Northern Asia) band plans
 * Based on IARU Region 1 band plan
 */
export const BAND_PLANS_ITU1: BandPlan[] = [
  BAND_160M_ITU1,
  BAND_80M_ITU1,
  BAND_60M_ITU1,
  BAND_40M_ITU1,
  BAND_30M_ITU1,
  BAND_20M_ITU1,
  BAND_17M_ITU1,
  BAND_15M_ITU1,
  BAND_12M_ITU1,
  BAND_10M_ITU1,
  BAND_6M_ITU1,
];

/**
 * ITU Region 3 (Asia Pacific, Oceania) band plans
 * Based on IARU Region 3 band plan
 */
export const BAND_PLANS_ITU3: BandPlan[] = [
  BAND_160M_ITU3,
  BAND_80M_ITU3,
  BAND_60M_ITU3,
  BAND_40M_ITU3,
  BAND_30M_ITU3,
  BAND_20M_ITU3,
  BAND_17M_ITU3,
  BAND_15M_ITU3,
  BAND_12M_ITU3,
  BAND_10M_ITU3,
  BAND_6M_ITU3,
];

/**
 * Combined lookup for all ITU regions
 */
export const ALL_BAND_PLANS: Record<ITURegion, BandPlan[]> = {
  ITU1: BAND_PLANS_ITU1,
  ITU2: BAND_PLANS_ITU2,
  ITU3: BAND_PLANS_ITU3,
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get band plan for a specific band and ITU region
 * @param band - Band designator (e.g., '20m', '40m')
 * @param region - ITU region
 * @returns BandPlan or undefined if not found
 */
export function getBandPlan(
  band: string,
  region: ITURegion,
): BandPlan | undefined {
  const plans = ALL_BAND_PLANS[region];
  return plans.find((p) => p.band === band);
}

/**
 * Get the band plan and segment for a given frequency
 * @param frequencyKHz - Frequency in kHz
 * @param region - ITU region
 * @returns Object with band and segment, or undefined if frequency not in any band
 */
export function getSegmentForFrequency(
  frequencyKHz: number,
  region: ITURegion,
): { band: BandPlan; segment: BandSegment } | undefined {
  const plans = ALL_BAND_PLANS[region];

  for (const band of plans) {
    const bandStartKHz = band.startMHz * 1000;
    const bandEndKHz = band.endMHz * 1000;

    if (frequencyKHz >= bandStartKHz && frequencyKHz <= bandEndKHz) {
      // Find the specific segment
      for (const segment of band.segments) {
        if (
          frequencyKHz >= segment.startKHz &&
          frequencyKHz <= segment.endKHz
        ) {
          return { band, segment };
        }
      }
      // Frequency is in band but not in any segment (gap between segments)
      // This can happen with 60m channelized allocations
      return undefined;
    }
  }

  return undefined;
}

/**
 * Check if operation at a frequency is allowed for a given license class and mode
 * @param frequencyKHz - Frequency in kHz
 * @param region - ITU region
 * @param licenseClass - License class of operator
 * @param mode - Operating mode
 * @returns true if operation is allowed, false otherwise
 */
export function isFrequencyAllowed(
  frequencyKHz: number,
  region: ITURegion,
  licenseClass: LicenseClass,
  mode: BandMode,
): boolean {
  const result = getSegmentForFrequency(frequencyKHz, region);

  if (!result) {
    return false;
  }

  const { segment } = result;

  // Check if license class is authorized
  if (!segment.licenseClasses.includes(licenseClass)) {
    return false;
  }

  // Check if mode is permitted
  if (!segment.modes.includes(mode)) {
    return false;
  }

  return true;
}

/**
 * Get all bands for a specific ITU region
 * @param region - ITU region
 * @returns Array of band designators
 */
export function getBandsForRegion(region: ITURegion): string[] {
  return ALL_BAND_PLANS[region].map((plan) => plan.band);
}

/**
 * Find frequency range for a license class in a specific band
 * @param band - Band designator
 * @param region - ITU region
 * @param licenseClass - License class
 * @param mode - Operating mode (optional, filters by mode if provided)
 * @returns Array of segments available to the license class
 */
export function getAvailableSegments(
  band: string,
  region: ITURegion,
  licenseClass: LicenseClass,
  mode?: BandMode,
): BandSegment[] {
  const plan = getBandPlan(band, region);
  if (!plan) {
    return [];
  }

  return plan.segments.filter((segment) => {
    const hasLicense = segment.licenseClasses.includes(licenseClass);
    const hasMode = mode ? segment.modes.includes(mode) : true;
    return hasLicense && hasMode;
  });
}

/**
 * Get maximum power allowed at a frequency
 * @param frequencyKHz - Frequency in kHz
 * @param region - ITU region
 * @param licenseClass - License class (may affect power limits)
 * @returns Maximum power in watts, or 0 if frequency not allowed
 */
export function getMaxPower(
  frequencyKHz: number,
  region: ITURegion,
  licenseClass: LicenseClass,
): number {
  const result = getSegmentForFrequency(frequencyKHz, region);

  if (!result) {
    return 0;
  }

  const { segment } = result;

  if (!segment.licenseClasses.includes(licenseClass)) {
    return 0;
  }

  // Special case: Technician on 10m is limited to 200W
  if (
    licenseClass === "TECHNICIAN" &&
    frequencyKHz >= 28000 &&
    frequencyKHz <= 28500
  ) {
    return Math.min(segment.maxPowerWatts, 200);
  }

  return segment.maxPowerWatts;
}
