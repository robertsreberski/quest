# quest — end-to-end walkthrough

A real, captured run of the whole loop: **plan → dispatch → iterate → checkpoint
→ verify-from-store**, across **both store backends** (`local` and `github`) and
**both workers** (Claude in-session, Codex headless).

Every command below was run for real; the output blocks are the actual results,
trimmed for noise (elisions marked `…`). Nothing here is fabricated — where a
worker reported no USD cost (Codex is token-only), that is shown as-is.

**Model policy (the cheap-tier demo).** To keep reproduction inexpensive — and
to prove tiers are adjustable *per quest* — this walkthrough runs the
orchestrator on **sonnet** and the executor/worker on **haiku** (Codex uses the
config default `gpt-5.5`). The model flags are visible in the commands. Your
production defaults can stay `opus`/`xhigh`; the demo overrides them per dispatch.

## Conventions

- `$PLUGIN_DIR` — your quest plugin checkout (the same path you pass to
  `claude --plugin-dir .`; see the README *Install* section).
- The CLI (`quest`, `quest-run`) is on `PATH` for each demo dir via
  `export PATH="$PLUGIN_DIR/bin:$PATH"`.
- Demo repos are throwaway `mktemp -d` dirs; paths in output are shown as generic
  `/tmp/quest-demo-*` markers.

---

## 1. Local backend — author a quest

Spin up a throwaway repo, create a store, and author a small quest with a **real
validation loop** (`make hello`). Note `--model haiku` on the record — this is
the cheap tier the executor will run at.

```bash
DEMO=$(mktemp -d)                    # throwaway git repo
cd "$DEMO" && git init -q && git commit -q --allow-empty -m init
export PATH="$PLUGIN_DIR/bin:$PATH"

quest init
```

```
Initialized local quest store at /tmp/quest-demo-local/.quests

Store created. Next steps:
  1. Author a quest:   quest create --help   (or $quest:plan in your agent session)
  2. Check it:         quest lint --all
  3. Work it:          $quest:work <id> in-session, or quest-run <id> headless
```

```bash
quest create --title "make hello prints hello" \
  --objective "A Makefile in the repo root provides a \`hello\` target that prints the word hello." \
  --done-when "\`make hello\` prints a line containing hello" \
  --done-when "the Makefile is committed" \
  --validation "make hello" \
  --worker claude --model haiku --max-iterations 3 --priority p1
```

```
Created quest 1: make hello prints hello
  record: /tmp/quest-demo-local/.quests/quests/001-make-hello-prints-hello.md
  next:   quest lint 1 && quest show 1
```

Check the contract and see what's ready:

```bash
quest lint --all
quest list --ready
```

```
lint: OK (1 record)
  1 [p1] todo        make hello prints hello
```

The record carries the cheap tier — `model: haiku` — which the orchestrator will
honor when it dispatches:

```bash
quest show 1 --json | jq '{id, worker, model, status}'
```

```json
{ "id": 1, "worker": "claude", "model": "haiku", "status": "todo" }
```

---

## 2. Orchestrated dispatch — sonnet orchestrator → haiku executor (in-session)

Now run a **real orchestrator session on sonnet**. It reads the ready queue,
dispatches the `quest-executor` subagent **at the record's tier (haiku)**,
watches it iterate, and verifies the checkpoint before accepting.

Interactively this is `$quest:orchestrate` in Codex, or `/quest:orchestrate`
inside a Claude Code session opened with `claude --plugin-dir "$PLUGIN_DIR"`.
Captured here headlessly with `-p` so the result is machine-readable:

```bash
cd "$DEMO"
claude --plugin-dir "$PLUGIN_DIR" \
  -p "Orchestrate the ready quests per $quest:orchestrate. Dispatch the quest-executor subagent per the record (its model field says haiku). Verify the checkpoint before accepting." \
  --model sonnet \
  --permission-mode acceptEdits \
  --allowedTools "Bash,Read,Edit,Write,Glob,Grep,Agent,Skill" \
  --output-format json
```

> On the author's machine this was launched inside `tmux` (directly-spawned
> `claude` children couldn't reach login credentials there); the command itself
> is identical.

Result (top-level fields + final message):

```json
{
  "type": "result",
  "subtype": "success",
  "is_error": false,
  "num_turns": 9,
  "duration_ms": 92746,
  "total_cost_usd": 0.34605315
}
```

```
The wave is done — no ready quests remain, and the store's only quest (#1) is
complete. … Quest 1 ("make hello prints hello") dispatched to quest-executor
(haiku), completed in 2 checkpoints, and independently verified — `make hello`
outputs "hello" and the Makefile is committed (39d36af). No further ready quests.
```

