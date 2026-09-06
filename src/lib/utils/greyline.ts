/**
 * Greyline Utility Functions
 *
 * Calculates greyline intensity levels and timing for enhanced propagation
 * during twilight periods. The greyline is particularly important for
 * low-band (160m/80m/40m) DX operations.
 *
 * Intensity Levels:
 * - Normal: Standard greyline (>30 min from sunrise/sunset)
 * - Enhanced: 15-30 minutes before/after sunrise/sunset
 * - Peak: Within 15 minutes of sunrise/sunset
 */

import SunCalc from "suncalc";

/**
 * Greyline intensity levels
 */
export type GreylineIntensity = "normal" | "enhanced" | "peak" | "none";

/**
 * Greyline status information
 */
export interface GreylineStatus {
  /** Current intensity level */
  intensity: GreylineIntensity;
  /** Whether greyline conditions are active (enhanced or peak) */
  isActive: boolean;
  /** Minutes until next greyline event (sunrise or sunset) */
  minutesToNextEvent: number | null;
  /** Type of next event */
  nextEventType: "sunrise" | "sunset" | null;
  /** Time of next event */
  nextEventTime: Date | null;
  /** Minutes since last event (for post-event timing) */
  minutesSinceLastEvent: number | null;
  /** Type of last event */
  lastEventType: "sunrise" | "sunset" | null;
}

/**
 * Thresholds for greyline intensity (in minutes)
 */
const PEAK_THRESHOLD_MINUTES = 15;
const ENHANCED_THRESHOLD_MINUTES = 30;

/**
 * Low bands that benefit from greyline propagation
 */
export const GREYLINE_LOW_BANDS = ["160m", "80m", "40m"] as const;

/**
 * Calculate greyline intensity based on time proximity to sunrise/sunset
 *
 * @param lat - Latitude in decimal degrees
 * @param lon - Longitude in decimal degrees
 * @param date - Date/time to calculate for
 * @returns Greyline intensity level
 */
export function getGreylineIntensity(
  lat: number,
  lon: number,
  date: Date,
): GreylineIntensity {
  const status = getGreylineStatus(lat, lon, date);
  return status.intensity;
}

/**
 * Get comprehensive greyline status for a location
 *
 * @param lat - Latitude in decimal degrees
 * @param lon - Longitude in decimal degrees
 * @param date - Date/time to calculate for
 * @returns Complete greyline status information
 */
export function getGreylineStatus(
  lat: number,
  lon: number,
  date: Date,
): GreylineStatus {
  // Get sun times for today and tomorrow
  const todayTimes = SunCalc.getTimes(date, lat, lon);
  const tomorrow = new Date(date);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowTimes = SunCalc.getTimes(tomorrow, lat, lon);

  // Also check yesterday for recent events
  const yesterday = new Date(date);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayTimes = SunCalc.getTimes(yesterday, lat, lon);

  // Collect all relevant events with their times
  interface SunEvent {
    type: "sunrise" | "sunset";
    time: Date;
  }

  const events: SunEvent[] = [];

  // Add valid events (check for NaN which indicates no sunrise/sunset at extreme latitudes)
  if (yesterdayTimes.sunset && !isNaN(yesterdayTimes.sunset.getTime())) {
    events.push({ type: "sunset", time: yesterdayTimes.sunset });
  }
  if (todayTimes.sunrise && !isNaN(todayTimes.sunrise.getTime())) {
    events.push({ type: "sunrise", time: todayTimes.sunrise });
  }
  if (todayTimes.sunset && !isNaN(todayTimes.sunset.getTime())) {
    events.push({ type: "sunset", time: todayTimes.sunset });
  }
  if (tomorrowTimes.sunrise && !isNaN(tomorrowTimes.sunrise.getTime())) {
    events.push({ type: "sunrise", time: tomorrowTimes.sunrise });
  }
  if (tomorrowTimes.sunset && !isNaN(tomorrowTimes.sunset.getTime())) {
    events.push({ type: "sunset", time: tomorrowTimes.sunset });
  }

  // Sort events by time
  events.sort((a, b) => a.time.getTime() - b.time.getTime());

  // Find the closest past and future events
  let lastEvent: SunEvent | null = null;
  let nextEvent: SunEvent | null = null;
  const now = date.getTime();

  for (const event of events) {
    if (event.time.getTime() <= now) {
      lastEvent = event;
    } else if (!nextEvent) {
      nextEvent = event;
    }
  }

  // Calculate time differences
  const minutesToNext = nextEvent
    ? (nextEvent.time.getTime() - now) / 60000
    : null;
  const minutesSinceLast = lastEvent
    ? (now - lastEvent.time.getTime()) / 60000
    : null;

  // Determine intensity based on proximity to events
  let intensity: GreylineIntensity = "none";

  // Check if we're approaching the next event
  if (minutesToNext !== null && minutesToNext <= ENHANCED_THRESHOLD_MINUTES) {
    if (minutesToNext <= PEAK_THRESHOLD_MINUTES) {
      intensity = "peak";
    } else {
      intensity = "enhanced";
    }
  }
  // Check if we're just past the last event
  else if (
    minutesSinceLast !== null &&
    minutesSinceLast <= ENHANCED_THRESHOLD_MINUTES
  ) {
    if (minutesSinceLast <= PEAK_THRESHOLD_MINUTES) {
      intensity = "peak";
    } else {
      intensity = "enhanced";
    }
  }
  // Normal greyline during twilight (civil twilight period)
  else {
    const sunPos = SunCalc.getPosition(date, lat, lon);
    const altitudeDegrees = sunPos.altitude * (180 / Math.PI);
    // Civil twilight is when sun is between 0 and -6 degrees
    if (altitudeDegrees <= 0 && altitudeDegrees >= -6) {
      intensity = "normal";
    }
  }

  return {
    intensity,
    isActive: intensity === "enhanced" || intensity === "peak",
    minutesToNextEvent:
      minutesToNext !== null ? Math.round(minutesToNext) : null,
    nextEventType: nextEvent?.type ?? null,
    nextEventTime: nextEvent?.time ?? null,
    minutesSinceLastEvent:
      minutesSinceLast !== null ? Math.round(minutesSinceLast) : null,
    lastEventType: lastEvent?.type ?? null,
  };
}

