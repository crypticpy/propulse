import { HamClockSegmented } from "../controls";
import type { RecentContactsConfig } from "./recentContactsConfig";

/**
 * Registered as `recentContacts`'s `ConfigPanel` (guide §9 "Contract") and
 * reused directly by the Pages & Tiles OPTIONS dialog via `useWidgetConfig`.
 */
export function RecentContactsConfigPanel({
  value,
  onChange,
}: {
  value: RecentContactsConfig;
  onChange: (next: RecentContactsConfig) => void;
}) {
  return (
    <HamClockSegmented
      label="Rows shown"
      value={String(value.rowCount) as "2" | "3" | "4"}
      onChange={(next) =>
        onChange({ rowCount: Number(next) as RecentContactsConfig["rowCount"] })
      }
      options={[
        { value: "2", label: "2 ROWS" },
        { value: "3", label: "3 ROWS" },
        { value: "4", label: "4 ROWS" },
      ]}
    />
  );
}
