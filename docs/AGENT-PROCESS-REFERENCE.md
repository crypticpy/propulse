# Agent process reference

Lookup material for [`AGENT-CONSTITUTION.md`](AGENT-CONSTITUTION.md). Read the
section you need, not the file.

## Comment formats

First line is the bold keyword so a thread can be scanned by eye or script.
Keep each to a few lines.

```markdown
**claim**

- agent: Claude (session https://claude.ai/code/session_…) | Codex | Cursor | Human @name
- branch: feat/<epic>-<task>
- scope: <one sentence>
- files: <paths; shared files from the epic's Coordination section called out>
- eta: <date or "this session">
```

```markdown
**progress** (on the epic)

- merged: #…, #…
- in flight: #… (In review, waiting on Codex thread), #… (In progress, branch …)
- blocked: #… on <what>
- next: <the first thing the next session should do>
```

```markdown
**handoff**

- branch: … (pushed at <sha>)
- done: …
- remaining: …
- next step: <exact command or action>
- traps: …
```

```markdown
**review**

1. **S1 — blocker:** file:line — scenario — fix
2. …
   Verdict: mergeable after S1, S2.
```

```markdown
**done**

- merged: <sha> (PR #…)
- live: <URL or service> at <time UTC>
- look at: …
- follow-ups: #…
```

`**blocked**`, `**withdrawn**`, `**releasing stale claim**`: same shape, one-line
reason.

## Worktree setup and verification

```bash
npm run worktree:new -- <slug> [<type>/<epic-slug>-<task-slug>]   # bootstraps or repairs .worktrees/<slug>; see scripts/new-worktree.sh
npm run verify                                  # the push gate; doc-only changes take the fast path
npx vitest run <path>                           # focused tests
git merge origin/main                           # before opening the PR and whenever main moves
```

