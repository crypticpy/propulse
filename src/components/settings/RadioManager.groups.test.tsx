import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { RadioManager } from "./RadioManager";

it("names the custom radio checkbox groups and preserves independent selection", () => {
  render(
    <MemoryRouter>
      <RadioManager />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole("button", { name: "+ Custom Definition" }));
  const dialog = screen.getByRole("dialog", { name: "New Custom Radio" });
  const bands = within(dialog).getByRole("group", { name: "Bands" });
  const modes = within(dialog).getByRole("group", { name: "Modes" });
  const band = within(bands).getByRole("checkbox", { name: "23cm" });
  const mode = within(modes).getByRole("checkbox", { name: "JS8" });
  expect(band).toHaveProperty("checked", false);
  expect(mode).toHaveProperty("checked", false);
  fireEvent.click(band);
  expect(band).toHaveProperty("checked", true);
  expect(mode).toHaveProperty("checked", false);
  fireEvent.click(mode);
  expect(mode).toHaveProperty("checked", true);
  expect(band).toHaveProperty("checked", true);
});
