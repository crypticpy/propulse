import { ensureHamClockThemeFont } from "@/lib/hamclock/themeFonts";
import {
  HAMCLOCK_THEMES,
  useHamClockDisplayStore,
  type HamClockTheme,
} from "@/stores/hamclockDisplayStore";

interface ThemeCard {
  name: string;
  /** One plain-language line; the reader is choosing a look, not a token. */
  note: string;
}

const THEME_CARDS: Record<HamClockTheme, ThemeCard> = {
  pulse: { name: "Pulse", note: "Bright neon on deep blue, with glow." },
  classic: { name: "Classic", note: "Serif type, warm white on black." },
  brass: { name: "Brass", note: "Navy and brass, engraved plates." },
};

/**
 * Theme chooser with a live miniature of each theme.
 *
 * Each preview carries its own `data-hamclock-theme`, so it paints from that
 * theme's real tokens rather than a hand-copied swatch. Hover or focus warms
 * the theme's web font so the preview tells the truth by the time it is
 * chosen, while an operator who never opens this panel downloads nothing.
 */
export function HamClockThemePicker() {
  const theme = useHamClockDisplayStore((s) => s.theme);
  const setTheme = useHamClockDisplayStore((s) => s.setTheme);

  return (
    <fieldset className="mb-3">
      <legend className="mb-2">Theme</legend>
      <div className="grid grid-cols-3 gap-2">
        {HAMCLOCK_THEMES.map((value) => {
          const card = THEME_CARDS[value];
          const selected = theme === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={selected}
              aria-label={`${card.name} theme — ${card.note}`}
              title={card.note}
              onPointerEnter={() => ensureHamClockThemeFont(value)}
              onFocus={() => ensureHamClockThemeFont(value)}
              onClick={() => {
                ensureHamClockThemeFont(value);
                setTheme(value);
              }}
              className={`rounded-lg border p-1 transition-colors ${
                selected
                  ? "border-plasma-orange bg-plasma-orange/10"
                  : "border-white/15 hover:border-white/40"
              }`}
            >
              <span data-hamclock-theme={value} className="hc-swatch">
                <span className="hc-swatch-title">Best band</span>
                <span className="hc-swatch-hero">20M</span>
                <span className="hc-swatch-sub">
                  GOOD · <b>SFI 148</b>
                </span>
              </span>
              <span className="mt-1 block text-center text-xs">
                {card.name}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-gray-400">{THEME_CARDS[theme].note}</p>
    </fieldset>
  );
}
