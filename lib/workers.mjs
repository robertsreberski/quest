// Worker adapters for the headless runner. BOTH the Claude and Codex adapters
// live here. Each exposes the shared interface the runner drives generically:
//
//   buildInvocation(questRecord, config, opts) -> { cmd, args, env, prompt, artifactsFile? }
//   parseResult(stdout, artifacts)             -> { session_id?, cost_usd?, tokens?, events? }
//
// plus a higher-level `runSession(ctx)` that composes those two into one runner
// iteration (a single worker SESSION). Codex's session additionally owns the
// native-goal correction + same-session continuation resumes; Claude's is a
// single non-interactive `claude -p` call in native /goal mode.
//
// Design invariants:
// - Adapters never touch the quest store directly. They only shape and parse
//   worker invocations; the runner owns all `quest` CLI reads/writes.
// - USD cost is only ever reported when the worker reports it (Claude's
//   total_cost_usd). Codex cost stays token-only — never fabricated.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

// Non-interactive backstop injected into the Claude system prompt. A headless
// worker must never block on input; a human-only decision becomes a blocked
// checkpoint and a stop, which the runner then observes.
const CLAUDE_APPEND_SYSTEM_PROMPT =
  "Non-interactive headless run: never wait for input or ask a question. " +
  "If a decision can only be made by a human, checkpoint the quest with " +
  "quest_status blocked (via `quest checkpoint`) stating the decision needed, then stop.";

// The machine-generated, conversation-verifiable stopping condition shared by
// both workers. `runStartIso` makes it verifiable: only a checkpoint newer than
// the run start satisfies it, so a stale prior checkpoint can't be mistaken for
// progress.
function stoppingCondition(id, runStartIso) {
  return (
    "the output of `quest show " +
    id +
    " --json` shown in this conversation contains a NEW checkpoint (timestamp after " +
    runStartIso +
    ") with quest_status complete or blocked"
  );
}

function workInstructions(id) {
  return (
    "Work quest " +
    id +
    " per the $quest:work skill. The quest store is in this directory. " +
    "End every iteration by running quest show " +
    id +
    "."
  );
}

// ---------------------------------------------------------------------------
// Shared parse helpers
// ---------------------------------------------------------------------------

function tryParseJson(text) {
  if (!text) return undefined;
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    // Fall back to the last non-empty line (streamed multi-object stdout).
    const lines = trimmed.split("\n").filter((l) => l.trim());
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        return JSON.parse(lines[i]);
      } catch {
        /* keep scanning upward */
      }
    }
    return undefined;
  }
}

