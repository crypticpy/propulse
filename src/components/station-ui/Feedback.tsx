import {
  CheckCircle2,
  CircleHelp,
  Info,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import type { StationTone } from "./tokens";

const icons = {
  neutral: CircleHelp,
  info: Info,
  success: CheckCircle2,
  warning: TriangleAlert,
  danger: XCircle,
};
export function Badge({
  tone = "neutral",
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: StationTone }) {
  return (
    <span
      {...props}
      className={`su-badge su-tone-${tone} ${props.className ?? ""}`}
    >
      {children}
    </span>
  );
}
export function ProvenanceBadge({
  source,
}: {
  source: "measured" | "manufacturer" | "declared" | "estimated" | "unknown";
}) {
  const labels = {
    measured: "Measured",
    manufacturer: "Manufacturer",
    declared: "User entered",
    estimated: "Estimated",
    unknown: "Unknown",
  };
  return (
    <Badge
      tone={source === "estimated" || source === "unknown" ? "warning" : "info"}
    >
      {labels[source]}
    </Badge>
  );
}
export function Notice({
  title,
  children,
  tone = "info",
  live = false,
}: {
  title: string;
  children?: ReactNode;
  tone?: StationTone;
  live?: boolean;
}) {
  const Icon = icons[tone];
  return (
    <div
      className={`su-notice su-tone-${tone}`}
      role={live ? (tone === "danger" ? "alert" : "status") : undefined}
    >
      <Icon size={20} aria-hidden="true" />
      <div>
        <p className="su-notice-title">{title}</p>
        {children && <div className="su-hint">{children}</div>}
      </div>
    </div>
  );
}
export function EmptyState({
  title,
  children,
  action,
  icon,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="su-empty">
      {icon && <span aria-hidden="true">{icon}</span>}
      <h3>{title}</h3>
      {children && <p className="su-hint">{children}</p>}
      {action}
    </div>
  );
}
export function Skeleton({
  label = "Loading",
  lines = 3,
}: {
  label?: string;
  lines?: number;
}) {
  return (
    <div role="status" className="su-skeleton">
      <span className="su-sr-only">{label}</span>
      {Array.from({ length: Math.max(1, Math.min(10, lines)) }, (_, i) => (
        <span aria-hidden="true" key={i} />
      ))}
    </div>
  );
}
