#!/usr/bin/env node
// Packs data/*.json, prints a report and the diff to the previous run, writes out/plan.json.
// Usage: node tools/pack.mjs [--json]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildModel } from '../src/model.js';
import { pack } from '../src/pack.js';
import { formatReport, formatDiff } from '../src/report.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => JSON.parse(readFileSync(join(root, 'data', f), 'utf8'));

const model = buildModel(read('container.json'), read('items.json'), read('constraints.json'));
if (!model.ok) {
  console.error('Data errors:\n  ' + model.errors.join('\n  '));
  process.exit(1);
}
const plan = pack(model);

const outFile = join(root, 'out', 'plan.json');
const prev = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : null;
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(plan, null, 1));

if (process.argv.includes('--json')) console.log(JSON.stringify(plan, null, 1));
else console.log(formatReport(plan) + formatDiff(prev, plan));