/**
 * Check if greyline is beneficial for a specific band
 *
 * @param band - Band name (e.g., "40m", "20m")
 * @param intensity - Current greyline intensity
 * @returns Whether greyline conditions are beneficial for this band
 */
export function isGreylineActiveForBand(
  band: string,
  intensity: GreylineIntensity,
): boolean {
  // Greyline primarily benefits low bands
  const isLowBand = GREYLINE_LOW_BANDS.some(
    (lb) => band.toLowerCase() === lb.toLowerCase(),
  );

  // Only show as active during enhanced or peak periods
  const isActiveIntensity = intensity === "enhanced" || intensity === "peak";

  return isLowBand && isActiveIntensity;
}

/**
 * Get visual parameters for greyline rendering based on intensity
 *
 * @param intensity - Current greyline intensity
 * @returns Visual parameters for rendering
 */
export function getGreylineVisualParams(intensity: GreylineIntensity): {
  /** Width in degrees from terminator */
  widthDegrees: number;
  /** Base opacity (0-1) */
  opacity: number;
  /** Color in hex format */
  color: string;
  /** Whether to enable pulsing animation */
  pulsing: boolean;
  /** Pulse speed multiplier */
  pulseSpeed: number;
} {
  switch (intensity) {
    case "peak":
      return {
        widthDegrees: 20,
        opacity: 0.55,
        color: "#ffcc00",
        pulsing: true,
        pulseSpeed: 1.5,
      };
    case "enhanced":
      return {
        widthDegrees: 18,
        opacity: 0.45,
        color: "#ffbb00",
        pulsing: false,
        pulseSpeed: 1,
      };
    case "normal":
      return {
        widthDegrees: 15,
        opacity: 0.35,
        color: "#ffaa00",
        pulsing: false,
        pulseSpeed: 1,
      };
    case "none":
    default:
      return {
        widthDegrees: 15,
        opacity: 0.25,
        color: "#ff9900",
        pulsing: false,
        pulseSpeed: 1,
      };
  }
}

/**
 * Opacity multiplier for the animated terminator glow (TerminatorEnhancement3D).
 *
 * Returns 0 outside greyline hours so the glow disappears entirely rather than
 * painting a permanent second band over the main greyline ribbon -- the glow is
 * an "it's happening now" cue, not a static decoration.
 *
 * @param intensity - Greyline intensity level for the operator's location
 * @returns Multiplier in 0-1; 0 means render nothing
 */
export function getGreylineGlowIntensity(intensity: GreylineIntensity): number {
  switch (intensity) {
    case "peak":
      return 1;
    case "enhanced":
      return 0.7;
    case "normal":
      return 0.45;
    case "none":
    default:
      return 0;
  }
}

/**
 * Format time to next greyline event for display
 *
 * @param minutes - Minutes to event (can be negative for past events)
 * @param eventType - Type of event
 * @returns Formatted string for display
 */
export function formatGreylineEventTime(
  minutes: number | null,
  eventType: "sunrise" | "sunset" | null,
): string {
  if (minutes === null || eventType === null) {
    return "No event";
  }

  const absMinutes = Math.abs(minutes);
  const eventName = eventType === "sunrise" ? "SR" : "SS";

  if (absMinutes < 1) {
    return `${eventName} now`;
  } else if (absMinutes < 60) {
    return `${Math.round(absMinutes)}m to ${eventName}`;
  } else {
    const hours = Math.floor(absMinutes / 60);
    const mins = Math.round(absMinutes % 60);
    if (mins === 0) {
      return `${hours}h to ${eventName}`;
    }
    return `${hours}h ${mins}m to ${eventName}`;
  }
}

