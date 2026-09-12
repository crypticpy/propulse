/**
 * Shared setup-page toolkit (#1097) — the building blocks BridgeInfoPage
 * and SetupGuidePage both need, so install instructions and the remembered
 * platform choice cannot drift between the two pages that show them.
 */

export {
  type Platform,
  PLATFORM_STORAGE_KEY,
  detectPlatform,
  platformLabel,
  getInitialPlatform,
  persistPlatform,
} from "./platform";

export { CommandBlock } from "./CommandBlock";
export { Step } from "./Step";
export { ConnectionDot, type ConnectionDotSize } from "./ConnectionDot";
export { FAQItem } from "./FAQItem";
export { ArchitectureDiagram } from "./ArchitectureDiagram";
