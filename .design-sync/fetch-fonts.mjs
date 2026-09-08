// Regenerates .design-sync/fonts/{fonts.css,*.woff2} from Google Fonts so the
// design-sync bundle ships self-contained @font-face rules (claude.ai/design
// renders receive only styles.css's @import closure; index.html's <link> to
// Google Fonts never reaches them). Latin subset only. Run: node .design-sync/fetch-fonts.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const dir = join(dirname(fileURLToPath(import.meta.url)), "fonts");
mkdirSync(dir, { recursive: true });
const url = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;600&family=Orbitron:wght@400;700;900&display=swap";
const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const css = await (await fetch(url, { headers: { "User-Agent": ua } })).text();
const blocks = [...css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*\{[^}]+\})/g)].filter((m) => m[1] === "latin");
const out = [];
for (const [, , block] of blocks) {
  const fam = block.match(/font-family:\s*'([^']+)'/)[1].replace(/\s+/g, "");
  const wght = block.match(/font-weight:\s*(\d+)/)[1];
  const src = block.match(/url\((https:[^)]+\.woff2)\)/)[1];
  const name = `${fam}-${wght}.woff2`;
  const buf = Buffer.from(await (await fetch(src)).arrayBuffer());
  writeFileSync(join(dir, name), buf);
  out.push(block.replace(src, `./${name}`).replace(/\n\s*unicode-range:[^;]+;/, ""));
  console.error(`  ${name} ${(buf.length / 1024).toFixed(0)} KB`);
}
writeFileSync(join(dir, "fonts.css"), out.join("\n") + "\n");
console.error(`fonts.css: ${out.length} @font-face rules`);
