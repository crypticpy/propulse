import { useEffect, useState } from "react";
import { useRetainedSolarImage } from "@/components/solar/useRetainedSolarImage";
import {
  SOLAR_IMAGE_PRODUCTS,
  solarImageMetadataUrl,
  solarImageUrl,
  type SolarImageProductId,
} from "@/lib/solar/mediaProducts";

interface FrameSpec {
  productId: SolarImageProductId;
  label: string;
}

const FRAMES: readonly FrameSpec[] = [
  { productId: "aia-193", label: "AIA 193 · CORONAL HOLES" },
  { productId: "hmi-magnetogram", label: "HMI · MAGNETOGRAM" },
];

/** One-shot fetch of the image's own `observedAt`, for the frame caption. */
function useImageObservedAt(metadataUrl: string): string | null {
  const [observedAt, setObservedAt] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setObservedAt(null);
    (async () => {
      try {
        const response = await fetch(metadataUrl, {
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error("metadata unavailable");
        const body = (await response.json()) as { observedAt?: unknown };
        if (!active) return;
        setObservedAt(
          typeof body.observedAt === "string" ? body.observedAt : null,
        );
      } catch {
        if (active) setObservedAt(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [metadataUrl]);

  return observedAt;
}

function frameCaption(observedAt: string | null): string {
  const parsed = observedAt ? Date.parse(observedAt) : Number.NaN;
  if (!Number.isFinite(parsed)) return "LAST FRAME —";
  const date = new Date(parsed);
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  return `LAST FRAME ${hh}:${mm}Z`;
}

function SolarImageFrame({ productId, label }: FrameSpec) {
  const product = SOLAR_IMAGE_PRODUCTS[productId];
  const imageUrl = solarImageUrl(productId);
  const metadataUrl = solarImageMetadataUrl(productId);
  const observedAt = useImageObservedAt(metadataUrl);
  // The cadence URL advances while a pinned report stays open. Keep the last
  // decoded frame on screen and test the next one off-screen, so a transient
  // proxy failure never leaves a broken frame (same flow as SolarImageCard).
  const retained = useRetainedSolarImage(
    productId,
    imageUrl,
    imageUrl,
    product.hardTtlSeconds * 1_000,
  );
  // The caption must describe the frame on screen, not a candidate that is
  // still probing, so it only follows the metadata once the candidate shows.
  const [shownObservedAt, setShownObservedAt] = useState<string | null>(null);
  useEffect(() => {
    if (retained.visibleUrl === imageUrl && observedAt !== null) {
      setShownObservedAt(observedAt);
    }
  }, [imageUrl, observedAt, retained.visibleUrl]);
  const unavailable = !retained.hasLoadedImage && retained.candidateFailed;

  return (
    <div className="hcr-imagery-frame">
      <p className="hcr-imagery-label">{label}</p>
      <div className="hcr-imagery-media">
        {unavailable ? (
          <p className="hcr-imagery-empty">FRAME UNAVAILABLE</p>
        ) : (
          <img
            src={retained.visibleUrl ?? undefined}
            alt={product.alt}
            onLoad={retained.handleVisibleLoad}
            onError={retained.handleVisibleError}
          />
        )}
        {retained.probeUrl && (
          <img
            key={retained.probeUrl}
            src={retained.probeUrl}
            alt=""
            aria-hidden="true"
            className="hcr-imagery-probe"
            onLoad={retained.handleProbeLoad}
            onError={retained.handleProbeError}
          />
        )}
      </div>
      <p className="hcr-imagery-caption">
        {frameCaption(unavailable ? null : shownObservedAt)}
      </p>
    </div>
  );
}

/**
 * NOW-tab imagery for the Solar report (wall spec section 26.5 imagery
 * follow-up): the AIA 193 Å coronal-hole frame and the HMI magnetogram side
 * by side, each with its own last-frame timestamp. Sized by height (not
 * width) so the pair sits above the SFI chart without the report ever
 * scrolling.
 */
export function SolarImageryStrip() {
  return (
    <div className="hcr-imagery-strip">
      {FRAMES.map((frame) => (
        <SolarImageFrame key={frame.productId} {...frame} />
      ))}
    </div>
  );
}
