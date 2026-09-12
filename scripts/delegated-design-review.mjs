#!/usr/bin/env node
/** Base-trusted, owner-authorized delegation for color-system epic #1256 only. */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const REVIEWERS = new Set(["crypticpy", "propulse-bot[bot]"]);
const TASKS = new Set([1257, 1258, 1259, 1260, 1261, 1262, 1263, 1264]);
const MARKER = "Delegation: color-system-1256";

/** Only standalone, visible PR references count; examples are not authority. */
function referenceLines(body) {
  const lines = body.replace(/<!--[\s\S]*?(?:-->|$)/g, "").split(/\r?\n/);
  let fence = null;
  return lines.filter((line) => {
    const delimiter = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (delimiter) {
      const run = delimiter[1];
      if (!fence) fence = run;
      else if (run[0] === fence[0] && run.length >= fence.length) fence = null;
      return false;
    }
    return !fence && !/^(?: {4}|\t|\s*>)/.test(line);
  });
}

export function delegatedScope(body) {
  if (typeof body !== "string" || /<\/?[A-Za-z][^>]*>/.test(body)) {
    return false;
  }
  const refs = new Set(referenceLines(body).flatMap((line) => {
    const match = line.match(/^ {0,3}(?:Refs|Closes) #([0-9]+)\s*$/i);
    return match ? [Number(match[1])] : [];
  }));
  return refs.has(1256) && [...TASKS].some((task) => refs.has(task));
}

/** Strict comment format avoids treating quoted approvals as fresh reviews. */
function reviewDecision(body, head) {
  if (typeof body !== "string" || /<!--|<\/?[A-Za-z][^>]*>|^\s*(?:>|`{3,}|~{3,})/m.test(body)) {
    return null;
  }
  const lines = body.replace(/\r\n/g, "\n").split("\n").filter((line) => line.trim());
  if (lines[0] !== "**design review**") return null;
  const fields = new Map();
  for (const line of lines.slice(1)) {
    const match = line.match(/^(?:- )?(agent|Delegation|Reviewed|Verdict): (.+)$/);
    if (!match) continue;
    if (fields.has(match[1])) return null;
    fields.set(match[1], match[2]);
  }
  if (fields.get("agent") !== "Codex" || `Delegation: ${fields.get("Delegation")}` !== MARKER) return null;
  const reviewed = fields.get("Reviewed");
  if (!/^[a-f0-9]{7,40}$/i.test(reviewed ?? "") || !head.startsWith(reviewed.toLowerCase())) return null;
  const verdict = fields.get("Verdict");
  if (!/^(?:- )?Verdict: (?:approved|changes needed)$/.test(lines.at(-1))) return null;
  return verdict === "approved";
}

/** Parse the existing gh --jq TSV snapshot without shell evaluation. */
export function parseCommentsTsv(input) {
  if (typeof input !== "string") throw new TypeError("comments must be TSV text");
  return input.split(/\r?\n/).filter(Boolean).map((line) => {
    const fields = line.split("\t");
    if (fields.length !== 3) throw new Error("malformed comment TSV row");
    const [url, login, encoded] = fields;
    if (!url || !login || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
      throw new Error("malformed comment TSV fields");
    }
    const bytes = Buffer.from(encoded, "base64");
    if (bytes.toString("base64") !== encoded) throw new Error("noncanonical comment encoding");
    const body = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { url, login, body };
  });
}

/** Input order is GitHub's chronological issue-comment order; latest review wins. */
export function delegatedApproval({ body, head, comments }) {
  if (typeof head !== "string" || !/^[a-f0-9]{40}$/i.test(head) || !Array.isArray(comments)) {
    throw new TypeError("expected full PR head SHA and comment array");
  }
  if (!comments.every((comment) => comment && ["url", "login", "body"].every((key) => typeof comment[key] === "string"))) {
    throw new TypeError("malformed comment record");
  }
  if (!delegatedScope(body)) return null;
  let approved = null;
  for (const comment of comments) {
    if (!REVIEWERS.has(comment.login)) continue;
    const decision = reviewDecision(comment.body, head.toLowerCase());
    if (decision !== null) approved = decision ? comment.url : null;
  }
  return approved;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const approval = delegatedApproval({
      body: process.env.PR_BODY,
      head: process.env.HEAD_SHA,
      comments: parseCommentsTsv(readFileSync(0, "utf8")),
    });
    if (approval) process.stdout.write(`${approval}\n`);
  } catch (error) {
    process.stderr.write(`delegated design review: ${error.message}\n`);
    process.exitCode = 1;
  }
}
