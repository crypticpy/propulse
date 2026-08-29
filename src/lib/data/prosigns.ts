/**
 * CW prosigns (run-together Morse) and common CW abbreviations.
 */

export interface Prosign {
  sign: string;
  morse: string;
  meaning: string;
}

export const PROSIGNS: Prosign[] = [
  { sign: "AR", morse: ".-.-.", meaning: "End of message" },
  { sign: "AS", morse: ".-...", meaning: "Wait / stand by" },
  { sign: "BK", morse: "-...-.-", meaning: "Break (invite receiving station to transmit)" },
  { sign: "BT", morse: "-...-", meaning: "New paragraph / separator" },
  { sign: "CL", morse: "-.-..-..", meaning: "Closing station (going off the air)" },
  { sign: "CT", morse: "-.-.-", meaning: "Start of transmission / attention" },
  { sign: "HH", morse: "........", meaning: "Error / correction, delete last word" },
  { sign: "K", morse: "-.-", meaning: "Invitation to transmit (go ahead)" },
  { sign: "KN", morse: "-.--.", meaning: "Invitation to transmit, specific station only" },
  { sign: "R", morse: ".-.", meaning: "Received / acknowledged (roger)" },
  { sign: "SK", morse: "...-.-", meaning: "End of contact (silent key / sign off)" },
  { sign: "SN", morse: "...-.", meaning: "Understood (also VE)" },
  { sign: "SOS", morse: "...---...", meaning: "International distress signal" },
];

export interface CwAbbreviation {
  abbr: string;
  meaning: string;
}

export const CW_ABBREVIATIONS: CwAbbreviation[] = [
  { abbr: "73", meaning: "Best regards" },
  { abbr: "88", meaning: "Love and kisses" },
  { abbr: "AGN", meaning: "Again" },
  { abbr: "ANT", meaning: "Antenna" },
  { abbr: "BCNU", meaning: "Be seeing you" },
  { abbr: "BTU", meaning: "Back to you" },
  { abbr: "CQ", meaning: "Calling any station" },
  { abbr: "CUL", meaning: "See you later" },
  { abbr: "CPY", meaning: "Copy" },
  { abbr: "DE", meaning: "From / this is" },
  { abbr: "DX", meaning: "Distance / foreign station" },
  { abbr: "ES", meaning: "And" },
  { abbr: "FB", meaning: "Fine business (excellent)" },
  { abbr: "GA", meaning: "Good afternoon / go ahead" },
  { abbr: "GE", meaning: "Good evening" },
  { abbr: "GM", meaning: "Good morning" },
  { abbr: "GN", meaning: "Good night" },
  { abbr: "GUD", meaning: "Good" },
  { abbr: "HI", meaning: "Laughter (CW chuckle)" },
  { abbr: "HR", meaning: "Here" },
  { abbr: "HW", meaning: "How" },
  { abbr: "NR", meaning: "Number" },
  { abbr: "OM", meaning: "Old man (fellow ham)" },
  { abbr: "OP", meaning: "Operator" },
  { abbr: "PSE", meaning: "Please" },
  { abbr: "PWR", meaning: "Power" },
  { abbr: "R", meaning: "Received / roger" },
  { abbr: "RIG", meaning: "Radio equipment" },
  { abbr: "RPT", meaning: "Repeat / report" },
  { abbr: "RST", meaning: "Readability, strength, tone report" },
  { abbr: "SIG", meaning: "Signal" },
  { abbr: "TNX", meaning: "Thanks" },
  { abbr: "TU", meaning: "Thank you" },
  { abbr: "UR", meaning: "Your / you're" },
  { abbr: "WX", meaning: "Weather" },
  { abbr: "XYL", meaning: "Wife" },
  { abbr: "YL", meaning: "Young lady" },
  { abbr: "GL", meaning: "Good luck" },
  { abbr: "SRI", meaning: "Sorry" },
  { abbr: "VY", meaning: "Very" },
];