/**
 * Get intensity label for display
 *
 * @param intensity - Greyline intensity level
 * @returns Human-readable label
 */
export function getGreylineIntensityLabel(
  intensity: GreylineIntensity,
): string {
  switch (intensity) {
    case "peak":
      return "Peak";
    case "enhanced":
      return "Enhanced";
    case "normal":
      return "Normal";
    case "none":
      return "Inactive";
  }
}

/**
 * Get color for intensity level
 *
 * @param intensity - Greyline intensity level
 * @returns Color in hex format
 */
export function getGreylineIntensityColor(
  intensity: GreylineIntensity,
): string {
  switch (intensity) {
    case "peak":
      return "#ffcc00";
    case "enhanced":
      return "#ffaa00";
    case "normal":
      return "#ff8800";
    case "none":
      return "#666666";
  }
}

/** One hourly sample of the grey-line intensity curve, 0-23 UTC. */
export interface GreylineHourSample {
  hour: number;
  at: Date;
  level: GreylineIntensity;
  /** 0-1, taken from `getGreylineVisualParams(level).opacity` so the report
   * chart and the map's static band never disagree on how strong an hour is. */
  intensity: number;
}

function utcMidnight(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

/**
 * Sample the grey-line intensity once per UTC hour across the day containing
 * `date`, for the "GREY-LINE INTENSITY — 24 H" report chart (wall spec
 * section 26.9). Reuses `getGreylineIntensity` and `getGreylineVisualParams`
 * hourly rather than adding a second physics model.
 */
export function getGreylineIntensityCurve(
  lat: number,
  lon: number,
  date: Date,
): GreylineHourSample[] {
  const dayStart = utcMidnight(date);
  return Array.from({ length: 24 }, (_, hour) => {
    const at = new Date(dayStart.getTime() + hour * 60 * 60 * 1000);
    const level = getGreylineIntensity(lat, lon, at);
    return {
      hour,
      at,
      level,
      intensity: getGreylineVisualParams(level).opacity,
    };
  });
}

/** Minutes either side of a horizon crossing that the low bands lift, same
 * window `MoonReport.tsx` draws for a single station. */
export const GREYLINE_WINDOW_MINUTES = 30;

interface GreylineCrossingWindow {
  start: Date;
  end: Date;
}

/** Every sunrise/sunset window (crossing time ± `windowMinutes`) across
 * yesterday, today and tomorrow, so a window that starts just before or
 * after local midnight is never missed. */
function greylineWindowsNear(
  lat: number,
  lon: number,
  date: Date,
  windowMinutes: number,
): GreylineCrossingWindow[] {
  const windows: GreylineCrossingWindow[] = [];
  for (const offsetDays of [-1, 0, 1]) {
    const day = new Date(date);
    day.setUTCDate(day.getUTCDate() + offsetDays);
    const times = SunCalc.getTimes(day, lat, lon);
    for (const event of [times.sunrise, times.sunset]) {
      if (event && !isNaN(event.getTime())) {
        windows.push({
          start: new Date(event.getTime() - windowMinutes * 60_000),
          end: new Date(event.getTime() + windowMinutes * 60_000),
        });
      }
    }
  }
  return windows;
}

/** A period when the QTH's and the target's grey-line windows overlap. */
export interface MutualGreylineWindow {
  start: Date;
  end: Date;
  /** Whether `date` falls inside this window. */
  active: boolean;
}

/**
 * The nearest mutual grey-line window between two stations: a period when
 * both the QTH's and the target's own ±`windowMinutes` grey-line windows
 * overlap in UTC. Low-band DX along the path is best worked in this window,
 * since both ends sit on their own terminator at once. Returns the window
 * that is active right now, or otherwise the next one to start; null when
 * the two stations' terminator crossings never coincide within a day either
 * side of `date` (e.g. one station is in polar day or polar night).
 */
export function getMutualGreylineWindow(
  qthLat: number,
  qthLon: number,
  targetLat: number,
  targetLon: number,
  date: Date,
  windowMinutes: number = GREYLINE_WINDOW_MINUTES,
): MutualGreylineWindow | null {
  const qthWindows = greylineWindowsNear(qthLat, qthLon, date, windowMinutes);
  const targetWindows = greylineWindowsNear(
    targetLat,
    targetLon,
    date,
    windowMinutes,
  );
  const now = date.getTime();

  const overlaps: MutualGreylineWindow[] = [];
  for (const a of qthWindows) {
    for (const b of targetWindows) {
      const start = Math.max(a.start.getTime(), b.start.getTime());
      const end = Math.min(a.end.getTime(), b.end.getTime());
      if (start < end) {
        overlaps.push({
          start: new Date(start),
          end: new Date(end),
          active: now >= start && now < end,
        });
      }
    }
  }
  if (overlaps.length === 0) return null;

  const active = overlaps.find((overlap) => overlap.active);
  if (active) return active;

  const upcoming = overlaps
    .filter((overlap) => overlap.start.getTime() >= now)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  return upcoming[0] ?? null;
}
