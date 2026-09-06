/** Real inventory managers, grouped into a readable and navigable gear area. */
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Boxes, WandSparkles } from "lucide-react";
import { useShackStore } from "@/stores/shackStore";
import { RadioManager } from "@/components/settings/RadioManager";
import { AntennaManager } from "./AntennaManager";
import { FeedlineManager } from "./FeedlineManager";
import { AccessoryManager } from "./AccessoryManager";
import { InlineComponentManager } from "./InlineComponentManager";
import { SetupWizard } from "./SetupWizard";
import { Button, Notice, Section, Surface } from "@/components/station-ui";

export function EquipmentSection() {
  const [params, setParams] = useSearchParams();
  const requestedCategory = params.get("category") ?? "all";
  const category = [
    "radios",
    "antennas",
    "feedlines",
    "accessories",
    "inline",
  ].includes(requestedCategory)
    ? requestedCategory
    : "all";
  const setCategory = (nextCategory: string) =>
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set("view", "equipment");
      if (nextCategory === "all") next.delete("category");
      else next.set("category", nextCategory);
      return next;
    });
  const [wizardOpen, setWizardOpen] = useState(() => {
    const inventory = useShackStore.getState();
    return (
      category === "all" &&
      inventory.radios.length +
        inventory.antennas.length +
        inventory.feedlines.length +
        inventory.accessories.length +
        inventory.inlineComponents.length ===
        0
    );
  });
  const radios = useShackStore((s) => s.radios.length);
  const antennas = useShackStore((s) => s.antennas.length);
  const feedlines = useShackStore((s) => s.feedlines.length);
  const accessories = useShackStore((s) => s.accessories.length);
  const inline = useShackStore((s) => s.inlineComponents.length);
  const totalCount = radios + antennas + feedlines + accessories + inline;
  const groups = [
    { id: "radios", label: "Radios", count: radios, content: <RadioManager /> },
    {
      id: "antennas",
      label: "Antennas",
      count: antennas,
      content: <AntennaManager />,
    },
    {
      id: "feedlines",
      label: "Feedlines",
      count: feedlines,
      content: <FeedlineManager />,
    },
    {
      id: "accessories",
      label: "Accessories",
      count: accessories,
      content: <AccessoryManager />,
    },
    {
      id: "inline",
      label: "Inline components",
      count: inline,
      content: <InlineComponentManager />,
    },
  ];

  return (
    <Section
      title="My gear"
      description="Your radios, antennas, cables and the details that make this station yours."
    >
      {wizardOpen && category === "all" ? (
        <Surface className="shack-legacy">
          <div className="station-shack-section-intro">
            <div>
              <p className="su-eyebrow">START WITH YOUR STATION</p>
              <p className="su-hint">
                Use guided setup, or add individual items at your own pace.
              </p>
            </div>
            <Button onClick={() => setWizardOpen(false)}>
              <Boxes size={18} aria-hidden="true" /> Add gear individually
            </Button>
          </div>
          <SetupWizard onComplete={() => setWizardOpen(false)} />
        </Surface>
      ) : (
        <>
          {totalCount === 0 && (
            <div className="station-shack-section-intro">
              <Notice title="Start with any piece of gear">
                Choose a category below. You can connect equipment later in the
                workbench.
              </Notice>
              <Button
                onClick={() => {
                  setCategory("all");
                  setWizardOpen(true);
                }}
              >
                <WandSparkles size={18} aria-hidden="true" /> Guided setup
              </Button>
            </div>
          )}
          <div
            className="station-gear-filter"
            role="group"
            aria-label="Equipment categories"
          >
            {[
              { id: "all", label: "All gear", count: totalCount },
              ...groups,
            ].map((group) => (
              <Button
                key={group.id}
                aria-pressed={category === group.id}
                onClick={() => setCategory(group.id)}
              >
                {group.label}{" "}
                <span className="station-gear-count">{group.count}</span>
              </Button>
            ))}
          </div>
          <div className="station-gear-sections shack-legacy">
            {groups.map((group) => (
              <div
                key={group.id}
                hidden={category !== "all" && category !== group.id}
                className="station-gear-group"
              >
                {group.content}
              </div>
            ))}
          </div>
        </>
      )}
    </Section>
  );
}
