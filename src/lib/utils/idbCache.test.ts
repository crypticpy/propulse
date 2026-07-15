import { beforeEach, describe, expect, it, vi } from "vitest";
import { SOLAR_SCHEMA_VERSION, type SolarEnvelope } from "@/lib/solar/contracts";
import {
  getSolarCachedEnvelope,
  invalidateSolarCache,
  resetApiCacheConnection,
  setSolarCachedEnvelope,
} from "./idbCache";

const SOURCE = "noaa-k-index" as const;

function envelope(): SolarEnvelope<Array<{ kp: number }>> {
  const now = new Date().toISOString();
  return {
    schemaVersion: SOLAR_SCHEMA_VERSION,
    sourceId: SOURCE,
    provider: "NOAA SWPC",
    product: "Planetary Kp",
    data: [{ kp: 2 }],
    observedAt: now,
    fetchedAt: now,
    sourceUrl: "https://services.swpc.noaa.gov/",
  };
}

async function writeRaw(value: unknown): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("propulse-api-cache", 2);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction("responses", "readwrite");
      transaction.objectStore("responses").put(value);
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    };
    request.onerror = () => reject(request.error);
  });
}

describe("bounded IndexedDB solar cache", () => {
  beforeEach(async () => {
    await resetApiCacheConnection();
    await invalidateSolarCache(SOURCE);
  });

  it("discards a corrupted cache entry safely", async () => {
    await resetApiCacheConnection();
    await writeRaw({
      kind: "solar",
      key: `solar:${SOURCE}`,
      envelope: { schemaVersion: 0 },
      storedAt: "not-a-number",
    });
    await resetApiCacheConnection();

    expect(await getSolarCachedEnvelope(SOURCE)).toBeNull();
    expect(await getSolarCachedEnvelope(SOURCE)).toBeNull();
  });

  it("continues when IndexedDB is unavailable", async () => {
    await resetApiCacheConnection();
    vi.stubGlobal("indexedDB", undefined);

    await expect(setSolarCachedEnvelope(envelope())).resolves.toBeUndefined();
    await expect(getSolarCachedEnvelope(SOURCE)).resolves.toBeNull();
  });

  it("continues when a write is rejected by quota pressure", async () => {
    await resetApiCacheConnection();
    const put = vi
      .spyOn(IDBObjectStore.prototype, "put")
      .mockImplementation(() => {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      });

    await expect(setSolarCachedEnvelope(envelope())).resolves.toBeUndefined();
    expect(put).toHaveBeenCalled();
  });
});
