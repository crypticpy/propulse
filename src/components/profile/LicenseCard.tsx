/**
 * LicenseCard -- Enhanced license display card for the profile page.
 *
 * Shows colored class badge, country name, callsign, expiration bar, and grid square.
 * Uses data from profileStore.
 */

import { useState } from "react";
import { useProfileStore } from "@/stores/profileStore";
import { LICENSE_COUNTRY_NAMES } from "@/types/user";
import type { LicenseClass } from "@/types/user";
import { LicenseExpirationBar } from "./LicenseExpirationBar";
import { LicenseHistory } from "./LicenseHistory";
import { PrivilegeMatrix } from "./PrivilegeMatrix";

/**
 * Map license class to a Tailwind badge color
 */
function getClassBadgeColor(licenseClass: LicenseClass): string {
  const upper = licenseClass.toUpperCase();
  switch (upper) {
    case "EXTRA":
      return "bg-signal-green/20 text-signal-green border-signal-green/30";
    case "GENERAL":
    case "ADVANCED":
    case "ADVANCED_CA":
      return "bg-plasma-orange/20 text-plasma-orange border-plasma-orange/30";
    case "TECHNICIAN":
    case "INTERMEDIATE":
    case "BASIC":
    case "BASIC_HONOURS":
      return "bg-caution-amber/20 text-caution-amber border-caution-amber/30";
    case "NOVICE":
    case "FOUNDATION":
      return "bg-nebula-blue/20 text-nebula-blue border-nebula-blue/30";
    default:
      return "bg-white/10 text-gray-300 border-white/20";
  }
}

/**
 * Display names for license classes
 */
const LICENSE_CLASS_DISPLAY: Record<string, string> = {
  NOVICE: "Novice",
  TECHNICIAN: "Technician",
  GENERAL: "General",
  ADVANCED: "Advanced",
  EXTRA: "Amateur Extra",
  GMRS: "GMRS",
  MURS: "MURS",
  CB: "CB",
  MARINE: "Marine",
  FOUNDATION: "Foundation",
  INTERMEDIATE: "Intermediate",
  FULL: "Full",
  KLASSE_A: "Klasse A",
  KLASSE_E: "Klasse E",
  BASIC: "Basic",
  BASIC_HONOURS: "Basic w/ Honours",
  ADVANCED_CA: "Advanced",
};

function getDisplayName(licenseClass: LicenseClass): string {
  return LICENSE_CLASS_DISPLAY[licenseClass] || licenseClass;
}

/**
 * Chevron icon that rotates when the section is open
 */
function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

/**
 * Collapsible disclosure section
 */
function Disclosure({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-white/5 pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between w-full text-left group rounded focus-visible:ring-2 focus-visible:ring-plasma-orange/50 focus-visible:outline-none"
      >
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wider group-hover:text-gray-300 transition-colors">
          {title}
        </span>
        <ChevronIcon open={open} />
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

export function LicenseCard() {
  const license = useProfileStore((s) => s.license);
  const station = useProfileStore((s) => s.station);

  if (!license) {
    return (
      <div className="text-sm text-gray-500 italic">
        No license information configured.
      </div>
    );
  }

  const badgeColor = getClassBadgeColor(license.class);
  const displayName = getDisplayName(license.class);
  const countryName = LICENSE_COUNTRY_NAMES[license.country] ?? license.country;
  const displayCallsign = station?.callsign || "NO CALL";
  const displayGrid = station?.grid || "----";

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
        License
      </h3>

      {/* Class badge + Country */}
      <div className="flex items-center gap-2">
        <span
          className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badgeColor}`}
        >
          {displayName}
        </span>
        <span className="text-xs text-gray-400">{countryName}</span>
      </div>

      {/* Callsign large */}
      <div className="font-mono text-xl font-bold text-plasma-orange">
        {displayCallsign}
      </div>

      {/* Grid */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-gray-500">Grid</span>
        <span className="font-mono text-gray-300">{displayGrid}</span>
      </div>

      {/* Expiration bar */}
      <LicenseExpirationBar expirationDate={license.expirationDate} />

      {/* License ID if present */}
      {license.licenseId && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-500">ID</span>
          <span className="font-mono text-gray-400">{license.licenseId}</span>
        </div>
      )}

      {/* Collapsible: Upgrade History */}
      <Disclosure title="Upgrade History">
        <LicenseHistory />
      </Disclosure>

      {/* Collapsible: Band Privileges */}
      <Disclosure title="Band Privileges">
        <PrivilegeMatrix />
      </Disclosure>
    </div>
  );
}
