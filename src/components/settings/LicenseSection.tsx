/**
 * LicenseSection Component
 *
 * Allows users to configure their amateur radio license information
 * including country, class, expiration date, and license ID.
 * Displays warnings for expiring or expired licenses.
 */

import { useState, useEffect, useMemo } from "react";
import { useUserStore } from "@/stores/userStore";
import { useLicenseStatus } from "@/hooks/useActiveLocation";
import type { LicenseInfo, LicenseCountry, LicenseClass } from "@/types/user";
import {
  LICENSE_CLASSES_BY_COUNTRY,
  LICENSE_COUNTRY_NAMES,
} from "@/types/user";

interface LicenseSectionProps {
  className?: string;
}

/**
 * Display names for license classes
 */
const LICENSE_CLASS_DISPLAY_NAMES: Record<string, string> = {
  // US Amateur classes
  NOVICE: "Novice",
  TECHNICIAN: "Technician",
  GENERAL: "General",
  ADVANCED: "Advanced",
  EXTRA: "Amateur Extra",
  // Other US radio services
  GMRS: "GMRS",
  MURS: "MURS",
  CB: "CB",
  MARINE: "Marine",
  // UK classes
  FOUNDATION: "Foundation",
  INTERMEDIATE: "Intermediate",
  FULL: "Full",
  // German classes
  KLASSE_A: "Klasse A",
  KLASSE_E: "Klasse E",
  // Canadian classes
  BASIC: "Basic",
  BASIC_HONOURS: "Basic with Honours",
  ADVANCED_CA: "Advanced",
};

/**
 * Get display name for a license class
 */
function getLicenseClassDisplayName(licenseClass: LicenseClass): string {
  return LICENSE_CLASS_DISPLAY_NAMES[licenseClass] || licenseClass;
}

/**
 * LicenseSection - License information configuration
 */
