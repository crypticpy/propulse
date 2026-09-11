import assert from "node:assert/strict";
import test from "node:test";
import {
  countReviewRounds,
  evaluateReviewCap,
  parseArchitectureReview,
} from "./review-cap.mjs";

const HEAD = "abc1234def5678900000000000000000000abcd";
const ALLOWED = ["crypticpy", "propulse-bot[bot]"];

function reviewRequest(login = "crypticpy", body = "@codex review") {
  return { user: { login }, body };
}

function architectureReview({
  agent = "Claude Opus",
  sha = HEAD.slice(0, 7),
  verdict = "ship",
  issue = 12,
  login = "crypticpy",
  trailing = "",
} = {}) {
  return {
    user: { login },
    body: `**architecture review**\n- agent: ${agent}\n- Reviewed: ${sha}\nVerdict: ${verdict} (#${issue})${trailing}`,
  };
}

test("four review-request comments do not cap", () => {
  const comments = Array.from({ length: 4 }, () => reviewRequest());
  const result = evaluateReviewCap({
    comments,
    headSha: HEAD,
    allowedReviewers: ALLOWED,
  });
  assert.equal(result.rounds, 4);
  assert.equal(result.capped, false);
  assert.equal(result.ok, true);
  assert.equal(result.verdict, null);
});

test("five review-request comments cap with no review", () => {
  const comments = Array.from({ length: 5 }, () => reviewRequest());
  const result = evaluateReviewCap({
    comments,
    headSha: HEAD,
    allowedReviewers: ALLOWED,
  });
  assert.equal(result.rounds, 5);
  assert.equal(result.capped, true);
  assert.equal(result.ok, false);
  assert.match(result.reason, /no \*\*architecture review\*\*/);
});

test("capped with a valid architecture review for the current head passes", () => {
  const comments = [
    ...Array.from({ length: 5 }, () => reviewRequest()),
    architectureReview(),
  ];
  const result = evaluateReviewCap({
    comments,
    headSha: HEAD,
    allowedReviewers: ALLOWED,
  });
  assert.equal(result.capped, true);
  assert.equal(result.ok, true);
  assert.equal(result.verdict, "ship");
});

test("capped with a review pinned to an old head fails", () => {
  const comments = [
    ...Array.from({ length: 5 }, () => reviewRequest()),
    architectureReview({ sha: "0000000" }),
  ];
  const result = evaluateReviewCap({
    comments,
    headSha: HEAD,
    allowedReviewers: ALLOWED,
  });
  assert.equal(result.capped, true);
  assert.equal(result.ok, false);
});

test("capped with a review from a non-allowed login fails", () => {
  const comments = [
    ...Array.from({ length: 5 }, () => reviewRequest()),
    architectureReview({ login: "random-fixer" }),
  ];
  const result = evaluateReviewCap({
    comments,
    headSha: HEAD,
    allowedReviewers: ALLOWED,
  });
  assert.equal(result.capped, true);
  assert.equal(result.ok, false);
});

test("bot-authored @codex review comments are not counted", () => {
  const comments = [
    ...Array.from({ length: 4 }, () => reviewRequest()),
    reviewRequest("codex[bot]"),
    reviewRequest("propulse-bot[bot]"),
  ];
  const result = evaluateReviewCap({
    comments,
    headSha: HEAD,
    allowedReviewers: ALLOWED,
  });
  assert.equal(result.rounds, 4);
  assert.equal(result.capped, false);
});

test("a verdict line with trailing prose is not a valid architecture review", () => {
  const parsed = parseArchitectureReview(
    "**architecture review**\n- agent: Claude Opus\n- Reviewed: abc1234\nVerdict: ship (#12) trailing prose",
  );
  assert.equal(parsed, null);
});

test("a redesign verdict is accepted", () => {
  const parsed = parseArchitectureReview(
    "**architecture review**\n- agent: Claude Opus\n- Reviewed: abc1234\nVerdict: redesign (#99)",
  );
  assert.deepEqual(parsed, {
    agent: "Claude Opus",
    reviewedSha: "abc1234",
    verdict: "redesign",
    issue: 99,
  });
});

test("countReviewRounds ignores requests embedded mid-comment", () => {
  const comments = [
    { user: { login: "crypticpy" }, body: "please run @codex review later" },
    reviewRequest(),
  ];
  assert.equal(countReviewRounds(comments), 1);
});
