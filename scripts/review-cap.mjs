#!/usr/bin/env node
/**
 * review-cap: count bot review rounds on a PR two ways (explicit
 * `@codex review` requests from a write-access allow-list, and distinct bot
 * reviews that left inline findings, minus one to exclude Codex's automatic
 * first pass on open) and, once either counter reaches the cap, evaluate
 * whether a valid `**architecture review**` comment already covers the
 * current head. The verdict decides whether `pr-contract` merges (`ship`),
 * blocks (`redesign` or pending), and whether the review-cap automation
 * still needs to run. See docs/AGENT-CONSTITUTION.md, "Review cap".
 *
 * This script is only trustworthy when it runs from the default branch (a
 * PR cannot edit the copy that gates it) — see the checkout steps in
 * .github/workflows/pr-contract.yml and .github/workflows/review-cap.yml.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REVIEW_REQUEST = /^@codex review\b/i;
const SOURCERY_LOGIN = /^sourcery-ai\[bot\]$/i;
// A Codex review is identified by this badge on at least one of its inline
// comments. Empirically (verified live against #874 and #894) Codex posts as
// `chatgpt-codex-connector[bot]`, not "under the linked user's login" as
// issue #1054 originally assumed.
const BADGE = /img\.shields\.io\/badge\/P[0-3]\b/i;

/**
 * The only logins whose reviews count toward the cap, and (mirrored as a
 * workflow-level login allow-list, since a workflow `if:` cannot import this
 * file) the only bot logins `review-cap.yml` admits from `pull_request_review`
 * and `issue_comment` triggers. Restricting `countFindingReviews` to this set
 * closes a hole where any login could plant a badge- or Sourcery-shaped
 * comment to force the cap and its secret-bearing architecture review
 * (finding 5 of PR #1067's third review).
 */
