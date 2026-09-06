/**
 * PerformanceSection -- Wrapper for analysis components with context header.
 *
 * Shows the active signal path, then renders PerformanceDashboard,
 * WhatIfSimulator, and PathComparison. Upgrade copy is informational only.
 */

import { useMemo } from "react";
import { Badge, Notice, Section, Surface } from "@/components/station-ui";
import { useActiveChain, useStationInventory } from "@/stores/shackStore";
import { useChainPerformance } from "@/hooks/useChainPerformance";
import { useKIndex } from "@/hooks/useSolarData";
import {
  openingTiedChallenge,
  suggestFeedlineUpgrade,
} from "@/lib/station/stationUpgrade";
import { PerformanceDashboard } from "./PerformanceDashboard";
import { WhatIfSimulator } from "./WhatIfSimulator";
import { PathComparison } from "./PathComparison";

export function PerformanceSection() {
  const chain = useActiveChain();
  const inventory = useStationInventory();
  const performance = useChainPerformance();
  const kIndexQuery = useKIndex();
  const kp = kIndexQuery.data?.[kIndexQuery.data.length - 1]?.kp_index;

  const upgrade = useMemo(
    () => suggestFeedlineUpgrade(chain, inventory, performance.bands),
    [chain, inventory, performance.bands],
  );
  const challenge = useMemo(
    () => openingTiedChallenge(upgrade, kp == null || kp < 4),
    [kp, upgrade],
  );

  return (
    <Section
      title="Performance & experiments"
      description="Understand your signal path, compare alternatives and explore equipment changes."
    >
      <div className="su-stack shack-legacy">
        <Surface>
          <div className="su-inline">
            <Badge tone="warning">Estimated performance</Badge>
            <strong>
              {chain ? `Analyzing: ${chain.name}` : "No signal path selected"}
            </strong>
          </div>
          <p className="su-hint">
            {chain
              ? "Results use your equipment details and the station model. Compare them with measurements at your station."
              : "Choose an operating signal path in the workbench to see its performance."}
          </p>
        </Surface>
        {upgrade && (
          <Notice title="Equipment comparison">{upgrade.message}</Notice>
        )}
        {challenge && <Notice title="Opening">{challenge}</Notice>}
        <PerformanceDashboard />
        <WhatIfSimulator />
        <PathComparison />
      </div>
    </Section>
  );
}
