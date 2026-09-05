import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CircleDot,
  Pencil,
  Layers,
  TriangleAlert,
} from "lucide-react";
import type { SVGProps } from "react";
import { Button, IconButton } from "./Actions";
import { Badge } from "./Feedback";

export type EquipmentKind = "radio" | "tuner" | "antenna" | "cable" | "switch";
/** Generic equipment is first-class; no catalog artwork or hardware state required. */
export function EquipmentGlyph({
  kind,
  ...props
}: SVGProps<SVGSVGElement> & { kind: EquipmentKind }) {
  return (
    <svg
      viewBox="0 0 160 90"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {kind === "antenna" ? (
        <>
          <path d="M12 18 80 38 148 18M80 38v43M72 81h16" />
          <circle cx="80" cy="38" r="4" />
        </>
      ) : kind === "cable" ? (
        <>
          <ellipse cx="80" cy="42" rx="52" ry="25" />
          <ellipse cx="80" cy="42" rx="45" ry="18" />
          <path d="M41 58 25 76h-12m97-17 18 16h17M14 72v8m130-10v10" />
        </>
      ) : (
        <>
          <path d="m19 18 12-9h98l12 9v56H19zM19 23h122M27 74v7h13v-7m80 0v7h13v-7" />
          {kind === "radio" ? (
            <>
              <rect x="29" y="32" width="59" height="25" rx="2" />
              <circle cx="116" cy="47" r="13" />
              <path d="M30 65h9m8 0h9m8 0h9m24 0h7" />
            </>
          ) : (
            <>
              <circle cx="66" cy="48" r="15" />
              <circle cx="105" cy="53" r="4" />
              <circle cx="122" cy="53" r="4" />
              <path d="M33 32h6m9 0h6m12 3v8" />
            </>
          )}
        </>
      )}
    </svg>
  );
}
export function EquipmentTile({
  name,
  kind,
  detail,
  selected = false,
  onSelect,
}: {
  name: string;
  kind: EquipmentKind;
  detail?: string;
  selected?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className="su-equipment-tile"
      aria-pressed={selected}
      onClick={onSelect}
    >
      <EquipmentGlyph kind={kind} />
      <span>
        <strong>{name}</strong>
        {detail && <span className="su-hint">{detail}</span>}
      </span>
    </button>
  );
}
export function PortButton({
  name,
  detail,
  selected = false,
  onClick,
}: {
  name: string;
  detail?: string;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <Button className="su-port" aria-pressed={selected} onClick={onClick}>
      <CircleDot size={18} aria-hidden="true" />
      <span>
        {name}
        {detail && <small>{detail}</small>}
      </span>
    </Button>
  );
}
export function ConnectionPreview({
  endpoints,
  label = "Connection preview",
}: {
  endpoints: readonly string[];
  label?: string;
}) {
  return (
    <div className="su-connection-preview">
      <p className="su-hint">{label}</p>
      <ol>
        {endpoints.map((endpoint, index) => (
          <li key={`${index}-${endpoint}`}>
            {index > 0 && <ArrowRight aria-hidden="true" size={18} />}
            <span>{endpoint}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
export function SetupStatus({
  editing,
  using,
  dirty,
}: {
  editing: string;
  using: string;
  dirty: boolean;
}) {
  return (
    <div className="su-setup-status">
      <span>
        <Pencil size={17} aria-hidden="true" />
        Editing: <strong>{editing}</strong>
      </span>
      <span>
        <Layers size={17} aria-hidden="true" />
        Using in ProPulse: <strong>{using}</strong>
      </span>
      {dirty && (
        <Badge tone="warning">
          <TriangleAlert size={16} aria-hidden="true" />
          Changes not yet in use
        </Badge>
      )}
    </div>
  );
}
export function ReorderControls({
  label,
  onMoveUp,
  onMoveDown,
  first,
  last,
}: {
  label: string;
  onMoveUp: () => void;
  onMoveDown: () => void;
  first: boolean;
  last: boolean;
}) {
  return (
    <div className="su-reorder">
      <IconButton
        label={`Move ${label} up`}
        disabled={first}
        onClick={onMoveUp}
      >
        <ArrowUp aria-hidden="true" size={17} />
      </IconButton>
      <IconButton
        label={`Move ${label} down`}
        disabled={last}
        onClick={onMoveDown}
      >
        <ArrowDown aria-hidden="true" size={17} />
      </IconButton>
    </div>
  );
}
