import { PanelMiniStrip } from "propulse";

export function LeftDocked() {
  return (
    <div style={{ height: 240, width: 40 }}>
      <PanelMiniStrip side="left" onExpand={() => {}} onHide={() => {}}>
        <span className="text-su-muted text-[10px] [writing-mode:vertical-rl]">
          Band Conditions
        </span>
      </PanelMiniStrip>
    </div>
  );
}

export function RightDocked() {
  return (
    <div style={{ height: 240, width: 40 }}>
      <PanelMiniStrip side="right" onExpand={() => {}} onHide={() => {}}>
        <span className="text-su-muted text-[10px] [writing-mode:vertical-rl]">
          Path Analysis
        </span>
      </PanelMiniStrip>
    </div>
  );
}
