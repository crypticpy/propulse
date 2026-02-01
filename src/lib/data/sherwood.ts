import type { SherwoodReceiverEntry } from "@/types/sherwood";
import { SHERWOOD_RECEIVERS } from "./sherwood.generated";

export { SHERWOOD_RECEIVERS };

export function searchSherwoodReceivers(query: string): SherwoodReceiverEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return SHERWOOD_RECEIVERS;
  return SHERWOOD_RECEIVERS.filter(
    (r) =>
      r.manufacturer.toLowerCase().includes(q) ||
      r.model.toLowerCase().includes(q),
  );
}

