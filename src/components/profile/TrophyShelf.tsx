/**
 * TrophyShelf — CSS shelves for profile awards. Data still comes from AchievementGrid.
 */

import type { ReactNode } from "react";

export function TrophyShelf({ children }: { children: ReactNode }) {
  return (
    <div className="relative rounded-xl border border-white/10 bg-panel p-4">
      <div className="relative z-[1]">{children}</div>
    </div>
  );
}
