/**
 * Development utilities barrel export.
 *
 * In development mode:
 *   - Auto-seeds equipment if shack is empty
 *   - Sets test profile (KB0EL) if no callsign set
 *   - Attaches seed/clear helpers to `window` for console access:
 *       __seedEquipment()   — populate shack with test equipment
 *       __clearEquipment()  — wipe all shack equipment
 */

export { seedTestEquipment, clearTestEquipment } from "./seedEquipment";

// Auto-attach to window + auto-seed in development
if (import.meta.env.DEV) {
  import("./seedEquipment").then(
    async ({ seedTestEquipment, clearTestEquipment }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__seedEquipment = seedTestEquipment;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__clearEquipment = clearTestEquipment;

      // Auto-seed if shack is empty (no radios)
      const { useShackStore } = await import("@/stores/shackStore");
      const shack = useShackStore.getState();
      if (shack.radios.length === 0) {
        console.log("[dev] Auto-seeding equipment for KB0EL...");
        seedTestEquipment();
      }

      // Set test profile if no callsign
      const { useProfileStore } = await import("@/stores/profileStore");
      const profile = useProfileStore.getState();
      if (!profile.station?.callsign) {
        console.log("[dev] Setting test profile: KB0EL");
        profile.setStation({
          callsign: "KB0EL",
          operatorName: "Clark B Ashworth",
          homeLocationId: "home",
          activeLocationId: null,
          grid: "DM79",
          lat: 39.74,
          lon: -104.99,
          savedLocations: [
            {
              id: "home",
              name: "Home QTH",
              grid: "DM79",
              lat: 39.74,
              lon: -104.99,
              type: "home",
              createdAt: new Date().toISOString(),
            },
          ],
        });
      }
    },
  );
}
