import type { ReactNode } from "react";
import { useWidgetConfig, type RegisteredWidgetConfig } from "@/stores/hamclockWidgetConfigStore";
import { HamClockButton, HamClockDialog } from "../controls";

/** Shared wall shell for registered configuration panels and store adapters. */
export function WidgetConfigDialog({ open, onClose, title, purpose, children, widget }: {
  open: boolean;
  onClose: () => void;
  title: string;
  purpose: string;
  children?: ReactNode;
  widget?: { id: string; config: RegisteredWidgetConfig };
}) {
  return (
    <HamClockDialog open={open} onClose={onClose} size="config" title={title}
      purpose={purpose} actions={<HamClockButton onClick={onClose}>DONE</HamClockButton>}>
      {open && (widget ? <RegisteredPanel {...widget} /> : children)}
    </HamClockDialog>
  );
}


function RegisteredPanel({ id, config }: { id: string; config: RegisteredWidgetConfig }) {
  const [value, onChange] = useWidgetConfig(id, config);
  const Panel = config.ConfigPanel;
  return <Panel value={value} onChange={onChange} />;
}
