#!/usr/bin/env node
'use strict';

const { validate } = require('../src/validate');

const [cmd, target] = process.argv.slice(2);

if (cmd !== 'validate' || !target) {
  console.error('usage: plan-dossier validate <dossier-dir>');
  process.exit(2);
}

validate(target).then(
  ({ errors, warns }) => {
    for (const w of warns) console.log(`warn: ${w}`);
    for (const e of errors) console.error(`error: ${e}`);
    console.log(`\n${errors.length} error(s), ${warns.length} warning(s)`);
    process.exit(errors.length ? 1 : 0);
  },
  (err) => {
    console.error(`error: ${err.message}`);
    process.exit(1);
  }
);
