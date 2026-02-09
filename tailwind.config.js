/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Primary palette
        "plasma-orange":
          "rgb(var(--theme-accent-primary-rgb, 255 107 53) / <alpha-value>)",
        "signal-green":
          "rgb(var(--theme-accent-secondary-rgb, 0 255 136) / <alpha-value>)",
        "caution-amber":
          "rgb(var(--color-caution-rgb, 255 210 63) / <alpha-value>)",
        "caution-yellow":
          "rgb(var(--color-caution-rgb, 255 210 63) / <alpha-value>)",
        "alert-red": "rgb(var(--color-alert-rgb, 255 68 85) / <alpha-value>)",
        "aurora-purple": "#aa44ff",
        "cosmic-cyan": "#44ddff",

        // Background colors
        "deep-space": "#0a0a1a",
        "nebula-blue": "#1a1a2e",
        void: "#16213e",
        "void-black": "#0d1527",
        panel: "#0f0f23",
        "space-900": "#0a0e1a",

        // Condition colors (CSS-variable-driven for color blind mode)
        excellent: "rgb(var(--color-excellent-rgb, 0 255 136) / <alpha-value>)",
        good: "rgb(var(--color-good-rgb, 68 221 102) / <alpha-value>)",
        fair: "rgb(var(--color-fair-rgb, 255 170 0) / <alpha-value>)",
        poor: "rgb(var(--color-poor-rgb, 255 68 85) / <alpha-value>)",

        // Additional accents
        "sunspot-blue": "#3a86ff",
        "feedline-teal": "#14B8A6",
      },
      fontFamily: {
        orbitron: ["Orbitron", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
      },
      backgroundImage: {
        "cosmic-gradient":
          "linear-gradient(135deg, #0a0a1a 0%, #1a1a2e 50%, #16213e 100%)",
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
      },
      keyframes: {
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
        "glow-green": "0 0 20px rgba(0, 255, 136, 0.3)",
        card: "0 4px 20px rgba(0, 0, 0, 0.3)",
      },
    },
  },
  plugins: [],
};
