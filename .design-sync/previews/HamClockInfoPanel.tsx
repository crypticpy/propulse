import { useState } from "react";
import { HamClockInfoPanel } from "propulse";

/**
 * Individually collapsible sidebar section (DE Station, DX Target, Band
 * Conditions, …). `collapsed`/`onToggle` are controlled by the parent
 * sidebar stack; local state stands in for that here.
 */
export function Expanded() {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div style={{ width: 320, background: "var(--hc-bg)" }}>
      <HamClockInfoPanel
        id="band-conditions"
        title="Band conditions"
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
      >
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          <div className="flex justify-between gap-1">
            <dt className="text-gray-500">SFI</dt>
            <dd className="font-mono text-gray-200">142</dd>
          </div>
          <div className="flex justify-between gap-1">
            <dt className="text-gray-500">K-index</dt>
            <dd className="font-mono text-gray-200">3</dd>
          </div>
          <div className="flex justify-between gap-1">
            <dt className="text-gray-500">20m</dt>
            <dd className="font-mono text-signal-green">Good</dd>
          </div>
          <div className="flex justify-between gap-1">
            <dt className="text-gray-500">40m</dt>
            <dd className="font-mono text-caution-amber">Fair</dd>
          </div>
        </dl>
      </HamClockInfoPanel>
    </div>
  );
}

export function Collapsed() {
  const [collapsed, setCollapsed] = useState(true);
  return (
    <div style={{ width: 320, background: "var(--hc-bg)" }}>
      <HamClockInfoPanel
        id="dx-target"
        title="DX target"
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
      >
        <p className="text-[11px] text-gray-400">VK6LC · OF87 · 14,820 km</p>
      </HamClockInfoPanel>
    </div>
  );
}
