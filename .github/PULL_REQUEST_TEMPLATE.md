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

<!-- Required when the PR touches UI (src/components, src/pages, src/styles,
docs/designs, .design-sync, anything a person sees). A Claude Fable session
posts a **design review** comment; put its verdict and URL here, e.g.
Design review: approved by Fable (https://github.com/…#issuecomment-…)
Use "Design review: requested" until then. pr-contract fails a UI PR whose
body lacks "Design review: approved". Leave blank for non-UI PRs. -->

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