export const REVIEW_BOT_LOGINS = ["chatgpt-codex-connector[bot]", "sourcery-ai[bot]"];
const REVIEW_BOT_LOGIN_SET = new Set(
  REVIEW_BOT_LOGINS.map((login) => login.toLowerCase()),
);
const HEADING = /\*\*architecture review\*\*/i;
const AGENT_LINE = /^-\s*agent:\s*(.+?)\s*$/im;
const REVIEWED_LINE = /^-\s*Reviewed:\s*([0-9a-f]{7,40})\b/im;
const VERDICT_LINE = /^Verdict:\s*(ship|redesign)\s*\(#(\d+)\)\s*$/im;

/** Accounts allowed to post the `**architecture review**` comment. `crypticpy` is the break-glass path (see BREAK_GLASS_AGENT). */
export const ALLOWED_REVIEWERS = [
  "github-actions[bot]",
  "propulse-bot[bot]",
  "crypticpy",
];

/** Write-access logins allowed to spend an `@codex review` request round. */
export const REQUEST_LOGINS = ["crypticpy", "propulse-bot[bot]"];

export const AUTOMATION_AGENT = "Claude (review-cap automation)";
export const BREAK_GLASS_AGENT = "crypticpy (break-glass)";
const VALID_AGENTS = new Set(
  [AUTOMATION_AGENT, BREAK_GLASS_AGENT].map((a) => a.toLowerCase()),
);

/** `@codex review` request comments (issue-level) from the write-access allow-list. */
export function countReviewRequests(issueComments, allowedRequesters = REQUEST_LOGINS) {
  const allowSet = new Set(allowedRequesters.map((login) => login.toLowerCase()));
  return issueComments.filter((comment) => {
    const login = (comment.user?.login ?? "").toLowerCase();
    if (!allowSet.has(login)) return false;
    const body = (comment.body ?? "").trim();
    return REVIEW_REQUEST.test(body);
  }).length;
}

/**
 * Distinct PR reviews that left inline findings, counted only when the
 * review's own login is a recognised review bot (`REVIEW_BOT_LOGINS`) — a
 * human (or any other account) planting the same badge or Sourcery-shaped
 * comment must not be able to force the cap (finding 5 of PR #1067's third
 * review). A Codex review is identified by the `img.shields.io/badge/P[0-3]`
 * badge (P0-P3, the full severity set Codex posts — a P0-only review was
 * previously invisible to the cap) on at least one of its inline comments; a
 * Sourcery review is identified by the `sourcery-ai[bot]` login with at
 * least one inline comment (a budget-exhausted refusal has none).
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
    const login = (review.user?.login ?? "").toLowerCase();
    if (!REVIEW_BOT_LOGIN_SET.has(login)) continue;
    const ownComments = commentsByReview.get(review.id) ?? [];
    if (ownComments.some((comment) => BADGE.test(comment.body ?? ""))) {
      findingIds.add(review.id);
    } else if (SOURCERY_LOGIN.test(login) && ownComments.length > 0) {
      findingIds.add(review.id);
    }
  }
  return findingIds.size;
}

/**
 * `rounds` is `max(requests, findings - 1)`: Codex reviews automatically on
 * PR open, before any `@codex review` request is ever posted, so that first
 * finding review is not a "round" caused by the fix loop — only the ones
 * that follow a request are. Verified against #1036 and #1035 (4 requests,
 * 5 finding reviews each, merged cleanly, correctly not capped) and #874 (44
 * requests, 44 finding reviews, correctly still capped after the -1).
 */
export function countRounds({ issueComments, reviews, reviewComments }, allowedRequesters) {
  const requests = countReviewRequests(issueComments, allowedRequesters);
  const findings = countFindingReviews({ reviews, reviewComments });
  const rounds = Math.max(requests, Math.max(0, findings - 1));
  return { requests, findings, rounds };
}

/**
 * Returns `{ agent, reviewedSha, verdict, issue }` or `null`. The `agent`
 * line must equal `AUTOMATION_AGENT` or the owner's break-glass form
 * `BREAK_GLASS_AGENT`; anything else is not a valid architecture review.
 */
export function parseArchitectureReview(commentBody) {
  const body = commentBody ?? "";
  if (!HEADING.test(body)) return null;
  const agentMatch = body.match(AGENT_LINE);
  if (!agentMatch) return null;
  const agent = agentMatch[1];
  if (!VALID_AGENTS.has(agent.toLowerCase())) return null;
  const shaMatch = body.match(REVIEWED_LINE);
  if (!shaMatch) return null;
  const verdictMatch = body.match(VERDICT_LINE);
  if (!verdictMatch) return null;
  return {
    agent,
    reviewedSha: shaMatch[1].toLowerCase(),
    verdict: verdictMatch[1].toLowerCase(),
    issue: Number(verdictMatch[2]),
  };
}

/**
 * `ok` is the pr-contract merge signal: true when not capped, or when capped
 * and an allowed reviewer's comment carries a `ship` verdict for the current
 * head. `reviewed` is true whenever such a comment exists at all (ship or
 * redesign) — the review-cap automation uses it to avoid posting twice. When
 * more than one valid comment matches the head, the *last* one (by comment
 * order) wins, so a corrected verdict can supersede an earlier mistake in
 * either direction.
 */
export function evaluateReviewCap({
  issueComments,
  reviews,
  reviewComments,
  headSha,
  allowedReviewers = ALLOWED_REVIEWERS,
  allowedRequesters = REQUEST_LOGINS,
  cap = 5,
}) {
  const { requests, findings, rounds } = countRounds(
    { issueComments, reviews, reviewComments },
    allowedRequesters,
  );
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
    // No `break`: comments are in ascending creation order, so the last
    // valid match wins and a later correction supersedes an earlier one.
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

/**
 * The issue number from the latest comment accepted by the SAME trusted
 * parser (`parseArchitectureReview`) and author allow-list the merge gate
 * uses, ignoring the head check, AND whose recorded verdict matches the
 * `verdict` this run is about to post. Used to decide whether the
 * architecture review reuses a prior follow-up issue instead of filing a new
 * one on every push. A comment with the right heading and an issue-number-shaped
 * substring but not a real architecture review (wrong agent line, missing
 * `Reviewed:` line, non-allowed author) is rejected exactly as
 * `evaluateReviewCap` would reject it as evidence for `ok` — a look-alike
 * comment can no longer hijack which issue is reused (finding 6 of PR
 * #1067's third review). The verdict match prevents a `redesign` issue from
 * being reused for a later `ship` verdict (or vice versa) just because it was
 * the most recent architecture-review comment (finding 3 of PR #1067's
 * fourth review); the caller additionally checks the issue is still open
 * before trusting the reuse, since this function has no network access.
 */
export function findPriorIssue(issueComments, verdict, allowedReviewers = ALLOWED_REVIEWERS) {
  const allowSet = new Set(allowedReviewers.map((login) => login.toLowerCase()));
  let issue = null;
  for (const comment of issueComments) {
    const login = (comment.user?.login ?? "").toLowerCase();
    if (!allowSet.has(login)) continue;
    const parsed = parseArchitectureReview(comment.body);
    if (!parsed) continue;
    if (parsed.verdict !== verdict) continue;
    issue = parsed.issue;
    // No `break`: same last-match-wins resolution as evaluateReviewCap.
  }
  return issue;
}

/**
 * Unresolved threads whose first comment's author `__typename` is exactly
 * `"Bot"` — the only threads review-cap automation may reply to and resolve
 * without human review. `__typename` is `null` for a deleted account,
 * `"Mannequin"` for a migrated one, and `"Organization"` for an org account;
 * only an exact `"Bot"` match qualifies, so a deleted human's blocking
 * thread is never auto-resolved (finding 2 of PR #1067's third review: a
 * `!= "User"` filter wrongly matched all three of those).
 */
export function unresolvedBotThreads(threads) {
  return threads
    .filter((thread) => thread.isResolved === false)
    .filter((thread) => thread.comments?.nodes?.[0]?.author?.__typename === "Bot")
    .map((thread) => ({ id: thread.id, firstComment: thread.comments.nodes[0].body }));
}

/**
 * Every thread, resolved or not, with every comment — the architecture
 * review must judge the finding family across all rounds, not just the
 * threads still open (finding 9 of PR #1067's third review).
 */
export function formatThreadsForReview(threads) {
  return threads.map((thread) => ({
    id: thread.id,
    isResolved: thread.isResolved,
    path: thread.path ?? null,
    line: thread.line ?? null,
    comments: (thread.comments?.nodes ?? []).map((comment) => ({
      login: comment.author?.login ?? null,
      body: comment.body ?? "",
    })),
  }));
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

const REVIEW_THREADS_QUERY = `
  query($owner: String!, $name: String!, $pr: Int!, $cursor: String) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $pr) {
        reviewThreads(first: 100, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            isResolved
            path
            line
            comments(first: 50) {
              pageInfo { hasNextPage endCursor }
              nodes { author { login __typename } body }
            }
          }
        }
      }
    }
  }`;

// Fetches comments past the first page of a single thread, keyed by the
// thread's own node id (finding 5 of PR #1067's fourth review:
// `comments(first: 50)` inline in REVIEW_THREADS_QUERY had no pagination, so
// a long-running thread silently dropped anything past its 50th comment).
const THREAD_COMMENTS_QUERY = `
  query($id: ID!, $cursor: String) {
    node(id: $id) {
      ... on PullRequestReviewThread {
        comments(first: 50, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes { author { login __typename } body }
        }
      }
    }
  }`;

function fetchReviewThreadsPage(repo, pr, cursor) {
  const [owner, name] = repo.split("/");
  const args = [
    "api",
    "graphql",
    "-f",
    `query=${REVIEW_THREADS_QUERY}`,
    "-F",
    `owner=${owner}`,
    "-F",
    `name=${name}`,
    "-F",
    `pr=${pr}`,
  ];
  if (cursor) {
    args.push("-F", `cursor=${cursor}`);
  }
  const result = spawnSync("gh", args, { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`gh api graphql failed: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout).data.repository.pullRequest.reviewThreads;
}

function fetchThreadCommentsPage(threadId, cursor) {
  const args = [
    "api",
    "graphql",
    "-f",
    `query=${THREAD_COMMENTS_QUERY}`,
    "-F",
    `id=${threadId}`,
  ];
  if (cursor) {
    args.push("-F", `cursor=${cursor}`);
  }
  const result = spawnSync("gh", args, { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`gh api graphql failed: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout).data.node.comments;
}

/** Every comment on a single thread, following `comments.pageInfo` past the first page. */
function fetchAllThreadComments(thread) {
  const nodes = [...thread.comments.nodes];
  let pageInfo = thread.comments.pageInfo;
  while (pageInfo?.hasNextPage) {
    const page = fetchThreadCommentsPage(thread.id, pageInfo.endCursor);
    nodes.push(...page.nodes);
    pageInfo = page.pageInfo;
  }
  return nodes;
}

/**
 * Every review thread on the PR, paginated (finding 8 of PR #1067's third
 * review: `reviewThreads(first:100)` with no `pageInfo` handling silently
 * dropped anything past the first 100 threads), with every thread's comments
 * also paginated past their first page (finding 5 of PR #1067's fourth
 * review).
 */
function fetchAllReviewThreads(repo, pr) {
  const threads = [];
  let cursor = null;
  for (;;) {
    const page = fetchReviewThreadsPage(repo, pr, cursor);
    threads.push(...page.nodes);
    if (!page.pageInfo.hasNextPage) break;
    cursor = page.pageInfo.endCursor;
  }
  return threads.map((thread) => ({
    ...thread,
    comments: { nodes: fetchAllThreadComments(thread) },
  }));
}

async function main() {
  const args = process.argv.slice(2);
  const knownSubcommands = ["status", "resolve-post-cap", "prior-issue", "threads"];
  const subcommand = knownSubcommands.includes(args[0]) ? args.shift() : "status";

  if (subcommand === "threads") {
    const [repo, pr] = args;
    if (!repo || !pr) {
      console.error("Usage: node scripts/review-cap.mjs threads <owner/repo> <pr>");
      process.exitCode = 1;
      return;
    }
    const threads = fetchAllReviewThreads(repo, pr);
    console.log(
      JSON.stringify({
        unresolvedBot: unresolvedBotThreads(threads),
        all: formatThreadsForReview(threads),
      }),
    );
    return;
  }

  if (subcommand === "prior-issue") {
    const [repo, pr, verdict] = args;
    if (!repo || !pr || !verdict) {
      console.error(
        "Usage: node scripts/review-cap.mjs prior-issue <owner/repo> <pr> <ship|redesign>",
      );
      process.exitCode = 1;
      return;
    }
    console.log(
      JSON.stringify({ issue: findPriorIssue(fetchIssueComments(repo, pr), verdict) }),
    );
    return;
  }

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
