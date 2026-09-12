import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IngestionResult } from "@/hooks/useCallsignIngestion";
import { useProfileStore } from "@/stores/profileStore";
import { useSettingsStore } from "@/stores/settingsStore";
import type { LicenseInfo, UserStation } from "@/types/user";
import { gridToLatLon } from "@/lib/utils/grid";
import { StationIdentityForm } from "./StationIdentityForm";
import {
  buildLookupImport,
  overlayStationLookupCoords,
  saveIdentityWithLookup,
  useStationIdentityDraft,
} from "./identityLookupDraft";

const LOOKUP: IngestionResult = {
  name: "Pat Operator",
  grid: "EM29",
  lat: 38.123456,
  lon: -92.654321,
  country: "United States",
  licenseClass: "Extra",
  expiryDate: "2030-01-01",
  grantDate: "2010-06-15",
  bio: "Lookup bio from callbook",
  imageUrl: "https://example.test/photo.jpg",
  sources: ["callook"],
};

const ingestion = vi.hoisted(() => ({
  result: null as IngestionResult | null,
  loading: false,
}));

vi.mock("@/hooks/useCallsignIngestion", () => ({
  useCallsignIngestion: (callsign: string) => ({
    result: callsign.trim().length >= 3 ? ingestion.result : null,
    loading: ingestion.loading && callsign.trim().length >= 3,
    error: null,
  }),
}));

const originalProfile = useProfileStore.getState();
const originalSettings = useSettingsStore.getState();

const HOME_COORDS = { lat: 38.5, lon: -93 };

function seedStation(): UserStation {
  return {
    callsign: "W0TEST",
    operatorName: "",
    homeLocationId: "home-1",
    activeLocationId: null,
    savedLocations: [
      {
        id: "home-1",
        name: "Home",
        grid: "EM38",
        lat: HOME_COORDS.lat,
        lon: HOME_COORDS.lon,
        type: "home",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "pota-1",
        name: "POTA K-1234",
        grid: "EM29",
        lat: 39.1,
        lon: -94.2,
        type: "pota",
        createdAt: "2026-02-01T00:00:00.000Z",
      },
    ],
    grid: "EM38",
    lat: HOME_COORDS.lat,
    lon: HOME_COORDS.lon,
  };
}

const seedLicense: LicenseInfo = {
  country: "US",
  class: "GENERAL",
  expirationDate: null,
};

function committed() {
  const profile = useProfileStore.getState();
  return {
    license: profile.license,
    bio: profile.bio,
    profileImageUrl: profile.profileImageUrl,
    lastIngestedCallsign: profile.lastIngestedCallsign,
    lat: profile.station?.lat,
    lon: profile.station?.lon,
    operatorName: profile.station?.operatorName,
    grid: profile.station?.grid,
    home: profile.station?.savedLocations.find((loc) => loc.id === "home-1"),
    pota: profile.station?.savedLocations.find((loc) => loc.id === "pota-1"),
    licenseClass: useSettingsStore.getState().licenseClass,
  };
}

function IdentityDraftHost() {
  const { formProps, handleCancelEdit } = useStationIdentityDraft();
  return (
    <div>
      <StationIdentityForm {...formProps} idPrefix="test" />
      <button type="button" onClick={handleCancelEdit}>
        Cancel
      </button>
    </div>
  );
}

function checkbox(label: RegExp): HTMLInputElement {
  return screen.getByRole("checkbox", { name: label }) as HTMLInputElement;
}

function nameInput(): HTMLInputElement {
  return screen.getByLabelText(/Operator Name/) as HTMLInputElement;
}

function gridInput(): HTMLInputElement {
  return screen.getByPlaceholderText("EM10fp") as HTMLInputElement;
}

function setBox(label: RegExp, checked: boolean) {
  const box = checkbox(label);
  if (box.checked !== checked) fireEvent.click(box);
}

