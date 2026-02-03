import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui";
import { DetailModal } from "@/components/ui/DetailModal";
import { useUserStore } from "@/stores/userStore";
import { gridToLatLon, isValidGrid } from "@/lib/utils/grid";
import { RadioManager } from "./RadioManager";
import { LocationInput } from "./LocationInput";
import { LocationManager } from "./LocationManager";
import { LicenseSection } from "./LicenseSection";
import { FavoredBandsPicker } from "./FavoredBandsPicker";
import { NotificationSettings } from "./NotificationSettings";
import {
  downloadSettingsBackup,
  readBackupFile,
  importSettings,
  getBackupSummary,
  type SettingsBackup,
  type ValidationResult,
} from "@/lib/utils/settingsBackup";
import type { UserStation, TextScale } from "@/types/user";
import type { ColorBlindMode, StatusType } from "@/lib/themes/colorblind";
import {
  COLOR_BLIND_MODE_NAMES,
  COLOR_BLIND_MODE_DESCRIPTIONS,
  getColorBlindColor,
  getStatusIcon,
} from "@/lib/themes/colorblind";

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsTab =
  | "profile"
  | "locations"
  | "license"
  | "equipment"
  | "preferences"
  | "notifications"
  | "backup";

interface TabDef {
  id: SettingsTab;
  label: string;
  icon: React.ReactNode;
}

const TABS: TabDef[] = [
  {
    id: "profile",
    label: "Profile",
    icon: (
      <svg
        className="w-4 h-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
        />
      </svg>
    ),
  },
  {
    id: "locations",
    label: "Locations",
    icon: (
      <svg
        className="w-4 h-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
    ),
  },
  {
    id: "license",
    label: "License",
    icon: (
      <svg
        className="w-4 h-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
    ),
  },
  {
    id: "equipment",
    label: "Equipment",
    icon: (
      <svg
        className="w-4 h-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
        />
      </svg>
    ),
  },
  {
    id: "preferences",
    label: "Preferences",
    icon: (
      <svg
        className="w-4 h-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
    ),
  },
  {
    id: "notifications",
    label: "Alerts",
    icon: (
      <svg
        className="w-4 h-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
        />
      </svg>
    ),
  },
  {
    id: "backup",
    label: "Backup",
    icon: (
      <svg
        className="w-4 h-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
        />
      </svg>
    ),
  },
];

/**
 * SettingsModal - User settings with tabbed navigation
 */
