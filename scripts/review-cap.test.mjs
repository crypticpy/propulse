import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  ALLOWED_REVIEWERS,
  AUTOMATION_AGENT,
  BREAK_GLASS_AGENT,
  REVIEW_BOT_LOGINS,
  countFindingReviews,
  countReviewRequests,
  countRounds,
  evaluateReviewCap,
  findPriorIssue,
  formatThreadsForReview,
  parseArchitectureReview,
  postCapFollowup,
  unresolvedBotThreads,
} from "./review-cap.mjs";

const HEAD = "abc1234def5678900000000000000000000abcd";

function reviewRequest(login = "crypticpy", body = "@codex review") {
  return { user: { login }, body };
}

function architectureReview({
  agent = AUTOMATION_AGENT,
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

// --- countReviewRequests: write-access allow-list ---------------------------

test("four review-request comments from an allow-listed login do not cap", () => {
  const issueComments = Array.from({ length: 4 }, () => reviewRequest());
  assert.equal(countReviewRequests(issueComments), 4);
});

test("propulse-bot[bot] is an allowed requester", () => {
  const issueComments = [reviewRequest("propulse-bot[bot]")];
  assert.equal(countReviewRequests(issueComments), 1);
});

test("a non-allow-listed login's @codex review does not count as a request", () => {
  const issueComments = [
    ...Array.from({ length: 4 }, () => reviewRequest()),
    reviewRequest("codex[bot]"),
    reviewRequest("random-fixer"),
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

test("a review whose only badge is P0 counts as a finding review", () => {
  const { reviews, reviewComments } = flatten([codexReview(1, "P0")]);
  assert.equal(countFindingReviews({ reviews, reviewComments }), 1);
});

test("a plain crypticpy reply review with no badge does not count", () => {
  const reviews = [{ id: 1, user: { login: "crypticpy" }, body: "" }];
  const reviewComments = [
    { reviewId: 1, user: { login: "crypticpy" }, body: "Fixed in abc123." },
  ];
  assert.equal(countFindingReviews({ reviews, reviewComments }), 0);
});

test("a badge review from a human login does not count (finding 5 of PR #1067's third review)", () => {
  const reviews = [{ id: 1, user: { login: "some-human" }, body: "" }];
  const reviewComments = [
    {
      reviewId: 1,
      user: { login: "some-human" },
      body: "![P1 Badge](https://img.shields.io/badge/P1-orange?style=flat) planted finding",
    },
  ];
  assert.equal(countFindingReviews({ reviews, reviewComments }), 0);
});

test("a badge review from an unrecognised bot login does not count", () => {
  assert.deepEqual(REVIEW_BOT_LOGINS, ["chatgpt-codex-connector[bot]", "sourcery-ai[bot]"]);
  const reviews = [{ id: 1, user: { login: "codex[bot]" }, body: "" }];
  const reviewComments = [
    {
      reviewId: 1,
      user: { login: "codex[bot]" },
      body: "![P1 Badge](https://img.shields.io/badge/P1-orange?style=flat) planted finding",
    },
  ];
  assert.equal(countFindingReviews({ reviews, reviewComments }), 0);
});

// --- countRounds: max(requests, findings - 1) --------------------------------
// The -1 excludes Codex's automatic review-on-open, which precedes any
// request and is not caused by the fix loop.

test("countRounds discounts findings by one before taking the max", () => {
  const issueComments = [reviewRequest()];
  const { reviews, reviewComments } = flatten([
    codexReview(1),
    codexReview(2),
    codexReview(3),
  ]);
  const result = countRounds({ issueComments, reviews, reviewComments });
  assert.deepEqual(result, { requests: 1, findings: 3, rounds: 2 });
});

test("countRounds takes the max when requests exceed discounted findings", () => {
  const issueComments = Array.from({ length: 5 }, () => reviewRequest());
  const { reviews, reviewComments } = flatten([codexReview(1)]);
  const result = countRounds({ issueComments, reviews, reviewComments });
  assert.deepEqual(result, { requests: 5, findings: 1, rounds: 5 });
});

test("the #1036 shape (4 requests, 5 finding reviews) is not capped", () => {
  const issueComments = Array.from({ length: 4 }, () => reviewRequest());
  const { reviews, reviewComments } = flatten(
    Array.from({ length: 5 }, (_, i) => codexReview(i + 1)),
  );
  const result = evaluateReviewCap({
    issueComments,
    reviews,
    reviewComments,
    headSha: HEAD,
  });
  assert.equal(result.rounds, 4);
  assert.equal(result.capped, false);
});

test("the #874 shape (44 requests, 44 finding reviews) is still capped", () => {
  const issueComments = Array.from({ length: 44 }, () => reviewRequest());
  const { reviews, reviewComments } = flatten(
    Array.from({ length: 44 }, (_, i) => codexReview(i + 1)),
  );
  const result = evaluateReviewCap({
    issueComments,
    reviews,
    reviewComments,
    headSha: HEAD,
  });
  assert.equal(result.rounds, 44);
  assert.equal(result.capped, true);
});

test("cap boundary: findings=5 (discounted to 4) is not capped, findings=6 (discounted to 5) is capped", () => {
  const notCapped = flatten(Array.from({ length: 5 }, (_, i) => codexReview(i + 1)));
  const notCappedResult = countRounds({
    issueComments: [],
    reviews: notCapped.reviews,
    reviewComments: notCapped.reviewComments,
  });
  assert.equal(notCappedResult.rounds, 4);

  const capped = flatten(Array.from({ length: 6 }, (_, i) => codexReview(i + 1)));
  const cappedResult = countRounds({
    issueComments: [],
    reviews: capped.reviews,
    reviewComments: capped.reviewComments,
  });
  assert.equal(cappedResult.rounds, 5);
});

// --- parseArchitectureReview -------------------------------------------------

test("a verdict line with trailing prose is not a valid architecture review", () => {
  const parsed = parseArchitectureReview(
    `**architecture review**\n- agent: ${AUTOMATION_AGENT}\n- Reviewed: abc1234\nVerdict: ship (#12) trailing prose`,
  );
  assert.equal(parsed, null);
});

test("a blockquoted verdict line is not a valid architecture review", () => {
  const parsed = parseArchitectureReview(
    `**architecture review**\n- agent: ${AUTOMATION_AGENT}\n- Reviewed: abc1234\n> Verdict: ship (#12)`,
  );
  assert.equal(parsed, null);
});

test("a redesign verdict is accepted", () => {
  const parsed = parseArchitectureReview(
    `**architecture review**\n- agent: ${AUTOMATION_AGENT}\n- Reviewed: abc1234\nVerdict: redesign (#99)`,
  );
  assert.deepEqual(parsed, {
    agent: AUTOMATION_AGENT,
    reviewedSha: "abc1234",
    verdict: "redesign",
    issue: 99,
  });
});

test("an agent line naming neither the automation nor the break-glass form is rejected", () => {
  const parsed = parseArchitectureReview(
    "**architecture review**\n- agent: Some Other Agent\n- Reviewed: abc1234\nVerdict: ship (#12)",
  );
  assert.equal(parsed, null);
});

test("the break-glass agent line is accepted", () => {
  const parsed = parseArchitectureReview(
    `**architecture review**\n- agent: ${BREAK_GLASS_AGENT}\n- Reviewed: abc1234\nVerdict: ship (#12)`,
  );
  assert.equal(parsed.agent, BREAK_GLASS_AGENT);
});

// --- evaluateReviewCap -------------------------------------------------------

function cappedInput(extraIssueComments = []) {
  // 6 finding reviews discount to 5, which meets the cap.
  const { reviews, reviewComments } = flatten(
    Array.from({ length: 6 }, (_, i) => codexReview(i + 1)),
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

test("a NONE-association comment with a valid-looking ship verdict is ignored (finding 5 of PR #1067's second review: an outside contributor cannot plant an architecture review)", () => {
  const result = evaluateReviewCap(
    cappedInput([
      {
        user: { login: "some-outside-contributor" },
        authorAssociation: "NONE",
        body: architectureReview().body,
      },
    ]),
  );
  assert.equal(result.ok, false);
  assert.equal(result.reviewed, false);
});

test("crypticpy is still an allowed architecture-review author via the break-glass agent line", () => {
  assert.ok(ALLOWED_REVIEWERS.includes("crypticpy"));
  const result = evaluateReviewCap(
    cappedInput([
      architectureReview({ login: "crypticpy", agent: BREAK_GLASS_AGENT }),
    ]),
  );
  assert.equal(result.ok, true);
});

test("crypticpy posting with the automation's agent line is still accepted (agent identity is not login-bound)", () => {
  const result = evaluateReviewCap(
    cappedInput([architectureReview({ login: "crypticpy" })]),
  );
  assert.equal(result.ok, true);
});

// --- last-match-wins verdict resolution --------------------------------------

test("a later redesign supersedes an earlier ship for the same head", () => {
  const result = evaluateReviewCap(
    cappedInput([
      architectureReview({ verdict: "ship", issue: 12 }),
      architectureReview({ verdict: "redesign", issue: 55 }),
    ]),
  );
  assert.equal(result.verdict, "redesign");
  assert.equal(result.issue, 55);
  assert.equal(result.ok, false);
});

test("a later ship supersedes an earlier redesign for the same head", () => {
  const result = evaluateReviewCap(
    cappedInput([
      architectureReview({ verdict: "redesign", issue: 55 }),
      architectureReview({ verdict: "ship", issue: 12 }),
    ]),
  );
  assert.equal(result.verdict, "ship");
  assert.equal(result.issue, 12);
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

// --- findPriorIssue -----------------------------------------------------------

test("findPriorIssue reuses the latest comment whose verdict matches the requested verdict", () => {
  const issueComments = [
    architectureReview({ verdict: "ship", issue: 12 }),
    architectureReview({ verdict: "redesign", issue: 55 }),
  ];
  assert.equal(findPriorIssue(issueComments, "ship"), 12);
  assert.equal(findPriorIssue(issueComments, "redesign"), 55);
});

test("findPriorIssue does not reuse a prior issue whose recorded verdict does not match the current verdict (finding 3 of PR #1067's fourth review)", () => {
  const issueComments = [architectureReview({ verdict: "redesign", issue: 55 })];
  assert.equal(findPriorIssue(issueComments, "ship"), null);
  assert.equal(findPriorIssue(issueComments, "redesign"), 55);
});

test("findPriorIssue ignores a look-alike comment that is not a valid architecture review (finding 6 of PR #1067's third review)", () => {
  const issueComments = [
    {
      user: { login: "github-actions[bot]" },
      body: "**architecture review**\nVerdict: ship (#999) but not really a valid review",
    },
  ];
  assert.equal(findPriorIssue(issueComments, "ship"), null);
});

test("findPriorIssue ignores a valid-shaped comment from a non-allowed login", () => {
  const issueComments = [architectureReview({ login: "random-fixer" })];
  assert.equal(findPriorIssue(issueComments, "ship"), null);
});

test("findPriorIssue returns null when there is no prior architecture review", () => {
  assert.equal(findPriorIssue([], "ship"), null);
});

// --- unresolvedBotThreads and formatThreadsForReview ---------------------------

function thread({ id, isResolved = false, path = null, line = null, comments }) {
  return {
    id,
    isResolved,
    path,
    line,
    comments: { nodes: comments },
  };
}

test("unresolvedBotThreads keeps only unresolved threads whose first comment author is exactly Bot (finding 2 of PR #1067's third review)", () => {
  const threads = [
    thread({
      id: "t1",
      comments: [
        { author: { login: "chatgpt-codex-connector[bot]", __typename: "Bot" }, body: "finding" },
      ],
    }),
    thread({
      id: "t2",
      comments: [
        { author: { login: null, __typename: null }, body: "deleted account's blocking comment" },
      ],
    }),
    thread({
      id: "t3",
      comments: [
        { author: { login: "ghost", __typename: "Mannequin" }, body: "migrated account" },
      ],
    }),
    thread({
      id: "t4",
      comments: [
        { author: { login: "some-org", __typename: "Organization" }, body: "org account" },
      ],
    }),
    thread({
      id: "t5",
      isResolved: true,
      comments: [
        { author: { login: "chatgpt-codex-connector[bot]", __typename: "Bot" }, body: "already resolved" },
      ],
    }),
  ];
  assert.deepEqual(unresolvedBotThreads(threads), [{ id: "t1", firstComment: "finding" }]);
});

test("formatThreadsForReview serializes every thread with every comment, resolved or not", () => {
  const threads = [
    thread({
      id: "t1",
      isResolved: false,
      path: "src/foo.ts",
      line: 12,
      comments: [
        { author: { login: "chatgpt-codex-connector[bot]" }, body: "finding" },
        { author: { login: "crypticpy" }, body: "fixed in abc123" },
      ],
    }),
    thread({ id: "t2", isResolved: true, comments: [] }),
  ];
  assert.deepEqual(formatThreadsForReview(threads), [
    {
      id: "t1",
      isResolved: false,
      path: "src/foo.ts",
      line: 12,
      comments: [
        { login: "chatgpt-codex-connector[bot]", body: "finding" },
        { login: "crypticpy", body: "fixed in abc123" },
      ],
    },
    { id: "t2", isResolved: true, path: null, line: null, comments: [] },
  ]);
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

// --- review-cap.yml's mirrored bot login allow-list --------------------------
// review-cap.yml cannot `import` REVIEW_BOT_LOGINS (a workflow `if:` has no
// module system), so it carries its own copy in the `count` job's trigger
// gate. This test reads that YAML back and asserts it has not drifted from
// the source of truth here (finding 4 of PR #1067's fourth review).

const WORKFLOW_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".github",
  "workflows",
  "review-cap.yml",
);

test("review-cap.yml's REVIEW_BOT_LOGINS anchor and count job if: expression match REVIEW_BOT_LOGINS", () => {
  const yaml = fs.readFileSync(WORKFLOW_PATH, "utf8");

  const anchorMatch = yaml.match(/#\s*REVIEW_BOT_LOGINS:\s*(.+)/);
  assert.ok(
    anchorMatch,
    "expected a `# REVIEW_BOT_LOGINS:` anchor comment in review-cap.yml",
  );
  const listed = anchorMatch[1]
    .split(",")
    .map((login) => login.trim())
    .filter(Boolean);
  assert.deepEqual(new Set(listed), new Set(REVIEW_BOT_LOGINS));

  const countJobStart = yaml.indexOf("\n  count:\n");
  assert.ok(countJobStart !== -1, "expected a `count:` job in review-cap.yml");
  const nextJobStart = yaml.indexOf("\n  label:\n", countJobStart);
  const countJobSection = yaml.slice(
    countJobStart,
    nextJobStart === -1 ? undefined : nextJobStart,
  );
  const ifMatch = countJobSection.match(/if:\s*>-\n([\s\S]*?)\n\s*runs-on:/);
  assert.ok(ifMatch, "expected to find the count job's `if:` expression");
  const ifExpression = ifMatch[1];
  for (const login of REVIEW_BOT_LOGINS) {
    assert.ok(
      ifExpression.includes(login),
      `expected the count job's if: expression to include ${login}`,
    );
  }
});
