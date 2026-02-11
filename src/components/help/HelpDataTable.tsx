/**
 * HelpDataTable — Renders a clean table of data source references.
 */

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
  return (
    <div className="overflow-x-auto my-3 rounded-lg border border-white/5">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10 bg-white/[0.02]">
            <th className="text-left px-3 py-2 text-gray-400 font-medium text-xs uppercase tracking-wider">
              Name
            </th>
            <th className="text-left px-3 py-2 text-gray-400 font-medium text-xs uppercase tracking-wider">
              Source
            </th>
            {sources.some((s) => s.endpoint) && (
              <th className="text-left px-3 py-2 text-gray-400 font-medium text-xs uppercase tracking-wider">
                Endpoint
              </th>
            )}
            <th className="text-left px-3 py-2 text-gray-400 font-medium text-xs uppercase tracking-wider">
              Refresh
            </th>
            {sources.some((s) => s.cache) && (
              <th className="text-left px-3 py-2 text-gray-400 font-medium text-xs uppercase tracking-wider">
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
              <td className="px-3 py-2 text-gray-200 font-medium">
                {src.name}
              </td>
              <td className="px-3 py-2 text-gray-400">{src.source}</td>
              {sources.some((s) => s.endpoint) && (
                <td className="px-3 py-2 text-gray-500 font-mono text-xs">
                  {src.endpoint || "-"}
                </td>
              )}
              <td className="px-3 py-2 text-gray-400">{src.refresh}</td>
              {sources.some((s) => s.cache) && (
                <td className="px-3 py-2 text-gray-400">{src.cache || "-"}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
