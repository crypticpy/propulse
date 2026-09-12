import assert from "node:assert/strict";
import test from "node:test";
import {
  hunkLooksLikeUi,
  parsePullFiles,
  uiSrcFilenamesFromPullFiles,
} from "./pr-contract-ui-hunk.mjs";

test("issue refs in comments are not UI", () => {
  const hunk = [
    "@@ -1,3 +1,4 @@",
    "+/** Tombstones for deleted shack gear (#326). */",
    " export function applyTombstone() {}",
  ].join("\n");
  assert.equal(hunkLooksLikeUi(hunk), false);
  assert.equal(hunkLooksLikeUi("+// Closes #994\n export const n = 1;\n"), false);
  assert.equal(hunkLooksLikeUi("+// Refs #1075 and (#326)\n"), false);
});

test("quoted and CSS hex colours are UI", () => {
  assert.equal(hunkLooksLikeUi('+  color: "#3a6",\n'), true);
  assert.equal(hunkLooksLikeUi("+  color: #fff;\n"), true);
  assert.equal(hunkLooksLikeUi("+  fill: '#00aa88'\n"), true);
  assert.equal(hunkLooksLikeUi("+  stroke: `#aabbcc`;\n"), true);
  assert.equal(hunkLooksLikeUi("+  className: 'bg-[#3a6]',\n"), true);
  assert.equal(
    hunkLooksLikeUi('+  const swatch = "linear-gradient(#fff, #000)";\n'),
    true,
  );
  assert.equal(
    hunkLooksLikeUi("+  background: linear-gradient(#fff, #000);\n"),
    true,
  );
});

test("null patch fails closed; empty patch is not UI", () => {
  assert.equal(hunkLooksLikeUi(null), true);
  assert.equal(hunkLooksLikeUi(undefined), true);
  assert.equal(hunkLooksLikeUi(""), false);
});

test("existing visual-token patterns still fire", () => {
  assert.equal(hunkLooksLikeUi("+  rgba(0, 0, 0, 0.5)\n"), true);
  assert.equal(hunkLooksLikeUi("+  hsla(120, 50%, 40%, 1)\n"), true);
  assert.equal(hunkLooksLikeUi("+  const colour = 'green';\n"), true);
  assert.equal(hunkLooksLikeUi("+  <div className=\"flex\">\n"), true);
  assert.equal(hunkLooksLikeUi("+  className: 'text-sm',\n"), true);
});

test("src/ files with issue-ref-only hunks are dropped; colour hunks and missing patches are kept", () => {
  const names = uiSrcFilenamesFromPullFiles([
    {
      filename: "src/lib/sync/shackGearTombstone.ts",
      patch: "+/** Retention (#326). */\n export const DAYS = 90;\n",
    },
    {
      filename: "src/lib/api/muf.ts",
      patch: "+  return color: \"#3a6\";\n",
    },
    { filename: "src/lib/api/huge.bin" },
    { filename: "package.json", patch: '+  "color": "#3a6"\n' },
  ]);
  assert.deepEqual(names, ["src/lib/api/muf.ts", "src/lib/api/huge.bin"]);
});

test("parsePullFiles accepts a JSON array or NDJSON", () => {
  const files = [
    { filename: "src/a.ts", patch: "+// (#326)\n" },
    { filename: "src/b.ts", patch: '+color: "#3a6"\n' },
  ];
  assert.deepEqual(parsePullFiles(JSON.stringify(files)), files);
  assert.deepEqual(
    parsePullFiles(files.map((file) => JSON.stringify(file)).join("\n")),
    files,
  );
  assert.deepEqual(parsePullFiles(""), []);
});
