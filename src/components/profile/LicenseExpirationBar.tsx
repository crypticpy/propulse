/**
 * LicenseExpirationBar -- Progress bar showing license expiration status.
 *
 * Colors: green >180d, amber 90-180d, red <90d, pulsing red <30d.
 * Width: min(daysRemaining / 365, 1) * 100%.
 */

interface LicenseExpirationBarProps {
  /** ISO date string for license expiration */
  expirationDate?: string | null;
}

function getDaysRemaining(expirationDate: string): number {
  // Force UTC parsing for date-only strings to avoid cross-browser timezone drift
  const normalized = expirationDate.includes("T")
    ? expirationDate
    : expirationDate + "T00:00:00Z";
  const exp = new Date(normalized);
  const now = new Date();
  // Compare UTC dates to avoid off-by-one near midnight
  const nowUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const expUTC = Date.UTC(
    exp.getUTCFullYear(),
    exp.getUTCMonth(),
    exp.getUTCDate(),
  );
  return Math.floor((expUTC - nowUTC) / (1000 * 60 * 60 * 24));
}

function getBarColor(days: number): string {
  if (days < 0) return "bg-alert-red";
  if (days < 30) return "bg-alert-red animate-pulse";
  if (days < 90) return "bg-alert-red";
  if (days <= 180) return "bg-caution-amber";
  return "bg-signal-green";
}

function getTextColor(days: number): string {
  if (days < 0) return "text-alert-red";
  if (days < 90) return "text-alert-red";
  if (days <= 180) return "text-caution-amber";
  return "text-signal-green";
}

function getStatusText(days: number): string {
  if (days < 0)
    return `Expired ${Math.abs(days)} day${Math.abs(days) !== 1 ? "s" : ""} ago`;
  if (days === 0) return "Expires today";
  return `Expires in ${days} day${days !== 1 ? "s" : ""}`;
}

export function LicenseExpirationBar({
  expirationDate,
}: LicenseExpirationBarProps) {
  if (!expirationDate) {
    return <div className="text-xs text-gray-500">No expiration set</div>;
  }

  const days = getDaysRemaining(expirationDate);
  const barColor = getBarColor(days);
  const textColor = getTextColor(days);
  const statusText = getStatusText(days);

  // Width: clamp between 0% and 100%
  const widthPercent = days <= 0 ? 0 : Math.min(days / 365, 1) * 100;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className={`text-xs font-medium ${textColor}`}>{statusText}</span>
      </div>
      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${widthPercent}%` }}
        />
      </div>
    </div>
  );
}