**Verify from the store, not the chat.** The orchestrator's summary is not
evidence — the checkpoint trail is. This verification is part of the demo:

```bash
quest show 1 --json | jq '{status, checkpoints: [.checkpoints[] | {quest_status, changed: .fields.changed, validation: .fields.validation_summary}]}'
```

```json
{
  "status": "complete",
  "checkpoints": [
    {
      "quest_status": "in_progress",
      "changed": "Makefile created with hello target",
      "validation": "hello outputs 'hello'"
    },
    {
      "quest_status": "complete",
      "changed": "Makefile created",
      "validation": "`make hello` → hello"
    }
  ]
}
```

And the work product is real — the haiku executor actually wrote and committed a
Makefile:

```bash
git log --oneline -2 && make hello
```

```
39d36af Add Makefile with hello target
a9f7627 init
hello
```

**Cost of this leg: `$0.35`** (sonnet orchestrator + haiku executor, rolled up;
9 turns, ~93s).

---

## 3. Headless runner — codex worker (`gpt-5.5` from defaults)

The second worker is **Codex**, driven **headless** by `quest-run` in native
goal mode. Its model comes from the store's config default (`gpt-5.5`) — no
override on the record.

> **Note on the sandbox.** Headless Codex runs under the runner's
> `--sandbox workspace-write`, which write-protects `.git`, so a headless Codex
> worker can't `git commit`. This leg therefore uses a plain (unversioned)
> scratch dir; the work is validated by `make bye` alone. (The Claude executor in
> §2 committed fine — it ran in-session, not under the Codex sandbox.)

```bash
CODEX_DEMO=$(mktemp -d)              # plain scratch dir — not a git repo
cd "$CODEX_DEMO"
export PATH="$PLUGIN_DIR/bin:$PATH"
quest init

quest create --title "make bye prints goodbye" \
  --objective "A Makefile in the repo root provides a \`bye\` target that prints the word goodbye." \
  --done-when "\`make bye\` prints a line containing goodbye" \
  --validation "make bye" \
  --constraint "Headless codex runs under the runner's workspace-write sandbox, which write-protects .git; this scratch dir is unversioned — validate with make, don't git-commit." \
  --worker codex --max-iterations 3 --priority p1
```

```
Created quest 1: make bye prints goodbye
  record: /tmp/quest-demo-codex/.quests/quests/001-make-bye-prints-goodbye.md
```

`--dry-run` prints the exact worker invocation the runner will spawn — note
`-m gpt-5.5` (from config) and `--sandbox workspace-write`:

```bash
quest-run 1 --dry-run
```

```
# dry run — quest 1 (codex); nothing spawned
PATH=$PLUGIN_DIR/bin:… \
codex exec "If goal tools are available in this exec surface, create a goal for
this thread using the create_goal tool with this exact stopping condition: the
output of `quest show 1 --json` shown in this conversation contains a NEW
checkpoint (timestamp after 2026-07-07T14:32:54Z) with quest_status complete or
blocked. If you created a goal, verify with get_goal. Only call
update_goal(status=\"complete\") AFTER `quest checkpoint` succeeded. Work quest
1 per the $quest:work skill. …" --json -m gpt-5.5 -C /tmp/quest-demo-codex
--sandbox workspace-write --skip-git-repo-check -o $TMPDIR/quest-run-codex-<uuid>.json
--output-schema $PLUGIN_DIR/schemas/final-report.schema.json -c model_reasoning_effort=medium
```

Now run it for real:

```bash
quest-run 1 --json
```

```json
{"run_id":"fsj8wpsy","quest":1,"worker":"codex","final_status":"complete","iterations":1,"cost_usd":0,"tokens":313582,"exit_code":0}
```

The runner journals every run to `.quests/runs.ndjson` — the NDJSON lines for
this run:

```bash
cat .quests/runs.ndjson
```

```json
{"event":"run_started","run_id":"fsj8wpsy","quest":1,"worker":"codex","ts":"2026-07-07T14:31:51Z"}
{"event":"iteration_finished","run_id":"fsj8wpsy","quest":1,"worker":"codex","ts":"2026-07-07T14:32:41Z","session_id":"019f3cfe-…","cost_usd":null,"tokens":313582,"status_after":"complete"}
{"event":"run_ended","run_id":"fsj8wpsy","quest":1,"worker":"codex","ts":"2026-07-07T14:32:41Z","final_status":"complete","iterations":1,"cost_usd":0,"tokens":313582}
```

Final state — a `complete` checkpoint citing the validation it ran:

```bash
quest show 1
```

