// The headless runner: `quest-run`. Drives Claude and Codex workers in native
// goal mode with deterministic budgets, stall enforcement, a runs journal, and
// notifications. It is a THIN loop — all quest state is read and written through
// the `quest` CLI (never by touching record files), and all worker-specific
// invocation/parse logic lives in lib/workers.mjs.
//
// Exit codes extend the `quest` CLI set (contract-spec):
//   0 success (complete) · 2 usage · 3 no store/config · 4 not found
//   10 ended blocked (worker-blocked OR stall) · 11 budget exhausted

import { parseArgs } from "node:util";
import { spawn as spawnChild, spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ConfigError, findStoreDir, loadConfig } from "./config.mjs";
import { nowIso } from "./contract.mjs";
import * as local from "./store-local.mjs";
import { getAdapter, CODEX_SANDBOX_MODES, DEFAULT_CODEX_SANDBOX } from "./workers.mjs";

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const QUEST_BIN = join(PLUGIN_ROOT, "bin", "quest");
const SCHEMA_PATH = join(PLUGIN_ROOT, "schemas", "final-report.schema.json");

class RunUsageError extends Error {
  constructor(message) {
    super(message);
    this.hint = "see `quest-run --help`";
  }
}

// ---------------------------------------------------------------------------
// Help (same shape as the `quest` help layer: usage / flags / example)
// ---------------------------------------------------------------------------

const HELP = {
  purpose: "Drive a headless Claude or Codex worker through a quest with checkpoint-based stop checks.",
  usage: [
    "quest-run <id> [--worker claude|codex] [--model M] [--effort E]",
    "              [--max-iterations N] [--max-cost USD] [--codex-sandbox MODE]",
    "              [--codex-goal-mode auto|require|off]",
    "              [--continue-session] [--notify '<cmd>'] [--dry-run] [--json]",
    "quest-run --ready [--parallel N] [--isolate worktree] [--dry-run] [--json]",
  ],
  flags: [
    ["<id>", "quest id to run (omit only with --ready)"],
    ["--worker <w>", "claude | codex; default: record frontmatter, then config"],
    ["--model <m>", "worker model override; default: record, then config default"],
    ["--effort <e>", "reasoning effort override; default: record, then config"],
    ["--max-iterations <n>", "session budget; exceeding it → blocked, exit 11"],
    ["--max-cost <usd>", "USD cost cap (claude only; codex reports no USD so this never binds)"],
    ["--max-tokens <n>", "token cap; governs codex spend since USD is unreported → blocked, exit 11"],
    ["--session-timeout <s>", "per-session wall-clock cap (seconds); a hung worker is killed and the session counts as a stall (default 1800; config defaults.session_timeout)"],
    ["--codex-sandbox <mode>", "codex exec sandbox: read-only | workspace-write | danger-full-access (default workspace-write; config defaults.codex.sandbox). workspace-write BLOCKS git commits — commit quests need danger-full-access"],
    ["--codex-goal-mode <mode>", "codex goal-tool policy: auto | require | off (default auto; config defaults.codex.goal_mode)"],
    ["--continue-session", "resume the previous session each iteration instead of a fresh one"],
    ["--notify <cmd>", "shell command run on run end (env: QUEST_ID, QUEST_TITLE, FINAL_STATUS, ITERATIONS, COST)"],
    ["--dry-run", "print the exact worker invocation and exit without spawning"],
    ["--json", "machine-readable run summary"],
    ["--ready", "run every ready quest, promoting newly-ready ones as deps complete"],
    ["--parallel <n>", "with --ready: run up to N quests concurrently (default 1)"],
    ["--isolate <mode>", "with --ready: `worktree` gives each quest its own git worktree + branch"],
  ],
  notes: [
    "Iterations are SESSIONS. By default each iteration is a fresh worker session;",
    "2 consecutive sessions with no new checkpoint → runner-recorded blocked (exit 10).",
    "A session exceeding --session-timeout is killed and counted as a no-checkpoint session.",
    "Works against local and github-backed stores alike (record IO goes through the quest CLI).",
    "Costs are never fabricated: codex is token-only, so --max-cost only binds for claude.",
    "codex's default --codex-sandbox workspace-write write-protects .git, so a codex worker",
    "cannot `git commit` under it; a commit-requiring quest must opt into danger-full-access —",
    "an explicit tradeoff (full disk + network access), never escalated silently.",
    "codex goal tools are optional by default; --codex-goal-mode require blocks honestly if",
    "the exec surface does not expose or invoke them.",
    "Without --isolate, parallel quests are assumed file-disjoint (no locking beyond the store's).",
    "--isolate worktree leaves the worktree + quest/<id>-<slug> branch in place; the PR is the merge path.",
  ],
  example: "quest-run 12 --worker claude --max-iterations 6 --notify 'echo $QUEST_ID $FINAL_STATUS'",
};

