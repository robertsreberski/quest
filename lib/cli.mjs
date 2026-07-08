// Command dispatch for `quest`. Exit codes (contract-spec): 0 ok · 2 usage ·
// 3 no store/config · 4 not found · 5 contract violation · 6 backend unavailable.

import { parseArgs } from "node:util";
import { readFileSync, existsSync, writeFileSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { ConfigError, findStoreDir, loadConfig } from "./config.mjs";
import { ContractError, lintRecord } from "./contract.mjs";
import * as local from "./store-local.mjs";
import * as github from "./store-github.mjs";
import { openStore } from "./store.mjs";
import { COMMANDS, renderCommandHelp, renderGeneralHelp, renderInitNextSteps, renderNoStore, renderStatusOverview } from "./help.mjs";
import { claudeDoctor, claudeDoctorFix, codexDoctorFix, doctor as codexDoctor, installAgents as installCodexAgents, installClaudeAgents, nativeProjectRoot, versionInfo } from "./codex-native.mjs";

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

class UsageError extends Error {
  constructor(message, { command } = {}) {
    super(message);
    this.hint = command ? `see \`quest ${command} --help\`` : "see `quest help`";
  }
}

function exitCodeFor(err) {
  if (err instanceof UsageError) return 2;
  if (err instanceof ConfigError) return 3;
  if (err instanceof local.NotFoundError) return 4;
  if (err instanceof ContractError) return 5;
  if (err instanceof github.GhError) return 6; // backend unavailable: gh missing/unauthenticated/failed
  return 1;
}

export async function run(argv, io = {}) {
  const out = io.stdout ?? ((s) => process.stdout.write(s + "\n"));
  const errOut = io.stderr ?? ((s) => process.stderr.write(s + "\n"));
  const cwd = io.cwd ?? process.cwd();
  const env = io.env ?? process.env;

  try {
    return await dispatch(argv, { out, errOut, cwd, env });
  } catch (err) {
    const code = exitCodeFor(err);
    errOut(`quest: ${err.message}`);
    if (err.hint) errOut(`  hint: ${err.hint}`);
    if (code === 1) errOut(err.stack.split("\n").slice(1, 4).join("\n"));
    return code;
  }
}

function parse(command, args, options, { positionals = 0 } = {}) {
  let parsed;
  try {
    parsed = parseArgs({ args, options: { ...options, help: { type: "boolean" }, json: { type: "boolean" } }, allowPositionals: true });
  } catch (err) {
    throw new UsageError(err.message, { command });
  }
  if (parsed.values.help) return { help: true };
  if (parsed.positionals.length > positionals) {
    throw new UsageError(`unexpected argument "${parsed.positionals[positionals]}"`, { command });
  }
  return parsed;
}

function requireId(parsed, command) {
  const raw = parsed.positionals[0];
  if (!raw || !/^\d+$/.test(raw)) throw new UsageError("a numeric quest id is required", { command });
  return Number(raw);
}

function getStore(cwd, env) {
  const storeDir = findStoreDir(cwd, env);
  if (!storeDir) throw new ConfigError("no quest store found (searched for .quests/ from here upward)", { hint: "run `quest init` to create one" });
  return loadConfig(storeDir, env);
}

function preflightInitAgentInstall(cwd, env) {
  const plans = [
    ["codex", installCodexAgents({ scope: "project", dryRun: true, cwd, env })],
    ["claude", installClaudeAgents({ scope: "project", dryRun: true, cwd, env })],
  ];
  const conflicts = plans.flatMap(([provider, result]) => result.conflicts.map((c) => `${provider}:${c.path}`));
  if (conflicts.length) {
    throw new UsageError(
      "native agent template conflict; inspect existing files or run " +
      "`quest codex install-agents --scope project --force` / " +
      "`quest claude install-agents --scope project --force` after resolving: " +
      conflicts.join(", "),
      { command: "init" },
    );
  }
  return plans;
}

function printDoctorResult(command, result, out) {
  if (result.repairs?.length) {
    out(`${command} doctor --fix: repairs`);
    for (const r of result.repairs) out(`  ${r.ok ? "OK " : "ERR"} ${r.name}: ${r.command} (${r.detail})`);
  }
  for (const c of result.checks) out(`${c.ok ? "OK " : "ERR"} ${c.name}: ${c.detail}`);
  if (result.recommended_path) {
    const r = result.recommended_path;
    out(`Recommendation: ${r.label} — ${r.command}`);
  }
  out(result.ok ? `${command} doctor: OK` : `${command} doctor: problems found`);
}

function parseOpenArgs(args) {
  const forwarded = [];
  let dryRun = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--") {
      forwarded.push(...args.slice(i + 1));
      break;
    }
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") return { help: true };
    forwarded.push(arg);
  }
  return { dryRun, forwarded };
}

