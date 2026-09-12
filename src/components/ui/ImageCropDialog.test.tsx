import { useEffect } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Area } from "react-easy-crop";
import { ImageCropDialog } from "./ImageCropDialog";
import { storeImage } from "@/lib/db/imageStore";

vi.mock("@/lib/db/imageStore", () => ({
  storeImage: vi.fn(),
}));

function MockCropper({
  onCropComplete,
}: {
  onCropComplete: (area: Area, pixels: Area) => void;
}) {
  useEffect(() => {
    const area = { x: 0, y: 0, width: 100, height: 100 };
    // Run after ImageCropDialog's open reset effect, like a real cropper load.
    const timer = window.setTimeout(() => onCropComplete(area, area), 0);
    return () => window.clearTimeout(timer);
  }, [onCropComplete]);
  return <div data-testid="mock-cropper" />;
}

vi.mock("react-easy-crop", () => ({
  default: MockCropper,
}));

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  imageSrc: "data:image/jpeg;base64,abc",
  aspect: 1,
  cropShape: "rect" as const,
  maxOutputWidth: 800,
  maxOutputHeight: 600,
  quality: 0.85,
  onComplete: vi.fn(),
};

describe("ImageCropDialog", () => {
  beforeEach(() => {
    vi.mocked(storeImage).mockReset();
    defaultProps.onClose.mockReset();
    defaultProps.onComplete.mockReset();

    class MockImage {
      crossOrigin = "";
      private _src = "";
      setAttribute(name: string, value: string) {
        if (name === "crossOrigin") this.crossOrigin = value;
      }
      set src(value: string) {
        this._src = value;
        queueMicrotask(() => {
          this._onLoad?.();
        });
      }
      get src() {
        return this._src;
      }
      private _onLoad: (() => void) | null = null;
      addEventListener(event: string, cb: () => void) {
        if (event === "load") this._onLoad = cb;
      }
    }
    vi.stubGlobal("Image", MockImage as unknown as typeof Image);

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      ((contextId: string) => {
        if (contextId === "2d") {
          return { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
        }
        return null;
      }) as typeof HTMLCanvasElement.prototype.getContext,
    );

    HTMLCanvasElement.prototype.toBlob = vi.fn(function toBlob(
      this: HTMLCanvasElement,
      callback: BlobCallback,
    ) {
      callback(new Blob(["jpeg"], { type: "image/jpeg" }));
    });
  });

  it("shows a recoverable alert when save fails and keeps the dialog open", async () => {
    vi.mocked(storeImage).mockRejectedValueOnce(
      new Error("IndexedDB quota exceeded"),
    );

    render(<ImageCropDialog {...defaultProps} />);

    await waitFor(() => {
      expect(
        (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false);
    });

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/IndexedDB quota exceeded/i);
    expect(alert.textContent).toMatch(/crop is unchanged/i);
    expect(defaultProps.onComplete).not.toHaveBeenCalled();
    expect(defaultProps.onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId("mock-cropper")).toBeTruthy();
  });

  it("allows retry after a failed save", async () => {
    vi.mocked(storeImage)
      .mockRejectedValueOnce(new Error("IndexedDB quota exceeded"))
      .mockResolvedValueOnce("img-123");

    render(<ImageCropDialog {...defaultProps} />);

    await waitFor(() => {
      expect(
        (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false);
    });

    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("alert");

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(defaultProps.onComplete).toHaveBeenCalledWith("img-123");
    });
    expect(storeImage).toHaveBeenCalledTimes(2);
  });
});
