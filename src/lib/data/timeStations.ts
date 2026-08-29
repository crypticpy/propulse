/**
 * Standard time & frequency broadcast stations (WWV/WWVH/CHU and peers).
 *
 * These are fixed, continuously transmitting HF beacons with precisely known
 * locations and schedules — hearing one is an instant propagation check
 * toward its region. Rendered as a map marker layer (G20).
 */

export interface TimeStation {
  id: string;
  callsign: string;
  name: string;
  /** Operating agency, for the tooltip */
  operator: string;
  lat: number;
  lon: number;
  /** Carrier frequencies in MHz, ascending */
  frequenciesMHz: number[];
  notes?: string;
}

export const TIME_STATIONS: TimeStation[] = [
  {
    id: "wwv",
    callsign: "WWV",
    name: "Fort Collins, Colorado, USA",
    operator: "NIST",
    lat: 40.6781,
    lon: -105.0403,
    frequenciesMHz: [2.5, 5, 10, 15, 20, 25],
    notes: "Voice time announcements every minute; male voice",
  },
  {
    id: "wwvh",
    callsign: "WWVH",
    name: "Kekaha, Kauai, Hawaii, USA",
    operator: "NIST",
    lat: 21.9878,
    lon: -159.7631,
    frequenciesMHz: [2.5, 5, 10, 15],
    notes: "Voice time announcements every minute; female voice",
  },
  {
    id: "chu",
    callsign: "CHU",
    name: "Ottawa, Ontario, Canada",
    operator: "NRC",
    lat: 45.2986,
    lon: -75.7573,
    frequenciesMHz: [3.33, 7.85, 14.67],
    notes: "Bilingual voice announcements; USB with full carrier",
  },
  {
    id: "rwm",
    callsign: "RWM",
    name: "Moscow, Russia",
    operator: "VNIIFTRI",
    lat: 55.8,
    lon: 38.3,
    frequenciesMHz: [4.996, 9.996, 14.996],
    notes: "CW time signal, no voice",
  },
  {
    id: "bpm",
    callsign: "BPM",
    name: "Pucheng, Shaanxi, China",
    operator: "NTSC (Chinese Academy of Sciences)",
    lat: 34.95,
    lon: 109.56,
    frequenciesMHz: [2.5, 5, 10, 15],
  },
  {
    id: "yvto",
    callsign: "YVTO",
    name: "Caracas, Venezuela",
    operator: "Cagigal Naval Observatory",
    lat: 10.5061,
    lon: -66.9281,
    frequenciesMHz: [5],
    notes: "Spanish voice announcements",
  },
  {
    id: "hla",
    callsign: "HLA",
    name: "Daejeon, South Korea",
    operator: "KRISS",
    lat: 36.3872,
    lon: 127.3653,
    frequenciesMHz: [5],
  },
];
