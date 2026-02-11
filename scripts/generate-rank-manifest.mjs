import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RANK_DIR = path.resolve(__dirname, "../public/assets/rank");
const OUTPUT_FILE = path.join(RANK_DIR, "manifest.json");

const IMAGE_EXTENSIONS = new Set([".png", ".webp", ".jpg", ".jpeg"]);

async function dirExists(dirPath) {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function listImageFiles(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries
      .filter(
        (e) => e.isFile() && IMAGE_EXTENSIONS.has(path.extname(e.name).toLowerCase()),
      )
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

async function main() {
  if (!(await dirExists(RANK_DIR))) {
    console.error(`Rank asset directory not found: ${RANK_DIR}`);
    process.exit(1);
  }

  const tiers = {};
  const summary = [];
  let totalAssets = 0;

  // Read tier directories
  const tierEntries = await fs.readdir(RANK_DIR, { withFileTypes: true });
  const tierDirs = tierEntries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  for (const tier of tierDirs) {
    const tierPath = path.join(RANK_DIR, tier);
    const typeEntries = await fs.readdir(tierPath, { withFileTypes: true });
    const typeDirs = typeEntries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();

    const types = {};
    let tierCount = 0;

    for (const type of typeDirs) {
      const typePath = path.join(tierPath, type);
      const resEntries = await fs.readdir(typePath, { withFileTypes: true });
      const resDirs = resEntries
        .filter((e) => e.isDirectory())
        .map((e) => e.name);

      // Scan each resolution subfolder for image files
      for (const resolution of resDirs) {
        const resPath = path.join(typePath, resolution);
        const files = await listImageFiles(resPath);

        if (files.length > 0) {
          types[type] = { resolution, files };
          tierCount += files.length;
        }
      }

      // Also check for images directly in the type folder (no resolution subfolder)
      const directFiles = await listImageFiles(typePath);
      if (directFiles.length > 0 && !types[type]) {
        types[type] = { resolution: null, files: directFiles };
        tierCount += directFiles.length;
      }
    }

    if (Object.keys(types).length > 0) {
      tiers[tier] = types;
    }

    totalAssets += tierCount;
    summary.push({ tier, count: tierCount });
  }

  const manifest = {
    generated: new Date().toISOString(),
    tiers,
  };

  await fs.writeFile(OUTPUT_FILE, JSON.stringify(manifest, null, 2) + "\n", "utf-8");

  // Print summary
  console.log("Rank asset manifest generated");
  console.log(`Output: ${OUTPUT_FILE}`);
  console.log("");

  for (const { tier, count } of summary) {
    const marker = count > 0 ? "+" : "-";
    console.log(`  [${marker}] ${tier}: ${count} asset${count !== 1 ? "s" : ""}`);
  }

  console.log("");
  console.log(`Total: ${totalAssets} asset${totalAssets !== 1 ? "s" : ""} across ${Object.keys(tiers).length} tier${Object.keys(tiers).length !== 1 ? "s" : ""}`);
}

main().catch((err) => {
  console.error("Failed to generate rank manifest:", err);
  process.exit(1);
});
