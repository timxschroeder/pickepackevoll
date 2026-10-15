#!/usr/bin/env node
// Packs data/*.json, prints a report and the diff to the previous run, writes out/plan.json.
// Usage: node tools/pack.mjs [--json] [--van <id>] [--compare]
//   --van <id>   pack that van instead of the active one in data/container.json
//   --compare    also pack every van and print a one-line-per-van comparison
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildModel, vanList } from '../src/model.js';
import { pack } from '../src/pack.js';
import { formatReport, formatDiff, formatComparison } from '../src/report.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => JSON.parse(readFileSync(join(root, 'data', f), 'utf8'));

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const data = ['container.json', 'items.json', 'constraints.json'].map(read);
const model = buildModel(...data, arg('--van'));
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

if (process.argv.includes('--compare')) {
  const plans = vanList(data[0]).map((v) => (v.id === model.container.id ? plan : pack(buildModel(...data, v.id))));
  console.log('\n' + formatComparison(plans, model.container.id));
}
