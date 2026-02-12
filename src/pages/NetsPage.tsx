/**
 * NetsPage -- Net Registry listing page.
 *
 * Displays a filterable, searchable grid of amateur radio nets.
 * Header with "Create Net" auth-gated button, NetFilterControls,
 * and a responsive grid of NetCard components.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useNetStore } from "@/stores/netStore";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { NetCard } from "@/components/nets/NetCard";
import { NetFilterControls } from "@/components/nets/NetFilterControls";
import { HappeningNowBanner } from "@/components/nets/HappeningNowBanner";
import { SmartNetFinder } from "@/components/nets/SmartNetFinder";
import { PropagationNetSuggestions } from "@/components/nets/PropagationNetSuggestions";
import type { NetFilters } from "@/types/net";
import { DEFAULT_NET_FILTERS } from "@/types/net";

export function NetsPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const requireAuth = useRequireAuth();

  // Store selectors
  const nets = useNetStore((s) => s.nets);
  const isLoading = useNetStore((s) => s.isLoading);
  const fetchNets = useNetStore((s) => s.fetchNets);
  const sessions = useNetStore((s) => s.sessions);

  // Local filter state
  const [filters, setFilters] = useState<NetFilters>({
    ...DEFAULT_NET_FILTERS,
  });

  // Count active filters (excluding sortBy which always has a value)
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.search) count++;
    if (filters.type) count++;
    if (filters.band) count++;
    if (filters.mode) count++;
    if (filters.dayOfWeek !== null) count++;
    if (filters.region) count++;
    if (filters.formalityLevel !== null) count++;
    if (filters.newcomerFriendly !== null) count++;
    return count;
  }, [filters]);

  // Fetch nets on mount and whenever filters change
  useEffect(() => {
    void fetchNets(filters);
  }, [fetchNets, filters]);

  // Filter change handler
  const handleFilterChange = useCallback(
    <K extends keyof NetFilters>(key: K, value: NetFilters[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  // Reset all filters
  const handleReset = useCallback(() => {
    setFilters({ ...DEFAULT_NET_FILTERS });
  }, []);

  // Check which nets have live sessions
  const liveNetIds = useMemo(() => {
    const ids = new Set<string>();
    for (const session of sessions) {
      if (session.status === "live") {
        ids.add(session.netId);
      }
    }
    return ids;
  }, [sessions]);

  // Build liveNets array for the HappeningNowBanner
  const liveNets = useMemo(() => {
    const result: Array<{ net: (typeof nets)[number]; ncsCallsign?: string }> =
      [];
    for (const session of sessions) {
      if (session.status !== "live") continue;
      const net = nets.find((n) => n.id === session.netId);
      if (!net) continue;
      result.push({ net, ncsCallsign: session.ncsCallsign || undefined });
    }
    return result;
  }, [sessions, nets]);

  // Create net handler (auth-gated)
  const handleCreateNet = () => {
    requireAuth(() => navigate("/nets/create"), "Sign in to create a new net");
  };

  return (
    <div
      className={
        isMobile
          ? "px-4 py-4 space-y-4"
          : "max-w-[1200px] mx-auto px-6 py-6 space-y-6"
      }
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Net Registry</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Discover and subscribe to amateur radio nets
          </p>
        </div>
        <button
          type="button"
          onClick={handleCreateNet}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-plasma-orange/15 text-plasma-orange border border-plasma-orange/30 hover:bg-plasma-orange/25 transition-all"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          {!isMobile && "Create Net"}
        </button>
      </div>

      {/* Happening Now banner */}
      <HappeningNowBanner liveNets={liveNets} />

      {/* Smart recommendations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <SmartNetFinder />
        <PropagationNetSuggestions />
      </div>

      {/* Filter controls */}
      <NetFilterControls
        filters={filters}
        onChange={handleFilterChange}
        onReset={handleReset}
        activeCount={activeFilterCount}
      />

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center min-h-[30vh]">
          <LoadingSpinner size="lg" text="Loading nets..." />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && nets.length === 0 && (
        <div className="flex flex-col items-center justify-center min-h-[30vh] text-center">
          <svg
            className="w-12 h-12 text-gray-600 mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.858 15.355-5.858 21.213 0"
            />
          </svg>
          <p className="text-gray-400 text-sm mb-2">No nets found</p>
          <p className="text-gray-500 text-xs mb-4">
            {activeFilterCount > 0
              ? "Try adjusting your filters or search query"
              : "Be the first to create a net for the community"}
          </p>
          {activeFilterCount > 0 && (
            <button
              onClick={handleReset}
              className="text-xs text-plasma-orange hover:text-plasma-orange/80 transition-colors"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}

      {/* Net grid */}
      {!isLoading && nets.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {nets.map((net) => (
            <NetCard key={net.id} net={net} isLive={liveNetIds.has(net.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
