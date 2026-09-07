/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    // Test files never render in the app, but their class names were still
    // being emitted into the production stylesheet. Excluding them is pure
    // dead-CSS removal and keeps the Main CSS budget honest.
    "!./src/**/*.test.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary palette — aliased onto the unified station tokens
        // (--su-*) so PropSphere and every remaining page share one
        // palette with Solar/Home. See docs/designs/design-system/README.md.
        //
        // These aliases carry no hex fallback: globals.css declares every
        // --su-*-rgb on :root as the documented pre-JS fallback, so a second
        // copy here would be a fourth place the palette could drift — and it
        // is repeated in every emitted utility, which cost ~5 kB of shipped
        // CSS. The `su` namespace below keeps DS-02's fallbacks as they are.
        "plasma-orange": "rgb(var(--su-accent-rgb) / <alpha-value>)",
        "signal-green": "rgb(var(--su-success-rgb) / <alpha-value>)",
        "caution-amber": "rgb(var(--su-warning-rgb) / <alpha-value>)",
        "caution-yellow": "rgb(var(--su-warning-rgb) / <alpha-value>)",
        "alert-red": "rgb(var(--su-danger-rgb) / <alpha-value>)",
        "aurora-purple": "#aa44ff",
        "cosmic-cyan": "rgb(var(--su-info-rgb) / <alpha-value>)",

        // Background colors. Six legacy darks collapse onto the three station
        // surface roles, keeping their relative depth: `space-900`/`void-black`
        // were the darkest, so they take the darkest role (`--su-input`);
        // `deep-space` and `void` are the page background (`--su-canvas`);
        // `panel` and `nebula-blue` are card/surface colours (`--su-panel`).
        // `void` points at `--su-canvas` rather than `--su-panel` so
        // `from-nebula-blue to-void` gradients keep two distinct stops instead
        // of flattening. Multi-stop gradients built from names that still
        // share one role (for example `from-panel via-nebula-blue`) still
        // flatten — acceptable, and the page/surface/well ordering that
        // layout depends on is preserved.
        "deep-space": "rgb(var(--su-canvas-rgb) / <alpha-value>)",
        "nebula-blue": "rgb(var(--su-panel-rgb) / <alpha-value>)",
        void: "rgb(var(--su-canvas-rgb) / <alpha-value>)",
        "void-black": "rgb(var(--su-input-rgb) / <alpha-value>)",
        panel: "rgb(var(--su-panel-rgb) / <alpha-value>)",
        "space-900": "rgb(var(--su-input-rgb) / <alpha-value>)",

        // Condition colors — aliased onto the su- tones (same style as
        // `signal-green`/`caution-amber`/`alert-red` above). They used to read
        // `--color-*-rgb` variables from src/styles/design-tokens.css, which
        // was never imported and was deleted as dead code in #533. Only
        // `good` is used in src/ today.
        excellent: "rgb(var(--su-success-rgb) / <alpha-value>)",
        good: "rgb(var(--su-success-rgb) / <alpha-value>)",
        fair: "rgb(var(--su-warning-rgb) / <alpha-value>)",
        poor: "rgb(var(--su-danger-rgb) / <alpha-value>)",

        // Additional accents
        "sunspot-blue": "#3a86ff",
        "feedline-teal": "#14B8A6",

        // Station design system (--su-*). One token set, themed by
        // applyThemeToDocument(); the hex fallbacks are the Propulse dark
        // palette. See docs/designs/design-system/README.md.
        su: {
          canvas: "rgb(var(--su-canvas-rgb, 20 24 39) / <alpha-value>)",
          panel: "rgb(var(--su-panel-rgb, 25 30 46) / <alpha-value>)",
          input: "rgb(var(--su-input-rgb, 17 22 36) / <alpha-value>)",
          text: "rgb(var(--su-text-rgb, 202 210 220) / <alpha-value>)",
          muted: "rgb(var(--su-muted-rgb, 160 171 186) / <alpha-value>)",
          line: "rgb(var(--su-line-rgb, 99 112 136) / <alpha-value>)",
          accent: "rgb(var(--su-accent-rgb, 255 107 53) / <alpha-value>)",
          "on-accent": "rgb(var(--su-on-accent-rgb, 0 0 0) / <alpha-value>)",
          "accent-edge":
            "rgb(var(--su-accent-edge-rgb, 255 107 53) / <alpha-value>)",
          "accent-text":
            "rgb(var(--su-accent-text-rgb, 255 107 53) / <alpha-value>)",
          info: "rgb(var(--su-info-rgb, 133 196 208) / <alpha-value>)",
          success: "rgb(var(--su-success-rgb, 139 219 176) / <alpha-value>)",
          warning: "rgb(var(--su-warning-rgb, 245 207 121) / <alpha-value>)",
          danger: "rgb(var(--su-danger-rgb, 253 164 175) / <alpha-value>)",
        },
      },
      fontFamily: {
        orbitron: ["Orbitron", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
      },
      backgroundImage: {
        "cosmic-gradient":
          "linear-gradient(135deg, rgb(var(--su-canvas-rgb)) 0%, rgb(var(--su-panel-rgb)) 50%, rgb(var(--su-canvas-rgb)) 100%)",
        "title-gradient": "linear-gradient(135deg, #ff6b35 0%, #ffd23f 100%)",
        "glow-orange":
          "radial-gradient(circle at 30% 20%, rgba(255, 107, 53, 0.1) 0%, transparent 50%)",
      },
      animation: {
        "spin-slow": "spin 3s linear infinite",
        "pulse-glow": "pulseGlow 3s ease-in-out infinite",
        "fade-in-up": "fadeInUp 0.5s ease-out both",
        shake: "shake 0.5s ease-in-out",
        "slide-in-right": "slideInRight 0.25s ease-out both",
        // Operator Rank System animations live in src/styles/rank-animations.css
        // (keyframes + .animate-rank-* utilities), loaded with the rank-styled routes.
        "alert-glow-pulse": "alertGlowPulse 4s ease-in-out infinite",
      },
      keyframes: {
        alertGlowPulse: {
          "0%, 100%": { opacity: "0.05" },
          "50%": { opacity: "0.15" },
        },
        pulseGlow: {
          "0%, 100%": { opacity: "1", filter: "brightness(1)" },
          "50%": { opacity: "0.8", filter: "brightness(1.2)" },
        },
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "10%, 30%, 50%, 70%, 90%": { transform: "translateX(-4px)" },
          "20%, 40%, 60%, 80%": { transform: "translateX(4px)" },
        },
        slideInRight: {
          "0%": { opacity: "0", transform: "translateX(100%)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
      },
      boxShadow: {
        "glow-orange": "0 0 20px rgba(255, 107, 53, 0.3)",
        "glow-green": "0 0 20px rgb(var(--su-success-rgb) / 0.3)",
        card: "0 4px 20px rgba(0, 0, 0, 0.3)",
      },
    },
  },
  plugins: [],
};
