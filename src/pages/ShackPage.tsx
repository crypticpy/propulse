/** The real station workspace, sharing the approved profile/station language. */
import { Link, useSearchParams } from "react-router-dom";
import { ArrowUpRight, Cable, Radio, UserRound } from "lucide-react";
import { useShackStore, useActiveChain } from "@/stores/shackStore";
import { useRankAssets } from "@/hooks/useRankAssets";
import { useOperatorRank } from "@/hooks/useOperatorRank";
import { EquipmentSection } from "@/components/shack/EquipmentSection";
import { DiagramSection } from "@/components/shack/DiagramSection";
import { PerformanceSection } from "@/components/shack/PerformanceSection";
import { HelpTooltip } from "@/components/help/HelpTooltip";
import {
  Badge,
  PageHeader,
  StationProvider,
  Tabs,
} from "@/components/station-ui";
import "@/components/shack/station-shack.css";

type ShackView = "equipment" | "diagram" | "performance";

export default function ShackPage() {
  const [params, setParams] = useSearchParams();
  const requestedView = params.get("view");
  const activeView: ShackView =
    requestedView === "equipment" || requestedView === "performance"
      ? requestedView
      : "diagram";
  const setActiveView = (view: string) =>
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set("view", view);
      return next;
    });
  const totalCount = useShackStore(
    (s) =>
      s.radios.length +
      s.antennas.length +
      s.feedlines.length +
      s.accessories.length +
      s.inlineComponents.length,
  );
  const chainCount = useShackStore((s) => s.stationChains.length);
  const chain = useActiveChain();
  const { rank } = useOperatorRank();
  const assets = useRankAssets(rank);

  return (
    <StationProvider className="station-shack" role="main">
      {assets.shackPageBg && (
        <div
          className="station-shack-backdrop"
          aria-hidden="true"
          style={{ backgroundImage: `url(${assets.shackPageBg})` }}
        />
      )}
      <div className="station-shack-page">
        <PageHeader
          eyebrow="YOUR STATION"
          title="My shack"
          description="Give every piece of gear a place. Build your signal paths and explore what your station can do."
          actions={
            <>
              <Link to="/profile" className="su-button su-button--secondary">
                <UserRound size={18} aria-hidden="true" /> My profile{" "}
                <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
              <HelpTooltip
                section="radio-shack"
                tooltip="Learn more about My Shack"
              />
            </>
          }
        />
        <div className="station-shack-summary" aria-label="Station summary">
          <div>
            <Radio size={20} aria-hidden="true" />
            <span>
              <strong>{totalCount}</strong> equipment item
              {totalCount === 1 ? "" : "s"}
            </span>
          </div>
          <div>
            <Cable size={20} aria-hidden="true" />
            <span>
              <strong>{chainCount}</strong> signal path
              {chainCount === 1 ? "" : "s"}
            </span>
          </div>
          <div className="station-shack-operating">
            <span className="su-hint">Using in ProPulse</span>
            <Badge tone={chain ? "info" : "neutral"}>
              {chain?.name ?? "No path selected"}
            </Badge>
          </div>
        </div>
        <Tabs
          label="Shack workspace"
          value={activeView}
          onChange={setActiveView}
          items={[
            {
              value: "diagram",
              label: "Workbench",
              content: activeView === "diagram" && (
                <DiagramSection
                  onNavigateToEquipment={(category) =>
                    setParams((previous) => {
                      const next = new URLSearchParams(previous);
                      next.set("view", "equipment");
                      if (category) next.set("category", category);
                      else next.delete("category");
                      return next;
                    })
                  }
                />
              ),
            },
            {
              value: "equipment",
              label: "My gear",
              content: activeView === "equipment" && (
                <EquipmentSection
                  key={params.get("category") ?? "all"}
                  initialCategory={params.get("category") ?? "all"}
                />
              ),
            },
            {
              value: "performance",
              label: "Performance & experiments",
              content: activeView === "performance" && <PerformanceSection />,
            },
          ]}
        />
      </div>
    </StationProvider>
  );
}
