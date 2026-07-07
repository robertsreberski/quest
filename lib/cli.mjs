// Command dispatch for `quest`. Exit codes (contract-spec): 0 ok · 2 usage ·
// 3 no store/config · 4 not found · 5 contract violation · 6 backend unavailable.

import { parseArgs } from "node:util";
import { readFileSync, existsSync, writeFileSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ConfigError, findStoreDir, loadConfig } from "./config.mjs";
import { ContractError, lintRecord } from "./contract.mjs";
import * as local from "./store-local.mjs";
import * as github from "./store-github.mjs";
import { openStore } from "./store.mjs";
import { COMMANDS, renderCommandHelp, renderGeneralHelp, renderInitNextSteps, renderNoStore, renderStatusOverview } from "./help.mjs";

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

async function dispatch(argv, ctx) {
  const [command, ...rest] = argv;
  const { out, errOut, cwd, env } = ctx;

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
    });
    if (p.help) return void out(renderCommandHelp("init")) ?? 0;
    const backend = p.values.backend;
    if (!["local", "github"].includes(backend)) throw new UsageError(`--backend must be local or github (got "${backend}")`, { command: "init" });
    if (backend === "github" && !p.values.repo) throw new UsageError("--repo owner/name is required with --backend github", { command: "init" });
    if (backend === "github") {
      github.assertAuth(env); // green `gh auth status` required
      github.ensureLabels(p.values.repo, env); // idempotent label creation
    }
    const storeDir = local.initLocalStore(cwd);
    const config = {
      backend,
      ...(p.values.repo ? { github: { repo: p.values.repo } } : {}),
      defaults: { worker: "claude", claude: { model: "opus", effort: "xhigh" }, codex: { model: "gpt-5.5", reasoning_effort: "medium" }, max_iterations: 8, priority: "p2" },
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
    out(`Initialized ${backend} quest store at ${storeDir}`);
    out(renderInitNextSteps(backend));
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
};
