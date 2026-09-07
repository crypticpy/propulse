import { useState } from "react";
import { useWSJTXStore } from "@/stores/wsjtxStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useRigStore } from "@/stores/rigStore";
import { useUTCClock } from "@/hooks/useUTCClock";
import { recentWSJTXDecodes, wsjtxSourceState } from "@/lib/hamclock/wsjtx";
import { HamClockTile } from "../HamClockTile";
import { WsjtxReport, WsjtxRows } from "../reports/WsjtxReport";
export function WsjtxTile() {
  const [open, setOpen] = useState(false);
  const stored = useWSJTXStore(s => s.decodes);
  const decodes = [...stored].sort((a, b) => b.receivedAt - a.receivedAt);
  const enabled = useSettingsStore(s => s.bridgeEnabled);
  const connected = useRigStore(s => s.bridgeConnected);
  const now = useUTCClock(10_000).getTime();
  const state = wsjtxSourceState(enabled, connected, decodes[0]?.receivedAt, now);
  const rows = recentWSJTXDecodes(decodes, now);
  return <>
    <HamClockTile grow title="WSJT-X" source={state} state={state === "RECEIVING" ? "var(--hc-accent)" : "var(--hc-warn)"} onOpen={() => setOpen(true)} openLabel="Open the WSJT-X report">
      <WsjtxRows rows={rows} state={state} compact />
    </HamClockTile>
    {open && <WsjtxReport open onClose={() => setOpen(false)} />}
  </>;
}
