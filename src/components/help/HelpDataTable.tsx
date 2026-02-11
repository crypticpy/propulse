/**
 * HelpDataTable — Renders a clean table of data source references.
 *
 * Mobile: horizontally scrollable with right-edge fade mask to hint at scroll.
 * Uses negative margin trick to let the table bleed to viewport edge.
 */

import { useIsMobile } from "@/hooks/useIsMobile";

export interface DataSource {
  name: string;
  source: string;
  endpoint?: string;
  refresh: string;
  cache?: string;
}

interface HelpDataTableProps {
  sources: DataSource[];
}

export function HelpDataTable({ sources }: HelpDataTableProps) {
  const isMobile = useIsMobile();
  const hasEndpoint = sources.some((s) => s.endpoint);
  const hasCache = sources.some((s) => s.cache);

  const table = (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-white/10 bg-white/[0.02]">
          <th className="text-left px-3 py-2 text-gray-400 font-medium text-xs uppercase tracking-wider whitespace-nowrap">
            Name
          </th>
          <th className="text-left px-3 py-2 text-gray-400 font-medium text-xs uppercase tracking-wider whitespace-nowrap">
            Source
          </th>
          {hasEndpoint && (
            <th className="text-left px-3 py-2 text-gray-400 font-medium text-xs uppercase tracking-wider whitespace-nowrap">
              Endpoint
            </th>
          )}
          <th className="text-left px-3 py-2 text-gray-400 font-medium text-xs uppercase tracking-wider whitespace-nowrap">
            Refresh
          </th>
          {hasCache && (
            <th className="text-left px-3 py-2 text-gray-400 font-medium text-xs uppercase tracking-wider whitespace-nowrap">
              Cache
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {sources.map((src, i) => (
          <tr
            key={i}
            className="border-b border-white/5 last:border-b-0 hover:bg-white/[0.02] transition-colors"
          >
            <td className="px-3 py-2 text-gray-200 font-medium whitespace-nowrap">
              {src.name}
            </td>
            <td className="px-3 py-2 text-gray-400 whitespace-nowrap">
              {src.source}
            </td>
            {hasEndpoint && (
              <td className="px-3 py-2 text-gray-500 font-mono text-xs whitespace-nowrap">
                {src.endpoint || "-"}
              </td>
            )}
            <td className="px-3 py-2 text-gray-400 whitespace-nowrap">
              {src.refresh}
            </td>
            {hasCache && (
              <td className="px-3 py-2 text-gray-400 whitespace-nowrap">
                {src.cache || "-"}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );

  // Mobile: use negative margin to give more scroll room, with fade hint
  if (isMobile) {
    return (
      <div className="my-3 rounded-lg border border-white/5 table-scroll-fade">
        <div className="overflow-x-auto -mx-4 px-4">{table}</div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto my-3 rounded-lg border border-white/5">
      {table}
    </div>
  );
}
