/**
 * Bundle the portable /api/* handlers for the bridge.
 *
 * Rolls api/_lib/portableRoutes.ts (and everything it imports, including the
 * src/lib modules some handlers share with the frontend) into a single
 * self-contained ESM file next to the compiled bridge server. Runs as part of
 * `npm run build` in bridge/; uses the root workspace's esbuild.
 */

import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outfile = path.join(root, "bridge", "dist", "portableRoutes.mjs");

await build({
  entryPoints: [path.join(root, "api", "_lib", "portableRoutes.ts")],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  sourcemap: false,
  logLevel: "info",
});
