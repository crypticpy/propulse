/**
 * Award Tracking Types
 *
 * Type definitions for the DXCC, WAS, and WAZ award tracking system.
 */

/** Status of a single award slot (entity, state, or zone) */
export type SlotStatus = "needed" | "worked_unconfirmed" | "confirmed";

/** A single DXCC entity slot in the award grid */
export interface DxccSlot {
  /** DXCC entity ID */
  entityId: number;
  /** Entity name */
  name: string;
  /** Primary callsign prefix */
  prefix: string;
  /** Continent code */
  continent: string;
  /** CQ zone number */
  cqZone: number;
  /** Current slot status */
  status: SlotStatus;
  /** Number of QSOs with this entity */
  qsoCount: number;
  /** Bands on which this entity has been worked */
  bands: string[];
  /** Modes on which this entity has been worked */
  modes: string[];
}

/** A single US state slot for WAS tracking */
export interface WasState {
  /** 2-letter state abbreviation */
  abbr: string;
  /** Full state name */
  name: string;
  /** Current slot status */
  status: SlotStatus;
  /** Number of QSOs with this state */
  qsoCount: number;
  /** Bands on which this state has been worked */
  bands: string[];
  /** Modes on which this state has been worked */
  modes: string[];
}

/** A single CQ zone slot for WAZ tracking */
export interface WazZone {
  /** CQ zone number (1-40) */
  zone: number;
  /** Current slot status */
  status: SlotStatus;
  /** Number of QSOs with this zone */
  qsoCount: number;
  /** Bands on which this zone has been worked */
  bands: string[];
  /** Modes on which this zone has been worked */
  modes: string[];
}

/** Full award progress summary for all three awards */
export interface AwardProgress {
  dxcc: {
    slots: DxccSlot[];
    totalEntities: number;
    workedCount: number;
    confirmedCount: number;
    neededCount: number;
  };
  was: {
    slots: WasState[];
    totalStates: number;
    workedCount: number;
    confirmedCount: number;
    neededCount: number;
  };
  waz: {
    slots: WazZone[];
    totalZones: number;
    workedCount: number;
    confirmedCount: number;
    neededCount: number;
  };
}

/** Filter options for the DXCC grid display */
export interface DxccFilterOptions {
  band?: string;
  mode?: string;
  continent?: string;
  status?: SlotStatus;
  searchQuery?: string;
}

/** Filter options for the WAS display */
export interface WasFilterOptions {
  band?: string;
  mode?: string;
  status?: SlotStatus;
}

/** Filter options for the WAZ display */
export interface WazFilterOptions {
  band?: string;
  mode?: string;
  status?: SlotStatus;
}
