// Backend seam. Given a loaded config it returns one uniform record-store
// interface, so cli.mjs handlers are backend-agnostic. Only quest *records*
// are backend-specific; config, amendments and the runs journal always stay
// local in .quests/ (the handlers for those keep calling store-local directly).

import * as local from "./store-local.mjs";
import * as github from "./store-github.mjs";

export function openStore(config, ctx = {}) {
  if (config.backend === "github") {
    const repo = config.github.repo;
    const env = ctx.env ?? process.env;
    return {
      createQuest: (defaults, fields, sections) => github.createQuest(repo, defaults, fields, sections, env),
      loadQuest: (id) => github.loadQuest(repo, id, env),
      listQuests: () => github.listQuests(repo, env),
      readyQuests: () => github.readyQuests(repo, env),
      startQuest: (id) => github.startQuest(repo, id, env),
      appendCheckpoint: (id, cp) => github.appendCheckpoint(repo, id, cp, env),
      cancelQuest: (id, reason) => github.cancelQuest(repo, id, reason, env),
      reopenQuest: (id, reason) => github.reopenQuest(repo, id, reason, env),
      editQuest: (id, changes) => github.editQuest(repo, id, changes, env),
      lintAll: () => github.lintAll(repo, env),
    };
  }
  const dir = config.storeDir;
  return {
    createQuest: (defaults, fields, sections) => local.createQuest(dir, defaults, fields, sections),
    loadQuest: (id) => local.loadQuest(dir, id),
    listQuests: () => local.listQuests(dir),
    readyQuests: () => local.readyQuests(dir),
    startQuest: (id) => local.startQuest(dir, id),
    appendCheckpoint: (id, cp) => local.appendCheckpoint(dir, id, cp),
    cancelQuest: (id, reason) => local.cancelQuest(dir, id, reason),
    reopenQuest: (id, reason) => local.reopenQuest(dir, id, reason),
    editQuest: (id, changes) => local.editQuest(dir, id, changes),
    lintAll: () => local.lintAll(dir),
  };
}
