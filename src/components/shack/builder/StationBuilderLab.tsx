/** The working station editor, using existing inventory and signal-path stores. */
import { useCallback, useState } from "react";
import { ArrowRight, Cable, Layers, Plus, Radio } from "lucide-react";
import {
  Badge,
  Button,
  EquipmentTile,
  Inline,
  Notice,
  Section,
  StationProvider,
  Surface,
} from "@/components/station-ui";
import {
  useActiveChain,
  useShackStore,
  useStationChains,
  useUserAccessories,
  useUserAntennas,
  useUserFeedlines,
  useUserRadios,
} from "@/stores/shackStore";
import { AllChainsView } from "./AllChainsView";
import "./station-workbench.css";

interface StationBuilderLabProps {
  onNavigateToEquipment?: (category?: string) => void;
  embedded?: boolean;
}

export function StationBuilderLab({
  onNavigateToEquipment,
  embedded = false,
}: StationBuilderLabProps) {
  const [selectedBand, setSelectedBand] = useState("20m");
  const chains = useStationChains();
  const activeChain = useActiveChain();
  const addChain = useShackStore((s) => s.addChain);
  const setActiveChain = useShackStore((s) => s.setActiveChain);
  const radios = useUserRadios();
  const antennas = useUserAntennas();
  const feedlines = useUserFeedlines();
  const accessories = useUserAccessories();
  const inlineCount = useShackStore((s) => s.inlineComponents.length);
  const equipmentCount =
    radios.length +
    antennas.length +
    feedlines.length +
    accessories.length +
    inlineCount;

  const handleCreateChain = useCallback(() => {
    const id = addChain({
      name: `Signal Path ${chains.length + 1}`,
      nodes: [],
      feedlineRuns: [],
      operatingPowerWatts: 100,
      shackAccessoryIds: [],
    });
    if (id) setActiveChain(id);
  }, [addChain, setActiveChain, chains.length]);

  const navigateToEquipment = useCallback(
    (tab: "radios" | "antennas" | "feedlines" = "radios") => {
      if (onNavigateToEquipment) onNavigateToEquipment(tab);
      else
        window.dispatchEvent(
          new CustomEvent("shack:navigate", {
            detail: { view: "equipment", tab },
          }),
        );
    },
    [onNavigateToEquipment],
  );

  return (
    <StationProvider
      className={`station-workbench ${embedded ? "station-workbench--embedded" : ""}`}
    >
      <Section
        title="Station workbench"
        description="Give your equipment a place. Follow the signal from radio to antenna."
        actions={
          <Button onClick={() => navigateToEquipment()}>
            <Plus size={18} aria-hidden="true" /> Manage equipment
          </Button>
        }
      >
        {!embedded && (
          <div className="sw-status-bar">
            <span>
              <Layers size={18} aria-hidden="true" /> Selected in ProPulse:{" "}
              <strong>{activeChain?.name ?? "No signal path selected"}</strong>
            </span>
            <Inline>
              <Badge>
                {chains.length} signal {chains.length === 1 ? "path" : "paths"}
              </Badge>
              <Badge>{equipmentCount} equipment items</Badge>
            </Inline>
          </div>
        )}
        {chains.length > 0 ? (
          <AllChainsView
            selectedBand={selectedBand}
            onSelectBand={setSelectedBand}
          />
        ) : (
          <Surface className="sw-onboarding">
            <div className="sw-onboarding-copy">
              <p className="su-eyebrow">YOUR EQUIPMENT, CONNECTED</p>
              <h3>
                {equipmentCount
                  ? "Your gear is ready for a signal path"
                  : "Start with the equipment on your desk"}
              </h3>
              <p className="su-hint">
                A signal path describes how your radio, accessories, cable and
                antenna work together. Add equipment, arrange the path, then
                explore its estimated performance.
              </p>
              <div className="sw-path-example" aria-label="Example signal path">
                <Radio size={22} aria-hidden="true" />
                <span>Radio</span>
                <ArrowRight size={18} aria-hidden="true" />
                <Cable size={22} aria-hidden="true" />
                <span>Feedline</span>
                <ArrowRight size={18} aria-hidden="true" />
                <span>Antenna</span>
              </div>
            </div>
            <div className="sw-start-gear">
              <EquipmentTile
                kind="radio"
                name="Add a radio"
                detail={`${radios.length} in your equipment`}
                onSelect={() => navigateToEquipment("radios")}
              />
              <EquipmentTile
                kind="cable"
                name="Add a feedline"
                detail={`${feedlines.length} in your equipment`}
                onSelect={() => navigateToEquipment("feedlines")}
              />
              <EquipmentTile
                kind="antenna"
                name="Add an antenna"
                detail={`${antennas.length} in your equipment`}
                onSelect={() => navigateToEquipment("antennas")}
              />
            </div>
            {equipmentCount > 0 && (
              <Button variant="primary" onClick={handleCreateChain}>
                <Plus size={18} aria-hidden="true" /> Create signal path
              </Button>
            )}
          </Surface>
        )}
        <Notice title="Your station, as you describe it">
          Changes are saved as you edit. Opening a signal path selects it in
          ProPulse; edits update that path directly. The diagram describes your
          connections and does not monitor or switch physical hardware.
        </Notice>
      </Section>
    </StationProvider>
  );
}
