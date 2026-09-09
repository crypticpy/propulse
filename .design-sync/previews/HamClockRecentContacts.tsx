import { HamClockRecentContacts } from "propulse";

/**
 * Zero-prop logbook rail section for the HamClock sidebar (real call site:
 * HamClockSpotsSidebar). Reads recent contacts via React Query
 * (`readHamClockContacts`) against the sandbox's empty local logbook, so
 * this renders the component's own honest "No contacts logged" state.
 */
export function EmptyLogbook() {
  return (
    <div style={{ width: 320, background: "var(--hc-bg)" }}>
      <HamClockRecentContacts />
    </div>
  );
}
