/**
 * NetsPage -- Net Registry listing page.
 *
 * Displays a filterable, searchable, paginated grid of amateur radio nets.
 * Header with "Create Net" auth-gated button, NetFilterControls,
 * and a responsive grid of NetCard components with pagination.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { useNetStore } from "@/stores/netStore";
import { useIsMobile } from "@/hooks/useIsMobile";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Pagination } from "@/components/ui/Pagination";
import { NetCard } from "@/components/nets/NetCard";
import { NetFilterControls } from "@/components/nets/NetFilterControls";
import { HappeningNowBanner } from "@/components/nets/HappeningNowBanner";
import { SmartNetFinder } from "@/components/nets/SmartNetFinder";
import { PropagationNetSuggestions } from "@/components/nets/PropagationNetSuggestions";
import type { NetFilters } from "@/types/net";
import { DEFAULT_NET_FILTERS } from "@/types/net";

export function NetsPage() {
  const isMobile = useIsMobile();

  // Store selectors
  const nets = useNetStore((s) => s.nets);
  const isLoading = useNetStore((s) => s.isLoading);
  const fetchNets = useNetStore((s) => s.fetchNets);
  const sessions = useNetStore((s) => s.sessions);
  const totalCount = useNetStore((s) => s.totalCount);
  const currentPage = useNetStore((s) => s.currentPage);
  const pageSize = useNetStore((s) => s.pageSize);
  const setPage = useNetStore((s) => s.setPage);
  const setPageSize = useNetStore((s) => s.setPageSize);

  // Local filter state
  const [filters, setFilters] = useState<NetFilters>({
    ...DEFAULT_NET_FILTERS,
  });

  // Track previous filters to detect filter changes (not page changes)
  const prevFiltersRef = useRef(filters);

  // Count active filters (excluding sortBy which always has a value)
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.search) count++;
    if (filters.type) count++;
    if (filters.band) count++;
    if (filters.mode) count++;
    if (filters.dayOfWeek !== null) count++;
    if (filters.region) count++;
    if (filters.country) count++;
    if (filters.stateOrProvince) count++;
    if (filters.formalityLevel !== null) count++;
    if (filters.newcomerFriendly !== null) count++;
    return count;
  }, [filters]);

  // Reset page to 0 when filters change (not when page changes)
  useEffect(() => {
    const prev = prevFiltersRef.current;
    const filtersChanged =
      prev.search !== filters.search ||
      prev.type !== filters.type ||
      prev.band !== filters.band ||
      prev.mode !== filters.mode ||
      prev.dayOfWeek !== filters.dayOfWeek ||
      prev.region !== filters.region ||
      prev.country !== filters.country ||
      prev.stateOrProvince !== filters.stateOrProvince ||
      prev.sortBy !== filters.sortBy ||
      prev.formalityLevel !== filters.formalityLevel ||
      prev.newcomerFriendly !== filters.newcomerFriendly;

    if (filtersChanged) {
      setPage(0);
    }
    prevFiltersRef.current = filters;
  }, [filters, setPage]);

  // Fetch nets on mount and whenever filters or pagination change
  useEffect(() => {
    void fetchNets(filters);
  }, [fetchNets, filters, currentPage, pageSize]);

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

  // Page reset handler for filter controls
  const handlePageReset = useCallback(() => {
    setPage(0);
  }, [setPage]);

  // Page size change handler — also resets to first page
  const handlePageSizeChange = useCallback(
    (size: number) => {
      setPageSize(size);
    },
    [setPageSize],
  );

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

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

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
        <Link
          to="/ncs"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-gray-200 bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] transition-all"
        >
          <span>🎙️</span>
          Net Controller
        </Link>
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
        onPageReset={handlePageReset}
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

      {/* Pagination — only show when results exceed a single page */}
      {!isLoading && totalCount > pageSize && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={handlePageSizeChange}
          totalCount={totalCount}
          pageSizeOptions={[24, 48, 96]}
          entityName="nets"
        />
      )}
    </div>
  );
}
