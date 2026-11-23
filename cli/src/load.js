'use strict';

const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

function loadDossier(dir) {
  const abs = path.resolve(dir);
  if (!fs.existsSync(abs)) throw new Error(`dossier directory not found: ${dir}`);

  const planPath = path.join(abs, 'plan.yaml');
  if (!fs.existsSync(planPath)) throw new Error(`plan.yaml not found in ${dir}`);
  const planRaw = fs.readFileSync(planPath, 'utf8');
  const plan = YAML.parse(planRaw);
  if (!plan || typeof plan !== 'object') throw new Error('plan.yaml is empty or not a mapping');

  const tasksDir = path.join(abs, 'tasks');
  const tasks = fs.existsSync(tasksDir)
    ? fs.readdirSync(tasksDir)
        .filter((f) => f.endsWith('.yaml'))
        .map((f) => {
          const raw = fs.readFileSync(path.join(tasksDir, f), 'utf8');
          return { file: `tasks/${f}`, raw, card: YAML.parse(raw) };
        })
    : [];

  const ledgerPath = path.join(abs, 'ledger.jsonl');
  if (!fs.existsSync(ledgerPath)) {
    throw new Error('ledger.jsonl not found in dossier (minimal form allows an empty file, not a missing one)');
  }
  const ledgerRaw = fs.readFileSync(ledgerPath, 'utf8');
  const ledgerLines = ledgerRaw
    .split('\n')
    .map((l, i) => ({ line: i + 1, text: l }))
    .filter((l) => l.text.trim() !== '');

  const views = {};
  for (const name of ['plan.view.md', 'review.packet.md']) {
    const p = path.join(abs, 'views', name);
    views[name] = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
  }

  return { abs, planRaw, plan, tasks, ledgerLines, views };
}

module.exports = { loadDossier };
