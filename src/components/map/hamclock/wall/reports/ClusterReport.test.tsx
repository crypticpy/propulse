import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { ClusterReport } from "./ClusterReport";
import { HamClockPinnedReportHost } from "./WallReport";
import { useDXStore } from "@/stores/dxStore";

vi.mock("@/components/dx/DXSpotList/DXSpotList", () => ({ DXSpotList: ({ showFilters }: { showFilters: boolean }) => <div>{showFilters ? "Existing cluster filters and content" : "Missing filters"}</div> }));
const previous = useDXStore.getState();
afterEach(() => useDXStore.setState(previous));
it("retains cluster content inside report chrome without inventing a hero or read time", async () => {
  useDXStore.setState({ spots: [], spotSource: "rest" });
  render(<ClusterReport open onClose={vi.fn()} />);
  const dialog = screen.getByRole("dialog", { name: "DX cluster report" });
  expect(dialog.querySelector(".hcr-lead")).toBeNull();
  expect(await screen.findByText("Existing cluster filters and content")).toBeTruthy();
  expect(screen.getByText(/DX CLUSTER REST · LAST SPOT/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "PIN" })).toBeTruthy();
});
it("pins the existing list across owner unmount and unpins cleanly", async () => {
  function Harness() {
    const [open, setOpen] = useState(true);
    return <>{open && <ClusterReport open onClose={() => setOpen(false)} />}<HamClockPinnedReportHost /></>;
  }
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "PIN" }));
  expect(screen.getByRole("dialog", { name: "DX cluster report" })).toBeTruthy();
  expect(await screen.findByText("Existing cluster filters and content")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "UNPIN" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});
