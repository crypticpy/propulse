import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "node_modules",
      ".next",
      "next-env.d.ts",
      "dev-dist",
      "bridge/dist",
      "collector/dist",
      "ml/", // Python ML workspace (venv bundles third-party JS)
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        {
          allowConstantExport: true,
          allowExportNames: [
            "drawDXSpots",
            "getSpotAtPoint",
            "useVirtualList",
            "useVariableHeightVirtualList",
            "getSpotAgeInfo",
            "formatSpotAge",
            "getShortAgeLabel",
            "getAgeBadgeColors",
            "getModeColor",
            "MODE_COLORS",
            "getGreatCirclePoints",
            "resolveSpotLocations",
            "getAgeOpacity",
            "DIFFICULTY_COLORS",
            "DIFFICULTY_LABELS",
            "getDifficultyColor",
            "drawNVISCoverage",
            "FIELD_LABELS",
            "getEquipmentSymbol",
            "getElectricalSymbol",
            "getFeedlineRunNodeHeight",
            "calculatePropagationIndex",
            "getBzColor",
            "getBzDescription",
            "HELP_CONTENT",
            "heightToRadius",
            "DEFAULT_SATELLITE_FILTERS",
            // Marker color tables exported for LayerLegend (src/lib/map/layerLegends.ts)
            "FT8_DECODE_COLORS",
            "CATEGORY_COLORS",
            "EQ_MAGNITUDE_COLORS",
            "ALERT_SEVERITY_COLORS",
            "STORM_CATEGORY_HEX",
            "RIVER_STATUS_HEX",
          ],
        },
      ],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
