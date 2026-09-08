#!/usr/bin/env bash
# Emits a .d.ts tree for the design-sync barrel into dist/types (gitignored) so
# .ds-sync/lib/dts.mjs (ts-morph over **/*.d.ts) can resolve real component
# props. Without this, an app repo has no shipped .d.ts and every
# <Name>Props collapses to `[key: string]: unknown`.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist/types node_modules/.tmp/tsconfig.types.tsbuildinfo
npx tsc -p .design-sync/tsconfig.types.json | grep -c "error TS" | xargs -I{} echo "tsc declaration diagnostics: {} (emit still written)" || true
printf '{\n  "name": "propulse-types",\n  "private": true,\n  "types": "index.d.ts"\n}\n' > dist/types/package.json
printf 'export * from "./.design-sync/ds-entry";\n' > dist/types/index.d.ts
echo "dist/types: $(find dist/types -name '*.d.ts' | wc -l | tr -d ' ') .d.ts files"
# ts-morph in .ds-sync/lib/dts.mjs has no tsconfig paths, so the barrel's
# "@/..." re-exports can't be followed; rewrite them to relative paths.
sed -i '' 's#"@/#"../src/#g' dist/types/.design-sync/ds-entry.d.ts
echo "ds-entry.d.ts: $(grep -c '"../src/' dist/types/.design-sync/ds-entry.d.ts) relative re-exports"
