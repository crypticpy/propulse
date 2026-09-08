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
git fetch origin
git worktree add .worktrees/<slug> --detach origin/main
cd .worktrees/<slug> && git checkout -b <type>/<epic-slug>-<task-slug>
npm ci && (cd bridge && npm ci) && (cd collector && npm ci)
ln -sfn <path-to-shared>/ml/.venv ml/.venv     # if the ML venv lives in another checkout
npm run hooks:install
npm run verify                                  # the push gate; doc-only changes take the fast path
npx vitest run <path>                           # focused tests
git merge origin/main                           # before opening the PR and whenever main moves
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

| Setting                                                                        | Effect                                                           |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Repo → General → _Automatically delete head branches_                          | Merged branches stop piling up (109 swept by hand on 2026-09-07) |
| Project #4 → Workflows → _Item closed → Done_, _Pull request merged → Done_    | Board Done follows `Closes #N` with nobody touching it           |
| Project #4 → Workflows → _Item added → Backlog_                                | New issues never sit without a status                            |
| Branch protection on `main`: require `pr-contract` and conversation resolution | A PR without an issue link or with an open thread cannot merge   |
| Branch protection on `main`: block force pushes                                | Belt and braces                                                  |

## Why these rules (2026-09-07)

The PR-landing pass that produced this document found: two PRs in a seven-PR
stack re-implementing work already on `main` because nothing was claimed on
the board; the stack 315 commits behind `main`, reconciled by hand; 109
merged branches never deleted; PRs with no issue link or agent identity;
bot review threads left silent; items marked Done when a PR merely existed.
Each rule in the constitution maps to one of those.
