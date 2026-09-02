import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CSSProperties, ReactNode } from "react";
import type { SpotCluster as SpotClusterData } from "@/hooks/useSpotClustering";
import { SpotCluster } from "./SpotCluster";

vi.mock("@react-three/fiber", async () => {
  const actual = await vi.importActual<typeof import("@react-three/fiber")>(
    "@react-three/fiber",
  );
  return { ...actual, useFrame: vi.fn() };
});

vi.mock("@react-three/drei", () => ({
  Html: ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
    <div style={style}>{children}</div>
  ),
}));

vi.mock("@/hooks/useGlobeOcclusion", () => ({
  useGlobeOcclusion: () => ({
    opacityRef: { current: 1 },
    opacity: 1,
  }),
}));

const cluster: SpotClusterData = {
  id: "cluster-1",
  center: { lat: 30.25, lon: -97.75 },
  spots: [
    {
      id: "spot-1",
      spotter: "W1AW",
      dx: "K5ABC",
      frequency: 14074,
      mode: "FT8",
      time: new Date("2026-08-31T13:59:00.000Z"),
      comment: "",
      source: "Cluster",
    },
  ],
  count: 3,
  primarySpot: {
    id: "spot-1",
    spotter: "W1AW",
    dx: "K5ABC",
    frequency: 14074,
    mode: "FT8",
    time: new Date("2026-08-31T13:59:00.000Z"),
    comment: "",
    source: "Cluster",
  },
};

describe("SpotCluster accessibility", () => {
  it("opens a cluster from the focusable count badge", () => {
    const onClick = vi.fn();
    render(
      <SpotCluster
        cluster={cluster}
        color="#123456"
        ariaLabel="Open 3 active spots"
        onClick={onClick}
      />,
    );

    const button = screen.getByRole("button", {
      name: "Open 3 active spots",
    });
    expect(button.style.backgroundColor).toBe("rgb(18, 52, 86)");
    fireEvent.click(button);

    expect(onClick).toHaveBeenCalledWith(cluster, { x: 0, y: 0 });
  });

  it.each(["Enter", " "])("opens a cluster from the %j key", (key) => {
    const onClick = vi.fn();
    render(
      <SpotCluster
        cluster={cluster}
        ariaLabel="Open 3 spots"
        onClick={onClick}
      />,
    );

    fireEvent.keyDown(
      screen.getByRole("button", { name: "Open 3 spots" }),
      { key },
    );

    expect(onClick).toHaveBeenCalledOnce();
  });
});