function renderRunHelp() {
  const lines = [HELP.purpose, "", "Usage:", ...HELP.usage.map((u) => `  ${u}`), "", "Flags:"];
  const w = Math.max(...HELP.flags.map(([f]) => f.length));
  for (const [flag, desc] of HELP.flags) lines.push(`  ${flag.padEnd(w)}  ${desc}`);
  lines.push("", "Notes:", ...HELP.notes.map((n) => `  ${n}`), "", "Example:", `  ${HELP.example}`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Process helpers (async spawn so --parallel is genuinely concurrent)
// ---------------------------------------------------------------------------

function resolveExecutable(cmd, env) {
  if (cmd.includes("/")) return cmd;
  const path = env.PATH || "";
  for (const dir of path.split(":")) {
    if (!dir) continue;
    const candidate = join(dir, cmd);
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      /* not here */
    }
  }
  return cmd; // let spawn surface ENOENT
}

// A wall-clock `timeoutMs` (>0) arms a timer that SIGKILLs a hung child and
// resolves with `timedOut: true` — the runner treats that session as making no
// progress (never fabricated results). quest-CLI calls pass no timeout.
function spawnCapture(cmd, args, { cwd, env, timeoutMs, killSignal = "SIGKILL" } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawnChild(cmd, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    } catch (err) {
      resolve({ stdout: "", stderr: String(err), code: 127 });
      return;
    }
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let timer;
    const settle = (res) => {
      if (timer) clearTimeout(timer);
      resolve(res);
    };
    if (timeoutMs && timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        try {
          child.kill(killSignal);
        } catch {
          /* already exited */
        }
      }, timeoutMs);
    }
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err) => settle({ stdout, stderr: stderr + String(err), code: 127, timedOut }));
    child.on("close", (code) => settle({ stdout, stderr, code: code ?? 0, timedOut }));
  });
}

// ---------------------------------------------------------------------------
// Quest CLI seam — the ONLY path to read or mutate quest state
// ---------------------------------------------------------------------------

function questCli(storeDir, env, args) {
  return spawnCapture(process.execPath, [QUEST_BIN, ...args], {
    cwd: PLUGIN_ROOT,
    env: { ...env, QUEST_DIR: storeDir },
  });
}

async function readState(storeDir, env, id) {
  const { stdout, code } = await questCli(storeDir, env, ["show", String(id), "--json"]);
  if (code !== 0) return null;
  try {
    return JSON.parse(stdout.trim());
  } catch {
    return null;
  }
}

async function questStart(storeDir, env, id) {
  return questCli(storeDir, env, ["start", String(id)]);
}

async function recordBlocked(storeDir, env, id, summary, validation) {
  return questCli(storeDir, env, [
    "checkpoint",
    String(id),
    "--status",
    "blocked",
    "--summary",
    summary,
    "--validation",
    validation,
  ]);
}

// ---------------------------------------------------------------------------
// Option resolution: flag → record frontmatter → config defaults
// ---------------------------------------------------------------------------