function parseJsonl(text) {
  if (!text) return [];
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function num(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function sumTokens(usage) {
  if (!usage || typeof usage !== "object") return undefined;
  const input = num(usage.input_tokens) ?? num(usage.prompt_tokens) ?? 0;
  const output = num(usage.output_tokens) ?? num(usage.completion_tokens) ?? 0;
  const total = num(usage.total_tokens);
  if (total !== undefined) return total;
  const sum = input + output;
  return sum > 0 ? sum : undefined;
}

// ---------------------------------------------------------------------------
// Claude adapter
// ---------------------------------------------------------------------------

export const claude = {
  name: "claude",

  buildInvocation(questRecord, config, opts) {
    const { id } = opts;
    const prompt =
      "/goal " +
      stoppingCondition(id, opts.runStartIso) +
      "\n" +
      workInstructions(id);
    const args = [
      "-p",
      prompt,
      "--plugin-dir",
      opts.pluginRoot,
      "--model",
      opts.model,
      "--output-format",
      "json",
      "--permission-mode",
      "acceptEdits",
      "--allowedTools",
      "Bash,Read,Edit,Write,Glob,Grep,Skill",
      "--append-system-prompt",
      CLAUDE_APPEND_SYSTEM_PROMPT,
    ];
    if (opts.resumeSessionId) args.push("--resume", opts.resumeSessionId);
    // Effort is passed via env: CLAUDE_EFFORT is observed-supported; no stable
    // documented flag at this CLI version, so env is the deliberate seam.
    // PATH prepends the plugin's bin/ so the worker's Bash can reach the `quest`
    // CLI to record checkpoints (Claude Code does not guarantee plugin bins on
    // the child's PATH); QUEST_DIR is added by the runner so records stay central.
    const basePath = opts.env?.PATH ?? "";
    const env = {
      PATH: `${join(opts.pluginRoot, "bin")}:${basePath}`,
      ...(opts.effort ? { CLAUDE_EFFORT: String(opts.effort) } : {}),
    };
    return { cmd: "claude", args, env, prompt };
  },

  parseResult(stdout /* , artifacts */) {
    const obj = tryParseJson(stdout);
    if (!obj) return {};
    return {
      session_id: typeof obj.session_id === "string" ? obj.session_id : undefined,
      cost_usd: num(obj.total_cost_usd),
      tokens: sumTokens(obj.usage),
    };
  },

  // One Claude session = one `claude -p` call in native /goal mode.
  async runSession(ctx) {
    const inv = this.buildInvocation(ctx.questRecord, ctx.config, ctx.opts);
    const { stdout } = await ctx.spawn(inv);
    const res = this.parseResult(stdout, {});
    return { ...res, invocations: [inv], sawGoal: true };
  },
};

// ---------------------------------------------------------------------------
// Codex adapter
// ---------------------------------------------------------------------------

const CODEX_MAX_RESUMES = 3;

// Legal `codex exec --sandbox` modes and the default. workspace-write (the
// default) write-protects `.git`, so a codex worker under it CANNOT `git commit`
// (the index.lock write fails — confirmed empirically in quest 8's walkthrough).
// Commit-requiring quests must explicitly opt into danger-full-access via the
// runner's --codex-sandbox flag (or config defaults.codex.sandbox). The runner
// validates the resolved value; buildInvocation only consumes it.
export const CODEX_SANDBOX_MODES = ["read-only", "workspace-write", "danger-full-access"];
export const DEFAULT_CODEX_SANDBOX = "workspace-write";

function codexArtifactsFile() {
  return join(tmpdir(), `quest-run-codex-${randomUUID()}.json`);
}

// Recognise an ACTUAL create_goal tool invocation in the codex `--json` event
// stream — not prose that merely mentions it. Only tool/function/mcp-call event
// items count, so a narrated "I will create_goal…" is correctly treated as
// missing and triggers the corrective resume.
function isToolCallItem(item) {
  if (!item || typeof item !== "object") return false;
  const t = String(item.type || "");
  return /tool_call|function_call|mcp|tool_use|command/i.test(t);
}

function toolCallName(item) {
  return String(item?.tool || item?.name || item?.tool_name || item?.function?.name || "");
}

export function codexUsedCreateGoal(events) {
  for (const e of events) {
    // Newer shape: { type: "item.*", item: {...} }
    if (e && e.item && isToolCallItem(e.item) && toolCallName(e.item).includes("create_goal")) return true;
    // Legacy shape: { msg: { type, ... } } / flat tool-call event.
    if (e && e.msg && isToolCallItem(e.msg) && toolCallName(e.msg).includes("create_goal")) return true;
    if (isToolCallItem(e) && toolCallName(e).includes("create_goal")) return true;
  }
  return false;
}

function codexSessionId(events) {
  for (const e of events) {
    const id =
      e?.session_id ||
      e?.thread_id ||
      e?.item?.thread_id ||
      e?.session?.id ||
      e?.thread?.id ||
      (e?.msg && (e.msg.session_id || e.msg.thread_id));
    if (typeof id === "string" && id) return id;
  }
  return undefined;
}

function codexTokens(events) {
  let tokens;
  for (const e of events) {
    const usage = e?.usage || e?.item?.usage || e?.msg?.usage || (e?.type === "token_count" ? e : undefined);
    const t = sumTokens(usage);
    if (t !== undefined) tokens = t; // last usage event wins (running total)
  }
  return tokens;
}

const CODEX_CREATE_GOAL_CORRECTION = (id) =>
  "You did not invoke the create_goal tool — you narrated it instead. Call the create_goal tool now " +
  "(a real tool call, not prose) with the stopping condition, verify with get_goal, then continue working quest " +
  id +
  " per $quest:work.";

export const codex = {
  name: "codex",

  buildInvocation(questRecord, config, opts) {
    const { id } = opts;
    const goalMode = opts.codexGoalMode ?? "auto";
    const goalInstruction =
      goalMode === "off"
        ? "Do not rely on goal tools. Treat the Quest checkpoint stopping condition below as the run contract."
        : goalMode === "require"
          ? "First step: Create a goal for this thread using the create_goal tool (not as prose) with this exact stopping condition: "
          : "If goal tools are available in this exec surface, create a goal for this thread using the create_goal tool with this exact stopping condition: ";
    const prompt =
      goalInstruction +
      (goalMode === "off" ? " Stopping condition: " : "") +
      stoppingCondition(id, opts.runStartIso) +
      (goalMode === "off" ? "" : '. If you created a goal, verify with get_goal. Only call update_goal(status="complete") AFTER `quest checkpoint` succeeded.') +
      "\n" +
      workInstructions(id);
    const artifactsFile = codexArtifactsFile();
    const args = [
      "exec",
      prompt,
      "--json",
      "-m",
      opts.model,
      "-C",
      opts.cwd,
      "--sandbox",
      opts.codexSandbox ?? DEFAULT_CODEX_SANDBOX,
      "--skip-git-repo-check",
      "-o",
      artifactsFile,
      "--output-schema",
      opts.schemaPath,
    ];
    if (opts.effort) args.push("-c", `model_reasoning_effort=${opts.effort}`);
    // Prepend the plugin's bin/ so the `quest` CLI resolves inside the sandbox.
    const basePath = opts.env?.PATH ?? "";
    const env = { PATH: `${join(opts.pluginRoot, "bin")}:${basePath}` };
    return { cmd: "codex", args, env, prompt, artifactsFile };
  },

  // Build a `codex exec resume` invocation for the corrective/continuation
  // segments. `sessionArg` is "--last" or a concrete session/thread id.
  buildResume(questRecord, config, opts, sessionArg, text) {
    const artifactsFile = codexArtifactsFile();
    const args = ["exec", "resume"];
    if (sessionArg === "--last") args.push("--last");
    else args.push(sessionArg);
    args.push(text, "--json", "--skip-git-repo-check", "-o", artifactsFile, "--output-schema", opts.schemaPath);
    if (opts.effort) args.push("-c", `model_reasoning_effort=${opts.effort}`);
    const basePath = opts.env?.PATH ?? "";
    const env = { PATH: `${join(opts.pluginRoot, "bin")}:${basePath}` };
    return { cmd: "codex", args, env, prompt: text, artifactsFile };
  },

  parseResult(stdout, artifacts = {}) {
    const events = parseJsonl(stdout);
    return {
      session_id: codexSessionId(events),
      cost_usd: undefined, // codex reports no USD — never fabricated
      tokens: codexTokens(events),
      events,
      lastMessage: artifacts.lastMessage,
    };
  },

  readArtifacts(inv) {
    if (!inv.artifactsFile) return {};
    try {
      return { lastMessage: readFileSync(inv.artifactsFile, "utf8") };
    } catch {
      return {};
    }
  },

  // One Codex iteration: initial segment, then (if create_goal was narrated
  // rather than invoked) exactly one corrective resume, then same-session
  // continuation resumes while the stopping condition is unmet — capped at
  // CODEX_MAX_RESUMES total resume segments per iteration.
  async runSession(ctx) {
    const { questRecord, config, opts } = ctx;
    const invocations = [];
    let cost, tokens, sessionId;
    let resumes = 0;
    let correctiveResume = false;

    const runSegment = async (inv) => {
      invocations.push(inv);
      const { stdout } = await ctx.spawn(inv);
      const res = this.parseResult(stdout, this.readArtifacts(inv));
      if (res.session_id) sessionId = res.session_id;
      if (res.tokens !== undefined) tokens = res.tokens;
      if (res.cost_usd !== undefined) cost = res.cost_usd;
      return res;
    };

    // Initial segment.
    const first = await runSegment(this.buildInvocation(questRecord, config, opts));
    let sawGoal = codexUsedCreateGoal(first.events || []);

    // Corrective resume only when the caller explicitly requires goal tools.
    // In auto/off modes the documented Codex exec JSONL + output-schema path is
    // the contract; goal tools are useful but not assumed available.
    if (!sawGoal && opts.codexGoalMode === "require") {
      correctiveResume = true;
      resumes += 1;
      const corr = this.buildResume(questRecord, config, opts, "--last", CODEX_CREATE_GOAL_CORRECTION(opts.id));
      const cres = await runSegment(corr);
      if (codexUsedCreateGoal(cres.events || [])) sawGoal = true;
    }

    if (opts.codexGoalMode === "require" && !sawGoal) {
      return { session_id: sessionId, cost_usd: cost, tokens, invocations, sawGoal, correctiveResume, resumes, goalToolMissingRequired: true };
    }

    // Same-session continuation while the stopping condition is unmet.
    while (resumes < CODEX_MAX_RESUMES) {
      const state = await ctx.readState();
      const newCheckpoint = (state?.checkpoints?.length ?? 0) > ctx.checkpointsBefore;
      if (newCheckpoint) break; // condition met — the outer loop will observe it
      resumes += 1;
      const arg = sessionId || "--last";
      const text =
        `The stopping condition is not yet met: no new checkpoint since ${opts.runStartIso}. ` +
        `Continue working quest ${opts.id}.`;
      await runSegment(this.buildResume(questRecord, config, opts, arg, text));
    }

    return { session_id: sessionId, cost_usd: cost, tokens, invocations, sawGoal, correctiveResume, resumes };
  },
};

export function getAdapter(worker) {
  if (worker === "codex") return codex;
  if (worker === "claude") return claude;
  throw new Error(`unknown worker "${worker}" (expected claude or codex)`);
}
