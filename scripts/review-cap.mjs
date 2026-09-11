#!/usr/bin/env node
/**
 * review-cap: count bot review rounds on a PR two ways (explicit
 * `@codex review` requests, and distinct bot reviews that left inline
 * findings) and, once either counter reaches the cap, evaluate whether a
 * valid `**architecture review**` comment already covers the current head.
 * The verdict decides whether `pr-contract` merges (`ship`), blocks
 * (`redesign` or pending), and whether the review-cap automation still needs
 * to run. See docs/AGENT-CONSTITUTION.md, "Review cap".
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REVIEW_REQUEST = /^@codex review\b/i;
const BOT_LOGIN = /\[bot\]$/i;
const SOURCERY_LOGIN = /^sourcery-ai\[bot\]$/i;
const BADGE = /img\.shields\.io\/badge\/P[123]\b/i;
const HEADING = /\*\*architecture review\*\*/i;
const AGENT_LINE = /^-\s*agent:\s*(.+?)\s*$/im;
const REVIEWED_LINE = /^-\s*Reviewed:\s*([0-9a-f]{7,40})\b/im;
const VERDICT_LINE = /^Verdict:\s*(ship|redesign)\s*\(#(\d+)\)\s*$/im;

export const ALLOWED_REVIEWERS = [
  "github-actions[bot]",
  "propulse-bot[bot]",
  "crypticpy",
];

/** `@codex review` request comments (issue-level) from non-bot accounts. */
export function countReviewRequests(issueComments) {
  return issueComments.filter((comment) => {
    const login = comment.user?.login ?? "";
    if (BOT_LOGIN.test(login)) return false;
    const body = (comment.body ?? "").trim();
    return REVIEW_REQUEST.test(body);
  }).length;
}

/**
 * Distinct PR reviews that left inline findings: a Codex review is
 * identified by the `img.shields.io/badge/P[123]` badge on at least one of
 * its inline comments (whatever login posts it); a Sourcery review is
 * identified by the `sourcery-ai[bot]` login with at least one inline
 * comment (a budget-exhausted refusal has none).
 */
export function countFindingReviews({ reviews, reviewComments }) {
  const commentsByReview = new Map();
  for (const comment of reviewComments) {
    if (comment.reviewId == null) continue;
    if (!commentsByReview.has(comment.reviewId)) {
      commentsByReview.set(comment.reviewId, []);
    }
    commentsByReview.get(comment.reviewId).push(comment);
  }
  const findingIds = new Set();
  for (const review of reviews) {
    const ownComments = commentsByReview.get(review.id) ?? [];
    const login = review.user?.login ?? "";
    if (ownComments.some((comment) => BADGE.test(comment.body ?? ""))) {
      findingIds.add(review.id);
    } else if (SOURCERY_LOGIN.test(login) && ownComments.length > 0) {
      findingIds.add(review.id);
    }
  }
  return findingIds.size;
}

export function countRounds({ issueComments, reviews, reviewComments }) {
  const requests = countReviewRequests(issueComments);
  const findings = countFindingReviews({ reviews, reviewComments });
  return { requests, findings, rounds: Math.max(requests, findings) };
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

/**
 * `ok` is the pr-contract merge signal: true when not capped, or when capped
 * and an allowed reviewer's comment carries a `ship` verdict for the current
 * head. `reviewed` is true whenever such a comment exists at all (ship or
 * redesign) — the review-cap automation uses it to avoid posting twice.
 */
export function evaluateReviewCap({
  issueComments,
  reviews,
  reviewComments,
  headSha,
  allowedReviewers = ALLOWED_REVIEWERS,
  cap = 5,
}) {
  const { requests, findings, rounds } = countRounds({
    issueComments,
    reviews,
    reviewComments,
  });
  const capped = rounds >= cap;
  const head = (headSha ?? "").toLowerCase();
  const allowSet = new Set(
    allowedReviewers.map((login) => login.toLowerCase()),
  );
  let reviewed = null;
  for (const comment of issueComments) {
    const login = (comment.user?.login ?? "").toLowerCase();
    if (!allowSet.has(login)) continue;
    const parsed = parseArchitectureReview(comment.body);
    if (!parsed) continue;
    if (!head.startsWith(parsed.reviewedSha)) continue;
    reviewed = parsed;
    break;
  }
  const ok = !capped || (reviewed !== null && reviewed.verdict === "ship");
  let reason;
  if (!capped) {
    reason = "not capped";
  } else if (!reviewed) {
    reason = `capped at ${rounds} rounds (requests=${requests}, findings=${findings}); no **architecture review** comment for head ${headSha} from an allowed reviewer`;
  } else if (reviewed.verdict === "redesign") {
    reason = `capped and reviewed: redesign required, see #${reviewed.issue}`;
  } else {
    reason = `capped and reviewed: ship, follow-up #${reviewed.issue}`;
  }
  return {
    rounds,
    requestRounds: requests,
    findingRounds: findings,
    capped,
    reviewed: reviewed !== null,
    verdict: reviewed?.verdict ?? null,
    issue: reviewed?.issue ?? null,
    agent: reviewed?.agent ?? null,
    ok,
    reason,
  };
}

/**
 * Selects the follow-up issue new post-cap bot threads should be resolved
 * against: only active once a `ship` verdict has been recorded for the head.
 */
export function postCapFollowup(evaluation) {
  const active =
    evaluation.capped && evaluation.reviewed && evaluation.verdict === "ship";
  return { active, issue: active ? evaluation.issue : null };
}

function ghJsonLines(args) {
  const result = spawnSync("gh", args, { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`gh ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

function fetchIssueComments(repo, pr) {
  return ghJsonLines([
    "api",
    `repos/${repo}/issues/${pr}/comments`,
    "--paginate",
    "--jq",
    ".[] | {login: .user.login, body: .body}",
  ]).map((c) => ({ user: { login: c.login }, body: c.body }));
}

function fetchReviews(repo, pr) {
  return ghJsonLines([
    "api",
    `repos/${repo}/pulls/${pr}/reviews`,
    "--paginate",
    "--jq",
    ".[] | {id: .id, login: .user.login, body: .body}",
  ]).map((r) => ({ id: r.id, user: { login: r.login }, body: r.body }));
}

function fetchReviewComments(repo, pr) {
  return ghJsonLines([
    "api",
    `repos/${repo}/pulls/${pr}/comments`,
    "--paginate",
    "--jq",
    ".[] | {reviewId: .pull_request_review_id, login: .user.login, body: .body}",
  ]).map((c) => ({
    reviewId: c.reviewId,
    user: { login: c.login },
    body: c.body,
  }));
}

function fetchAll(repo, pr) {
  return {
    issueComments: fetchIssueComments(repo, pr),
    reviews: fetchReviews(repo, pr),
    reviewComments: fetchReviewComments(repo, pr),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const subcommand =
    args[0] === "status" || args[0] === "resolve-post-cap"
      ? args.shift()
      : "status";
  const [repo, pr, headSha] = args;
  if (!repo || !pr || !headSha) {
    console.error(
      "Usage: node scripts/review-cap.mjs [status|resolve-post-cap] <owner/repo> <pr> <headSha>",
    );
    process.exitCode = 1;
    return;
  }
  const evaluation = evaluateReviewCap({ ...fetchAll(repo, pr), headSha });
  const output =
    subcommand === "resolve-post-cap" ? postCapFollowup(evaluation) : evaluation;
  console.log(JSON.stringify(output));
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
