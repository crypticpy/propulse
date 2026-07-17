import { chmod, mkdir, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadConfig } from "./config.js";
import { collectForecastsStrict } from "./collectors/forecast.js";
import { getDb } from "./db.js";

function receiptDirectory(): string {
  const index = process.argv.indexOf("--receipt-dir");
  if (index === -1 || !process.argv[index + 1]) {
    throw new Error("--receipt-dir is required");
  }
  return resolve(process.argv[index + 1]);
}

async function main(): Promise<void> {
  const directory = receiptDirectory();
  const config = loadConfig();
  const receipt = await collectForecastsStrict(getDb(config));
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const stamp = receipt.capturedAt.replace(/[-:.]/g, "").replace("+0000", "Z");
  const target = resolve(directory, `${stamp}.json`);
  const temporary = `${target}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporary, target);
  console.log(JSON.stringify({
    receipt: target,
    capturedAt: receipt.capturedAt,
    products: receipt.products.length,
    values: receipt.valueCount,
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
