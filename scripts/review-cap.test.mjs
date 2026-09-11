import assert from "node:assert/strict";
import test from "node:test";
import {
  ALLOWED_REVIEWERS,
  countFindingReviews,
  countReviewRequests,
  countRounds,
  evaluateReviewCap,
  parseArchitectureReview,
  postCapFollowup,
} from "./review-cap.mjs";

const HEAD = "abc1234def5678900000000000000000000abcd";

function reviewRequest(login = "crypticpy", body = "@codex review") {
  return { user: { login }, body };
}

function architectureReview({
  agent = "Claude (review-cap automation)",
  sha = HEAD.slice(0, 7),
  verdict = "ship",
  issue = 12,
  login = "github-actions[bot]",
} = {}) {
  return {
    user: { login },
    body: `**architecture review**\n- agent: ${agent}\n- Reviewed: ${sha}\nVerdict: ${verdict} (#${issue})`,
  };
}

function codexReview(id, badge = "P1") {
  return {
    review: { id, user: { login: "chatgpt-codex-connector[bot]" }, body: "" },
    comments: [
      {
        reviewId: id,
        user: { login: "chatgpt-codex-connector[bot]" },
        body: `![${badge} Badge](https://img.shields.io/badge/${badge}-orange?style=flat) some finding`,
      },
    ],
  };
}

function sourceryReview(id, { hasComments = true } = {}) {
  return {
    review: { id, user: { login: "sourcery-ai[bot]" }, body: "" },
    comments: hasComments
      ? [{ reviewId: id, user: { login: "sourcery-ai[bot]" }, body: "Consider extracting this." }]
      : [],
  };
}

function flatten(entries) {
  return {
    reviews: entries.map((e) => e.review),
    reviewComments: entries.flatMap((e) => e.comments),
  };
}

// --- countReviewRequests ---------------------------------------------------

test("four review-request comments do not cap", () => {
  const issueComments = Array.from({ length: 4 }, () => reviewRequest());
  assert.equal(countReviewRequests(issueComments), 4);
});

test("bot-authored @codex review comments are not counted as requests", () => {
  const issueComments = [
    ...Array.from({ length: 4 }, () => reviewRequest()),
    reviewRequest("codex[bot]"),
    reviewRequest("propulse-bot[bot]"),
  ];
  assert.equal(countReviewRequests(issueComments), 4);
});

test("countReviewRequests ignores requests embedded mid-comment", () => {
  const issueComments = [
    { user: { login: "crypticpy" }, body: "please run @codex review later" },
    reviewRequest(),
  ];
  assert.equal(countReviewRequests(issueComments), 1);
});

// --- countFindingReviews ----------------------------------------------------

test("distinct Codex badge reviews are counted once per review id", () => {
  const entries = [codexReview(1), codexReview(2)];
  // A second badge comment on the same review id must not double-count.
  entries[0].comments.push({
    reviewId: 1,
    user: { login: "chatgpt-codex-connector[bot]" },
    body: "![P2 Badge](https://img.shields.io/badge/P2-yellow?style=flat) another finding",
  });
  const { reviews, reviewComments } = flatten(entries);
  assert.equal(countFindingReviews({ reviews, reviewComments }), 2);
});

test("a Sourcery review with inline comments counts as a finding review", () => {
  const { reviews, reviewComments } = flatten([sourceryReview(1)]);
  assert.equal(countFindingReviews({ reviews, reviewComments }), 1);
});

test("a budget-exhausted Sourcery review with no inline comments does not count", () => {
  const { reviews, reviewComments } = flatten([
    sourceryReview(1, { hasComments: false }),
  ]);
  assert.equal(countFindingReviews({ reviews, reviewComments }), 0);
});

test("a plain crypticpy reply review with no badge does not count", () => {
  const reviews = [{ id: 1, user: { login: "crypticpy" }, body: "" }];
  const reviewComments = [
    { reviewId: 1, user: { login: "crypticpy" }, body: "Fixed in abc123." },
  ];
  assert.equal(countFindingReviews({ reviews, reviewComments }), 0);
});

// --- countRounds: max(requests, findings) -----------------------------------

test("countRounds takes the max when findings exceed requests", () => {
  const issueComments = [reviewRequest()];
  const { reviews, reviewComments } = flatten([
    codexReview(1),
    codexReview(2),
    codexReview(3),
  ]);
  const result = countRounds({ issueComments, reviews, reviewComments });
  assert.deepEqual(result, { requests: 1, findings: 3, rounds: 3 });
});

test("countRounds takes the max when requests exceed findings", () => {
  const issueComments = Array.from({ length: 5 }, () => reviewRequest());
  const { reviews, reviewComments } = flatten([codexReview(1)]);
  const result = countRounds({ issueComments, reviews, reviewComments });
  assert.deepEqual(result, { requests: 5, findings: 1, rounds: 5 });
});

// --- parseArchitectureReview -------------------------------------------------

