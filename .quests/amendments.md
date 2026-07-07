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
