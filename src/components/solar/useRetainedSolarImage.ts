import { useCallback, useState } from "react";

interface ImageIdentity {
  scopeKey: string;
  url: string;
}

interface ImageRecord extends ImageIdentity {
  loadedAt: number;
}

interface FailedImageRecord extends ImageIdentity {
  attemptKey: string | number;
}

/**
 * Keep a successfully decoded solar image mounted while the next cadence URL
 * is tested in a separate, non-visible image element.
 *
 * Cadence URLs deliberately use different CDN cache keys so wall displays ask
 * for newly revalidated provider data. That also means a new key cannot use a
 * prior key's stale-if-error object. Retaining the last decoded URL here closes
 * that client-side gap: consumers promote a candidate only after `load`, and a
 * failed background probe leaves the prior image available only through the
 * supplied hard-retention window. Card/detail metadata may impose an earlier,
 * observation-based expiry; the wall-clock limit also protects consumers that
 * do not have separate timestamp metadata.
 *
 * `scopeKey` prevents a component whose product prop changes from briefly
 * presenting the previous product as though it belonged to the new one.
 */
export function useRetainedSolarImage(
  scopeKey: string,
  candidateUrl: string | null,
  attemptKey: string | number = candidateUrl ?? "none",
  retainForMs = Number.POSITIVE_INFINITY,
) {
  const [loaded, setLoaded] = useState<ImageRecord | null>(null);
  const [failed, setFailed] = useState<FailedImageRecord | null>(null);
  const loadedUrl =
    loaded?.scopeKey === scopeKey &&
    Date.now() - loaded.loadedAt <= retainForMs
      ? loaded.url
      : null;
  const candidateFailed =
    candidateUrl !== null &&
    failed?.scopeKey === scopeKey &&
    failed.url === candidateUrl &&
    failed.attemptKey === attemptKey;
  const visibleUrl = loadedUrl ?? candidateUrl;
  const probeUrl =
    loadedUrl !== null &&
    candidateUrl !== null &&
    loadedUrl !== candidateUrl &&
    !candidateFailed
      ? candidateUrl
      : null;

  const promoteCandidate = useCallback(() => {
    if (!candidateUrl) return;
    setLoaded({ loadedAt: Date.now(), scopeKey, url: candidateUrl });
    setFailed((current) =>
      current?.scopeKey === scopeKey && current.url === candidateUrl
        ? null
        : current,
    );
  }, [candidateUrl, scopeKey]);

  const rejectCandidate = useCallback(() => {
    if (!candidateUrl) return;
    setFailed({ attemptKey, scopeKey, url: candidateUrl });
  }, [attemptKey, candidateUrl, scopeKey]);

  const handleVisibleLoad = useCallback(() => {
    // The visible element can still point at the retained URL while a newer
    // candidate is probing. Only the current candidate is eligible for
    // promotion; this also prevents a late load event from reverting an image.
    if (visibleUrl === candidateUrl) promoteCandidate();
  }, [candidateUrl, promoteCandidate, visibleUrl]);

  const handleVisibleError = useCallback(() => {
    if (visibleUrl === candidateUrl) {
      rejectCandidate();
      return;
    }

    // A previously decoded image can still become unavailable if the browser
    // evicts or invalidates it. Drop that record so the candidate becomes the
    // visible recovery request on the next render.
    if (visibleUrl === loadedUrl) {
      setLoaded((current) =>
        current?.scopeKey === scopeKey && current.url === visibleUrl
          ? null
          : current,
      );
    }
  }, [candidateUrl, loadedUrl, rejectCandidate, scopeKey, visibleUrl]);

  return {
    visibleUrl,
    probeUrl,
    hasLoadedImage: loadedUrl !== null,
    candidateFailed,
    handleVisibleLoad,
    handleVisibleError,
    handleProbeLoad: promoteCandidate,
    handleProbeError: rejectCandidate,
  };
}
