import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { collectSatellites } from "./satellites.js";

const ISS_TLE = `ISS (ZARYA)
1 25544U 98067A   26241.53070935  .00006055  00000+0  11827-3 0  9994
2 25544  51.6318 297.0786 0005001  87.3553 272.8007 15.48928101583126
`;

function fakeDb(): {
  db: SupabaseClient;
  upserts: Array<Record<string, unknown>>;
  healthInserts: Array<Record<string, unknown>>;
} {
  const upserts: Array<Record<string, unknown>> = [];
  const healthInserts: Array<Record<string, unknown>> = [];
  const db = {
    from(table: string) {
      if (table === "satellite_tle") {
        return {
          upsert: async (rows: Array<Record<string, unknown>>) => {
            upserts.push(...rows);
            return { error: null };
          },
        };
      }
      if (table === "collector_health") {
        return {
          insert: async (row: Record<string, unknown>) => {
            healthInserts.push(row);
            return { error: null };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    rpc: async () => ({ error: null }),
  } as unknown as SupabaseClient;
  return { db, upserts, healthInserts };
}

function stubTleSources(options: {
  celestrakUp: boolean;
  amsatUp: boolean;
}): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("celestrak.org")) {
        if (!options.celestrakUp) throw new Error("fetch failed");
        return new Response(ISS_TLE);
      }
      if (url.includes("amsat.org")) {
        if (!options.amsatUp) throw new Error("fetch failed");
        return new Response(ISS_TLE);
      }
      throw new Error(`unexpected URL ${url}`);
    }),
  );
}

describe("collectSatellites", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports ok with rows from every group when CelesTrak responds", async () => {
    stubTleSources({ celestrakUp: true, amsatUp: true });
    const { db, upserts, healthInserts } = fakeDb();
    await collectSatellites(db);

    expect(upserts).toHaveLength(9); // one fixture sat per TLE group
    expect(healthInserts[0]?.status).toBe("ok");
    expect(upserts[0]).toMatchObject({
      norad_id: 25544,
      satellite_name: "ISS (ZARYA)",
    });
  });

  it("falls back to AMSAT for the amateur group when CelesTrak is down", async () => {
    stubTleSources({ celestrakUp: false, amsatUp: true });
    const { db, upserts, healthInserts } = fakeDb();
    await collectSatellites(db);

    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({ norad_id: 25544, tle_group: "amateur" });
    // Partial success: fresh amateur TLEs landed, other groups failed
    expect(healthInserts[0]?.status).toBe("warning");
    expect(String(healthInserts[0]?.error_message)).toContain("stations");
    expect(String(healthInserts[0]?.error_message)).not.toContain("amateur");
  });

  it("reports error without throwing when every source is down", async () => {
    stubTleSources({ celestrakUp: false, amsatUp: false });
    const { db, upserts, healthInserts } = fakeDb();
    await expect(collectSatellites(db)).resolves.toBeUndefined();

    expect(upserts).toHaveLength(0);
    expect(healthInserts[0]?.status).toBe("error");
    expect(String(healthInserts[0]?.error_message)).toContain(
      "All TLE groups failed",
    );
  });
});
