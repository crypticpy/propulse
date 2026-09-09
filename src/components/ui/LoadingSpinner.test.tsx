import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoadingSpinner } from "./LoadingSpinner";

describe("LoadingSpinner", () => {
  it("uses border-4 for the lg spinner ring", () => {
    const { container } = render(<LoadingSpinner size="lg" />);
    const ring = container.querySelector('[aria-hidden="true"]');

    expect(ring?.className).toContain("border-4");
    expect(ring?.className).not.toContain("border-3");
  });
});
