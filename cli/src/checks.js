'use strict';

const fs = require('fs');
const path = require('path');

// All checks operate on the loaded dossier from load.js and push onto errors/warns.
// Numbering follows spec/invariants.md.

function runChecks(d, validatePlan, validateTask, validateEntry, errors, warns) {
  const { abs, plan, tasks, ledgerLines, views } = d;

  // --- Schema checks (structural) ---
  if (!validatePlan(plan)) {
    for (const e of validatePlan.errors) errors.push(`plan.yaml: ${e.instancePath || '/'} ${e.message}`);
  }
  const ledgerIds = new Set(); // filled below, used by cites check

  // --- Ledger (errors 5) ---
  const entries = [];
  ledgerLines.forEach(({ line, text }) => {
    let entry;
    try {
      entry = JSON.parse(text);
    } catch {
      errors.push(`ledger.jsonl:${line}: invalid JSON`);
      return;
    }
    if (!validateEntry(entry)) {
      for (const e of validateEntry.errors) errors.push(`ledger.jsonl:${line}: ${e.instancePath || '/'} ${e.message}`);
      return;
    }
    if (ledgerIds.has(entry.id)) errors.push(`ledger.jsonl:${line}: duplicate id ${entry.id}`);
    ledgerIds.add(entry.id);
    entries.push({ line, entry });
  });
  const seen = new Set();
  for (const { line, entry } of entries) {
    if (entry.supersedes != null) {
      if (entry.supersedes === entry.id) {
        errors.push(`ledger.jsonl:${line}: supersedes ${entry.id} points at itself`);
      } else if (!ledgerIds.has(entry.supersedes)) {
        errors.push(`ledger.jsonl:${line}: supersedes ${entry.supersedes} does not exist`);
      } else if (!seen.has(entry.supersedes)) {
        errors.push(`ledger.jsonl:${line}: supersedes ${entry.supersedes} appears later (must point at an earlier entry)`);
      }
    }
    seen.add(entry.id);
  }

  // --- DAG (errors 1-2) ---
  const dagIds = new Set((plan.dag || []).map((n) => n.id));
  for (const node of plan.dag || []) {
    if (!isWithinDossier(abs, node.task)) {
      errors.push(`dag ${node.id}: task path ${node.task} escapes the dossier directory`);
    }
    const taskPath = path.join(abs, node.task);
    if (!fs.existsSync(taskPath)) errors.push(`dag ${node.id}: task file ${node.task} not found`);
    for (const dep of node.depends_on || []) {
      if (!dagIds.has(dep)) errors.push(`dag ${node.id}: depends_on ${dep} does not exist`);
    }
  }
  const dagIdCounts = new Map();
  for (const n of plan.dag || []) dagIdCounts.set(n.id, (dagIdCounts.get(n.id) || 0) + 1);
  for (const [id, count] of dagIdCounts) {
    if (count > 1) errors.push(`dag: duplicate node id ${id} (${count} nodes)`);
  }
  detectCycle(plan.dag || [], errors);

  // --- Task cards (errors 3-4) ---
  const cardById = new Map();
  for (const { file, raw, card } of tasks) {
    if (!card || typeof card !== 'object') {
      errors.push(`${file}: empty or not a mapping`);
      continue;
    }
    if (!validateTask(card)) {
      for (const e of validateTask.errors) errors.push(`${file}: ${e.instancePath || '/'} ${e.message}`);
    }
    if (cardById.has(card.id)) errors.push(`${file}: duplicate card id ${card.id}`);
    cardById.set(card.id, { file, card });
    for (const cite of card.cites || []) {
      if (!ledgerIds.has(cite)) errors.push(`${file}: cites ${cite} not found in ledger.jsonl`);
    }
    // Warn 8: card token budget
    const est = raw.length / 4;
    if (est > 1024) warns.push(`${file}: ~${Math.round(est)} tokens exceeds the 1K card budget`);
  }
  for (const node of plan.dag || []) {
    const found = cardById.get(node.id);
    if (!found) {
      errors.push(`dag ${node.id}: no task card found`);
    } else if (found.file !== node.task && path.join(abs, found.file) !== path.join(abs, node.task)) {
      errors.push(`dag ${node.id}: card ${found.file} does not match task path ${node.task}`);
    }
  }
  for (const id of cardById.keys()) {
    if (!dagIds.has(id)) errors.push(`${cardById.get(id).file}: card id ${id} has no dag node`);
  }

  // --- Mitigation anchors (error 6) ---
  for (const r of plan.risks || []) {
    if (!Array.isArray(r.mitigated_by) || r.mitigated_by.length === 0) {
      errors.push(`risk ${r.id}: mitigated_by is empty (demote to open_questions)`);
      continue;
    }
    for (const anchor of r.mitigated_by) {
      let m;
      if ((m = anchor.match(/^a(\d+)$/))) {
        const n = Number(m[1]);
        if (!plan.acceptance || n < 1 || n > plan.acceptance.length) {
          errors.push(`risk ${r.id}: anchor ${anchor} out of range of L0 acceptance`);
        }
      } else if ((m = anchor.match(/^s(\d+)\.(\d+)$/))) {
        const card = cardById.get(`s${m[1]}`);
        const n = Number(m[2]);
        if (!card) errors.push(`risk ${r.id}: anchor ${anchor} references missing card s${m[1]}`);
        else if (n < 1 || n > (card.card.acceptance || []).length) {
          errors.push(`risk ${r.id}: anchor ${anchor} out of range of card s${m[1]} acceptance`);
        }
      } else {
        errors.push(`risk ${r.id}: malformed anchor ${anchor} (expected aN or sM.N)`);
      }
    }
  }

  // --- Trust grading (error 7) ---
  // Constraints: unverified requires by + rederive_cost (SKILL.md:143).
  // Decisions: unverified requires by only — the SKILL.md L0 example omits rederive_cost there.
  for (const [list, isDecision] of [[plan.constraints || [], false], [plan.decisions || [], true]]) {
    for (const item of list) {
      const label = item.id || '(no id)';
      if (item.trust === 'checked') {
        if (!item.assertion || !item.assertion.replay) errors.push(`${label}: trust checked requires assertion.replay`);
      } else if (item.trust === 'unverified') {
        if (!item.by) errors.push(`${label}: trust unverified requires by`);
        if (!isDecision && !item.rederive_cost) errors.push(`${label}: trust unverified requires rederive_cost`);
      }
    }
  }

  // --- Warn 9: empty exclusions explained ---
  if (Array.isArray(plan.excluded) && plan.excluded.length === 0) {
    const oq = (plan.open_questions || []).join('\n');
    if (!/exclu/i.test(oq)) warns.push('excluded is [] but open_questions does not note "no exclusions made"');
  }

  // --- Warn 8: plan token budget ---
  const planEst = d.planRaw.length / 4;
  if (planEst > 2048) warns.push(`plan.yaml: ~${Math.round(planEst)} tokens exceeds the 2K budget`);

  // --- Warn 10: review isolation ---
  const packet = views['review.packet.md'];
  if (packet) {
    const ids = packet.match(/L-\d+/g) || [];
    if (ids.length) warns.push(`review.packet.md contains ledger ids: ${[...new Set(ids)].join(', ')}`);
    for (const ex of plan.excluded || []) {
      if (ex.locator && packet.includes(ex.locator)) warns.push(`review.packet.md contains excluded locator ${ex.locator}`);
    }
  }

  // --- Warn 11: render consistency ---
  const view = views['plan.view.md'];
  if (view) {
    for (const node of plan.dag || []) {
      const re = new RegExp(`\\|\\s*${node.id}\\s*\\|`);
      const line = view.split('\n').find((l) => re.test(l));
      if (!line) {
        warns.push(`plan.view.md: dag node ${node.id} not shown`);
      } else if (!line.includes(node.status)) {
        warns.push(`plan.view.md: ${node.id} status "${node.status}" not reflected (line: "${line.trim().slice(0, 80)}")`);
      }
    }
  }
}

function isWithinDossier(abs, relPath) {
  const resolved = path.resolve(abs, relPath);
  return resolved === abs || resolved.startsWith(abs + path.sep);
}

function detectCycle(dag, errors) {
  const color = new Map(); // 1=visiting 2=done
  const edges = new Map(dag.map((n) => [n.id, n.depends_on || []]));
  const visit = (id, stack) => {
    color.set(id, 1);
    for (const dep of edges.get(id) || []) {
      const c = color.get(dep);
      if (c === 1) errors.push(`dag: cycle detected ${[...stack, id, dep].join(' -> ')}`);
      else if (!c) visit(dep, [...stack, id]);
    }
    color.set(id, 2);
  };
  for (const n of dag) if (!color.get(n.id)) visit(n.id, []);
}

module.exports = { runChecks };
