import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { ClusterReport } from "./ClusterReport";
import { HamClockPinnedReportHost } from "./WallReport";
import { useDXStore } from "@/stores/dxStore";

vi.mock("@/components/dx/DXSpotList/DXSpotList", () => ({ DXSpotList: ({ showFilters, wallPaging }: { showFilters: boolean; wallPaging: boolean }) => <div>{showFilters && wallPaging ? "Existing cluster filters and paged content" : "Missing report behavior"}</div> }));
const previous = useDXStore.getState();
afterEach(() => useDXStore.setState(previous));
it("retains paged cluster content inside body-only report chrome", async () => {
  useDXStore.setState({ spots: [], spotSource: "rest" });
  render(<ClusterReport open onClose={vi.fn()} />);
  const dialog = screen.getByRole("dialog", { name: "DX cluster report" });
  expect(dialog.querySelector(".hcr-cluster-hero")).toBeTruthy();
  expect(await screen.findByText("Existing cluster filters and paged content")).toBeTruthy();
  expect(screen.getByText(/DX REST · UNKNOWN · LAST SPOT/)).toBeTruthy();
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
  expect(await screen.findByText("Existing cluster filters and paged content")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "UNPIN" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});
