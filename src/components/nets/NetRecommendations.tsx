/**
 * NetRecommendations -- "Also Popular With These Operators"
 *
 * Fetches cross-net recommendations from the edge function and
 * renders a compact list of related nets. Returns null when there
 * are no recommendations or on error (graceful degradation).
 */

import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";

// ── Types ────────────────────────────────────────────────────────────────────

interface NetRecommendationsProps {
  netId: string;
}

interface Recommendation {
  netId: string;
  name: string;
  frequency: string;
  overlapCount: number;
}

// ── Component ────────────────────────────────────────────────────────────────

export function NetRecommendations({ netId }: NetRecommendationsProps) {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchRecommendations = useCallback(async () => {
    if (!netId) return;

    setIsLoading(true);

    try {
      const res = await fetch(`/api/nets/recommendations/${netId}`);
      if (!res.ok) {
        setRecommendations([]);
        return;
      }

      const json = (await res.json()) as {
        recommendations?: Recommendation[];
      };
      setRecommendations(json.recommendations ?? []);
    } catch {
      setRecommendations([]);
    } finally {
      setIsLoading(false);
    }
  }, [netId]);

  useEffect(() => {
    void fetchRecommendations();
  }, [fetchRecommendations]);

  // ── Loading skeleton ───────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="h-2.5 w-48 animate-pulse rounded bg-white/10" />
        <div className="h-10 animate-pulse rounded-lg bg-white/5" />
        <div className="h-10 animate-pulse rounded-lg bg-white/5" />
        <div className="h-10 animate-pulse rounded-lg bg-white/5" />
      </div>
    );
  }

  // ── Empty / error — render nothing ─────────────────────────────────────────

  if (recommendations.length === 0) {
    return null;
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      <h4 className="mb-2 text-[10px] uppercase tracking-widest text-gray-500">
        Also Popular With These Operators
      </h4>

      <div className="space-y-1.5">
        {recommendations.map((rec) => (
          <Link
            key={rec.netId}
            to={`/nets/${rec.netId}`}
            className="flex items-center gap-3 rounded-lg border border-white/5 bg-void/30 px-3 py-2 transition-colors hover:bg-void/50"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-200">
                {rec.name}
              </p>
              {rec.frequency && (
                <p className="text-[11px] text-gray-500">{rec.frequency}</p>
              )}
            </div>
            <span className="shrink-0 rounded-full bg-white/10 px-1.5 text-[10px] text-gray-400">
              {rec.overlapCount} in common
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

NetRecommendations.displayName = "NetRecommendations";

export default NetRecommendations;