describe("identity lookup draft (#353)", () => {
  beforeEach(() => {
    ingestion.result = LOOKUP;
    ingestion.loading = false;
    useProfileStore.setState(
      {
        station: seedStation(),
        license: seedLicense,
        bio: "Existing bio",
        profileImageUrl: "",
        lastIngestedCallsign: "",
      },
      false,
    );
    useSettingsStore.setState({ licenseClass: "GENERAL" });
  });

  afterEach(() => {
    useProfileStore.setState(originalProfile, true);
    useSettingsStore.setState(originalSettings, true);
  });

  it("applies name, grid, and coordinates together without writing stores", () => {
    render(<IdentityDraftHost />);
    setBox(/Name/, true);
    setBox(/Grid/, true);
    setBox(/Location/, true);
    setBox(/Bio/, false);
    setBox(/Photo/, false);
    fireEvent.click(
      screen.getByRole("button", { name: /Apply selected fields/i }),
    );

    expect(nameInput().value).toBe("Pat Operator");
    expect(gridInput().value.toUpperCase()).toBe("EM29");

    const afterApply = committed();
    expect(afterApply.operatorName).toBe("");
    expect(afterApply.grid).toBe("EM38");
    expect(afterApply.lat).toBe(HOME_COORDS.lat);
    expect(afterApply.lon).toBe(HOME_COORDS.lon);
    expect(afterApply.lastIngestedCallsign).toBe("");
    expect(afterApply.license).toEqual(seedLicense);
    expect(afterApply.licenseClass).toBe("GENERAL");
    expect(afterApply.bio).toBe("Existing bio");
    expect(afterApply.profileImageUrl).toBe("");
    expect(screen.getByRole("button", { name: "Save Profile" })).toBeTruthy();
  });

  it("keeps combined identity fields after Apply when station is replaced", () => {
    render(<IdentityDraftHost />);
    setBox(/Name/, true);
    setBox(/Grid/, true);
    setBox(/Location/, true);
    setBox(/Bio/, false);
    setBox(/Photo/, false);
    fireEvent.click(
      screen.getByRole("button", { name: /Apply selected fields/i }),
    );

    act(() => {
      const current = useProfileStore.getState().station!;
      useProfileStore.getState().setStation({
        ...current,
        operatorName: "Store Overwrite",
        grid: "FN31",
        lat: 41.7,
        lon: -72.7,
      });
    });

    expect(nameInput().value).toBe("Pat Operator");
    expect(gridInput().value.toUpperCase()).toBe("EM29");
  });

  it("commits only selected fields on Save, including lookup coordinates", () => {
    render(<IdentityDraftHost />);
    setBox(/Name/, true);
    setBox(/Grid/, true);
    setBox(/Location/, true);
    setBox(/Bio/, false);
    setBox(/Photo/, false);
    fireEvent.click(
      screen.getByRole("button", { name: /Apply selected fields/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save Profile" }));

    const afterSave = committed();
    expect(afterSave.operatorName).toBe("Pat Operator");
    expect(afterSave.grid).toBe("EM29");
    expect(afterSave.lat).toBe(LOOKUP.lat);
    expect(afterSave.lon).toBe(LOOKUP.lon);
    expect(afterSave.home?.lat).toBe(LOOKUP.lat);
    expect(afterSave.home?.lon).toBe(LOOKUP.lon);
    expect(afterSave.pota).toMatchObject({ lat: 39.1, lon: -94.2 });
    expect(afterSave.lastIngestedCallsign).toBe("W0TEST");
    expect(afterSave.license).toEqual(seedLicense);
    expect(afterSave.licenseClass).toBe("GENERAL");
    expect(afterSave.bio).toBe("Existing bio");
    expect(afterSave.profileImageUrl).toBe("");
    expect(gridToLatLon("EM29")).not.toEqual({
      lat: LOOKUP.lat,
      lon: LOOKUP.lon,
    });
  });

  it("shows Save for a license-only Apply and leaves settings untouched until Save", () => {
    render(<IdentityDraftHost />);
    setBox(/Name/, false);
    setBox(/Bio/, false);
    setBox(/Photo/, false);
    setBox(/License/, true);
    fireEvent.click(
      screen.getByRole("button", { name: /Apply selected fields/i }),
    );

    expect(screen.getByRole("button", { name: "Save Profile" })).toBeTruthy();
    expect(committed().license).toEqual(seedLicense);
    expect(committed().licenseClass).toBe("GENERAL");
    expect(committed().lastIngestedCallsign).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Save Profile" }));

    expect(committed().license?.class).toBe("EXTRA");
    expect(committed().license?.expirationDate).toBe("2030-01-01");
    expect(committed().licenseClass).toBe("EXTRA");
    expect(committed().lastIngestedCallsign).toBe("W0TEST");
    expect(committed().operatorName).toBe("");
    expect(committed().grid).toBe("EM38");
    expect(committed().lat).toBe(HOME_COORDS.lat);
    expect(committed().lon).toBe(HOME_COORDS.lon);
  });

  it("shows Save for a photo-only Apply without writing the image URL yet", () => {
    render(<IdentityDraftHost />);
    setBox(/Name/, false);
    setBox(/Bio/, false);
    setBox(/Photo/, true);
    fireEvent.click(
      screen.getByRole("button", { name: /Apply selected fields/i }),
    );

    expect(screen.getByRole("button", { name: "Save Profile" })).toBeTruthy();
    expect(committed().profileImageUrl).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Save Profile" }));
    expect(committed().profileImageUrl).toBe(LOOKUP.imageUrl);
    expect(committed().bio).toBe("Existing bio");
  });

  it("Cancel restores identity fields and leaves persistent profile unchanged", () => {
    render(<IdentityDraftHost />);
    const before = committed();
    setBox(/Name/, true);
    setBox(/Grid/, true);
    setBox(/License/, true);
    setBox(/Bio/, true);
    setBox(/Photo/, true);
    setBox(/Location/, true);
    fireEvent.click(
      screen.getByRole("button", { name: /Apply selected fields/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(nameInput().value).toBe("");
    expect(gridInput().value.toUpperCase()).toBe("EM38");
    expect(committed()).toEqual(before);
  });

  it("syncs identity fields from an external station update when the draft is clean", () => {
    render(<IdentityDraftHost />);
    act(() => {
      const current = useProfileStore.getState().station!;
      useProfileStore.getState().setStation({
        ...current,
        operatorName: "External Name",
        grid: "FN31",
      });
    });
    expect(nameInput().value).toBe("External Name");
    expect(gridInput().value.toUpperCase()).toBe("FN31");
  });

  it("retains typed identity fields when station updates during editing", () => {
    render(<IdentityDraftHost />);
    fireEvent.change(nameInput(), { target: { value: "Typed Name" } });
    act(() => {
      const current = useProfileStore.getState().station!;
      useProfileStore.getState().setStation({
        ...current,
        operatorName: "Store Overwrite",
        callsign: "N0NEW",
      });
    });
    expect(nameInput().value).toBe("Typed Name");
    expect((screen.getByLabelText("Callsign") as HTMLInputElement).value).toBe(
      "W0TEST",
    );
  });
});

describe("lookup draft helpers (#353)", () => {
  it("omits unselected fields from the import draft", () => {
    const built = buildLookupImport(
      LOOKUP,
      new Set(["licenseClass"]),
      seedLicense,
      "w0test",
    );
    expect(built.operatorName).toBeUndefined();
    expect(built.grid).toBeUndefined();
    expect(built.importDraft.bio).toBeUndefined();
    expect(built.importDraft.imageUrl).toBeUndefined();
    expect(built.importDraft.lat).toBeUndefined();
    expect(built.importDraft.license?.class).toBe("EXTRA");
    expect(built.importDraft.lastIngestedCallsign).toBe("W0TEST");
  });

  it("overlays lookup coordinates onto Home without touching other locations", () => {
    const next = overlayStationLookupCoords(
      seedStation(),
      38.123456,
      -92.654321,
    );
    expect(next.lat).toBe(38.123456);
    expect(next.lon).toBe(-92.654321);
    expect(next.savedLocations[0]).toMatchObject({
      id: "home-1",
      lat: 38.123456,
      lon: -92.654321,
      grid: "EM38",
    });
    expect(next.savedLocations[1]).toMatchObject({
      id: "pota-1",
      lat: 39.1,
      lon: -94.2,
    });
  });

  it("does not replace the station when only license records are pending", () => {
    const station = seedStation();
    const next = saveIdentityWithLookup(
      station,
      {
        callsign: station.callsign,
        operatorName: "",
        grid: station.grid,
      },
      {
        lastIngestedCallsign: "W0TEST",
        license: { ...seedLicense, class: "EXTRA" },
      },
    );
    expect(next).toBe(station);
  });
});
