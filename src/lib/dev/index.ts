/**
 * Development utilities barrel export.
 *
 * In development mode:
 *   - Auto-seeds equipment if shack is empty
 *   - Auto-seeds logbook if empty
 *   - Sets test profile (KB0EL) if no callsign set
 *   - Attaches seed/clear helpers to `window` for console access:
 *       __seedEquipment()   — populate shack with test equipment
 *       __clearEquipment()  — wipe all shack equipment
 *       __seedLogbook()     — populate logbook with ~600 test QSOs
 *       __clearLogbook()    — wipe all logbook entries
 */

export { seedTestEquipment, clearTestEquipment } from "./seedEquipment";
export { seedTestLogbook, clearTestLogbook } from "./seedLogbook";

// Auto-attach to window + auto-seed in development
if (import.meta.env.DEV) {
  import("./seedEquipment").then(
    async ({ seedTestEquipment, clearTestEquipment }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__seedEquipment = seedTestEquipment;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__clearEquipment = clearTestEquipment;

      // Auto-seed equipment (skips items that already exist by name/equipmentId)
      console.log("[dev] Seeding equipment...");
      const counts = seedTestEquipment();
      const total =
        counts.radios +
        counts.antennas +
        counts.feedlines +
        counts.accessories +
        counts.inlineComponents;
      if (total > 0) {
        console.log(`[dev] Added ${total} equipment items`);
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

  // Auto-seed logbook
  import("./seedLogbook").then(
    async ({ seedTestLogbook, clearTestLogbook }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__seedLogbook = seedTestLogbook;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__clearLogbook = clearTestLogbook;

      // Auto-seed logbook if empty
      const result = await seedTestLogbook();
      if (result.count > 0) {
        console.log(`[dev] Auto-seeded logbook with ${result.count} QSOs`);
      }
    },
  );
}
