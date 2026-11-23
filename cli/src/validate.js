'use strict';

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv/dist/2020').default;
const { loadDossier } = require('./load');
const { runChecks } = require('./checks');

function loadSchema(name) {
  // spec/ lives one level above cli/
  const p = path.join(__dirname, '..', '..', 'spec', name);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

async function validate(dir) {
  const d = loadDossier(dir);
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validatePlan = ajv.compile(loadSchema('plan.schema.json'));
  const validateTask = ajv.compile(loadSchema('task.schema.json'));
  const validateEntry = ajv.compile(loadSchema('ledger.schema.json'));

  const errors = [];
  const warns = [];
  runChecks(d, validatePlan, validateTask, validateEntry, errors, warns);
  return { errors, warns };
}

module.exports = { validate };
