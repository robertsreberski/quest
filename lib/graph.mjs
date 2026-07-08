const TERMINAL = new Set(["complete", "cancelled"]);

function byId(quests) {
  return new Map(quests.map((q) => [q.id, q]));
}

function prioritySort(a, b) {
  return a.priority.localeCompare(b.priority) || a.id - b.id;
}

function openChildIds(quests, parentId) {
  return quests
    .filter((q) => q.parent === parentId && !TERMINAL.has(q.status))
    .map((q) => q.id)
    .sort((a, b) => a - b);
}

function queueBlockers(q, known, quests, epicIds) {
  const reasons = [];
  if (q.parent !== undefined && !known.has(q.parent)) reasons.push(`missing parent: #${q.parent}`);

  const missingDeps = (q.depends_on ?? []).filter((id) => !known.has(id));
  if (missingDeps.length) reasons.push(`missing depends_on: ${missingDeps.map((id) => `#${id}`).join(", ")}`);

  const incompleteDeps = (q.depends_on ?? []).filter((id) => known.has(id) && known.get(id).status !== "complete");
  if (incompleteDeps.length) reasons.push(`incomplete depends_on: ${incompleteDeps.map((id) => `#${id}`).join(", ")}`);

  if (epicIds.has(q.id)) {
    const open = openChildIds(quests, q.id);
    if (open.length) reasons.push(`open children: ${open.map((id) => `#${id}`).join(", ")}`);
  }
  return reasons;
}

export function computeQueue(quests) {
  const all = [...quests];
  const known = byId(all);
  const epicIds = new Set(all.filter((q) => q.parent !== undefined).map((q) => q.parent));
  const workerReady = [];
  const inlineCloseReadyEpics = [];
  const blocked = [];

  for (const q of all) {
    if (q.status !== "todo") continue;
    const reasons = queueBlockers(q, known, all, epicIds);
    if (reasons.length) {
      blocked.push({ quest: q, reasons });
      continue;
    }
    if (epicIds.has(q.id)) inlineCloseReadyEpics.push(q);
    else workerReady.push(q);
  }

  workerReady.sort(prioritySort);
  inlineCloseReadyEpics.sort(prioritySort);
  blocked.sort((a, b) => prioritySort(a.quest, b.quest));
  return { workerReady, inlineCloseReadyEpics, blocked };
}

export function lintGraphReferences(quests) {
  const known = byId(quests);
  const problems = new Map(quests.map((q) => [q.id, []]));
  for (const q of quests) {
    if (q.parent !== undefined && !known.has(q.parent)) {
      problems.get(q.id).push(`parent references unknown quest ${q.parent}`);
    }
    for (const dep of q.depends_on ?? []) {
      if (!known.has(dep)) problems.get(q.id).push(`depends_on references unknown quest ${dep}`);
    }
  }
  return problems;
}
