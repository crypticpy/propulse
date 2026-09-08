export function SegmentedButton<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: React.ReactNode }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      className="flex gap-1 p-1 bg-void-black rounded-lg border border-su-line/40"
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            value === opt.value
              ? "bg-plasma-orange text-su-on-accent"
              : "text-su-muted hover:text-su-text"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
