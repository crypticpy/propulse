import { useEffect, useRef, useState } from "react";

export interface SolarImageMetadata {
  observedAt: string | null;
  checkedAt: string;
}

export type SolarImageMetadataState = "loading" | "ready" | "error";

interface MetadataRecord {
  metadata: SolarImageMetadata | null;
  state: SolarImageMetadataState;
}

const MAX_METADATA_RECORDS = 8;

function validateMetadata(value: unknown): SolarImageMetadata {
  if (!value || typeof value !== "object") {
    throw new Error("metadata contract mismatch");
  }

  const candidate = value as Partial<SolarImageMetadata>;
  if (
    !Number.isFinite(Date.parse(candidate.checkedAt ?? "")) ||
    (candidate.observedAt !== null &&
      !Number.isFinite(Date.parse(candidate.observedAt ?? "")))
  ) {
    throw new Error("metadata contract mismatch");
  }

  return candidate as SolarImageMetadata;
}

/**
 * Associate each metadata response with the image URL from the same cache
 * window. A cadence refresh fetches metadata and decodes its image in parallel,
 * so either request can finish first. Consumers must continue describing the
 * retained visible image until its replacement has decoded successfully; a
 * candidate metadata response must never make an older frame look newer.
 */
export function useSolarImageMetadata(
  candidateImageUrl: string,
  visibleImageUrl: string | null,
  metadataUrl: string,
  refreshIdentity: number,
) {
  const [records, setRecords] = useState(
    () => new Map<string, MetadataRecord>(),
  );
  const visibleImageUrlRef = useRef(visibleImageUrl);
  visibleImageUrlRef.current = visibleImageUrl;

  useEffect(() => {
    const controller = new AbortController();

    const updateRecord = (record: MetadataRecord) => {
      setRecords((current) => {
        const next = new Map(current);
        next.set(candidateImageUrl, record);

        // Failed cadence candidates can accumulate while the last decoded
        // image remains usable. Bound that history without evicting either the
        // current candidate or the metadata for the frame still on screen.
        while (next.size > MAX_METADATA_RECORDS) {
          const removable = [...next.keys()].find(
            (url) =>
              url !== candidateImageUrl &&
              url !== visibleImageUrlRef.current,
          );
          if (!removable) break;
          next.delete(removable);
        }
        return next;
      });
    };

    updateRecord({ metadata: null, state: "loading" });
    fetch(metadataUrl, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("metadata unavailable");
        return validateMetadata(await response.json());
      })
      .then((metadata) => {
        updateRecord({ metadata, state: "ready" });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          updateRecord({ metadata: null, state: "error" });
        }
      });

    return () => controller.abort();
  }, [candidateImageUrl, metadataUrl, refreshIdentity]);

  const visibleRecord = visibleImageUrl
    ? records.get(visibleImageUrl)
    : undefined;
  return {
    metadata: visibleRecord?.metadata ?? null,
    metadataState: visibleRecord?.state ?? "loading",
  };
}
