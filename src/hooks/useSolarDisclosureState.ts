import { useState } from "react";
import type { SolarSourceGroup } from "@/lib/solar/sourcePolicies";

type Section = Exclude<SolarSourceGroup, "now"> | "imagery";
type Preferences = Record<"mobile" | "desktop", Section[]>;
const key = "propulse-solar-sections-v1";
const sections: Section[] = ["forecast", "impacts", "details", "imagery"];
function read(): Preferences {
  const defaults: Preferences = { mobile: [], desktop: ["forecast", "impacts"] };
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null");
    if (!value || typeof value !== "object") return defaults;
    for (const device of ["mobile", "desktop"] as const) {
      if (Array.isArray(value[device])) defaults[device] = value[device].filter((section: unknown): section is Section => typeof section === "string" && sections.includes(section as Section));
    }
  } catch { /* Restricted storage uses in-memory disclosure preferences. */ }
  return defaults;
}
export function useSolarDisclosureState(isMobile: boolean) {
  const [preferences, setPreferences] = useState(read);
  const device = isMobile ? "mobile" : "desktop";
  const open = preferences[device];
  const toggle = (section: Section) => setPreferences((previous) => {
    const active = previous[device];
    const next = { ...previous, [device]: active.includes(section) ? active.filter((s) => s !== section) : [...active, section] };
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* Memory state still works. */ }
    return next;
  });
  return { open, toggle };
}
