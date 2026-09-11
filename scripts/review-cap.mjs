#!/usr/bin/env node
/**
 * review-cap: count `@codex review` rounds on a PR and, once capped, require
 * an `**architecture review**` comment for the current head before the gate
 * passes. See docs/AGENT-CONSTITUTION.md, "Review cap".
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REVIEW_REQUEST = /^@codex review\b/i;
const BOT_LOGIN = /\[bot\]$/i;
const HEADING = /\*\*architecture review\*\*/i;
const AGENT_LINE = /^-\s*agent:\s*(.+?)\s*$/im;
const REVIEWED_LINE = /^-\s*Reviewed:\s*([0-9a-f]{7,40})\b/im;
const VERDICT_LINE = /^Verdict:\s*(ship|redesign)\s*\(#(\d+)\)\s*$/im;

export function countReviewRounds(comments) {
  return comments.filter((comment) => {
    const login = comment.user?.login ?? "";
    if (BOT_LOGIN.test(login)) return false;
    const body = (comment.body ?? "").trim();
    return REVIEW_REQUEST.test(body);
  }).length;
}

/** Returns `{ agent, reviewedSha, verdict, issue }` or `null`. */
export function parseArchitectureReview(commentBody) {
  const body = commentBody ?? "";
  if (!HEADING.test(body)) return null;
  const agentMatch = body.match(AGENT_LINE);
  if (!agentMatch) return null;
  const shaMatch = body.match(REVIEWED_LINE);
  if (!shaMatch) return null;
  const verdictMatch = body.match(VERDICT_LINE);
  if (!verdictMatch) return null;
  return {
    agent: agentMatch[1],
    reviewedSha: shaMatch[1].toLowerCase(),
    verdict: verdictMatch[1].toLowerCase(),
    issue: Number(verdictMatch[2]),
  };
}

export function evaluateReviewCap({
  comments,
  headSha,
  allowedReviewers,
  cap = 5,
}) {
  const rounds = countReviewRounds(comments);
  const capped = rounds >= cap;
  if (!capped) {
    return { rounds, capped, verdict: null, ok: true, reason: "not capped" };
  }
  const head = (headSha ?? "").toLowerCase();
  const allowSet = new Set(
    (allowedReviewers ?? []).map((login) => login.toLowerCase()),
  );
  for (const comment of comments) {
    const login = (comment.user?.login ?? "").toLowerCase();
    if (!allowSet.has(login)) continue;
    const parsed = parseArchitectureReview(comment.body);
    if (!parsed) continue;
    if (!head.startsWith(parsed.reviewedSha)) continue;
    return {
      rounds,
      capped,
      verdict: parsed.verdict,
      ok: true,
      reason: `architecture review by ${parsed.agent}: ${parsed.verdict} (#${parsed.issue})`,
    };
  }
  return {
    rounds,
    capped,
    verdict: null,
    ok: false,
    reason: `capped at ${rounds} bot review rounds; no **architecture review** comment for head ${headSha} from an allowed reviewer`,
  };
}

function fetchComments(repo, pr) {
  const result = spawnSync(
    "gh",
    [
      "api",
      `repos/${repo}/issues/${pr}/comments`,
      "--paginate",
      "--jq",
      ".[] | {login: .user.login, body: .body}",
    ],
    { encoding: "utf8" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `gh api issues/${pr}/comments failed: ${result.stderr || result.stdout}`,
    );
  }
  return result.stdout
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const parsed = JSON.parse(line);
      return { user: { login: parsed.login }, body: parsed.body };
    });
}

async function main() {
  const [repo, pr, headSha] = process.argv.slice(2);
  if (!repo || !pr || !headSha) {
    console.error(
      "Usage: node scripts/review-cap.mjs <owner/repo> <pr> <headSha>",
    );
    process.exitCode = 1;
    return;
  }
  const comments = fetchComments(repo, pr);
  const result = evaluateReviewCap({
    comments,
    headSha,
    allowedReviewers: ["crypticpy", "propulse-bot[bot]"],
  });
  console.log(
    `rounds=${result.rounds} capped=${result.capped} verdict=${result.verdict ?? "none"} ok=${result.ok} — ${result.reason}`,
  );
  if (result.capped && !result.ok) {
    console.log(`::error::${result.reason}`);
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
