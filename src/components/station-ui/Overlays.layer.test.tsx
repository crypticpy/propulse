import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Dialog, StationProvider } from "./index";

afterEach(cleanup);
describe("station dialog layer compatibility", () => {
  it.each([undefined, "z-[450]"])(
    "preserves the existing overlay layer with %s",
    (layer) => {
      render(
        <StationProvider>
          <Dialog
            open
            onClose={() => {}}
            title="Radio edit"
            zIndexClassName={layer}
          >
            Fields
          </Dialog>
        </StationProvider>,
      );
      const dialog = screen.getByRole("dialog", { name: "Radio edit" });
      const overlay = dialog.closest(".fixed");
      expect(overlay?.classList.contains(layer ?? "z-[500]")).toBe(true);
    },
  );
});
