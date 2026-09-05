/**
 * Lazy-load facade for the sync engine.
 *
 * useSync imports this module dynamically so the SyncManager and every
 * per-store sync module stay out of the app entry bundle until a signed-in
 * user needs them. It deliberately avoids the barrel files so the emitted
 * chunk is named after this file rather than "index".
 */

export { SyncManager } from "./SyncManager";
export { registerAllModules } from "./modules";
