# Protocol amendments

Numbered, evidence-cited amendments to the base protocol, mined from retros
(`/quest:retro`). Read together with the base protocol via `quest protocol`.

## Amendment 1 — 2026-07-07T14:21:31Z

Verify the status flip immediately after dispatching an executor (quest show <id> --json), not only at stop: two of three parallel executors skipped 'quest start' and worked quests 3 and 5 while the store still said todo (2026-07-07; caught by orchestrator mid-flight correction).

## Amendment 2 — 2026-07-07T14:21:31Z

Author validation loops with commands verified runnable in the target environments, preferring the repo's canonical script: the literal 'node --test tests/' in quests 2/6/7 failed two different ways (no glob support on Node 20 in CI; module-resolution error locally on Node 24) and forced named substitutions in three checkpoints.

## Amendment 3 — 2026-07-07T14:21:31Z

Treat provider/tool behavior claims as unverified until exercised live in the actual runtime context: quest 5's live smoke found codex exec only narrates create_goal on 0.142.5 ChatGPT-auth (docs imply invocation), the gpt-5-codex default 400s on that auth, and gh label queries lag issue creation by seconds — none visible in docs or unit tests.

## Amendment 4 — 2026-07-07T14:21:31Z

Keep doing: (1) single-write-path CLI — every malformed record and illegal transition failed loudly at the seam (filename canonicality, duplicate-identifier mid-refactor, todo→complete rejection); (2) layered stop enforcement earned its keep the same day it shipped — the orchestrator layer caught quests 3/5 skipping protocol steps while the SubagentStop hook live-blocked a checkpoint-skipping subagent in quest 6's verification.

## Amendment 5 — 2026-07-07T14:28:21Z

When live smoke runs in throwaway stores, copy the runner journal (runs.ndjson) or its decisive lines into the checkpoint evidence — quest 5's headline live completions (runs imi9jhvc/gvevg81b) became unauditable the moment the temp dirs were deleted (reviewer F5).

## Amendment 6 — 2026-07-07T22:17:59Z

When an executor or reviewer subagent stops with its final report consumed by fighting a false SubagentStop block, resume it via SendMessage to restate the verdict rather than re-running the review — quest 15's reviewer and quest 16's reviewer both lost their reports to hook false-positives (2026-07-07T21:2x/22:0xZ); the resumed restate recovered the full finding list in one turn.

## Amendment 7 — 2026-07-07T22:17:59Z

After fixing a hook under hooks/, re-copy it into the running plugin cache (~/.claude/plugins/cache/.../hooks/) before dispatching the next subagent — the live session executes the cached copy, so quests 15/16/18 kept hitting an already-fixed false positive until the cache was synced (fixes committed 6ff394e, 345e5b6 but the cache lagged).

## Amendment 8 — 2026-07-07T22:17:59Z

Keep doing: send a reviewed quest back with quest reopen <id> --reason '<finding>' instead of hand-editing status or filing a duplicate — quest 15's Medium finding was dispatched back through its own new verb (reopen at 2026-07-07T21:4xZ), which recorded an audited checkpoint, kept the quest's custody, and dogfooded the feature in the same wave that shipped it.