function shellQuote(arg) {
  return /^[A-Za-z0-9_./:=@+-]+$/.test(arg) ? arg : `'${String(arg).replaceAll("'", "'\\''")}'`;
}

function openInvocation(command, cwd, env, forwarded) {
  const root = nativeProjectRoot(cwd, env);
  if (command === "codex") return { cmd: "codex", args: ["-C", root, ...forwarded], cwd };
  if (command === "claude") return { cmd: "claude", args: forwarded, cwd: root };
  throw new Error(`unknown provider "${command}"`);
}

function questCommandPrelude(cwd, env) {
  const root = nativeProjectRoot(cwd, env);
  return [
    `cd ${shellQuote(root)}`,
    `export PATH=${shellQuote(join(PLUGIN_ROOT, "bin"))}:$PATH`,
    "quest --version",
    "git status --short --branch",
  ];
}

function codexNativePrompt(id) {
  return "First call create_goal with: quest " + id +
    " has a new checkpoint whose quest_status is complete or blocked in `quest show " + id +
    " --json`; verify with get_goal; work quest " + id +
    " per $quest:work; only call update_goal(status=\"complete\") after the checkpoint exists.";
}

function claudeNativePrompt(id) {
  return "/goal quest " + id +
    " has a new checkpoint whose quest_status is complete or blocked in `quest show " + id +
    " --json`\nWork quest " + id + " per $quest:work.";
}

function renderWorkHandoff(command, id, recommendation, cwd, env) {
  const lines = [
    `${command} work: recommended path: ${recommendation.label}`,
    `Reason: ${recommendation.reason}`,
    "",
    "Quest command prelude:",
    ...questCommandPrelude(cwd, env).map((line) => `  ${line}`),
    "",
  ];
  if (recommendation.key === "native-subagents") {
    lines.push(
      command === "codex" ? "Codex native subagent handoff:" : "Claude native subagent handoff:",
      "  agent_type: quest-executor",
      "  prompt:",
      ...String(command === "codex" ? codexNativePrompt(id) : claudeNativePrompt(id)).split("\n").map((line) => `    ${line}`),
    );
  } else {
    lines.push(
      "Headless fallback command:",
      `  ${recommendation.command.replace("<id>", String(id))}`,
    );
  }
  return lines.join("\n");
}

