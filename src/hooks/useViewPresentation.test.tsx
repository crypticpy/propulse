import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ViewProvider } from "@/components/views/ViewProvider";
import { createMemoryWorkingStorage } from "@/lib/views/runtime";
import { useUpdateViewPresentation, useViewPresentation } from "./useViewPresentation";

function Probe() {
  const presentation = useViewPresentation();
  const updatePresentation = useUpdateViewPresentation();
  return (
    <div>
      <span data-testid="projection">{presentation.projection}</span>
      <button
        type="button"
        onClick={() => {
          updatePresentation({
            ...JSON.parse(JSON.stringify(presentation)),
            projection: "flat",
          });
        }}
      >
        flatten
      </button>
    </div>
  );
}

describe("useViewPresentation", () => {
  it("reads presentation from the bound runtime only", async () => {
    const user = userEvent.setup();
    render(
      <ViewProvider ownerId="owner-a" slot="normal" storage={createMemoryWorkingStorage()}>
        <Probe />
      </ViewProvider>,
    );
    expect(screen.getByTestId("projection").textContent).toBe("globe");
    await user.click(screen.getByRole("button", { name: "flatten" }));
    expect(screen.getByTestId("projection").textContent).toBe("flat");
  });
});