```
…
## Checkpoints

<!-- quest:checkpoint -->
### 2026-07-07T14:32:28Z — quest_status: complete
- iteration: 1
- changed: Added root Makefile bye target that prints goodbye.
- validation_summary: `make bye` -> exit 0, printed `goodbye`
```

**Cost of this leg:** Codex reports **no USD** — token spend only:
**313,582 tokens**. `quest-run`'s USD field stays `0`/`null` rather than
fabricating a number.

---

## 4. GitHub backend — records as issues (CLI-only)

The same store contract, backed by **GitHub Issues** instead of local files.
Labels mirror status/priority; checkpoints post as issue comments. This leg is
CLI-only (no model sessions).

```bash
GH_DEMO=$(mktemp -d)
cd "$GH_DEMO"
export PATH="$PLUGIN_DIR/bin:$PATH"

quest init --backend github --repo <owner>/quest-scratch
```

```
Initialized github quest store at /tmp/quest-demo-gh/.quests
…
Records live as GitHub issues; config and amendments stay local in .quests/.
```

Creating a quest opens an issue; its number is the quest id:

```bash
quest create --title "Walkthrough demo quest on the github backend" \
  --objective "Demonstrate that a quest record round-trips through GitHub Issues: labels mirror status/priority and checkpoints post as comments." \
  --done-when "the quest appears as an open issue with status/priority labels" \
  --done-when "a checkpoint is visible as an issue comment" \
  --validation "gh issue view <n> --json labels,comments" \
  --worker claude --priority p1
```

```
Created quest 2: Walkthrough demo quest on the github backend
  record: https://github.com/<owner>/quest-scratch/issues/2
```

Drive the lifecycle through the same CLI verbs — `start`, then one `checkpoint`:

```bash
quest start 2
quest checkpoint 2 --status in_progress \
  --summary "M1 — record round-trips as issue #2; labels + comment verified" \
  --validation "\`gh issue view 2 --json labels,comments\` → status:in_progress + quest-checkpoint comment"

quest list --json | jq -c '.[] | {id, title, status, priority}'
```

```
Quest 2 is now in_progress. …
Checkpoint recorded — quest 2 is in_progress.
{"id":2,"title":"Walkthrough demo quest on the github backend","status":"in_progress","priority":"p1"}
{"id":1,"title":"Live smoke quest","status":"complete","priority":"p1"}
```

Now confirm the mapping **on GitHub itself** — labels reflect status/priority and
the checkpoint is a comment:

```bash
gh issue view 2 --repo <owner>/quest-scratch --json number,state,labels,comments \
  | jq '{number, state, labels: [.labels[].name], comment: .comments[0].body[0:60]}'
```

```json
{
  "number": 2,
  "state": "OPEN",
  "labels": ["quest", "quest:in-progress", "quest-p1"],
  "comment": "<!-- quest:checkpoint -->\n### 2026-07-07T14:33:53Z — quest_status: in"
}
```

The status label (`quest:in-progress`) and priority label (`quest-p1`) mirror the
record; the `start` and `checkpoint` verbs edited the issue and posted a comment —
the exact same contract as the local backend, just stored as Issues.

---

## What you just saw

The whole loop, end to end:

- **Contracts, not vibes** — a quest is an Objective + evidence-checkable
  *Done-when* + an exact Validation loop. `quest lint` gates the contract before
  any work starts (§1).
- **Dispatch → iterate → checkpoint** — the sonnet orchestrator dispatched a
  haiku executor, which implemented, validated (`make hello`), committed green,
  and recorded a checkpoint each iteration (§2). Headless, the same loop runs a
  Codex worker with a machine-verifiable checkpoint stopping condition (§3).
- **Verify from the store** — completion is believed only after
  `quest show --json` shows a real checkpoint trail whose evidence discharges the
  Done-when items — never a chat summary (§2).
- **Two backends, one contract** — the identical verbs (`create`/`start`/
  `checkpoint`/`list`) drive local markdown files (§1–3) or GitHub Issues (§4).
- **Two workers** — Claude in-session at haiku (§2) and Codex headless at
  `gpt-5.5` (§3).
- **Tiers are adjustable per quest** — this demo ran `sonnet`/`haiku`
  (orchestrator/executor) via visible `--model` flags; production defaults can
  stay `opus`/`xhigh` in `.quests/config.json`. The record's `model` field, a
  `--model`/`-m` flag, or a `quest-run` override each pick the tier.
- **Budgets and stall enforcement** — every run is bounded: `--max-iterations`
  (sessions), `--max-cost` (Claude USD), `--max-tokens` (Codex spend); two
  consecutive sessions with no new checkpoint auto-writes a `blocked` checkpoint
  and stops. Budgets never fabricate costs — Codex stays token-only.
```