`worktree:new` is idempotent — re-run it against a worktree that already
exists to fill in whatever a prior run left missing (dependencies, the
`ml/.venv` symlink, hooks). It also warns when `git worktree list` crosses a
high count, since abandoned worktrees hide unpushed work from the issue
board (#160).

Expanded form, for when the script is unavailable (this is what it runs):

```bash
git fetch origin
git worktree add -b <type>/<epic-slug>-<task-slug> .worktrees/<slug> origin/main
cd .worktrees/<slug>
npm ci && (cd bridge && npm ci) && (cd collector && npm ci)
ln -sfn <path-to-shared>/ml/.venv ml/.venv     # if the ML venv lives in another checkout
npm run hooks:install
```

Finding open PRs that touch your files:

```bash
gh pr list --state open --json number,title,headRefName,files \
  --jq '.[] | select(.files[].path | test("src/components/map/")) | {number,title,headRefName}'
```

## Working the board

Project #4 (v2). IDs are stable; `gh project field-list 4 --owner crypticpy`
is the source of truth if one fails.

```bash
gh project item-list 4 --owner crypticpy --format json --limit 200 \
  | jq '.items[] | {id, title, status, agent, url: .content.url}'
gh project item-add 4 --owner crypticpy --url https://github.com/crypticpy/propulse/issues/<N> --format json --jq .id
gh project item-edit --project-id PVT_kwHOAsYuns4Bij4g --id <ITEM_ID> \
  --field-id PVTSSF_lAHOAsYuns4Bij4gzhhbeok --single-select-option-id <STATUS>
gh project item-edit --project-id PVT_kwHOAsYuns4Bij4g --id <ITEM_ID> \
  --field-id PVTSSF_lAHOAsYuns4Bij4gzhhbesw --single-select-option-id <AGENT>
```

| Status      | option     | Agent  | option                  |
| ----------- | ---------- | ------ | ----------------------- |
| Backlog     | `d75ecc3f` | Claude | `20fcf29d`              |
| Ready       | `673e7b5d` | others | `gh project field-list` |
| Claimed     | `35fa2bd9` |        |                         |
| In progress | `1de4eb45` |        |                         |
| In review   | `08f368c2` |        |                         |
| Done        | `2536fb27` |        |                         |

Reading threads:

```bash
gh issue view <N> --comments
gh pr view <N> --comments
gh api graphql -f query='{ repository(owner:"crypticpy", name:"propulse") { pullRequest(number:<N>) {
  reviewThreads(first:50) { nodes { id isResolved path comments(first:1) { nodes { body } } } } } } }'
gh api graphql -f query='mutation { resolveReviewThread(input:{threadId:"<THREAD_ID>"}) { thread { isResolved } } }'
```

Replying to an inline review comment:

```bash
gh api -X POST repos/crypticpy/propulse/pulls/<N>/comments/<COMMENT_ID>/replies -f body="Fixed in <sha>."
```

Merging and cleaning up:

```bash
gh pr view <N> --json mergeable,mergeStateStatus,statusCheckRollup
gh pr merge <N> --merge
git push origin --delete <branch>          # until auto-delete is on
```

GitHub's secondary rate limit punishes bursts: one call at a time, a beat
between them, one watcher per PR.

## Self-service queue (from 2026-09-09)

The orchestrator is not a work dispatcher. It reviews, fixes and merges.
Agents take their own work off the board.

**Taking work.** Ask for the top item in **Status = Ready** carrying the size
label you were told to take (`size:S`, `size:M`, `size:L`). Highest priority
first (`P1 bug` before `P2 core` before `P3 expansion`), oldest first inside a
priority. Then:

```bash
gh issue list --label ready --label "size:M" --state open \
  --json number,title,labels --jq '.[] | "\(.number) \(.title)"'
```

Claim it before you write a line of code: set **Agent** to yourself and
**Status = Claimed** on Project #4, and post the claim comment. If two agents
race, the earlier claim comment wins and the later one picks the next item.

**The labels.**

| Label               | Means                                                          |
| ------------------- | -------------------------------------------------------------- |
| `size:S`            | One file cluster, one sitting                                   |
| `size:M`            | A few modules; still one PR of at most 15 files                 |
| `size:L`            | Multi-area; expect to split into sequential PRs                 |
| `size:XL`           | Must be split before anyone claims it — do not take one         |
| `difficulty:easy`   | Spec is unambiguous and there are patterns to copy              |
| `difficulty:medium` | Needs judgement inside a known area                             |
| `difficulty:hard`   | Design decisions or cross-cutting risk; pair with a review pass |
| `ready`             | Unblocked and specified — claimable now                         |
| `blocked`           | Waiting on another issue or PR; the body names it               |
| `needs-owner`       | Waiting on an owner decision; do not start                      |

An item is `ready` only when it is both unblocked and specified well enough to
work from the body alone. If you claim a `ready` item and find it is neither,
say so in a comment, put it back (`Status = Backlog`, swap `ready` for
`blocked` or `needs-owner`), and take the next one. That is a normal outcome,
not a failure.

**Dependencies** are recorded natively — `blocked_by` on the issue, visible in
the GitHub UI — and mirrored as a "**Blocked by** …" line in the body when the
blocker is a *pull request* (the API rejects PRs as dependency targets):

```bash
gh api repos/crypticpy/propulse/issues/<N>/dependencies/blocked_by
gh api --method POST repos/crypticpy/propulse/issues/<N>/dependencies/blocked_by -F issue_id=<BLOCKER_DB_ID>
```

**Working it.** Fresh worktree off `origin/main`, never the primary checkout.
One PR, at most 15 files, `Closes #N` (or `Refs #N`) plus the `Agent:` line in
the body. **Commit only** — you do not push, open PRs, or merge. Post a
**progress** comment before you stop for any reason.

**What the reviewer does.** The Opus reviewer posts the second-opinion review,
**fixes what is broken itself** rather than handing the branch back, resolves
every thread, merges once checks are green, and prunes the worktree. Work only
comes back to you if the whole approach was wrong.

Sizing exists so several agents can run at once without a human deciding who
gets what: four to six coding agents on `size:S`/`size:M` items keep one
reviewer busy, which is the intended ratio.

## Deploys

- App (`src/`, `api/`): Vercel builds production from `main` automatically.
  Confirm the production deployment for the merge SHA reports `success`
  before posting `**done**`.
- Collector: `railway up ./collector --path-as-root --service <collector-service-id> --environment production --detach`.
  Plain `railway up` uploads the repo root and the root `railway.json` hijacks
  the build.
- Inference (`ml/service`): the inference deploy script, from a clean worktree
  at `main`. The path-history provider stays `unavailable` until its gate
  passes.
- Database: migrations are never auto-applied. Apply with `psql`, write the
  ledger row, `NOTIFY pgrst`. Write pages of at most 1000 rows (PostgREST has
  an 8 s statement timeout).

## Owner settings that make the process self-enforcing

| Setting                                                                                     | Effect                                                                                                              |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Repo → General → _Automatically delete head branches_                                       | Merged branches stop piling up (109 swept by hand on 2026-09-07)                                                    |
| Project #4 → Workflows: leave _Item closed → Done_ and _Pull request merged → Done_ **off** | `Closes #N` closes the issue at merge, before the deploy; Done stays a manual move made with the `**done**` comment |
| Project #4 → Workflows → _Item added → Backlog_                                             | New issues never sit without a status                                                                               |
| Branch protection on `main`: require `pr-contract` and conversation resolution              | A PR without an issue link or with an open thread cannot merge                                                      |
| Branch protection on `main`: block force pushes                                             | Belt and braces                                                                                                     |

## Why these rules (2026-09-07)

The PR-landing pass that produced this document found: two PRs in a seven-PR
stack re-implementing work already on `main` because nothing was claimed on
the board; the stack 315 commits behind `main`, reconciled by hand; 109
merged branches never deleted; PRs with no issue link or agent identity;
bot review threads left silent; items marked Done when a PR merely existed.
Each rule in the constitution maps to one of those.
