import { ensureHamClockThemeFont } from "@/lib/hamclock/themeFonts";
import {
  HAMCLOCK_THEMES,
  useHamClockDisplayStore,
  type HamClockTheme,
} from "@/stores/hamclockDisplayStore";
import { HamClockSegmented } from "../controls";

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
 * Theme chooser, moved here from the old header popout
 * (`HamClockThemePicker`, deleted by this batch), and now built on
 * `HamClockSegmented` rather than a hand-rolled radiogroup, so it gets roving
 * tabindex and arrow-key selection for free. Each option's `preview` carries
 * a live miniature of its own theme — painted from that theme's real tokens
 * via its own `data-hamclock-theme`, not a hand-copied swatch — so a reader
 * sees the truth before choosing. Nothing reacts to hover; the theme's web
 * font is only warmed on selection.
 */
export function ThemeTab() {
  const theme = useHamClockDisplayStore((s) => s.theme);
  const setTheme = useHamClockDisplayStore((s) => s.setTheme);

  return (
    <HamClockSegmented
      label="Theme"
      value={theme}
      onChange={(next) => {
        ensureHamClockThemeFont(next);
        setTheme(next);
      }}
      options={HAMCLOCK_THEMES.map((value) => {
        const card = THEME_CARDS[value];
        return {
          value,
          label: card.name.toUpperCase(),
          detail: card.note,
          preview: (
            <span data-hamclock-theme={value} className="hc-swatch">
              <span className="hc-swatch-title">Best band</span>
              <span className="hc-swatch-hero">20M</span>
              <span className="hc-swatch-sub">
                GOOD · <b>SFI 148</b>
              </span>
            </span>
          ),
        };
      })}
    />
  );
}