export function LicenseSection({ className = "" }: LicenseSectionProps) {
  const { preferences, setLicense } = useUserStore();
  const licenseStatus = useLicenseStatus();

  // Local form state
  const [country, setCountry] = useState<LicenseCountry>(
    preferences.license?.country ?? "US",
  );
  const [licenseClass, setLicenseClass] = useState<LicenseClass>(
    preferences.license?.class ?? "GENERAL",
  );
  const [expirationDate, setExpirationDate] = useState<string>(
    preferences.license?.expirationDate ?? "",
  );
  const [noExpiration, setNoExpiration] = useState<boolean>(
    preferences.license?.expirationDate === null,
  );
  const [licenseId, setLicenseId] = useState<string>(
    preferences.license?.licenseId ?? "",
  );
  const [isDirty, setIsDirty] = useState(false);

  // Available classes for selected country
  const availableClasses = useMemo(() => {
    return (
      LICENSE_CLASSES_BY_COUNTRY[country] || LICENSE_CLASSES_BY_COUNTRY.OTHER
    );
  }, [country]);

  // Sorted countries for dropdown
  const sortedCountries = useMemo(() => {
    const entries = Object.entries(LICENSE_COUNTRY_NAMES) as [
      LicenseCountry,
      string,
    ][];
    // Put US first, then sort alphabetically by display name
    return entries.sort((a, b) => {
      if (a[0] === "US") return -1;
      if (b[0] === "US") return 1;
      return a[1].localeCompare(b[1]);
    });
  }, []);

  // Reset class when country changes if current class is not available
  useEffect(() => {
    if (!availableClasses.includes(licenseClass)) {
      setLicenseClass(availableClasses[0]);
      setIsDirty(true);
    }
  }, [country, availableClasses, licenseClass]);

  // Handle country change
  const handleCountryChange = (newCountry: LicenseCountry) => {
    setCountry(newCountry);
    setIsDirty(true);
  };

  // Handle class change
  const handleClassChange = (newClass: LicenseClass) => {
    setLicenseClass(newClass);
    setIsDirty(true);
  };

  // Handle expiration date change
  const handleExpirationChange = (value: string) => {
    setExpirationDate(value);
    setIsDirty(true);
  };

  // Handle no expiration toggle
  const handleNoExpirationToggle = () => {
    setNoExpiration(!noExpiration);
    if (!noExpiration) {
      setExpirationDate("");
    }
    setIsDirty(true);
  };

  // Handle license ID change
  const handleLicenseIdChange = (value: string) => {
    setLicenseId(value);
    setIsDirty(true);
  };

  // Save license info
  const handleSave = () => {
    const license: LicenseInfo = {
      country,
      class: licenseClass,
      expirationDate: noExpiration ? null : expirationDate || null,
      licenseId: licenseId.trim() || undefined,
    };
    setLicense(license);
    setIsDirty(false);
  };

  // Clear license
  const handleClear = () => {
    setLicense(null);
    setCountry("US");
    setLicenseClass("GENERAL");
    setExpirationDate("");
    setNoExpiration(false);
    setLicenseId("");
    setIsDirty(false);
  };

  // Sync from store when it changes externally
  useEffect(() => {
    if (!isDirty) {
      setCountry(preferences.license?.country ?? "US");
      setLicenseClass(preferences.license?.class ?? "GENERAL");
      setExpirationDate(preferences.license?.expirationDate ?? "");
      setNoExpiration(preferences.license?.expirationDate === null);
      setLicenseId(preferences.license?.licenseId ?? "");
    }
  }, [preferences.license, isDirty]);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
        License Information
      </h3>

      {/* Warning/Error Banner */}
      {preferences.license && !licenseStatus.isValid && (
        <div className="p-3 bg-alert-red/10 border border-alert-red/30 rounded-lg">
          <div className="flex items-center gap-2">
            <WarningIcon className="w-4 h-4 text-alert-red flex-shrink-0" />
            <span className="text-sm text-alert-red font-medium">
              Your license has expired
            </span>
          </div>
          <p className="mt-1 text-xs text-alert-red/80 ml-6">
            Please renew your license to continue operating.
          </p>
        </div>
      )}

      {preferences.license &&
        licenseStatus.isExpiringSoon &&
        licenseStatus.daysUntilExpiration !== null && (
          <div className="p-3 bg-caution-amber/10 border border-caution-amber/30 rounded-lg">
            <div className="flex items-center gap-2">
              <WarningIcon className="w-4 h-4 text-caution-amber flex-shrink-0" />
              <span className="text-sm text-caution-amber font-medium">
                License expires in {licenseStatus.daysUntilExpiration} day
                {licenseStatus.daysUntilExpiration !== 1 ? "s" : ""}
              </span>
            </div>
            <p className="mt-1 text-xs text-caution-amber/80 ml-6">
              Consider renewing soon to avoid any gaps in your operating
              privileges.
            </p>
          </div>
        )}

      {/* Country Dropdown */}
      <div>
        <label
          htmlFor="license-country"
          className="block text-sm font-medium text-gray-300 mb-1"
        >
          Country
        </label>
        <select
          id="license-country"
          value={country}
          onChange={(e) =>
            handleCountryChange(e.target.value as LicenseCountry)
          }
          className="w-full px-3 py-2 bg-deep-space border border-white/10 rounded-lg
                     text-white focus:outline-none focus:border-plasma-orange/50"
        >
          {sortedCountries.map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {/* License Class Dropdown */}
      <div>
        <label
          htmlFor="license-class"
          className="block text-sm font-medium text-gray-300 mb-1"
        >
          Class
        </label>
        <select
          id="license-class"
          value={licenseClass}
          onChange={(e) => handleClassChange(e.target.value as LicenseClass)}
          className="w-full px-3 py-2 bg-deep-space border border-white/10 rounded-lg
                     text-white focus:outline-none focus:border-plasma-orange/50"
        >
          {availableClasses.map((cls) => (
            <option key={cls} value={cls}>
              {getLicenseClassDisplayName(cls)}
            </option>
          ))}
        </select>
      </div>

      {/* Expiration Date */}
      <div>
        <label
          htmlFor="license-expiration"
          className="block text-sm font-medium text-gray-300 mb-1"
        >
          Expiration Date
        </label>
        <div className="flex gap-3 items-center">
          <input
            type="date"
            id="license-expiration"
            value={noExpiration ? "" : expirationDate}
            onChange={(e) => handleExpirationChange(e.target.value)}
            disabled={noExpiration}
            className={`flex-1 px-3 py-2 bg-deep-space border border-white/10 rounded-lg
                       text-white focus:outline-none focus:border-plasma-orange/50
                       ${noExpiration ? "opacity-50 cursor-not-allowed" : ""}`}
          />
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={noExpiration}
              onChange={handleNoExpirationToggle}
              className="accent-plasma-orange w-4 h-4"
            />
            <span className="whitespace-nowrap">No expiration</span>
          </label>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Some licenses (e.g., CB) do not expire.
        </p>
      </div>

      {/* License ID (FRN, etc.) */}
      <div>
        <label
          htmlFor="license-id"
          className="block text-sm font-medium text-gray-300 mb-1"
        >
          License ID
          <span className="ml-1 text-xs text-gray-500 font-normal">
            (optional)
          </span>
        </label>
        <input
          type="text"
          id="license-id"
          value={licenseId}
          onChange={(e) => handleLicenseIdChange(e.target.value)}
          placeholder="FRN, license number, etc."
          className="w-full px-3 py-2 bg-deep-space border border-white/10 rounded-lg
                     text-white placeholder-gray-500 font-mono
                     focus:outline-none focus:border-plasma-orange/50"
        />
        <p className="mt-1 text-xs text-gray-500">
          For US licenses, this is typically your FRN (FCC Registration Number).
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 pt-2">
        {preferences.license && (
          <button
            type="button"
            onClick={handleClear}
            className="px-3 py-2 text-sm bg-nebula-blue border border-white/10 rounded-lg
                       text-gray-300 hover:text-white hover:border-white/20
                       transition-colors"
          >
            Clear
          </button>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={!isDirty}
          className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors
                     ${
                       isDirty
                         ? "bg-plasma-orange/20 border border-plasma-orange/50 text-plasma-orange hover:bg-plasma-orange/30"
                         : "bg-nebula-blue border border-white/10 text-gray-500 cursor-not-allowed"
                     }`}
        >
          {isDirty ? "Save License Info" : "Saved"}
        </button>
      </div>
    </div>
  );
}

/**
 * Warning icon component
 */
function WarningIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  );
}
