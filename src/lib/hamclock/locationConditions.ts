/** Format an instant in a coordinate-resolved IANA timezone for a compact card. */
export function formatLocationTime(
  at: Date,
  timeZone: string | undefined,
): string | null {
  if (!timeZone || Number.isNaN(at.getTime())) return null;

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZoneName: "short",
    }).formatToParts(at);
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? "";
    return `${value("hour")}:${value("minute")} ${value("timeZoneName")}`.trim();
  } catch {
    return null;
  }
}