function resolveOptions(front, config, flags) {
  const worker = flags.worker ?? front.worker ?? config.defaults.worker;
  if (!["claude", "codex"].includes(worker)) throw new RunUsageError(`--worker must be claude or codex (got "${worker}")`);
  const wd = worker === "codex" ? config.defaults.codex : config.defaults.claude;
  const recordModel = front.model && front.model !== "inherit" ? front.model : undefined;
  const model = flags.model ?? recordModel ?? wd.model;
  const effort = flags.effort ?? front.effort ?? (worker === "codex" ? wd.reasoning_effort : wd.effort);
  const maxIterations = flags["max-iterations"] != null ? Number(flags["max-iterations"]) : front.max_iterations ?? config.defaults.max_iterations;
  const maxCost = flags["max-cost"] != null ? Number(flags["max-cost"]) : front.max_cost ?? undefined;
  const maxTokens = flags["max-tokens"] != null ? Number(flags["max-tokens"]) : undefined;
  // Per-session wall-clock cap (seconds → ms). Flag > config default > 1800s.
  // A non-positive value disables the timeout.
  const sessionTimeoutSec = flags["session-timeout"] != null ? Number(flags["session-timeout"]) : config.defaults.session_timeout ?? 1800;
  const sessionTimeout = Number.isFinite(sessionTimeoutSec) && sessionTimeoutSec > 0 ? Math.round(sessionTimeoutSec * 1000) : 0;
  // Codex exec sandbox: flag → config defaults.codex.sandbox → workspace-write.
  // No silent escalation: the safe default stays workspace-write, and the value
  // is validated (an illegal one is a usage error). Validated whenever the flag
  // is explicit or the worker is codex, so a claude run never fails on a codex-
  // only config typo.
  const codexSandbox = flags["codex-sandbox"] ?? config.defaults.codex?.sandbox ?? DEFAULT_CODEX_SANDBOX;
  if ((flags["codex-sandbox"] != null || worker === "codex") && !CODEX_SANDBOX_MODES.includes(codexSandbox)) {
    throw new RunUsageError(`--codex-sandbox must be one of ${CODEX_SANDBOX_MODES.join(", ")} (got "${codexSandbox}")`);
  }
  const codexGoalMode = flags["codex-goal-mode"] ?? config.defaults.codex?.goal_mode ?? "auto";
  if ((flags["codex-goal-mode"] != null || worker === "codex") && !["auto", "require", "off"].includes(codexGoalMode)) {
    throw new RunUsageError(`--codex-goal-mode must be one of auto, require, off (got "${codexGoalMode}")`);
  }
  return { worker, model, effort, maxIterations, maxCost, maxTokens, sessionTimeout, codexSandbox, codexGoalMode };
}

