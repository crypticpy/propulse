## Summary

<!-- One or two sentences: what changed and why. -->

<!-- Closes when this PR completes the issue; Refs for a partial slice. One of
the two is required — the pr-contract check enforces it. -->

Closes #
Refs #

<!-- Agent family and session URL if any, e.g.
Agent: Claude (https://claude.ai/code/session_…)
Agent: Codex
Agent: Human -->

Agent:

<!-- Required when the PR touches UI (anything a person sees; path list in
docs/AGENT-CONSTITUTION.md, Design and UI review). A Claude Fable session
posts a **design review** comment with Reviewed: <head sha> and
Verdict: approved; put the words approved by Fable and the comment URL after
the colon below. Write requested until then. pr-contract checks the comment
itself, so a new push needs a new comment. Leave blank for non-UI PRs. -->

Design review:

## Test plan

<!-- Commands run + result. Routes/pages checked and how. -->

## Board

<!-- Item should be In review. -->

## Risks / follow-ups

## Checklist

- [ ] At most 15 files
- [ ] Branched from current `origin/main`, and `main` merged in
- [ ] `npm run verify` passes in the worktree
- [ ] Every review thread will be answered before merge
- [ ] UI change: Fable **design review** `approved` for this head (Design review line filled)
- [ ] No generated artifacts, secrets, or plans committed
- [ ] Feature-register rows flipped if applicable
