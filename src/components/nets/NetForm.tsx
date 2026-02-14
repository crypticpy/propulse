/**
 * NetForm -- Controlled form for creating/editing a net listing.
 *
 * Fields: name, type, frequency, mode, band, schedule, region, description,
 * repeater info, preamble template, tags, visibility, website URL.
 * Matches the dark-theme input styling used throughout Propulse.
 */

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import type {
  CreateNetInput,
  NetType,
  NetVisibility,
  NetSchedule,
  RepeaterInfo,
} from "@/types/net";
import { NET_TYPE_LABELS, FORMALITY_LABELS } from "@/types/net";
import { WORLD_COUNTRIES } from "@/lib/data/worldCountries.generated";
import { US_STATES } from "@/lib/data/usStates.generated";

// ── Props ────────────────────────────────────────────────────────────────────

interface NetFormProps {
  initialValues?: Partial<CreateNetInput>;
  onSubmit: (data: CreateNetInput) => Promise<void>;
  isSubmitting?: boolean;
}

// ── Constants ────────────────────────────────────────────────────────────────

const MODE_OPTIONS = ["SSB", "FM", "CW", "FT8", "RTTY", "Digital", "AM"];

const SCHEDULE_PATTERNS: Array<{
  value: NetSchedule["pattern"];
  label: string;
}> = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "monthly", label: "Monthly" },
  { value: "daily", label: "Daily" },
  { value: "adhoc", label: "Ad-hoc" },
];

const DAYS_OF_WEEK = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const VISIBILITY_OPTIONS: Array<{
  value: NetVisibility;
  label: string;
  description: string;
}> = [
  {
    value: "public",
    label: "Public",
    description: "Anyone can discover and subscribe",
  },
  {
    value: "unlisted",
    label: "Unlisted",
    description: "Only accessible via direct link",
  },
  {
    value: "private",
    label: "Private",
    description: "Invite-only, hidden from directory",
  },
];

// ── Frequency-to-Band Helper ─────────────────────────────────────────────────

function detectBandFromFrequency(freq: string): string {
  const mhz = parseFloat(freq.replace(/[^0-9.]/g, ""));
  if (isNaN(mhz)) return "";
  if (mhz >= 1.8 && mhz <= 2.0) return "160m";
  if (mhz >= 3.5 && mhz <= 4.0) return "80m";
  if (mhz >= 5.3 && mhz <= 5.4) return "60m";
  if (mhz >= 7.0 && mhz <= 7.3) return "40m";
  if (mhz >= 10.1 && mhz <= 10.15) return "30m";
  if (mhz >= 14.0 && mhz <= 14.35) return "20m";
  if (mhz >= 18.068 && mhz <= 18.168) return "17m";
  if (mhz >= 21.0 && mhz <= 21.45) return "15m";
  if (mhz >= 24.89 && mhz <= 24.99) return "12m";
  if (mhz >= 28.0 && mhz <= 29.7) return "10m";
  if (mhz >= 50.0 && mhz <= 54.0) return "6m";
  if (mhz >= 144.0 && mhz <= 148.0) return "2m";
  if (mhz >= 420.0 && mhz <= 450.0) return "70cm";
  if (mhz >= 902.0 && mhz <= 928.0) return "33cm";
  if (mhz >= 1240.0 && mhz <= 1300.0) return "23cm";
  return "";
}

// ── URL Validation ──────────────────────────────────────────────────────────