function lastSessionIdFor(storeDir, questId, worker) {
  const events = local.readRuns(storeDir);
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.event === "iteration_finished" && e.quest === questId && (!worker || e.worker === worker) && e.session_id) return e.session_id;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Notify (fire on run end; failure is isolated from the runner's exit code)
// ---------------------------------------------------------------------------

function runNotify(command, vars, io) {
  if (!command || !command.trim()) return;
  const env = {
    ...io.env,
    QUEST_ID: String(vars.id),
    QUEST_TITLE: vars.title ?? "",
    FINAL_STATUS: vars.finalStatus ?? "",
    ITERATIONS: String(vars.iterations ?? 0),
    COST: vars.cost == null ? "" : String(vars.cost),
  };
  let res;
  try {
    res = spawnSync("sh", ["-c", command], { env, encoding: "utf8" });
  } catch (err) {
    io.errOut(`quest-run: notify command errored (${err.message}); continuing — this does not change the run's exit code`);
    return;
  }
  if (res.error || res.status !== 0) {
    const why = res.error ? res.error.message : `exit ${res.status}`;
    io.errOut(`quest-run: notify command failed (${why}); continuing — this does not change the run's exit code`);
  }
}

// ---------------------------------------------------------------------------
// Single-quest run
// ---------------------------------------------------------------------------

async function runQuest(storeDir, config, id, flags, io, { cwd } = {}) {
  const env = io.env;
  const workerCwd = cwd ?? io.cwd;

  const initial = await readState(storeDir, env, id);
  if (!initial) {
    io.errOut(`quest-run: quest ${id} not found in ${storeDir}`);
    return { exitCode: 4, finalStatus: "not_found", iterations: 0, cost: 0 };
  }
  const opts = resolveOptions(initial, config, flags);
  const adapter = getAdapter(opts.worker);
  const title = initial.title ?? `quest ${id}`;

  // --dry-run: print the exact invocation, spawn nothing, journal nothing.
  if (flags["dry-run"]) {
    const runStartIso = nowIso();
    const invOpts = {
      id,
      model: opts.model,
      effort: opts.effort,
      resumeSessionId: flags["continue-session"] ? lastSessionIdFor(storeDir, id, opts.worker) : undefined,
      pluginRoot: PLUGIN_ROOT,
      cwd: workerCwd,
      env,
      schemaPath: SCHEMA_PATH,
      runStartIso,
      codexSandbox: opts.codexSandbox,
      codexGoalMode: opts.codexGoalMode,
    };
    const inv = adapter.buildInvocation(initial, config, invOpts);
    if (flags.json) {
      io.out(JSON.stringify({ dry_run: true, quest: id, worker: opts.worker, cmd: inv.cmd, args: inv.args, env: inv.env, prompt: inv.prompt }));
    } else {
      io.out(`# dry run — quest ${id} (${opts.worker}); nothing spawned`);
      io.out(describeInvocation(inv));
    }
    return { exitCode: 0, finalStatus: "dry_run", iterations: 0, cost: 0 };
  }

  const runId = randomRunId();
  const runStartIso = nowIso();
  local.appendRunEvent(storeDir, { event: "run_started", run_id: runId, quest: id, worker: opts.worker, ts: runStartIso });

  let finalStatus = "in_progress";
  let exitCode = 0;
  let sessionsRun = 0;
  let totalCost = 0;
  let totalTokens = 0;
  let stall = 0;
  let lastSessionId = flags["continue-session"] ? lastSessionIdFor(storeDir, id, opts.worker) : undefined;

  try {
    // Early exit on an already-terminal quest.
    if (initial.status === "complete") {
      finalStatus = "complete";
      exitCode = 0;
      io.errOut(`quest-run: quest ${id} is already complete — nothing to run. To legally re-enter the loop, run \`quest reopen ${id} --reason "<why>"\` first (never hand-edit the status line).`);
    } else if (initial.status === "cancelled") {
      finalStatus = "cancelled";
      exitCode = 0;
    } else if (initial.status === "blocked") {
      finalStatus = "blocked";
      exitCode = 10;
    } else {
      // Starting a run puts the quest in_progress so runner-authored blocked
      // checkpoints (stall/budget) are legal transitions.
      if (initial.status === "todo") await questStart(storeDir, env, id);

      for (;;) {
        const state = await readState(storeDir, env, id);
        if (!state) {
          io.errOut(`quest-run: lost the quest ${id} record mid-run`);
          finalStatus = "error";
          exitCode = 4;
          break;
        }
        if (state.status === "complete") {
          finalStatus = "complete";
          exitCode = 0;
          break;
        }
        if (state.status === "blocked") {
          finalStatus = "blocked";
          exitCode = 10;
          break;
        }
        if (state.status === "cancelled") {
          finalStatus = "cancelled";
          exitCode = 0;
          break;
        }

        // Budget gates (deterministic). Iterations count sessions already run.
        if (sessionsRun >= opts.maxIterations) {
          await recordBlocked(
            storeDir,
            env,
            id,
            `runner: iteration budget exhausted (${sessionsRun}/${opts.maxIterations} sessions without completion)`,
            "runner budget enforcement",
          );
          finalStatus = "blocked";
          exitCode = 11;
          break;
        }
        if (opts.maxCost != null && totalCost > opts.maxCost) {
          await recordBlocked(
            storeDir,
            env,
            id,
            `runner: cost budget exhausted ($${totalCost.toFixed(4)} > $${opts.maxCost})`,
            "runner budget enforcement",
          );
          finalStatus = "blocked";
          exitCode = 11;
          break;
        }
        if (opts.maxTokens != null && totalTokens > opts.maxTokens) {
          await recordBlocked(
            storeDir,
            env,
            id,
            `runner: token budget exhausted (${totalTokens} > ${opts.maxTokens} tokens)`,
            "runner budget enforcement",
          );
          finalStatus = "blocked";
          exitCode = 11;
          break;
        }

        const checkpointsBefore = state.checkpoints.length;
        sessionsRun += 1;

        // Any child killed by the session wall-clock timeout marks the whole
        // session as timed-out (a no-progress session for stall accounting).
        let sessionTimedOut = false;
        const ctx = {
          questRecord: state,
          config,
          opts: {
            id,
            model: opts.model,
            effort: opts.effort,
            resumeSessionId: flags["continue-session"] ? lastSessionId : undefined,
            pluginRoot: PLUGIN_ROOT,
            cwd: workerCwd,
            env,
            schemaPath: SCHEMA_PATH,
            runStartIso,
            codexSandbox: opts.codexSandbox,
            codexGoalMode: opts.codexGoalMode,
          },
          runStartIso,
          iteration: sessionsRun,
          checkpointsBefore,
          spawn: async (inv) => {
            const res = await spawnCapture(resolveExecutable(inv.cmd, env), inv.args, {
              cwd: workerCwd,
              env: { ...env, QUEST_DIR: storeDir, ...inv.env },
              timeoutMs: opts.sessionTimeout,
              killSignal: "SIGKILL",
            });
            if (res.timedOut) sessionTimedOut = true;
            return res;
          },
          readState: () => readState(storeDir, env, id),
        };

        let result;
        try {
          result = await adapter.runSession(ctx);
        } catch (err) {
          io.errOut(`quest-run: worker session ${sessionsRun} errored: ${err.message}`);
          result = {};
        }
        totalCost += result.cost_usd ?? 0;
        totalTokens += result.tokens ?? 0;
        if (result.session_id) lastSessionId = result.session_id;

        const after = await readState(storeDir, env, id);
        const newCheckpoint = after && after.checkpoints.length > checkpointsBefore;
        // A timed-out session never counts as progress, even if a checkpoint
        // landed before the kill — a terminal status is still caught at the top
        // of the next iteration, so completions are never lost.
        const progressed = newCheckpoint && !sessionTimedOut;
        // Journal the session BEFORE any terminal break so `quest runs` telemetry
        // (iteration count, cost, tokens) is never dropped for the final session.
        local.appendRunEvent(storeDir, {
          event: "iteration_finished",
          run_id: runId,
          quest: id,
          worker: opts.worker,
          ts: nowIso(),
          session_id: result.session_id ?? null,
          cost_usd: result.cost_usd ?? null,
          tokens: result.tokens ?? null,
          timed_out: sessionTimedOut,
          status_after: after ? after.status : null,
        });

        // Goal-mode `require`: block whenever create_goal was required but never
        // observed and the quest is still OPEN — a milestone checkpoint does not
        // satisfy the requirement. A genuinely complete/blocked/cancelled quest is
        // respected (its evidence trail stands on its own).
        const questOpen = !after || after.status === "in_progress" || after.status === "todo";
        if (opts.worker === "codex" && result.goalToolMissingRequired && questOpen) {
          await recordBlocked(
            storeDir,
            env,
            id,
            "runner: codex goal tools were required but no create_goal tool call was observed",
            "runner codex goal-mode enforcement",
          );
          finalStatus = "blocked";
          exitCode = 10;
          break;
        }

        if (progressed) {
          stall = 0;
          if (after.status === "complete") {
            finalStatus = "complete";
            exitCode = 0;
            break;
          }
          if (after.status === "blocked") {
            finalStatus = "blocked";
            exitCode = 10;
            break;
          }
          // in_progress → keep iterating
        } else {
          stall += 1;
          if (stall >= 2) {
            await recordBlocked(
              storeDir,
              env,
              id,
              "runner: 2 consecutive sessions ended without a checkpoint",
              "runner stall enforcement",
            );
            finalStatus = "blocked";
            exitCode = 10;
            break;
          }
        }
      }
    }
  } finally {
    local.appendRunEvent(storeDir, {
      event: "run_ended",
      run_id: runId,
      quest: id,
      worker: opts.worker,
      ts: nowIso(),
      final_status: finalStatus,
      iterations: sessionsRun,
      cost_usd: totalCost,
      tokens: totalTokens,
    });
    runNotify(flags.notify ?? config.notify?.command, { id, title, finalStatus, iterations: sessionsRun, cost: opts.worker === "codex" ? null : totalCost }, io);
  }

  if (!flags["dry-run"]) {
    if (flags.json) {
      io.out(JSON.stringify({ run_id: runId, quest: id, worker: opts.worker, final_status: finalStatus, iterations: sessionsRun, cost_usd: totalCost, tokens: totalTokens, exit_code: exitCode }));
    } else {
      io.out(`quest-run: quest ${id} ended ${finalStatus} after ${sessionsRun} session(s)${opts.worker === "codex" ? `, ${totalTokens} tokens` : `, $${totalCost.toFixed(4)}`} (run ${runId}).`);
    }
  }

  return { exitCode, finalStatus, iterations: sessionsRun, cost: totalCost, runId };
}

function describeInvocation(inv) {
  const lines = [];
  for (const [k, v] of Object.entries(inv.env || {})) lines.push(`${k}=${v} \\`);
  const q = (s) => (/[\s"'$`]/.test(s) ? JSON.stringify(s) : s);
  lines.push([inv.cmd, ...inv.args.map(q)].join(" "));
  return lines.join("\n");
}

function randomRunId() {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-2);
}

// ---------------------------------------------------------------------------
// --ready pool (with optional worktree isolation)
// ---------------------------------------------------------------------------

function slugForBranch(title) {
  return String(title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "quest";
}

function makeWorktree(repoRoot, id, title, io) {
  const slug = slugForBranch(title);
  const wtPath = join(repoRoot, ".quests-wt", `${id}-${slug}`);
  const branch = `quest/${id}-${slug}`;
  if (existsSync(wtPath)) return { wtPath, branch, created: false };
  const res = spawnSync("git", ["worktree", "add", wtPath, "-b", branch], { cwd: repoRoot, encoding: "utf8" });
  if (res.status !== 0) {
    io.errOut(`quest-run: git worktree add failed for quest ${id}: ${(res.stderr || res.stdout || "").trim()}`);
    return null;
  }
  return { wtPath, branch, created: true };
}

async function runReady(storeDir, config, flags, io) {
  const parallel = Math.max(1, flags.parallel != null ? Number(flags.parallel) : 1);
  const isolate = flags.isolate;
  if (isolate && isolate !== "worktree") throw new RunUsageError(`--isolate only supports "worktree" (got "${isolate}")`);
  const repoRoot = dirname(storeDir);

  const summaries = [];
  const done = new Set();
  const skippedEpics = new Set();
  const inFlight = new Map();

  const readyIds = async () => {
    const { stdout, code } = await questCli(storeDir, io.env, ["list", "--ready", "--json"]);
    if (code !== 0) return [];
    try {
      return JSON.parse(stdout).map((q) => q.id);
    } catch {
      return [];
    }
  };

  // Ids that at least one quest names as its parent — i.e. epics. Epics are
  // closed by the orchestrator inline (verify children, run the epic validation
  // loop, checkpoint), never dispatched to a worker. readyQuests already gates
  // out epics with open children; this catches the fully-verified epic that has
  // become "ready" so --ready still refuses to burn a worker run on it. A
  // direct `quest-run <id>` on an epic stays allowed.
  const epicIds = async () => {
    const { stdout, code } = await questCli(storeDir, io.env, ["list", "--json"]);
    if (code !== 0) return new Set();
    try {
      return new Set(JSON.parse(stdout).filter((q) => q.parent !== undefined).map((q) => q.parent));
    } catch {
      return new Set();
    }
  };

  const startOne = (id) => {
    const promise = (async () => {
      let cwd = io.cwd;
      let worktreeNote;
      if (isolate === "worktree" && !flags["dry-run"]) {
        const state = await readState(storeDir, io.env, id);
        const wt = makeWorktree(repoRoot, id, state?.title ?? `quest-${id}`, io);
        if (wt) {
          cwd = wt.wtPath;
          worktreeNote = `worktree ${wt.wtPath} on branch ${wt.branch} (left in place; PR is the merge path)`;
          io.out(`quest-run: quest ${id} isolated in ${worktreeNote}`);
        }
      }
      const res = await runQuest(storeDir, config, id, flags, io, { cwd });
      return { id, ...res, worktreeNote };
    })();
    inFlight.set(id, promise);
  };

  for (;;) {
    const epics = await epicIds();
    const ready = (await readyIds()).filter((id) => !done.has(id) && !inFlight.has(id) && !skippedEpics.has(id));
    for (const id of ready) {
      if (epics.has(id)) {
        skippedEpics.add(id);
        io.errOut(`quest-run: quest ${id} is an epic (other quests name it as parent) — refusing to auto-dispatch it. Close it inline per $quest:orchestrate: verify its children, run the epic validation loop, then \`quest checkpoint ${id} --status complete\`. Never burn a worker run on an epic.`);
        continue;
      }
      if (inFlight.size >= parallel) break;
      startOne(id);
    }
    if (inFlight.size === 0) break; // nothing ready and nothing running → wave done
    const settled = await Promise.race([...inFlight.values()]);
    inFlight.delete(settled.id);
    done.add(settled.id);
    summaries.push(settled);
  }

  const worstExit = summaries.reduce((code, s) => (s.exitCode > code ? s.exitCode : code), 0);
  if (flags.json) {
    io.out(JSON.stringify({ ready_run: true, quests: summaries.map((s) => ({ quest: s.id, final_status: s.finalStatus, iterations: s.iterations, exit_code: s.exitCode })) }));
  } else if (!summaries.length) {
    io.out("quest-run: no ready quests to run.");
  } else {
    io.out(`quest-run: ready wave finished — ${summaries.length} quest(s) run.`);
    for (const s of summaries) io.out(`  quest ${s.id}: ${s.finalStatus} (exit ${s.exitCode})`);
  }
  return worstExit;
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

function getStore(cwd, env) {
  const storeDir = findStoreDir(cwd, env);
  if (!storeDir) throw new ConfigError("no quest store found (searched for .quests/ from here upward)", { hint: "run `quest init` to create one" });
  const config = loadConfig(storeDir, env);
  return { storeDir, config };
}

export async function run(argv, io = {}) {
  const out = io.stdout ?? ((s) => process.stdout.write(s + "\n"));
  const errOut = io.stderr ?? ((s) => process.stderr.write(s + "\n"));
  const cwd = io.cwd ?? process.cwd();
  const env = io.env ?? process.env;
  const ioc = { out, errOut, cwd, env };

  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        worker: { type: "string" },
        model: { type: "string" },
        effort: { type: "string" },
        "max-iterations": { type: "string" },
        "max-cost": { type: "string" },
        "max-tokens": { type: "string" },
        "session-timeout": { type: "string" },
        "codex-sandbox": { type: "string" },
        "codex-goal-mode": { type: "string" },
        "continue-session": { type: "boolean" },
        notify: { type: "string" },
        "dry-run": { type: "boolean" },
        json: { type: "boolean" },
        ready: { type: "boolean" },
        parallel: { type: "string" },
        isolate: { type: "string" },
        help: { type: "boolean" },
      },
    });
  } catch (err) {
    errOut(`quest-run: ${err.message}`);
    errOut("  hint: see `quest-run --help`");
    return 2;
  }

  if (parsed.values.help) {
    out(renderRunHelp());
    return 0;
  }

  const flags = parsed.values;
  try {
    const { storeDir, config } = getStore(cwd, env);
    // Backend-agnostic: all record IO flows through the `quest` CLI, and the
    // runs journal (readRuns/appendRunEvent) is always local per contract-spec,
    // so github-backed stores are driven the same as local ones.

    if (flags.ready) {
      if (parsed.positionals.length) throw new RunUsageError("--ready takes no quest id");
      return await runReady(storeDir, config, flags, ioc);
    }

    const raw = parsed.positionals[0];
    if (!raw || !/^\d+$/.test(raw)) throw new RunUsageError("a numeric quest id is required (or use --ready)");
    if (parsed.positionals.length > 1) throw new RunUsageError(`unexpected argument "${parsed.positionals[1]}"`);
    const id = Number(raw);
    const { exitCode } = await runQuest(storeDir, config, id, flags, ioc);
    return exitCode;
  } catch (err) {
    if (err instanceof RunUsageError) {
      errOut(`quest-run: ${err.message}`);
      if (err.hint) errOut(`  hint: ${err.hint}`);
      return 2;
    }
    if (err instanceof ConfigError) {
      errOut(`quest-run: ${err.message}`);
      if (err.hint) errOut(`  hint: ${err.hint}`);
      return 3;
    }
    errOut(`quest-run: ${err.message}`);
    return 1;
  }
}
