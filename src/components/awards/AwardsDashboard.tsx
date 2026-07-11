/**
 * Awards Dashboard Component
 *
 * Container component displaying all award progress in a grid layout.
 * Shows DXCC, WAS, and WAZ award progress with summary stats.
 */

import { useAwards } from "../../hooks/useAwards";
import { DXCCProgress } from "./DXCCProgress";
import { WASProgress } from "./WASProgress";
import { WAZProgress } from "./WAZProgress";

export interface AwardsDashboardProps {
  /** Optional className for styling */
  className?: string;
}

/**
 * Awards Dashboard Component
 * Displays all award progress in a responsive grid
 */
export function AwardsDashboard({ className = "" }: AwardsDashboardProps) {
  const { progress, isLoading } = useAwards();

  // Calculate overall progress
  const totalWorked =
    progress.dxcc.worked + progress.was.worked + progress.waz.worked;
  const totalConfirmed =
    progress.dxcc.confirmed + progress.was.confirmed + progress.waz.confirmed;
  const totalPossible =
    progress.dxcc.total + progress.was.total + progress.waz.total;

  const overallPercent =
    totalPossible > 0 ? (totalWorked / totalPossible) * 100 : 0;

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Summary Header */}
      <div className="bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white mb-1">
              Awards Progress
            </h2>
            <p className="text-gray-400 text-sm">
              Track your progress toward amateur radio awards
            </p>
          </div>

          {/* Quick Stats */}
          <div className="flex gap-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-signal-green">
                {totalWorked}
              </div>
              <div className="text-xs text-gray-500">Total Worked</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-cosmic-cyan">
                {totalConfirmed}
              </div>
              <div className="text-xs text-gray-500">Confirmed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-plasma-orange">
                {overallPercent.toFixed(0)}%
              </div>
              <div className="text-xs text-gray-500">Overall</div>
            </div>
          </div>
        </div>

        {/* Quick Progress Bars */}
        <div className="mt-6 grid grid-cols-3 gap-4">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-400">DXCC</span>
              <span className="text-gray-300">
                {progress.dxcc.worked}/{progress.dxcc.total}
              </span>
            </div>
            <div className="h-1.5 bg-nebula-blue rounded-full overflow-hidden">
              <div
                className="h-full bg-aurora-purple rounded-full transition-all duration-500"
                style={{
                  width: `${(progress.dxcc.worked / progress.dxcc.total) * 100}%`,
                }}
              />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-400">WAS</span>
              <span className="text-gray-300">
                {progress.was.worked}/{progress.was.total}
              </span>
            </div>
            <div className="h-1.5 bg-nebula-blue rounded-full overflow-hidden">
              <div
                className="h-full bg-cosmic-cyan rounded-full transition-all duration-500"
                style={{
                  width: `${(progress.was.worked / progress.was.total) * 100}%`,
                }}
              />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-400">WAZ</span>
              <span className="text-gray-300">
                {progress.waz.worked}/{progress.waz.total}
              </span>
            </div>
            <div className="h-1.5 bg-nebula-blue rounded-full overflow-hidden">
              <div
                className="h-full bg-plasma-orange rounded-full transition-all duration-500"
                style={{
                  width: `${(progress.waz.worked / progress.waz.total) * 100}%`,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Award Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <DXCCProgress progress={progress.dxcc} isLoading={isLoading} />
        <WASProgress progress={progress.was} isLoading={isLoading} />
        <WAZProgress progress={progress.waz} isLoading={isLoading} />
      </div>

      {/* Achievement Badges (future feature placeholder) */}
      {(progress.dxcc.worked >= 100 ||
        progress.was.worked >= 50 ||
        progress.waz.worked >= 40) && (
        <div className="bg-gradient-to-r from-plasma-orange/10 to-aurora-purple/10 border border-plasma-orange/20 rounded-2xl p-6">
          <h3 className="text-lg font-bold text-white mb-4">Achievements</h3>
          <div className="flex flex-wrap gap-3">
            {progress.dxcc.worked >= 100 && (
              <div className="flex items-center gap-2 bg-white/5 rounded-lg px-4 py-2 border border-white/10">
                <span className="text-2xl">🏆</span>
                <div>
                  <div className="text-sm font-medium text-white">DXCC 100</div>
                  <div className="text-xs text-gray-400">
                    Worked 100 entities
                  </div>
                </div>
              </div>
            )}
            {progress.dxcc.worked >= 200 && (
              <div className="flex items-center gap-2 bg-white/5 rounded-lg px-4 py-2 border border-white/10">
                <span className="text-2xl">🥇</span>
                <div>
                  <div className="text-sm font-medium text-white">DXCC 200</div>
                  <div className="text-xs text-gray-400">
                    Worked 200 entities
                  </div>
                </div>
              </div>
            )}
            {progress.dxcc.worked >= 300 && (
              <div className="flex items-center gap-2 bg-white/5 rounded-lg px-4 py-2 border border-white/10">
                <span className="text-2xl">👑</span>
                <div>
                  <div className="text-sm font-medium text-white">
                    DXCC Honor Roll
                  </div>
                  <div className="text-xs text-gray-400">
                    Worked 300+ entities
                  </div>
                </div>
              </div>
            )}
            {progress.was.worked >= 50 && (
              <div className="flex items-center gap-2 bg-white/5 rounded-lg px-4 py-2 border border-white/10">
                <span className="text-2xl">🇺🇸</span>
                <div>
                  <div className="text-sm font-medium text-white">
                    WAS Complete
                  </div>
                  <div className="text-xs text-gray-400">
                    All 50 states worked
                  </div>
                </div>
              </div>
            )}
            {progress.waz.worked >= 40 && (
              <div className="flex items-center gap-2 bg-white/5 rounded-lg px-4 py-2 border border-white/10">
                <span className="text-2xl">🌍</span>
                <div>
                  <div className="text-sm font-medium text-white">
                    WAZ Complete
                  </div>
                  <div className="text-xs text-gray-400">
                    All 40 zones worked
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default AwardsDashboard;
