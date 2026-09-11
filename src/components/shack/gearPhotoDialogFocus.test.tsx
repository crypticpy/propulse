import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_VISUAL_EFFECTS, useVisualEffectsStore } from "@/stores/visualEffectsStore";
import { EquipmentHeroCard } from "./EquipmentHeroCard";

vi.mock("@/hooks/useImageUrl", () => ({
  useImageUrl: (imageId?: string) => ({
    url: imageId ? "blob:mock-image" : null,
  }),
}));

vi.mock("@/hooks/useOperatorRank", () => ({
  useOperatorRank: () => ({
    rank: "ethereal",
    hasChromaticEffects: false,
    hasParticles: false,
    preferences: { enableParticles: false },
  }),
}));

vi.mock("./EquipmentCard", () => ({
  ArtZonePattern: () => <svg />,
  StatIconSvg: () => <svg />,
}));

vi.mock("react-easy-crop", () => ({
  default: () => <div data-testid="mock-cropper" />,
}));

vi.mock("@/lib/db/imageStore", () => ({
  deleteImage: vi.fn(async () => undefined),
  storeImage: vi.fn(async () => "stored-image-id"),
}));

class MockFileReader {
  result: string | ArrayBuffer | null =
    "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD";
  onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
  readAsDataURL() {
    queueMicrotask(() => {
      this.onload?.({ target: this } as unknown as ProgressEvent<FileReader>);
    });
  }
}

function renderHeroWithPhoto() {
  const onClose = vi.fn();
  const onImageChange = vi.fn();
  render(
    <EquipmentHeroCard
      open
      title="HF transceiver"
      subtitle="Primary radio"
      equipmentType="radio"
      imageId="existing-image"
      onClose={onClose}
      onImageChange={onImageChange}
      onEdit={vi.fn()}
    />,
  );
  return { onClose, onImageChange };
}

describe("gear photo nested dialogs (#328)", () => {
  beforeEach(() => {
    useVisualEffectsStore.setState({ ...DEFAULT_VISUAL_EFFECTS, level: "off" });
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    vi.stubGlobal("FileReader", MockFileReader);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("closes only the remove confirmation and keeps the hero card open on Escape", async () => {
    const user = userEvent.setup();
    const { onClose } = renderHeroWithPhoto();

    const removeButton = screen.getByRole("button", { name: "Remove image" });
    await user.click(removeButton);

    expect(screen.getByRole("alertdialog", { name: "Remove Image" })).toBeTruthy();
    expect(
      document.querySelector('[role="dialog"][aria-labelledby]'),
    ).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog", { name: "Remove Image" })).toBeNull();
    });
    expect(screen.getByRole("dialog", { name: "HF transceiver" })).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("returns focus to the remove control after dismissing the confirmation", async () => {
    const user = userEvent.setup();
    renderHeroWithPhoto();

    const removeButton = screen.getByRole("button", { name: "Remove image" });
    await user.click(removeButton);
    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(document.activeElement).toBe(removeButton);
    });
  });

  it("closes only the crop dialog and keeps the hero card open on Escape", async () => {
    const user = userEvent.setup();
    const { onClose } = renderHeroWithPhoto();

    const uploadButton = screen.getByRole("button", { name: "Change photo" });
    await user.click(uploadButton);

    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File(["photo"], "photo.jpg", { type: "image/jpeg" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Crop Photo" })).toBeTruthy();
    });

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Crop Photo" })).toBeNull();
    });
    expect(screen.getByRole("dialog", { name: "HF transceiver" })).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps Tab focus inside the active crop dialog above the hero card", async () => {
    const user = userEvent.setup();
    renderHeroWithPhoto();

    await user.click(screen.getByRole("button", { name: "Change photo" }));
    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: {
        files: [new File(["photo"], "photo.jpg", { type: "image/jpeg" })],
      },
    });

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Crop Photo" })).toBeTruthy();
    });

    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    cancelButton.focus();
    await user.tab();

    const cropDialog = screen.getByRole("dialog", { name: "Crop Photo" });
    expect(cropDialog.contains(document.activeElement)).toBe(true);
  });

  it("restores body scroll lock to the hero card while a crop dialog is open", async () => {
    renderHeroWithPhoto();
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.click(screen.getByRole("button", { name: "Change photo" }));
    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: {
        files: [new File(["photo"], "photo.jpg", { type: "image/jpeg" })],
      },
    });

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Crop Photo" })).toBeTruthy();
    });
    expect(document.body.style.overflow).toBe("hidden");
  });
});
