import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StationProvider } from "@/components/station-ui";
import { EquipmentUsedInDialog } from "@/components/shack/EquipmentUsedInDialog";
import {
  createExperimentFixture,
  FIXTURE_DATE,
  FIXTURE_OWNER,
} from "@/lib/station/workbench/fixtures";
import { queryEquipmentUsedIn } from "@/lib/station/workbench/equipment/inventoryQuery";

function renderDialog(view: ReturnType<typeof queryEquipmentUsedIn> | null) {
  return render(
    <StationProvider>
      <EquipmentUsedInDialog open view={view} onClose={() => undefined} />
    </StationProvider>,
  );
}

describe("EquipmentUsedInDialog", () => {
  it("renders draft, historical and lifecycle guidance without private metadata", () => {
    const archive = createExperimentFixture();
    archive.publications.push({
      id: "published",
      ownerId: FIXTURE_OWNER,
      setupId: "home-hf",
      revisionId: "home-r1",
      audience: "visitor",
      publicationVersion: 1,
      reviewedAt: FIXTURE_DATE,
    });
    const view = queryEquipmentUsedIn(archive, FIXTURE_OWNER, "radio");
    renderDialog(view);

    expect(screen.getAllByText(/Used in · My HF transceiver/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Current draft/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Pinned revision/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Remove from setup/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Delete or retire inventory/i).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain("PRIVATE-SERIAL");
  });

  it("explains unwired inventory when there are no references", () => {
    const archive = createExperimentFixture();
    const spare = structuredClone(archive.inventory[2]);
    spare.id = "unwired-spare";
    spare.label = "Bench spare";
    archive.inventory.push(spare);
    const view = queryEquipmentUsedIn(archive, FIXTURE_OWNER, "unwired-spare");
    renderDialog(view);

    expect(screen.getByText(/Not referenced yet/i)).toBeTruthy();
    expect(screen.getAllByText(/Bench spare/i).length).toBeGreaterThan(0);
  });
});
