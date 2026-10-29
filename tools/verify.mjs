#!/usr/bin/env node
// Independent check of packing plans: does NOT use the packer's own geometry code.
// Packs the data (one plan per seed) and re-derives overlap, bounds, support, load limits, flags and weights.
// Usage: node tools/verify.mjs [--seeds 1,2,3] [--van <id>] [--evals <n>]
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildModel } from '../src/model.js';
import { pack } from '../src/pack.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => JSON.parse(readFileSync(join(root, 'data', f), 'utf8'));
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const seeds = (arg('--seeds') ?? '1,2,3').split(',').map(Number);
const T = 0.05; // cm tolerance

const overlap1 = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);

export function verifyPlan(plan, model) {
  const C = plan.container, P = plan.placements, bad = [];
  const item = new Map(model.items.map((it) => [it.id, it]));
  const inst = new Map(model.instances.map((i) => [i.uid, i]));
  const fail = (uid, msg) => bad.push(`${uid}: ${msg}`);
  const boxes = P.map((p) => ({ ...p, x1: p.x + p.dx, y1: p.y + p.dy, z1: p.z + p.dz }));
  const obst = (C.obstacles ?? []).map((o) => ({ name: o.name, x: o.x, y: o.y, z: o.z, x1: o.x + o.dx, y1: o.y + o.dy, z1: o.z + o.dz }));

  for (const b of boxes) {
    const it = item.get(b.id), pd = inst.get(b.uid)?.pdims;
    if (!it || !pd) { fail(b.uid, 'unknown piece'); continue; }
    if (b.x < -T || b.y < -T || b.z < -T || b.x1 > C.L + T || b.y1 > C.W + T || b.z1 > C.H + T) fail(b.uid, 'outside the van');
    // size must be a permutation of the packing dims
    const got = [b.dx, b.dy, b.dz].map((v) => Math.round(v * 10) / 10).sort((p, q) => p - q).join();
    const want = [...pd].map((v) => Math.round(v * 10) / 10).sort((p, q) => p - q).join();
    if (got !== want) fail(b.uid, `size ${got} is not a rotation of ${want}`);
    // flags: which axis is vertical (pdims order = l, w, h)
    const vertical = [0, 1, 2].filter((k) => Math.abs([b.dx, b.dy, b.dz][2] - pd[k]) < 0.11);
    if (it.upright && !vertical.includes(2)) fail(b.uid, 'upright piece is tipped over');
    if (it.noRotate && !(Math.abs(b.dx - pd[0]) < 0.11 && Math.abs(b.dy - pd[1]) < 0.11 && Math.abs(b.dz - pd[2]) < 0.11)) fail(b.uid, 'noRotate piece is rotated');
    if (it.floor && b.z > T) fail(b.uid, `must be on the floor, is at z=${b.z}`);
    if (it.maxHeight != null && b.z1 > it.maxHeight + T) fail(b.uid, `top edge ${b.z1} above maxHeight ${it.maxHeight}`);
    if (it.roofGapCm != null && b.z1 > C.H - it.roofGapCm + T) fail(b.uid, `top edge ${b.z1} leaves less than ${it.roofGapCm} cm under the roof`);
    for (const o of obst) if (overlap1(b.x, b.x1, o.x, o.x1) > T && overlap1(b.y, b.y1, o.y, o.y1) > T && overlap1(b.z, b.z1, o.z, o.z1) > T) fail(b.uid, `inside ${o.name}`);
  }
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (overlap1(a.x, a.x1, b.x, b.x1) > T && overlap1(a.y, a.y1, b.y, b.y1) > T && overlap1(a.z, a.z1, b.z, b.z1) > T) fail(a.uid, `overlaps ${b.uid}`);
  }

  // support: the share of the base resting on the floor / other pieces / wheel arches
  const supportOf = new Map();
  for (const b of boxes) {
    const it = item.get(b.id);
    if (!it) continue;
    const base = b.dx * b.dy;
    if (b.z < T) { supportOf.set(b.uid, []); continue; }
    const sup = [];
    for (const o of [...boxes.filter((o) => o !== b), ...obst.map((o) => ({ ...o, uid: null }))]) {
      if (Math.abs(o.z1 - b.z) > T) continue;
      const w = overlap1(b.x, b.x1, o.x, o.x1), h = overlap1(b.y, b.y1, o.y, o.y1);
      if (w > T && h > T) sup.push({ o, a: w * h });
    }
    const total = sup.reduce((s, e) => s + e.a, 0);
    const need = (it.minSupport ?? model.container.packing.minSupport) * base;
    if (total + 1 < need) fail(b.uid, `only ${Math.round((total / base) * 100)}% of the base is supported`);
    supportOf.set(b.uid, sup.filter((e) => e.o.uid).map((e) => ({ uid: e.o.uid, share: e.a / total })));
    for (const e of sup) if (e.o.uid && (item.get(e.o.id)?.maxTop ?? Infinity) <= 0) fail(b.uid, `rests on ${e.o.uid}, which carries nothing`);
  }
  // load: every piece passes its weight down to what it rests on, in proportion to the contact area
  const load = new Map(boxes.map((b) => [b.uid, 0]));
  const pass = (uid, kg) => { for (const s of supportOf.get(uid) ?? []) { load.set(s.uid, load.get(s.uid) + kg * s.share); pass(s.uid, kg * s.share); } };
  for (const b of boxes) pass(b.uid, item.get(b.id)?.kg ?? 0);
  for (const b of boxes) {
    const it = item.get(b.id);
    if (it && load.get(b.uid) > it.maxTop + 0.5) fail(b.uid, `carries ${load.get(b.uid).toFixed(1)} kg, limit ${it.maxTop} kg`);
  }
  // weights and door
  const kg = boxes.reduce((s, b) => s + (item.get(b.id)?.kg ?? 0), 0) + (plan.flex ?? []).filter((f) => f.gap != null).reduce((s, f) => s + f.kg, 0);
  if (kg > C.payloadKg + 0.5 && !(plan.warnings ?? []).some((w) => /exceed/.test(w))) bad.push(`total ${Math.round(kg)} kg is over the payload ${C.payloadKg} kg and the plan does not warn about it`);
  const placed = new Set([...P.map((p) => p.uid), ...(plan.flex ?? []).filter((f) => f.gap != null).map((f) => f.uid)]);
  const missing = model.instances.filter((i) => !placed.has(i.uid)).map((i) => i.uid);
  const reported = new Set(plan.unplaced.map((u) => u.uid));
  for (const u of missing) if (!reported.has(u)) bad.push(`${u}: neither placed nor reported as unplaced`);
  return { bad, placed: placed.size, pieces: model.instances.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let failed = 0;
  for (const seed of seeds) {
    const [c, i, k] = ['container.json', 'items.json', 'constraints.json'].map(read);
    c.packing = { ...c.packing, seed };
    if (arg('--evals')) c.packing.evals = +arg('--evals');
    const m = buildModel(c, i, k, arg('--van'));
    if (!m.ok) { console.error(m.errors.join('\n')); process.exit(1); }
    const plan = pack(m);
    const r = verifyPlan(plan, m);
    console.log(`seed ${seed}: ${r.placed}/${r.pieces} placed, margin ${plan.stats.marginPct}%, ${plan.meta.ms} ms → ${r.bad.length ? 'INVALID' : 'valid'}`);
    for (const b of r.bad.slice(0, 12)) console.log(`   ✗ ${b}`);
    failed += r.bad.length;
  }
  process.exit(failed ? 1 : 0);
}
