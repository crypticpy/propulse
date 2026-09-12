import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ImageUploadButton } from "./ImageUploadButton";

vi.mock("@/hooks/useImageUrl", () => ({
  useImageUrl: () => ({ url: null, loading: false }),
}));

vi.mock("@/components/ui/ImageCropDialog", () => ({
  ImageCropDialog: () => null,
}));

const defaultProps = {
  onImageChange: vi.fn(),
  aspect: 1,
  cropShape: "rect" as const,
  maxOutputWidth: 800,
  maxOutputHeight: 600,
  quality: 0.85,
};

describe("ImageUploadButton", () => {
  it("shows a recoverable alert when FileReader fails", async () => {
    class FailingFileReader {
      error = new DOMException("Read failed", "NotReadableError");
      onload: ((ev: ProgressEvent<FileReader>) => void) | null = null;
      onerror: ((ev: ProgressEvent<FileReader>) => void) | null = null;
      onabort: ((ev: ProgressEvent<FileReader>) => void) | null = null;
      readAsDataURL(_file: Blob) {
        queueMicrotask(() => this.onerror?.({} as ProgressEvent<FileReader>));
      }
    }

    vi.stubGlobal("FileReader", FailingFileReader);

    render(<ImageUploadButton {...defaultProps} label="Upload gear photo" />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["broken"], "gear.jpg", { type: "image/jpeg" });
    await userEvent.upload(input, file);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/could not read/i);
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeTruthy();
    expect(defaultProps.onImageChange).not.toHaveBeenCalled();
  });

  it("clears the read error when dismissed", async () => {
    class FailingFileReader {
      error = new DOMException("Read failed", "NotReadableError");
      onload: ((ev: ProgressEvent<FileReader>) => void) | null = null;
      onerror: ((ev: ProgressEvent<FileReader>) => void) | null = null;
      onabort: ((ev: ProgressEvent<FileReader>) => void) | null = null;
      readAsDataURL(_file: Blob) {
        queueMicrotask(() => this.onerror?.({} as ProgressEvent<FileReader>));
      }
    }

    vi.stubGlobal("FileReader", FailingFileReader);

    render(<ImageUploadButton {...defaultProps} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, new File(["broken"], "gear.jpg", { type: "image/jpeg" }));

    await screen.findByRole("alert");
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
    });
  });
});