test("a verdict line with trailing prose is not a valid architecture review", () => {
  const parsed = parseArchitectureReview(
    "**architecture review**\n- agent: Claude (review-cap automation)\n- Reviewed: abc1234\nVerdict: ship (#12) trailing prose",
  );
  assert.equal(parsed, null);
});

test("a redesign verdict is accepted", () => {
  const parsed = parseArchitectureReview(
    "**architecture review**\n- agent: Claude (review-cap automation)\n- Reviewed: abc1234\nVerdict: redesign (#99)",
  );
  assert.deepEqual(parsed, {
    agent: "Claude (review-cap automation)",
    reviewedSha: "abc1234",
    verdict: "redesign",
    issue: 99,
  });
});

// --- evaluateReviewCap -------------------------------------------------------

function cappedInput(extraIssueComments = []) {
  const { reviews, reviewComments } = flatten(
    Array.from({ length: 5 }, (_, i) => codexReview(i + 1)),
  );
  return {
    issueComments: extraIssueComments,
    reviews,
    reviewComments,
    headSha: HEAD,
  };
}

test("not capped is always ok with a null verdict", () => {
  const { reviews, reviewComments } = flatten([codexReview(1)]);
  const result = evaluateReviewCap({
    issueComments: [],
    reviews,
    reviewComments,
    headSha: HEAD,
  });
  assert.equal(result.capped, false);
  assert.equal(result.ok, true);
  assert.equal(result.verdict, null);
  assert.equal(result.reviewed, false);
});

test("capped with a ship verdict for the head is ok and reviewed", () => {
  const result = evaluateReviewCap(cappedInput([architectureReview()]));
  assert.equal(result.capped, true);
  assert.equal(result.reviewed, true);
  assert.equal(result.verdict, "ship");
  assert.equal(result.issue, 12);
  assert.equal(result.ok, true);
});

test("capped with a redesign verdict for the head is reviewed but not ok", () => {
  const result = evaluateReviewCap(
    cappedInput([architectureReview({ verdict: "redesign", issue: 55 })]),
  );
  assert.equal(result.capped, true);
  assert.equal(result.reviewed, true);
  assert.equal(result.verdict, "redesign");
  assert.equal(result.ok, false);
  assert.match(result.reason, /redesign required, see #55/);
});

test("capped with no architecture review comment is pending and not ok", () => {
  const result = evaluateReviewCap(cappedInput());
  assert.equal(result.capped, true);
  assert.equal(result.reviewed, false);
  assert.equal(result.verdict, null);
  assert.equal(result.ok, false);
  assert.match(result.reason, /no \*\*architecture review\*\*/);
});

test("capped with a review pinned to an old head fails", () => {
  const result = evaluateReviewCap(
    cappedInput([architectureReview({ sha: "0000000" })]),
  );
  assert.equal(result.ok, false);
  assert.equal(result.reviewed, false);
});

test("capped with a review from a non-allowed login fails", () => {
  const result = evaluateReviewCap(
    cappedInput([architectureReview({ login: "random-fixer" })]),
  );
  assert.equal(result.ok, false);
  assert.equal(result.reviewed, false);
});

test("crypticpy is still an allowed architecture-review author", () => {
  assert.ok(ALLOWED_REVIEWERS.includes("crypticpy"));
  const result = evaluateReviewCap(
    cappedInput([architectureReview({ login: "crypticpy" })]),
  );
  assert.equal(result.ok, true);
});

// --- postCapFollowup ---------------------------------------------------------

test("postCapFollowup is active only after a ship verdict for the head", () => {
  const shipped = evaluateReviewCap(cappedInput([architectureReview()]));
  assert.deepEqual(postCapFollowup(shipped), { active: true, issue: 12 });

  const redesigned = evaluateReviewCap(
    cappedInput([architectureReview({ verdict: "redesign", issue: 55 })]),
  );
  assert.deepEqual(postCapFollowup(redesigned), { active: false, issue: null });

  const pending = evaluateReviewCap(cappedInput());
  assert.deepEqual(postCapFollowup(pending), { active: false, issue: null });

  const { reviews, reviewComments } = flatten([codexReview(1)]);
  const notCapped = evaluateReviewCap({
    issueComments: [],
    reviews,
    reviewComments,
    headSha: HEAD,
  });
  assert.deepEqual(postCapFollowup(notCapped), { active: false, issue: null });
});

// --- JSON output shape --------------------------------------------------------

test("evaluateReviewCap output is JSON-serialisable with the documented keys", () => {
  const result = evaluateReviewCap(cappedInput([architectureReview()]));
  const roundTripped = JSON.parse(JSON.stringify(result));
  assert.deepEqual(Object.keys(roundTripped).sort(), [
    "agent",
    "capped",
    "findingRounds",
    "issue",
    "ok",
    "reason",
    "requestRounds",
    "reviewed",
    "rounds",
    "verdict",
  ]);
});
