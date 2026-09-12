import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { delegatedApproval, delegatedScope, parseCommentsTsv } from "./delegated-design-review.mjs";

const HEAD = "0123456789abcdef".repeat(2) + "01234567";
const BODY = "Refs #1256\nCloses #1257";
const REVIEW = `**design review**
- agent: Codex
Delegation: color-system-1256
Reviewed: ${HEAD}
1. No blocking design findings.
Verdict: approved`;
const comment = (body = REVIEW, login = "crypticpy") => ({ url: "https://example.test/review/1", login, body });
const evaluate = (comments = [comment()], body = BODY, head = HEAD) => delegatedApproval({ comments, body, head });
const tsv = (item) => `${item.url}\t${item.login}\t${Buffer.from(item.body).toString("base64")}`;

test("only the fixed epic and allowed task references receive delegation", () => {
  for (let task = 1257; task <= 1264; task++) {
    assert.equal(delegatedScope(`Refs #1256\nCloses #${task}`), true);
  }
  for (const body of [null, "", "Refs #1256", "Closes #1257", "Refs #12560\nCloses #1257",
    "Refs #1256\nCloses #1265", "Refs #1256\nCloses #12570", "Refs #1256\nCloses #1272",
    `> ${BODY.replaceAll("\n", "\n> ")}`, `\`\`\`\n${BODY}\n\`\`\``, `~~~\n${BODY}\n~~~`,
    `<!-- ${BODY} -->`,
    `<pre>${BODY}</pre>`,
    `<div hidden>\n${BODY}\n</div>`,
    `<blockquote>\n${BODY}\n</blockquote>`, "Refs #1256\n    Closes #1257", "Refs #1256\n`Closes #1257`",
    "Refs #1256\n\tCloses #1257", `\`\`\`example\n${BODY}`]) {
    assert.equal(delegatedScope(body), false, String(body));
  }
});

test("trusted accounts can approve the current head truthfully as Codex", () => {
  for (const login of ["crypticpy", "propulse-bot[bot]"]) {
    assert.equal(evaluate([comment(REVIEW, login)]), comment().url);
  }
  assert.equal(evaluate([comment(REVIEW.replace(HEAD, HEAD.slice(0, 7)))]), comment().url);
  assert.equal(evaluate([comment(REVIEW.replace(HEAD, HEAD.toUpperCase()))]), comment().url);
});

test("wrong model, author, marker, scope, verdict and head all fail", () => {
  for (const body of [
    REVIEW.replace("Codex", "Claude Fable"), REVIEW.replace("Codex", "Codex Opus"),
    REVIEW.replace("Delegation: color-system-1256\n", ""), REVIEW.replace("color-system-1256", "color-system-12560"),
    REVIEW.replace(HEAD, "b" + HEAD.slice(1)), REVIEW.replace(HEAD, HEAD.slice(0, 6)),
    REVIEW.replace(HEAD, HEAD + "a"), REVIEW.replace(HEAD, HEAD.slice(0, 7) + "wrong"),
    REVIEW.replace("Verdict: approved", "Verdict: unapproved"), REVIEW.replace("Verdict: approved", "Verdict: approved | changes needed"),
    REVIEW.replace("Verdict: approved", "Verdict: changes needed"), REVIEW.replace("agent: Codex", "agent: Codex\nagent: Grok"),
    REVIEW + "\nThis is not approved.", REVIEW.replace("**design review**", "design review"),
  ]) assert.equal(evaluate([comment(body)]), null, body);
  assert.equal(evaluate([comment(REVIEW, "random-bot[bot]")]), null);
  assert.equal(evaluate([comment()], "Refs #1256\nCloses #1272"), null);
});

test("quoted, fenced, commented and indented approval fragments fail", () => {
  for (const body of [
    REVIEW.split("\n").map((line) => "> " + line).join("\n"),
    `\`\`\`\n${REVIEW}\n\`\`\``, `~~~\n${REVIEW}\n~~~`, `<!--\n${REVIEW}\n-->`,
    REVIEW.replace("agent: Codex", "> agent: Codex"),
    REVIEW.replace("- agent: Codex", "<blockquote>\nagent: Codex\n</blockquote>"), REVIEW.replace("Reviewed:", "    Reviewed:"),
    REVIEW.split("\n").map((line) => "    " + line).join("\n"),
  ]) assert.equal(evaluate([comment(body)]), null, body);
});

test("latest current-head delegated decision can withdraw approval", () => {
  const rejection = comment(REVIEW.replace("Verdict: approved", "Verdict: changes needed"));
  assert.equal(evaluate([comment(), rejection]), null);
  assert.equal(evaluate([rejection, comment()]), comment().url);
  assert.equal(evaluate([comment(), comment("ordinary discussion")]), comment().url);
});

test("TSV decoding rejects malformed rows, base64 and UTF-8", () => {
  assert.deepEqual(parseCommentsTsv(tsv(comment())), [comment()]);
  assert.deepEqual(parseCommentsTsv(""), []);
  for (const input of ["wrong", "url\tlogin\t%", "url\tlogin\tabc", "url\tlogin\t/w==", "url\tlogin\tYQ==\textra"]) {
    assert.throws(() => parseCommentsTsv(input));
  }
  assert.throws(() => evaluate(null));
  assert.throws(() => evaluate([{}]));
  assert.throws(() => evaluate([], BODY, "invalid-head"));
});

test("CLI consumes cached TSV and environment without shell interpretation", () => {
  const run = (input, body = BODY) => spawnSync(process.execPath, [fileURLToPath(new URL("./delegated-design-review.mjs", import.meta.url))], {
    input, encoding: "utf8", env: { ...process.env, PR_BODY: body, HEAD_SHA: HEAD },
  });
  const approved = run(tsv(comment()));
  assert.equal(approved.status, 0, approved.stderr);
  assert.equal(approved.stdout.trim(), comment().url);
  assert.equal(run(tsv(comment()), "Refs #999").stdout, "");
  assert.equal(run("malformed").status, 1);
});

test("workflow uses trusted checkout, cached comments and bootstrap fallback", () => {
  const workflow = readFileSync(new URL("../.github/workflows/pr-contract.yml", import.meta.url), "utf8");
  assert.match(workflow, /ref: \$\{\{ github.event.repository.default_branch \}\}/);
  assert.match(workflow, /if \[ -z "\$APPROVED" \] && \[ -f scripts\/delegated-design-review.mjs \]/);
  assert.match(workflow, /printf '%s\\n' "\$COMMENTS" \| node scripts\/delegated-design-review.mjs/);
  assert.match(workflow, /agent\[\*_\]\*:.*Claude Fable/);
  assert.match(workflow, /PR_BODY: \$\{\{ github.event.pull_request.body \}\}/);
});