export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { station, setStation, preferences, updatePreferences } =
    useUserStore();

  // Active tab state
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");

  // Profile tab local form state
  const [callsign, setCallsign] = useState(station?.callsign || "");
  const [callsignError, setCallsignError] = useState<string | null>(null);
  const [grid, setGrid] = useState(station?.grid || "");
  const [gridError, setGridError] = useState<string | null>(null);
  const [operatorName, setOperatorName] = useState(
    station?.operatorName || station?.name || "",
  );

  // Callsign validation regex - matches common amateur radio callsign formats
  // e.g., W5XXX, N5XXX, KA5XXX, VE3XXX, G4XXX, JA1XXX
  const CALLSIGN_REGEX = /^[A-Z0-9]{1,3}[0-9][A-Z0-9]{0,3}[A-Z]$/i;

  // Preferences tab local form state
  const [timeFormat, setTimeFormat] = useState(preferences.timeFormat);
  const [units, setUnits] = useState(preferences.units);
  const [textScale, setTextScale] = useState<TextScale>(
    preferences.textScale ?? "md",
  );
  const [colorBlindMode, setColorBlindModeLocal] = useState<ColorBlindMode>(
    (preferences as { colorBlindMode?: ColorBlindMode }).colorBlindMode ??
      "none",
  );

  // Get the setColorBlindMode action from store
  const setColorBlindMode = useUserStore(
    (state) => state.setColorBlindMode as (mode: ColorBlindMode) => void,
  );

  // Radio manager modal state
  const [showFullRadioManager, setShowFullRadioManager] = useState(false);

  // Track if profile form has unsaved changes
  const [profileDirty, setProfileDirty] = useState(false);
  const [preferencesDirty, setPreferencesDirty] = useState(false);

  // Backup tab state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [backupStatus, setBackupStatus] = useState<{
    type: "success" | "error" | "warning" | "info";
    message: string;
  } | null>(null);
  const [pendingImport, setPendingImport] = useState<{
    backup: SettingsBackup;
    validation: ValidationResult;
  } | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setCallsign(station?.callsign || "");
      setCallsignError(null);
      setGrid(station?.grid || "");
      setOperatorName(station?.operatorName || station?.name || "");
      setTimeFormat(preferences.timeFormat);
      setUnits(preferences.units);
      setTextScale(preferences.textScale ?? "md");
      setColorBlindModeLocal(preferences.colorBlindMode ?? "none");
      setGridError(null);
      setProfileDirty(false);
      setPreferencesDirty(false);
      setActiveTab("profile");
      // Reset backup state
      setBackupStatus(null);
      setPendingImport(null);
      setIsImporting(false);
    }
  }, [isOpen, station, preferences]);

  // Handle export settings
  const handleExport = () => {
    try {
      downloadSettingsBackup();
      setBackupStatus({
        type: "success",
        message: "Settings exported successfully. Check your downloads folder.",
      });
    } catch (e) {
      setBackupStatus({
        type: "error",
        message: `Export failed: ${e instanceof Error ? e.message : "Unknown error"}`,
      });
    }
  };

  // Handle file selection for import
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset file input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    setBackupStatus(null);
    setPendingImport(null);

    const result = await readBackupFile(file);

    if ("error" in result) {
      setBackupStatus({
        type: "error",
        message: result.error,
      });
      return;
    }

    // Show summary and ask for confirmation
    const summary = getBackupSummary(result.data);
    setPendingImport({
      backup: result.data,
      validation: result.validation,
    });

    if (result.validation.warnings?.length) {
      setBackupStatus({
        type: "warning",
        message: result.validation.warnings.join(" "),
      });
    } else {
      setBackupStatus({
        type: "info",
        message: summary,
      });
    }
  };

  // Handle confirming the import
  const handleConfirmImport = () => {
    if (!pendingImport) return;

    setIsImporting(true);
    const result = importSettings(pendingImport.backup);

    if (result.success) {
      const importedSections = Object.entries(result.imported)
        .filter(([, imported]) => imported)
        .map(([section]) => section)
        .join(", ");

      setBackupStatus({
        type: "success",
        message: `Settings imported successfully. Imported: ${importedSections}`,
      });
    } else {
      setBackupStatus({
        type: "error",
        message: result.error || "Import failed",
      });
    }

    setPendingImport(null);
    setIsImporting(false);
  };

  // Handle canceling the import
  const handleCancelImport = () => {
    setPendingImport(null);
    setBackupStatus(null);
  };

  // Handle profile save
  const handleProfileSave = () => {
    // Validate callsign if provided
    if (callsign && !CALLSIGN_REGEX.test(callsign)) {
      setCallsignError(
        "Please enter a valid amateur radio callsign (e.g., W5XXX, VE3XXX)",
      );
      return;
    }
    setCallsignError(null);

    // Validate grid if provided
    if (grid && !isValidGrid(grid)) {
      setGridError("Please enter a valid Maidenhead grid square");
      return;
    }

    // Build station object with multi-location support
    if (callsign || grid) {
      const coords = grid ? gridToLatLon(grid) : { lat: 0, lon: 0 };
      const gridUpper = grid.toUpperCase();

      // Check if we have an existing station with valid home location
      const existingStation = station;
      const existingHomeId = existingStation?.homeLocationId;
      const hasValidExistingHome =
        existingStation &&
        existingHomeId &&
        existingStation.savedLocations?.some(
          (loc) => loc.id === existingHomeId,
        );

      let newStation: UserStation;

      if (hasValidExistingHome && existingStation && existingHomeId) {
        // Update existing home location
        const updatedLocations = existingStation.savedLocations.map((loc) =>
          loc.id === existingHomeId
            ? { ...loc, grid: gridUpper, lat: coords.lat, lon: coords.lon }
            : loc,
        );
        newStation = {
          ...existingStation,
          callsign: callsign.toUpperCase(),
          operatorName: operatorName.trim() || undefined,
          savedLocations: updatedLocations,
          // Update legacy fields
          grid: gridUpper,
          lat: coords.lat,
          lon: coords.lon,
        };
      } else {
        // Create new station with home location
        const homeLocationId = crypto.randomUUID();
        const homeLocation = {
          id: homeLocationId,
          name: "Home",
          grid: gridUpper,
          lat: coords.lat,
          lon: coords.lon,
          type: "home" as const,
          createdAt: new Date().toISOString(),
        };
        newStation = {
          callsign: callsign.toUpperCase(),
          operatorName: operatorName.trim() || undefined,
          homeLocationId,
          activeLocationId: null,
          savedLocations: [homeLocation],
          // Legacy compatibility fields
          grid: gridUpper,
          lat: coords.lat,
          lon: coords.lon,
        };
      }
      setStation(newStation);
    } else {
      setStation(null);
    }

    setProfileDirty(false);
  };

  // Handle preferences save
  const handlePreferencesSave = () => {
    updatePreferences({ timeFormat, units, textScale });
    setPreferencesDirty(false);
  };

  // Handle close - warn if unsaved changes
  const handleClose = () => {
    if (profileDirty || preferencesDirty) {
      const confirmClose = window.confirm(
        "You have unsaved changes. Are you sure you want to close?",
      );
      if (!confirmClose) {
        return;
      }
    }
    onClose();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <Card
        className="relative z-10 w-full max-w-2xl flex flex-col max-h-[calc(100dvh-2rem)]"
        animate
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-0 flex-shrink-0">
          <h2 className="font-orbitron text-xl font-bold text-gradient-orange">
            Settings
          </h2>
          <button
            onClick={handleClose}
            className="p-1 text-gray-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 px-6 pt-4 pb-2 overflow-x-auto flex-shrink-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap
                ${
                  activeTab === tab.id
                    ? "bg-plasma-orange/20 text-plasma-orange border border-plasma-orange/50"
                    : "text-gray-400 hover:text-white hover:bg-white/5 border border-transparent"
                }
              `}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="overflow-y-auto flex-1 min-h-0 px-6 py-4">
          {/* Profile Tab */}
          {activeTab === "profile" && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
                Station Identity
              </h3>

              {/* Callsign */}
              <div>
                <label
                  htmlFor="callsign"
                  className="block text-sm font-medium text-gray-300 mb-1"
                >
                  Callsign
                </label>
                <input
                  type="text"
                  id="callsign"
                  value={callsign}
                  onChange={(e) => {
                    setCallsign(e.target.value.toUpperCase());
                    setCallsignError(null);
                    setProfileDirty(true);
                  }}
                  placeholder="N5XXX"
                  aria-invalid={!!callsignError}
                  aria-describedby={
                    callsignError ? "callsign-error" : undefined
                  }
                  className={`w-full px-3 py-2 bg-deep-space border rounded-lg
                           text-white placeholder-gray-500 font-mono
                           focus:outline-none focus:border-plasma-orange/50
                           ${callsignError ? "border-alert-red/50" : "border-white/10"}`}
                />
                {callsignError && (
                  <p
                    id="callsign-error"
                    className="mt-1 text-xs text-alert-red"
                  >
                    {callsignError}
                  </p>
                )}
              </div>

              {/* Operator Name */}
              <div>
                <label
                  htmlFor="operator-name"
                  className="block text-sm font-medium text-gray-300 mb-1"
                >
                  Operator Name
                  <span className="ml-1 text-xs text-gray-500 font-normal">
                    (optional)
                  </span>
                </label>
                <input
                  type="text"
                  id="operator-name"
                  value={operatorName}
                  onChange={(e) => {
                    setOperatorName(e.target.value);
                    setProfileDirty(true);
                  }}
                  placeholder="John"
                  className="w-full px-3 py-2 bg-deep-space border border-white/10 rounded-lg
                           text-white placeholder-gray-500
                           focus:outline-none focus:border-plasma-orange/50"
                />
              </div>

              {/* Home Grid Square */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Home Grid Square
                </label>
                <LocationInput
                  value={grid}
                  onChange={(v) => {
                    setGrid(v);
                    setProfileDirty(true);
                  }}
                  error={gridError}
                  onError={setGridError}
                />
              </div>

              {/* Save Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleProfileSave}
                  disabled={!profileDirty}
                  className={`w-full px-4 py-2 rounded-lg text-sm font-medium transition-colors
                             ${
                               profileDirty
                                 ? "bg-plasma-orange/20 border border-plasma-orange/50 text-plasma-orange hover:bg-plasma-orange/30"
                                 : "bg-nebula-blue border border-white/10 text-gray-500 cursor-not-allowed"
                             }`}
                >
                  {profileDirty ? "Save Profile" : "Profile Saved"}
                </button>
              </div>
            </div>
          )}

          {/* Locations Tab */}
          {activeTab === "locations" && <LocationManager />}

          {/* License Tab */}
          {activeTab === "license" && <LicenseSection />}

          {/* Equipment Tab */}
          {activeTab === "equipment" && (
            <div className="space-y-4">
              <RadioManager compact />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowFullRadioManager(true)}
                  className="px-3 py-1.5 text-xs bg-white/5 border border-white/10
                             text-gray-200 rounded-lg hover:bg-white/10 hover:text-white transition-colors"
                >
                  Open full radio manager
                </button>
              </div>
            </div>
          )}

          {/* Preferences Tab */}
          {activeTab === "preferences" && (
            <div className="space-y-6">
              {/* Display Preferences */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
                  Display
                </h3>

                {/* Time Format */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Time Format
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setTimeFormat("24h");
                        setPreferencesDirty(true);
                      }}
                      className={`
                        flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                        ${
                          timeFormat === "24h"
                            ? "bg-plasma-orange/20 text-plasma-orange border border-plasma-orange/50"
                            : "bg-nebula-blue text-gray-300 border border-white/10 hover:border-white/20"
                        }
                      `}
                    >
                      24-hour
                    </button>
                    <button
                      onClick={() => {
                        setTimeFormat("12h");
                        setPreferencesDirty(true);
                      }}
                      className={`
                        flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                        ${
                          timeFormat === "12h"
                            ? "bg-plasma-orange/20 text-plasma-orange border border-plasma-orange/50"
                            : "bg-nebula-blue text-gray-300 border border-white/10 hover:border-white/20"
                        }
                      `}
                    >
                      12-hour
                    </button>
                  </div>
                </div>

                {/* Units */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Distance Units
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setUnits("metric");
                        setPreferencesDirty(true);
                      }}
                      className={`
                        flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                        ${
                          units === "metric"
                            ? "bg-plasma-orange/20 text-plasma-orange border border-plasma-orange/50"
                            : "bg-nebula-blue text-gray-300 border border-white/10 hover:border-white/20"
                        }
                      `}
                    >
                      Metric (km)
                    </button>
                    <button
                      onClick={() => {
                        setUnits("imperial");
                        setPreferencesDirty(true);
                      }}
                      className={`
                        flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                        ${
                          units === "imperial"
                            ? "bg-plasma-orange/20 text-plasma-orange border border-plasma-orange/50"
                            : "bg-nebula-blue text-gray-300 border border-white/10 hover:border-white/20"
                        }
                      `}
                    >
                      Imperial (mi)
                    </button>
                  </div>
                </div>

                {/* Text Size */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Text Size
                    <span className="ml-2 text-xs text-gray-500 font-normal">
                      (Accessibility)
                    </span>
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setTextScale("sm");
                        setPreferencesDirty(true);
                      }}
                      className={`
                        flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                        ${
                          textScale === "sm"
                            ? "bg-plasma-orange/20 text-plasma-orange border border-plasma-orange/50"
                            : "bg-nebula-blue text-gray-300 border border-white/10 hover:border-white/20"
                        }
                      `}
                    >
                      <span className="text-xs">Small</span>
                    </button>
                    <button
                      onClick={() => {
                        setTextScale("md");
                        setPreferencesDirty(true);
                      }}
                      className={`
                        flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                        ${
                          textScale === "md"
                            ? "bg-plasma-orange/20 text-plasma-orange border border-plasma-orange/50"
                            : "bg-nebula-blue text-gray-300 border border-white/10 hover:border-white/20"
                        }
                      `}
                    >
                      Normal
                    </button>
                    <button
                      onClick={() => {
                        setTextScale("lg");
                        setPreferencesDirty(true);
                      }}
                      className={`
                        flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                        ${
                          textScale === "lg"
                            ? "bg-plasma-orange/20 text-plasma-orange border border-plasma-orange/50"
                            : "bg-nebula-blue text-gray-300 border border-white/10 hover:border-white/20"
                        }
                      `}
                    >
                      <span className="text-base">Large</span>
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    Increase text size for better readability. Affects panels
                    and data displays.
                  </p>
                </div>

                {/* Color Vision Mode */}
                <div>
                  <label
                    htmlFor="color-blind-mode"
                    className="block text-sm font-medium text-gray-300 mb-2"
                  >
                    Color Vision Mode
                    <span className="ml-2 text-xs text-gray-500 font-normal">
                      (Accessibility)
                    </span>
                  </label>
                  <select
                    id="color-blind-mode"
                    value={colorBlindMode}
                    onChange={(e) => {
                      const mode = e.target.value as ColorBlindMode;
                      setColorBlindModeLocal(mode);
                      // Apply immediately (no save button needed)
                      setColorBlindMode(mode);
                    }}
                    className="w-full px-3 py-2 bg-deep-space border border-white/10 rounded-lg
                             text-white focus:outline-none focus:border-plasma-orange/50
                             appearance-none cursor-pointer"
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239ca3af'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                      backgroundRepeat: "no-repeat",
                      backgroundPosition: "right 0.75rem center",
                      backgroundSize: "1rem",
                    }}
                  >
                    {(
                      Object.keys(COLOR_BLIND_MODE_NAMES) as ColorBlindMode[]
                    ).map((mode) => (
                      <option key={mode} value={mode}>
                        {COLOR_BLIND_MODE_NAMES[mode]}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-gray-500">
                    {COLOR_BLIND_MODE_DESCRIPTIONS[colorBlindMode]}
                  </p>
                  {colorBlindMode !== "none" && (
                    <div className="mt-3 p-3 bg-white/5 border border-white/10 rounded-lg">
                      <p className="text-xs text-gray-400 mb-2">
                        Status color preview:
                      </p>
                      <div className="flex items-center gap-3 text-xs">
                        <ColorBlindPreviewDot
                          mode={colorBlindMode}
                          status="good"
                          label="Good"
                        />
                        <ColorBlindPreviewDot
                          mode={colorBlindMode}
                          status="fair"
                          label="Fair"
                        />
                        <ColorBlindPreviewDot
                          mode={colorBlindMode}
                          status="poor"
                          label="Poor"
                        />
                        <ColorBlindPreviewDot
                          mode={colorBlindMode}
                          status="closed"
                          label="Closed"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Save Button */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handlePreferencesSave}
                    disabled={!preferencesDirty}
                    className={`w-full px-4 py-2 rounded-lg text-sm font-medium transition-colors
                               ${
                                 preferencesDirty
                                   ? "bg-plasma-orange/20 border border-plasma-orange/50 text-plasma-orange hover:bg-plasma-orange/30"
                                   : "bg-nebula-blue border border-white/10 text-gray-500 cursor-not-allowed"
                               }`}
                  >
                    {preferencesDirty
                      ? "Save Display Preferences"
                      : "Preferences Saved"}
                  </button>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-white/10" />

              {/* Favored Bands */}
              <FavoredBandsPicker />
            </div>
          )}

          {/* Notifications Tab */}
          {activeTab === "notifications" && <NotificationSettings />}

          {/* Backup Tab */}
          {activeTab === "backup" && (
            <div className="space-y-6">
              {/* Export Section */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
                  Export Settings
                </h3>
                <p className="text-sm text-gray-400">
                  Download all your settings as a JSON file. This includes your
                  station profile, preferences, saved targets, watches, pins,
                  and filter settings.
                </p>
                <button
                  type="button"
                  onClick={handleExport}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3
                             bg-plasma-orange/20 border border-plasma-orange/50
                             text-plasma-orange rounded-lg font-medium
                             hover:bg-plasma-orange/30 transition-colors"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  Export Settings Backup
                </button>
              </div>

              {/* Divider */}
              <div className="border-t border-white/10" />

              {/* Import Section */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
                  Import Settings
                </h3>
                <p className="text-sm text-gray-400">
                  Restore settings from a previously exported backup file. This
                  will replace your current settings.
                </p>

                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileSelect}
                  className="hidden"
                  aria-label="Select backup file to import"
                />

                {/* Import button */}
                {!pendingImport && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3
                               bg-nebula-blue border border-white/20
                               text-gray-200 rounded-lg font-medium
                               hover:bg-white/10 hover:border-white/30 transition-colors"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                      />
                    </svg>
                    Select Backup File
                  </button>
                )}

                {/* Pending import confirmation */}
                {pendingImport && (
                  <div className="p-4 bg-deep-space border border-white/10 rounded-lg space-y-4">
                    <div className="flex items-start gap-3">
                      <svg
                        className="w-5 h-5 text-plasma-orange flex-shrink-0 mt-0.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        />
                      </svg>
                      <div>
                        <p className="text-sm font-medium text-white">
                          Ready to import settings
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {getBackupSummary(pendingImport.backup)}
                        </p>
                        <p className="text-xs text-gray-500 mt-2">
                          This will replace your current settings. This action
                          cannot be undone.
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleConfirmImport}
                        disabled={isImporting}
                        className="flex-1 px-3 py-2 bg-plasma-orange/20 border border-plasma-orange/50
                                   text-plasma-orange rounded-lg text-sm font-medium
                                   hover:bg-plasma-orange/30 transition-colors
                                   disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isImporting ? "Importing..." : "Confirm Import"}
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelImport}
                        disabled={isImporting}
                        className="flex-1 px-3 py-2 bg-white/5 border border-white/10
                                   text-gray-300 rounded-lg text-sm font-medium
                                   hover:bg-white/10 transition-colors
                                   disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Status message */}
              {backupStatus && (
                <div
                  className={`p-4 rounded-lg border ${
                    backupStatus.type === "success"
                      ? "bg-signal-green/10 border-signal-green/30 text-signal-green"
                      : backupStatus.type === "error"
                        ? "bg-alert-red/10 border-alert-red/30 text-alert-red"
                        : backupStatus.type === "warning"
                          ? "bg-solar-yellow/10 border-solar-yellow/30 text-solar-yellow"
                          : "bg-white/5 border-white/10 text-gray-300"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {backupStatus.type === "success" && (
                      <svg
                        className="w-5 h-5 flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                    {backupStatus.type === "error" && (
                      <svg
                        className="w-5 h-5 flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    )}
                    {backupStatus.type === "warning" && (
                      <svg
                        className="w-5 h-5 flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        />
                      </svg>
                    )}
                    {backupStatus.type === "info" && (
                      <svg
                        className="w-5 h-5 flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    )}
                    <p className="text-sm">{backupStatus.message}</p>
                  </div>
                </div>
              )}

              {/* Info note */}
              <div className="p-3 bg-white/5 border border-white/10 rounded-lg">
                <p className="text-xs text-gray-500">
                  <strong className="text-gray-400">Note:</strong> Backup files
                  include version information for compatibility. You can safely
                  import backups from older versions of PropulSE.
                </p>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Full Radio Manager Modal */}
      <DetailModal
        isOpen={showFullRadioManager}
        onClose={() => setShowFullRadioManager(false)}
        title="Radio Manager"
        subtitle="Add radios, track firmware/wiring, and manage multiple instances."
        size="full"
        zIndexClassName="z-[500]"
      >
        <RadioManager modalZIndexClassName="z-[550]" />
      </DetailModal>
    </div>
  );
}

/**
 * Preview dot for color blind mode color preview
 */
function ColorBlindPreviewDot({
  mode,
  status,
  label,
}: {
  mode: ColorBlindMode;
  status: StatusType;
  label: string;
}) {
  const color = getColorBlindColor(mode, status);
  const icon = getStatusIcon(mode, status);

  return (
    <div className="flex items-center gap-1.5">
      <div
        className="w-3 h-3 rounded-full flex items-center justify-center text-[8px] font-bold"
        style={{ backgroundColor: color }}
        title={`${label}: ${color}`}
      >
        {icon && <span className="text-white drop-shadow-sm">{icon}</span>}
      </div>
      <span className="text-gray-400" style={{ color }}>
        {label}
      </span>
    </div>
  );
}