async function runNativeSetupCommand(command, args, { out, cwd, env }, { label, doctor, doctorFix, install }) {
  const [subcommand, ...rest] = args;
  if (!subcommand || subcommand === "help" || subcommand === "--help" || subcommand === "-h") {
    out(renderCommandHelp(command));
    return 0;
  }
  if (subcommand === "doctor") {
    const p = parse(command, rest, { fix: { type: "boolean" } }, { positionals: 0 });
    if (p.help) {
      out(renderCommandHelp(command));
      return 0;
    }
    const result = p.values.fix ? doctorFix({ cwd, env }) : doctor({ cwd, env });
    if (p.values.json) out(JSON.stringify(result));
    else printDoctorResult(command, result, out);
    // 1 (generic diagnostic failure), not 5 — exit 5 is reserved for
    // ContractError (a quest contract violation), which a doctor finding is not.
    return result.ok ? 0 : 1;
  }
  if (subcommand === "open") {
    const p = parseOpenArgs(rest);
    if (p.help) {
      out(renderCommandHelp(command));
      return 0;
    }
    const result = doctorFix({ cwd, env });
    if (!result.ok) {
      printDoctorResult(command, result, out);
      out(`${command} open: not launching because doctor still reports problems`);
      return 1;
    }
    const invocation = openInvocation(command, cwd, env, p.forwarded);
    const rendered = [invocation.cmd, ...invocation.args].map(shellQuote).join(" ");
    if (p.dryRun) {
      out(`${command} open: health OK`);
      out(`Would run: ${rendered}`);
      return 0;
    }
    out(`${command} open: health OK; launching ${rendered}`);
    const res = spawnSync(invocation.cmd, invocation.args, { cwd: invocation.cwd, env, stdio: "inherit" });
    return typeof res.status === "number" ? res.status : 1;
  }
  if (subcommand === "work") {
    const p = parse(command, rest, { "dry-run": { type: "boolean" } }, { positionals: 1 });
    if (p.help) {
      out(renderCommandHelp(command));
      return 0;
    }
    const rawId = p.positionals[0];
    if (!rawId || !/^\d+$/.test(rawId)) throw new UsageError("a numeric quest id is required", { command });
    if (!p.values["dry-run"]) {
      throw new UsageError(`${command} work only supports --dry-run; launching provider sessions is out of scope`, { command });
    }
    const result = doctorFix({ cwd, env });
    if (!result.recommended_path?.available) {
      printDoctorResult(command, result, out);
      out(`${command} work: not printing a handoff because doctor still reports setup problems`);
      return 1;
    }
    if (!result.ok) printDoctorResult(command, result, out);
    else out(`${command} work: health OK`);
    out(renderWorkHandoff(command, rawId, result.recommended_path, cwd, env));
    return 0;
  }
  if (subcommand === "install-agents") {
    const p = parse(command, rest, {
      scope: { type: "string", default: "project" },
      "dry-run": { type: "boolean" },
      force: { type: "boolean" },
    }, { positionals: 0 });
    if (p.help) {
      out(renderCommandHelp(command));
      return 0;
    }
    if (!["project", "user"].includes(p.values.scope)) throw new UsageError(`--scope must be project or user (got "${p.values.scope}")`, { command });
    const isDry = Boolean(p.values["dry-run"]);
    const result = install({
      scope: p.values.scope,
      dryRun: isDry,
      force: Boolean(p.values.force),
      cwd,
      env,
    });
    // A real run refuses to overwrite; a --dry-run PREVIEWS the conflict
    // (its whole purpose) rather than erroring before showing the plan.
    if (!result.ok && !isDry) {
      const symlinkDirConflicts = result.conflicts.filter((c) => c.reason === "symlink-directory");
      if (symlinkDirConflicts.length) {
        throw new UsageError(`refusing to write agent templates through symlinked directory: ${symlinkDirConflicts.map((c) => c.path).join(", ")}`, { command });
      }
      const conflicts = result.conflicts.map((c) => c.path).join(", ");
      throw new UsageError(`agent file already exists; pass --force to replace: ${conflicts}`, { command });
    }
    if (p.values.json) out(JSON.stringify(result));
    else {
      out(`${isDry ? "Would install" : "Installed"} ${label} agents to ${result.target}`);
      for (const a of result.actions) out(`  ${a.action.padEnd(9)} ${a.path}`);
      if (!result.ok) {
        const symlinkDirConflicts = result.conflicts.filter((c) => c.reason === "symlink-directory");
        if (symlinkDirConflicts.length) out(`  symlinked directories must be real directories: ${symlinkDirConflicts.map((c) => c.path).join(", ")}`);
        const fileConflicts = result.conflicts.filter((c) => c.reason !== "symlink-directory");
        if (fileConflicts.length) out(`  conflicts present — pass --force to replace: ${fileConflicts.map((c) => c.path).join(", ")}`);
      }
    }
    return 0;
  }
  throw new UsageError(`unknown ${command} subcommand "${subcommand}"`, { command });
}

async function dispatch(argv, ctx) {
  const [command, ...rest] = argv;
  const { out, errOut, cwd, env } = ctx;

  if (command === "--version" || command === "-V" || command === "version") {
    const versions = versionInfo();
    out(versions.package);
    return 0;
  }

  if (!command) {
    const storeDir = findStoreDir(cwd, env);
    if (!storeDir) {
      out(renderNoStore());
      return 0;
    }
    const config = loadConfig(storeDir, env);
    const store = openStore(config, { env });
    const all = store.listQuests();
    const counts = {};
    for (const q of all) counts[q.status] = (counts[q.status] ?? 0) + 1;
    const runs = local.readRuns(storeDir);
    const ended = new Set(runs.filter((r) => r.event === "run_ended").map((r) => r.run_id));
    const active = runs.filter((r) => r.event === "run_started" && !ended.has(r.run_id)).length;
    out(renderStatusOverview({ counts, ready: store.readyQuests(), activeRuns: active, backend: config.backend }));
    return 0;
  }

  if (command === "help" || command === "--help" || command === "-h") {
    const topic = rest[0];
    if (topic && COMMANDS[topic]) out(renderCommandHelp(topic));
    else out(renderGeneralHelp());
    return 0;
  }

  if (!(command in HANDLERS)) {
    throw new UsageError(`unknown command "${command}"`);
  }
  return HANDLERS[command](rest, ctx);
}

