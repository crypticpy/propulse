/**
 * ModeSelector — Grouped dropdown for operating modes.
 *
 * Groups: Phone, CW, Digital, Data
 */

export interface ModeSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

interface ModeGroup {
  label: string;
  modes: string[];
}

const MODE_GROUPS: ModeGroup[] = [
  {
    label: "Phone",
    modes: ["SSB", "FM", "AM"],
  },
  {
    label: "CW",
    modes: ["CW"],
  },
  {
    label: "Digital",
    modes: [
      "FT8",
      "FT4",
      "RTTY",
      "PSK31",
      "JS8",
      "OLIVIA",
      "SSTV",
      "JT65",
      "JT9",
      "MSK144",
      "Q65",
      "FST4",
      "WSPR",
      "FREEDV",
    ],
  },
  {
    label: "Data",
    modes: ["PACKET", "WINLINK", "VARA"],
  },
];

export function ModeSelector({ value, onChange }: ModeSelectorProps) {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(e.target.value);
  };

  return (
    <div className="relative">
      <select
        id="qso-mode"
        aria-label="Operating mode"
        value={value}
        onChange={handleChange}
        className="
          w-full h-12 px-3 pr-8
          bg-white/5 border border-white/10 rounded-lg
          text-white text-base font-mono
          focus:border-plasma-orange/50 focus:ring-1 focus:ring-plasma-orange/30
          focus:outline-none
          transition-colors
          appearance-none cursor-pointer
        "
        style={{ fontSize: "16px" }}
      >
        <option value="" className="bg-deep-space text-gray-400">
          Mode
        </option>
        {MODE_GROUPS.map((group) => (
          <optgroup
            key={group.label}
            label={group.label}
            className="bg-deep-space"
          >
            {group.modes.map((mode) => (
              <option
                key={mode}
                value={mode}
                className="bg-deep-space text-white"
              >
                {mode}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      {/* Custom chevron */}
      <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M2.5 4.5L6 8L9.5 4.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}
