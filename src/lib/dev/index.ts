/**
 * Development utilities barrel export.
 *
 * In development mode, attaches seed/clear helpers to `window` for
 * quick console access:
 *   __seedEquipment()   — populate shack with test equipment
 *   __clearEquipment()  — wipe all shack equipment
 */

export { seedTestEquipment, clearTestEquipment } from "./seedEquipment";

// Auto-attach to window in development for console access
if (import.meta.env.DEV) {
  import("./seedEquipment").then(
    ({ seedTestEquipment, clearTestEquipment }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__seedEquipment = seedTestEquipment;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__clearEquipment = clearTestEquipment;
    },
  );
}