function isValidUrl(str: string): boolean {
  if (!str) return true; // empty is ok (optional field)
  try {
    const url = new URL(str);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

// ── Shared Input Class ───────────────────────────────────────────────────────

const inputClass =
  "w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-plasma-orange/50 focus:border-plasma-orange/30 transition-colors";

const labelClass = "block text-xs font-medium text-gray-400 mb-1";

// ── Country Combobox Data ────────────────────────────────────────────────────

/** Lightweight options — only name + iso, skip heavy border polygons */
const COUNTRY_OPTIONS = WORLD_COUNTRIES.filter(
  (c) => c.iso && c.iso !== "undefined",
)
  .map((c) => ({
    name: c.name,
    iso: c.iso,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

// ── Country Combobox Component ──────────────────────────────────────────────

function CountryCombobox({
  value,
  onChange,
}: {
  value: string;
  onChange: (iso: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedName = COUNTRY_OPTIONS.find((c) => c.iso === value)?.name ?? "";
  const filtered = search
    ? COUNTRY_OPTIONS.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase()),
      ).slice(0, 10)
    : COUNTRY_OPTIONS.slice(0, 10);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    function handleMouseDown(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsOpen(false);
        setSearch("");
        inputRef.current?.blur();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  return (
    <div className="relative" ref={containerRef}>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={isOpen ? search : selectedName}
          onChange={(e) => {
            setSearch(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            setIsOpen(true);
            setSearch("");
          }}
          placeholder="Search countries..."
          className={inputClass}
          role="combobox"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
        />
        {value && (
          <button
            type="button"
            onClick={() => {
              onChange("");
              setSearch("");
            }}
            className="shrink-0 p-1 text-gray-400 hover:text-white"
            aria-label="Clear country"
          >
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>
      {isOpen && (
        <ul
          className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto bg-deep-space border border-white/15 rounded-lg shadow-xl"
          role="listbox"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-500">
              No countries found
            </li>
          ) : (
            filtered.map((c) => (
              <li key={c.iso}>
                <button
                  type="button"
                  role="option"
                  aria-selected={c.iso === value}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                    c.iso === value
                      ? "bg-plasma-orange/15 text-plasma-orange"
                      : "text-gray-300 hover:bg-white/10"
                  }`}
                  onClick={() => {
                    onChange(c.iso);
                    setSearch("");
                    setIsOpen(false);
                  }}
                >
                  {c.name}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export function NetForm({
  initialValues,
  onSubmit,
  isSubmitting,
}: NetFormProps) {
  // ── Field State ──────────────────────────────────────────────────────────

  const [name, setName] = useState(initialValues?.name ?? "");
  const [type, setType] = useState<NetType>(initialValues?.type ?? "ragchew");
  const [frequency, setFrequency] = useState(initialValues?.frequency ?? "");
  const [mode, setMode] = useState(initialValues?.mode ?? "SSB");
  const [band, setBand] = useState(initialValues?.band ?? "");
  const [description, setDescription] = useState(
    initialValues?.description ?? "",
  );
  const [summary, setSummary] = useState(initialValues?.summary ?? "");
  const [country, setCountry] = useState(initialValues?.country ?? "");
  const [stateOrProvince, setStateOrProvince] = useState(
    initialValues?.stateOrProvince ?? "",
  );
  const [region, setRegion] = useState(initialValues?.region ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(initialValues?.websiteUrl ?? "");
  const [visibility, setVisibility] = useState<NetVisibility>(
    initialValues?.visibility ?? "public",
  );
  const [tagsInput, setTagsInput] = useState(
    (initialValues?.tags ?? []).join(", "),
  );
  const [preambleTemplate, setPreambleTemplate] = useState(
    initialValues?.preambleTemplate ?? "",
  );

  // Schedule
  const [showSchedule, setShowSchedule] = useState(!!initialValues?.schedule);
  const [schedulePattern, setSchedulePattern] = useState<
    NetSchedule["pattern"]
  >(initialValues?.schedule?.pattern ?? "weekly");
  const [scheduleDayOfWeek, setScheduleDayOfWeek] = useState<number>(
    initialValues?.schedule?.dayOfWeek ?? 0,
  );
  const [scheduleTimeUtc, setScheduleTimeUtc] = useState(
    initialValues?.schedule?.timeUtc ?? "",
  );
  const [durationMinutes, setDurationMinutes] = useState<number | "">(
    initialValues?.durationMinutes ?? "",
  );

  // Repeater
  const [showRepeater, setShowRepeater] = useState(
    !!initialValues?.repeaterInfo,
  );
  const [repeaterCallsign, setRepeaterCallsign] = useState(
    initialValues?.repeaterInfo?.callsign ?? "",
  );
  const [repeaterOffset, setRepeaterOffset] = useState(
    initialValues?.repeaterInfo?.offset ?? "",
  );
  const [repeaterTone, setRepeaterTone] = useState(
    initialValues?.repeaterInfo?.tone ?? "",
  );

  // Preamble
  const [showPreamble, setShowPreamble] = useState(
    !!initialValues?.preambleTemplate,
  );

  // Discovery & Newcomer Info
  const [showDiscovery, setShowDiscovery] = useState(
    !!(
      initialValues?.formalityLevel ||
      initialValues?.protocolNotes ||
      initialValues?.newcomerFriendly
    ),
  );
  const [formalityLevel, setFormalityLevel] = useState<number>(
    initialValues?.formalityLevel ?? 3,
  );
  const [protocolNotes, setProtocolNotes] = useState(
    initialValues?.protocolNotes ?? "",
  );
  const [newcomerFriendly, setNewcomerFriendly] = useState(
    initialValues?.newcomerFriendly ?? false,
  );

  // VoIP Access
  const [showVoip, setShowVoip] = useState(
    !!(
      initialValues?.echolinkNode ||
      initialValues?.allstarNode ||
      initialValues?.irlpNode
    ),
  );
  const [echolinkNode, setEcholinkNode] = useState(
    initialValues?.echolinkNode ?? "",
  );
  const [allstarNode, setAllstarNode] = useState(
    initialValues?.allstarNode ?? "",
  );
  const [irlpNode, setIrlpNode] = useState(initialValues?.irlpNode ?? "");

  // Validation
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ── Auto-detect band from frequency ────────────────────────────────────

  const handleFrequencyChange = useCallback((value: string) => {
    setFrequency(value);
    const detected = detectBandFromFrequency(value);
    if (detected) setBand(detected);
  }, []);

  // ── Tags as array ──────────────────────────────────────────────────────

  const tags = useMemo(
    () =>
      tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    [tagsInput],
  );

  // ── Submit Handler ─────────────────────────────────────────────────────

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      // Validate
      const newErrors: Record<string, string> = {};
      if (!name.trim()) newErrors.name = "Net name is required";
      if (!frequency.trim()) newErrors.frequency = "Frequency is required";
      if (websiteUrl.trim() && !isValidUrl(websiteUrl.trim()))
        newErrors.websiteUrl = "URL must start with http:// or https://";
      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        return;
      }
      setErrors({});

      // Build schedule
      let schedule: NetSchedule | undefined;
      if (showSchedule && scheduleTimeUtc.trim()) {
        schedule = {
          pattern: schedulePattern,
          timeUtc: scheduleTimeUtc.trim(),
        };
        if (
          (schedulePattern === "weekly" || schedulePattern === "biweekly") &&
          scheduleDayOfWeek !== undefined
        ) {
          schedule.dayOfWeek = scheduleDayOfWeek;
        }
      }

      // Build repeater info
      let repeaterInfo: RepeaterInfo | undefined;
      if (showRepeater && repeaterCallsign.trim()) {
        repeaterInfo = {
          callsign: repeaterCallsign.trim().toUpperCase(),
          offset: repeaterOffset.trim(),
          tone: repeaterTone.trim(),
        };
      }

      const data: CreateNetInput = {
        name: name.trim(),
        type,
        summary: summary.trim() || undefined,
        frequency: frequency.trim(),
        mode,
        band: band.trim() || detectBandFromFrequency(frequency) || "Unknown",
        description: description.trim() || undefined,
        country: country || undefined,
        stateOrProvince: stateOrProvince || undefined,
        region: region.trim() || undefined,
        schedule,
        durationMinutes:
          typeof durationMinutes === "number" ? durationMinutes : undefined,
        repeaterInfo,
        preambleTemplate:
          showPreamble && preambleTemplate.trim()
            ? preambleTemplate.trim()
            : undefined,
        tags: tags.length > 0 ? tags : undefined,
        visibility,
        websiteUrl: websiteUrl.trim() || undefined,
        formalityLevel,
        protocolNotes: protocolNotes.trim() || undefined,
        newcomerFriendly,
        echolinkNode: echolinkNode.trim() || undefined,
        allstarNode: allstarNode.trim() || undefined,
        irlpNode: irlpNode.trim() || undefined,
      };

      await onSubmit(data);
    },
    [
      name,
      type,
      summary,
      frequency,
      mode,
      band,
      description,
      country,
      stateOrProvince,
      region,
      showSchedule,
      schedulePattern,
      scheduleDayOfWeek,
      scheduleTimeUtc,
      durationMinutes,
      showRepeater,
      repeaterCallsign,
      repeaterOffset,
      repeaterTone,
      showPreamble,
      preambleTemplate,
      tags,
      visibility,
      websiteUrl,
      formalityLevel,
      protocolNotes,
      newcomerFriendly,
      echolinkNode,
      allstarNode,
      irlpNode,
      onSubmit,
    ],
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* ── Name ──────────────────────────────────────────────────────────── */}
      <div>
        <label className={labelClass}>
          Net Name <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setErrors((prev) => ({ ...prev, name: "" }));
          }}
          placeholder="e.g. Tri-State Evening Net"
          className={inputClass}
        />
        {errors.name && (
          <p className="mt-1 text-xs text-red-400">{errors.name}</p>
        )}
      </div>

      {/* ── Summary ────────────────────────────────────────────────────────── */}
      <div>
        <label className={labelClass}>
          Summary <span className="text-gray-500 font-normal">(optional)</span>
        </label>
        <input
          type="text"
          value={summary}
          onChange={(e) => setSummary(e.target.value.slice(0, 140))}
          placeholder="Brief one-liner for the directory card"
          maxLength={140}
          className={inputClass}
        />
        <p className="text-right text-xs text-gray-500 mt-0.5 tabular-nums">
          {summary.length}/140
        </p>
      </div>

      {/* ── Type ──────────────────────────────────────────────────────────── */}
      <div>
        <label className={labelClass}>Type</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as NetType)}
          className={inputClass}
        >
          {(Object.entries(NET_TYPE_LABELS) as [NetType, string][]).map(
            ([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ),
          )}
        </select>
      </div>

      {/* ── Frequency + Mode + Band ───────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={labelClass}>
            Frequency <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={frequency}
            onChange={(e) => {
              handleFrequencyChange(e.target.value);
              setErrors((prev) => ({ ...prev, frequency: "" }));
            }}
            placeholder="14.260 MHz"
            className={inputClass}
          />
          {errors.frequency && (
            <p className="mt-1 text-xs text-red-400">{errors.frequency}</p>
          )}
        </div>

        <div>
          <label className={labelClass}>Mode</label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            className={inputClass}
          >
            {MODE_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>Band</label>
          <input
            type="text"
            value={band}
            onChange={(e) => setBand(e.target.value)}
            placeholder="Auto-detect or manual"
            className={inputClass}
          />
        </div>
      </div>

      {/* ── Schedule (collapsible) ────────────────────────────────────────── */}
      <div>
        <button
          type="button"
          onClick={() => setShowSchedule((v) => !v)}
          className="flex items-center gap-2 text-xs font-medium text-gray-400 hover:text-gray-300 transition-colors"
        >
          <svg
            className={`w-3.5 h-3.5 transition-transform ${showSchedule ? "rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
          Schedule
        </button>

        {showSchedule && (
          <div className="mt-3 space-y-3 pl-5 border-l border-white/5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Pattern</label>
                <select
                  value={schedulePattern}
                  onChange={(e) =>
                    setSchedulePattern(e.target.value as NetSchedule["pattern"])
                  }
                  className={inputClass}
                >
                  {SCHEDULE_PATTERNS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              {(schedulePattern === "weekly" ||
                schedulePattern === "biweekly") && (
                <div>
                  <label className={labelClass}>Day of Week</label>
                  <select
                    value={scheduleDayOfWeek}
                    onChange={(e) =>
                      setScheduleDayOfWeek(Number(e.target.value))
                    }
                    className={inputClass}
                  >
                    {DAYS_OF_WEEK.map((d, i) => (
                      <option key={i} value={i}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Time UTC</label>
                <input
                  type="text"
                  value={scheduleTimeUtc}
                  onChange={(e) => setScheduleTimeUtc(e.target.value)}
                  placeholder="01:00"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Duration (min)</label>
                <input
                  type="number"
                  value={durationMinutes}
                  onChange={(e) =>
                    setDurationMinutes(
                      e.target.value ? Number(e.target.value) : "",
                    )
                  }
                  placeholder="60"
                  min={1}
                  className={inputClass}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Location ──────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div>
          <label className={labelClass}>Country</label>
          <CountryCombobox
            value={country}
            onChange={(iso) => {
              setCountry(iso);
              // Clear state if country changes to non-US
              if (iso !== "US") setStateOrProvince("");
            }}
          />
        </div>

        {country === "US" && (
          <div>
            <label className={labelClass}>State</label>
            <select
              value={stateOrProvince}
              onChange={(e) => setStateOrProvince(e.target.value)}
              className={inputClass}
            >
              <option value="">Select state...</option>
              {US_STATES.map((s) => (
                <option key={s.fips} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className={labelClass}>
            Region / Area{" "}
            <span className="text-gray-500 font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            placeholder="e.g. San Francisco Bay Area, Greater London"
            className={inputClass}
          />
        </div>
      </div>

      {/* ── Description ───────────────────────────────────────────────────── */}
      <div>
        <label className={labelClass}>Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the net's purpose, rules, or history..."
          rows={3}
          className={`${inputClass} resize-none`}
        />
      </div>

      {/* ── Discovery & Newcomer Info (collapsible) ────────────────────────── */}
      <div>
        <button
          type="button"
          onClick={() => setShowDiscovery((v) => !v)}
          className="flex items-center gap-2 text-xs font-medium text-gray-400 hover:text-gray-300 transition-colors"
        >
          <svg
            className={`w-3.5 h-3.5 transition-transform ${showDiscovery ? "rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
          Discovery & Newcomer Info
        </button>

        {showDiscovery && (
          <div className="mt-3 space-y-4 pl-5 border-l border-white/5">
            {/* Formality Level */}
            <div>
              <label className={labelClass}>
                Formality Level —{" "}
                <span className="text-gray-300">
                  {FORMALITY_LABELS[formalityLevel] ?? "Moderate"}
                </span>
              </label>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={formalityLevel}
                onChange={(e) => setFormalityLevel(Number(e.target.value))}
                className="w-full accent-plasma-orange"
              />
              <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                <span>Casual</span>
                <span>Formal</span>
              </div>
            </div>

            {/* Protocol Notes */}
            <div>
              <label className={labelClass}>Protocol Notes</label>
              <textarea
                value={protocolNotes}
                onChange={(e) => setProtocolNotes(e.target.value)}
                placeholder="What should newcomers expect when checking into this net?"
                rows={3}
                className={`${inputClass} resize-none`}
              />
            </div>

            {/* Newcomer Friendly */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={newcomerFriendly}
                onChange={(e) => setNewcomerFriendly(e.target.checked)}
                className="w-4 h-4 rounded accent-plasma-orange"
              />
              <div>
                <span className="text-sm text-gray-200">Newcomer Friendly</span>
                <p className="text-[11px] text-gray-500">
                  This net welcomes first-time check-ins
                </p>
              </div>
            </label>
          </div>
        )}
      </div>

      {/* ── Repeater Info (collapsible) ───────────────────────────────────── */}
      <div>
        <button
          type="button"
          onClick={() => setShowRepeater((v) => !v)}
          className="flex items-center gap-2 text-xs font-medium text-gray-400 hover:text-gray-300 transition-colors"
        >
          <svg
            className={`w-3.5 h-3.5 transition-transform ${showRepeater ? "rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
          Repeater Info
        </button>

        {showRepeater && (
          <div className="mt-3 grid grid-cols-3 gap-3 pl-5 border-l border-white/5">
            <div>
              <label className={labelClass}>Callsign</label>
              <input
                type="text"
                value={repeaterCallsign}
                onChange={(e) =>
                  setRepeaterCallsign(e.target.value.toUpperCase())
                }
                placeholder="W1AW"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Offset</label>
              <input
                type="text"
                value={repeaterOffset}
                onChange={(e) => setRepeaterOffset(e.target.value)}
                placeholder="+0.6 MHz"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Tone</label>
              <input
                type="text"
                value={repeaterTone}
                onChange={(e) => setRepeaterTone(e.target.value)}
                placeholder="100.0 Hz"
                className={inputClass}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── VoIP Access (collapsible) ──────────────────────────────────────── */}
      <div>
        <button
          type="button"
          onClick={() => setShowVoip((v) => !v)}
          className="flex items-center gap-2 text-xs font-medium text-gray-400 hover:text-gray-300 transition-colors"
        >
          <svg
            className={`w-3.5 h-3.5 transition-transform ${showVoip ? "rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
          VoIP Access
        </button>

        {showVoip && (
          <div className="mt-3 grid grid-cols-3 gap-3 pl-5 border-l border-white/5">
            <div>
              <label className={labelClass}>EchoLink Node</label>
              <input
                type="text"
                value={echolinkNode}
                onChange={(e) => setEcholinkNode(e.target.value)}
                placeholder="e.g. 9999"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>AllStar Node</label>
              <input
                type="text"
                value={allstarNode}
                onChange={(e) => setAllstarNode(e.target.value)}
                placeholder="e.g. 12345"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>IRLP Node</label>
              <input
                type="text"
                value={irlpNode}
                onChange={(e) => setIrlpNode(e.target.value)}
                placeholder="e.g. 9100"
                className={inputClass}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Preamble Template (collapsible) ───────────────────────────────── */}
      <div>
        <button
          type="button"
          onClick={() => setShowPreamble((v) => !v)}
          className="flex items-center gap-2 text-xs font-medium text-gray-400 hover:text-gray-300 transition-colors"
        >
          <svg
            className={`w-3.5 h-3.5 transition-transform ${showPreamble ? "rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
          Preamble Template
        </button>

        {showPreamble && (
          <div className="mt-3 pl-5 border-l border-white/5">
            <textarea
              value={preambleTemplate}
              onChange={(e) => setPreambleTemplate(e.target.value)}
              placeholder="Enter your net preamble script here..."
              rows={4}
              className={`${inputClass} resize-none`}
            />
          </div>
        )}
      </div>

      {/* ── Tags ──────────────────────────────────────────────────────────── */}
      <div>
        <label className={labelClass}>Tags</label>
        <input
          type="text"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="emergency, ares, local (comma-separated)"
          className={inputClass}
        />
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-white/10 text-gray-300 border border-white/5"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Visibility ────────────────────────────────────────────────────── */}
      <div>
        <label className={labelClass}>Visibility</label>
        <div className="space-y-2 mt-1">
          {VISIBILITY_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                visibility === opt.value
                  ? "bg-plasma-orange/5 border-plasma-orange/30"
                  : "bg-white/[0.02] border-white/5 hover:border-white/10"
              }`}
            >
              <input
                type="radio"
                name="visibility"
                value={opt.value}
                checked={visibility === opt.value}
                onChange={(e) => setVisibility(e.target.value as NetVisibility)}
                className="mt-0.5 accent-plasma-orange"
              />
              <div>
                <span className="text-sm font-medium text-white">
                  {opt.label}
                </span>
                <p className="text-[11px] text-gray-500">{opt.description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* ── Website URL ───────────────────────────────────────────────────── */}
      <div>
        <label className={labelClass}>Website URL</label>
        <input
          type="url"
          value={websiteUrl}
          onChange={(e) => {
            setWebsiteUrl(e.target.value);
            setErrors((prev) => ({ ...prev, websiteUrl: "" }));
          }}
          placeholder="https://..."
          className={inputClass}
        />
        {errors.websiteUrl && (
          <p className="mt-1 text-xs text-red-400">{errors.websiteUrl}</p>
        )}
      </div>

      {/* ── Submit ────────────────────────────────────────────────────────── */}
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full py-3 text-sm font-semibold rounded-xl bg-plasma-orange text-white shadow-lg shadow-plasma-orange/20 hover:bg-plasma-orange/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSubmitting ? "Saving..." : "Create Net"}
      </button>
    </form>
  );
}