const HANDLERS = {
  async init(args, { out, cwd, env }) {
    const p = parse("init", args, {
      backend: { type: "string", default: "local" },
      repo: { type: "string" },
      "agents-md": { type: "boolean" },
      "no-agents": { type: "boolean" },
    });
    if (p.help) return void out(renderCommandHelp("init")) ?? 0;
    const backend = p.values.backend;
    if (!["local", "github"].includes(backend)) throw new UsageError(`--backend must be local or github (got "${backend}")`, { command: "init" });
    if (backend === "github" && !p.values.repo) throw new UsageError("--repo owner/name is required with --backend github", { command: "init" });
    if (existsSync(join(cwd, ".quests", "config.json"))) {
      throw new ContractError(`a quest store already exists at ${join(cwd, ".quests")}`, { hint: "use the existing store, or delete it first if you really mean to start over" });
    }
    const agentPlans = p.values["no-agents"] ? [] : preflightInitAgentInstall(cwd, env);
    if (backend === "github") {
      github.assertAuth(env); // green `gh auth status` required
      github.ensureLabels(p.values.repo, env); // idempotent label creation
    }
    const storeDir = local.initLocalStore(cwd);
    const config = {
      backend,
      ...(p.values.repo ? { github: { repo: p.values.repo } } : {}),
      defaults: { worker: "claude", claude: { model: "opus", effort: "xhigh" }, codex: { model: "gpt-5.5", reasoning_effort: "medium", goal_mode: "auto" }, max_iterations: 8, priority: "p2" },
      notify: { command: "" },
    };
    writeFileSync(join(storeDir, "config.json"), JSON.stringify(config, null, 2) + "\n");
    writeFileSync(join(storeDir, "amendments.md"), "# Protocol amendments\n\n(none yet)\n");
    if (p.values["agents-md"]) {
      const section = [
        "",
        "## Quest goal-loop",
        "",
        "Work in this repo can be tracked as quests (goal contracts) in `.quests/`.",
        "Orient with `quest protocol` and `quest show <id> --json`; record progress",
        "only via `quest checkpoint`. A quest is complete only when every Done-when",
        "item is enumerated with evidence.",
        "",
      ].join("\n");
      appendFileSync(join(cwd, "AGENTS.md"), section);
    }
    for (const [provider] of agentPlans) {
      const label = provider === "codex" ? "Codex" : "Claude";
      const install = provider === "codex" ? installCodexAgents : installClaudeAgents;
      const result = install({ scope: "project", cwd, env });
      out(`Installed ${label} agents to ${result.target}`);
      for (const a of result.actions) out(`  ${a.action.padEnd(9)} ${a.path}`);
    }
    out(`Initialized ${backend} quest store at ${storeDir}`);
    out(renderInitNextSteps(backend, { agentsInstalled: agentPlans.length > 0 }));
    return 0;
  },

  async create(args, { out, cwd, env }) {
    const p = parse("create", args, {
      title: { type: "string" },
      objective: { type: "string" },
      "done-when": { type: "string", multiple: true },
      validation: { type: "string" },
      constraint: { type: "string", multiple: true },
      milestone: { type: "string", multiple: true },
      context: { type: "string" },
      "out-of-scope": { type: "string", multiple: true },
      parent: { type: "string" },
      "depends-on": { type: "string" },
      worker: { type: "string" },
      model: { type: "string" },
      effort: { type: "string" },
      "max-iterations": { type: "string" },
      "max-cost": { type: "string" },
      priority: { type: "string" },
    });
    if (p.help) return void out(renderCommandHelp("create")) ?? 0;
    const v = p.values;
    for (const [flag, val] of [["--title", v.title], ["--objective", v.objective], ["--validation", v.validation]]) {
      if (!val || !val.trim()) throw new UsageError(`${flag} is required`, { command: "create" });
    }
    if (!v["done-when"]?.length) throw new UsageError("at least one --done-when is required", { command: "create" });
    const config = getStore(cwd, env);
    const store = openStore(config, { env });
    const num = (flag, s) => {
      if (s === undefined) return undefined;
      if (!/^\d+(\.\d+)?$/.test(s)) throw new UsageError(`${flag} must be a number (got "${s}")`, { command: "create" });
      return Number(s);
    };
    const created = store.createQuest(config.defaults, {
      title: v.title,
      priority: v.priority,
      worker: v.worker,
      model: v.model,
      effort: v.effort,
      max_iterations: num("--max-iterations", v["max-iterations"]),
      max_cost: num("--max-cost", v["max-cost"]),
      parent: num("--parent", v.parent),
      depends_on: v["depends-on"] ? v["depends-on"].split(",").map((s) => num("--depends-on", s.trim())) : undefined,
    }, {
      objective: v.objective,
      doneWhen: v["done-when"],
      validation: v.validation,
      constraints: v.constraint,
      milestones: v.milestone,
      context: v.context,
      outOfScope: v["out-of-scope"],
    });
    if (p.values.json) out(JSON.stringify({ ok: true, id: created.id, path: created.path }));
    else {
      out(`Created quest ${created.id}: ${v.title}`);
      out(`  record: ${created.path}`);
      out(`  next:   quest lint ${created.id} && quest show ${created.id}`);
    }
    return 0;
  },

  async list(args, { out, cwd, env }) {
    const p = parse("list", args, {
      status: { type: "string" },
      parent: { type: "string" },
      ready: { type: "boolean" },
    });
    if (p.help) return void out(renderCommandHelp("list")) ?? 0;
    const config = getStore(cwd, env);
    const store = openStore(config, { env });
    let quests = p.values.ready ? store.readyQuests() : store.listQuests();
    if (p.values.status) quests = quests.filter((q) => q.status === p.values.status);
    if (p.values.parent) quests = quests.filter((q) => q.parent === Number(p.values.parent));
    if (p.values.json) {
      out(JSON.stringify(quests));
    } else if (!quests.length) {
      out(p.values.ready ? "No quests are ready (check `quest list` for blockers)." : "No quests match.");
    } else {
      for (const q of quests) {
        const deps = q.depends_on?.length ? ` deps:[${q.depends_on.join(",")}]` : "";
        out(`${String(q.id).padStart(3)} [${q.priority}] ${q.status.padEnd(11)} ${q.title}${deps}`);
      }
    }
    return 0;
  },

  async show(args, { out, cwd, env }) {
    const p = parse("show", args, {}, { positionals: 1 });
    if (p.help) return void out(renderCommandHelp("show")) ?? 0;
    const id = requireId(p, "show");
    const config = getStore(cwd, env);
    const q = openStore(config, { env }).loadQuest(id);
    if (p.values.json) out(JSON.stringify({ ...q.front, body: q.body, checkpoints: q.checkpoints, path: q.path }));
    else out(q.text.trimEnd());
    return 0;
  },

  async start(args, { out, cwd, env }) {
    const p = parse("start", args, {}, { positionals: 1 });
    if (p.help) return void out(renderCommandHelp("start")) ?? 0;
    const id = requireId(p, "start");
    const config = getStore(cwd, env);
    const q = openStore(config, { env }).startQuest(id);
    if (p.values.json) out(JSON.stringify({ ok: true, id, status: q.front.status }));
    else out(`Quest ${id} is now in_progress. Work it per \`quest protocol\`; record evidence with \`quest checkpoint ${id}\`.`);
    return 0;
  },

  async checkpoint(args, { out, cwd, env }) {
    const p = parse("checkpoint", args, {
      status: { type: "string" },
      summary: { type: "string" },
      validation: { type: "string" },
      iteration: { type: "string" },
      pr: { type: "string" },
      sha: { type: "string" },
      failed: { type: "string" },
      expansion: { type: "string" },
      note: { type: "string" },
    }, { positionals: 1 });
    if (p.help) return void out(renderCommandHelp("checkpoint")) ?? 0;
    const id = requireId(p, "checkpoint");
    const v = p.values;
    for (const [flag, val] of [["--status", v.status], ["--summary", v.summary], ["--validation", v.validation]]) {
      if (!val || !val.trim()) throw new UsageError(`${flag} is required`, { command: "checkpoint" });
    }
    const config = getStore(cwd, env);
    const store = openStore(config, { env });
    const existing = store.loadQuest(id);
    const q = store.appendCheckpoint(id, {
      quest_status: v.status,
      iteration: v.iteration ?? existing.checkpoints.length + 1,
      changed: v.summary,
      validation_summary: v.validation,
      pr: v.pr,
      head_sha: v.sha,
      failed_approaches: v.failed,
      compatible_expansion: v.expansion,
      note: v.note,
    });
    if (p.values.json) out(JSON.stringify({ ok: true, id, status: q.front.status, checkpoints: q.checkpoints.length }));
    else {
      out(`Checkpoint recorded — quest ${id} is ${q.front.status}.`);
      if (q.front.status === "complete") out("Remember: the final checkpoint should enumerate every Done-when item as Done/Blocked/Cancelled with evidence.");
      if (q.front.status === "blocked") out("Blocked is a valid stop. State the exact blocker so a fresh session (or human) can rule.");
    }
    return 0;
  },

  async cancel(args, { out, cwd, env }) {
    const p = parse("cancel", args, { reason: { type: "string" } }, { positionals: 1 });
    if (p.help) return void out(renderCommandHelp("cancel")) ?? 0;
    const id = requireId(p, "cancel");
    const config = getStore(cwd, env);
    openStore(config, { env }).cancelQuest(id, p.values.reason);
    if (p.values.json) out(JSON.stringify({ ok: true, id, status: "cancelled" }));
    else out(`Quest ${id} cancelled.`);
    return 0;
  },

  async reopen(args, { out, errOut, cwd, env }) {
    const p = parse("reopen", args, { reason: { type: "string" } }, { positionals: 1 });
    if (p.help) return void out(renderCommandHelp("reopen")) ?? 0;
    const id = requireId(p, "reopen");
    // --reason is validated in the store (a contract requirement, exit 5), not
    // as a usage error — mirrors `cancel`. reopenQuest throws if it is missing.
    const config = getStore(cwd, env);
    const store = openStore(config, { env });
    const q = store.reopenQuest(id, p.values.reason);
    // Reopening a child of a *complete* parent epic is allowed, never blocked —
    // but the epic's completion verdict may now be falsified, so warn the
    // orchestrator on stderr (the epic-falsification cue). Best-effort: a
    // missing/unloadable parent (or any lookup failure) must never fail an
    // already-successful reopen. Runs for both backends via this one handler.
    if (q.front.parent !== undefined) {
      try {
        const parent = store.loadQuest(q.front.parent);
        if (parent.front.status === "complete") {
          errOut(`quest: warning — quest ${id}'s parent epic ${q.front.parent} is complete; reopening this child may falsify the epic's completion verdict. Rule on it, and \`quest reopen ${q.front.parent} --reason "…"\` too if the integration gate no longer holds.`);
        }
      } catch {
        /* best-effort: never fail the reopen on a parent-lookup problem */
      }
    }
    if (p.values.json) out(JSON.stringify({ ok: true, id, status: q.front.status }));
    else {
      out(`Quest ${id} reopened — now in_progress (reason recorded in an audited checkpoint).`);
      out(`Reopened quests are dispatched directly by id (\`quest-run ${id}\` or $quest:work ${id}); they do not re-enter \`quest list --ready\`.`);
    }
    return 0;
  },

  async edit(args, { out, cwd, env }) {
    const p = parse("edit", args, {
      "add-done-when": { type: "string", multiple: true },
      "add-milestone": { type: "string", multiple: true },
      "add-context": { type: "string" },
      rationale: { type: "string" },
    }, { positionals: 1 });
    if (p.help) return void out(renderCommandHelp("edit")) ?? 0;
    const id = requireId(p, "edit");
    const config = getStore(cwd, env);
    openStore(config, { env }).editQuest(id, {
      addDoneWhen: p.values["add-done-when"] ?? [],
      addMilestone: p.values["add-milestone"] ?? [],
      addContext: p.values["add-context"],
      rationale: p.values.rationale,
    });
    if (p.values.json) out(JSON.stringify({ ok: true, id }));
    else out(`Quest ${id} expanded (rationale recorded).`);
    return 0;
  },

  async lint(args, { out, errOut, cwd, env }) {
    const p = parse("lint", args, { all: { type: "boolean" } }, { positionals: 1 });
    if (p.help) return void out(renderCommandHelp("lint")) ?? 0;
    const config = getStore(cwd, env);
    const store = openStore(config, { env });
    let results;
    if (p.values.all) {
      results = store.lintAll();
    } else {
      const id = requireId(p, "lint");
      const q = store.loadQuest(id);
      results = [{ file: q.file, id, problems: lintRecord(q, { filename: q.file }) }];
    }
    const bad = results.filter((r) => r.problems.length);
    if (p.values.json) out(JSON.stringify({ ok: bad.length === 0, results }));
    else if (!bad.length) out(`lint: OK (${results.length} record${results.length === 1 ? "" : "s"})`);
    else {
      for (const r of bad) for (const prob of r.problems) errOut(`${r.file}: ${prob}`);
    }
    if (bad.length) throw new ContractError(`${bad.length} record(s) fail the contract`, { hint: "records are written by `quest` commands; hand-edits must follow contract-spec.md exactly" });
    return 0;
  },

  async amend(args, { out, cwd, env }) {
    const p = parse("amend", args, { text: { type: "string" } });
    if (p.help) return void out(renderCommandHelp("amend")) ?? 0;
    if (!p.values.text?.trim()) throw new UsageError("--text is required", { command: "amend" });
    const config = getStore(cwd, env);
    const { number } = local.appendAmendment(config.storeDir, p.values.text);
    if (p.values.json) out(JSON.stringify({ ok: true, amendment: number }));
    else out(`Amendment ${number} recorded — future sessions read it via \`quest protocol\`.`);
    return 0;
  },

  async protocol(args, { out, cwd, env }) {
    const p = parse("protocol", args, {});
    if (p.help) return void out(renderCommandHelp("protocol")) ?? 0;
    const config = getStore(cwd, env);
    const base = readFileSync(join(PLUGIN_ROOT, "skills", "protocol", "references", "protocol.md"), "utf8");
    out(base.trimEnd());
    const amendmentsPath = join(config.storeDir, "amendments.md");
    if (existsSync(amendmentsPath)) {
      out("\n---\n");
      out(readFileSync(amendmentsPath, "utf8").trimEnd());
    }
    return 0;
  },

  async runs(args, { out, cwd, env }) {
    const p = parse("runs", args, { active: { type: "boolean" } });
    if (p.help) return void out(renderCommandHelp("runs")) ?? 0;
    const config = getStore(cwd, env);
    const events = local.readRuns(config.storeDir);
    const byRun = new Map();
    for (const e of events) {
      if (!byRun.has(e.run_id)) byRun.set(e.run_id, { run_id: e.run_id, quest: e.quest, worker: e.worker, started: null, ended: null, final_status: null, iterations: 0, cost_usd: 0 });
      const r = byRun.get(e.run_id);
      if (e.event === "run_started") r.started = e.ts;
      if (e.event === "iteration_finished") { r.iterations += 1; r.cost_usd += e.cost_usd ?? 0; }
      if (e.event === "run_ended") { r.ended = e.ts; r.final_status = e.final_status; }
    }
    let runs = [...byRun.values()];
    if (p.values.active) runs = runs.filter((r) => !r.ended);
    if (p.values.json) out(JSON.stringify(runs));
    else if (!runs.length) out(p.values.active ? "No active runs." : "No recorded runs.");
    else for (const r of runs) out(`${r.run_id}  quest ${r.quest}  ${r.worker}  ${r.ended ? `ended ${r.final_status}` : "ACTIVE"}  iters:${r.iterations}  $${r.cost_usd.toFixed(2)}`);
    return 0;
  },

  async codex(args, { out, cwd, env }) {
    return runNativeSetupCommand("codex", args, { out, cwd, env }, { label: "Codex", doctor: codexDoctor, doctorFix: codexDoctorFix, install: installCodexAgents });
  },

  async claude(args, { out, cwd, env }) {
    return runNativeSetupCommand("claude", args, { out, cwd, env }, { label: "Claude", doctor: claudeDoctor, doctorFix: claudeDoctorFix, install: installClaudeAgents });
  },
};
