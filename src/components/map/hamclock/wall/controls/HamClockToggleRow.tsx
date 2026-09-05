import { useId, useState, type ReactNode } from "react";

export interface HamClockToggleRowProps {
  /** Row name, rendered as the row's heading text. */
  label: string;
  /** Provenance line: "NOAA SWPC · 1 min · global". */
  detail?: ReactNode;
  /** Amber caveat line, optional. */
  caveat?: ReactNode;
  /** Optional leading glyph slot. */
  icon?: ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** When present the row gets a gear button that expands `options` INLINE under the row (never a popover). */
  options?: ReactNode;
  /** Controlled expansion; if omitted the row manages it. */
  expanded?: boolean;
  onExpandedChange?: (next: boolean) => void;
  /** Extra action buttons rendered before the ON/OFF button (e.g. REFRESH). */
  actions?: ReactNode;
}

/**
 * The settings row from guide §8: icon, name, provenance, an optional
 * caveat, and one big button that spells ON or OFF. A gear expands `options`
 * inline in the same row element instead of opening a second popover — a
 * popover that closes when the pointer drifts is unusable from a couch. The
 * label text itself carries no click handler, so a stray tap on the name can
 * never flip a state the operator did not mean to touch; the toggle button is
 * the only thing that does.
 */
export function HamClockToggleRow({
  label,
  detail,
  caveat,
  icon,
  checked,
  onChange,
  disabled = false,
  options,
  expanded,
  onExpandedChange,
  actions,
}: HamClockToggleRowProps) {
  const panelId = useId();
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = expanded ?? internalExpanded;

  function setExpanded(next: boolean) {
    onExpandedChange?.(next);
    if (expanded === undefined) setInternalExpanded(next);
  }

  return (
    <div
      className="hcc-row"
      data-checked={checked ? "true" : "false"}
      data-disabled={disabled ? "true" : undefined}
    >
      <div className="hcc-row-main">
        {icon && <span className="hcc-row-icon">{icon}</span>}
        <div className="hcc-row-text">
          <span className="hcc-row-label">{label}</span>
          {detail && <span className="hcc-row-detail">{detail}</span>}
          {caveat && <span className="hcc-row-caveat">{caveat}</span>}
        </div>
        {actions && <div className="hcc-row-actions">{actions}</div>}
        {options && (
          <button
            type="button"
            className="hcc-row-gear"
            aria-label={`${label} options`}
            aria-expanded={isExpanded}
            aria-controls={panelId}
            disabled={disabled}
            onClick={() => setExpanded(!isExpanded)}
          >
            OPTIONS
          </button>
        )}
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          className="hcc-toggle"
          data-state={checked ? "on" : "off"}
          disabled={disabled}
          onClick={() => onChange(!checked)}
        >
          {checked ? "ON" : "OFF"}
        </button>
      </div>
      {options && isExpanded && (
        <div id={panelId} className="hcc-row-options">
          {options}
        </div>
      )}
    </div>
  );
}
