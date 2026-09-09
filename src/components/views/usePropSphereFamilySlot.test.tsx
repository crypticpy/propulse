import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { LayoutMode } from "@/stores/mapStore";
import { usePropSphereFamilySlot } from "./usePropSphereFamilySlot";

describe("usePropSphereFamilySlot", () => {
  it("keeps the same slot across Normal <-> Lite (#603 N5)", () => {
    const { result, rerender } = renderHook<
      ReturnType<typeof usePropSphereFamilySlot>,
      { layoutMode: LayoutMode }
    >(({ layoutMode }) => usePropSphereFamilySlot(layoutMode), {
      initialProps: { layoutMode: "normal" },
    });
    expect(result.current).toBe("normal");

    rerender({ layoutMode: "lite" });
    expect(result.current).toBe("normal");

    rerender({ layoutMode: "normal" });
    expect(result.current).toBe("normal");
  });

  it("gives Pro its own family and freezes to the last non-HamClock family while HamClock is shown", () => {
    const { result, rerender } = renderHook<
      ReturnType<typeof usePropSphereFamilySlot>,
      { layoutMode: LayoutMode }
    >(({ layoutMode }) => usePropSphereFamilySlot(layoutMode), {
      initialProps: { layoutMode: "lite" },
    });
    expect(result.current).toBe("normal");

    rerender({ layoutMode: "pro" });
    expect(result.current).toBe("pro");

    rerender({ layoutMode: "hamclock" });
    expect(result.current).toBe("pro");

    rerender({ layoutMode: "normal" });
    expect(result.current).toBe("normal");
  });
});
