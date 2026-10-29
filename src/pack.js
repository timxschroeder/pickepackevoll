// Extreme-point packer ("back-bottom-left": fill from the cab wall toward the door, bottom up).
// Pure JS, deterministic for a given seed. Used by the browser and by tools/pack.mjs.
import { CONF } from './model.js';

const EPS = 0.01;
const VOXEL = 5; // cm, resolution of the free-gap search
const CAB_PULL = 0.3; // contact mode: weight of "close to the cab" (tested 0.3–4: no better)
const BAG_LITRES = 70;
const BAG_MIN_GAP_CM = 25;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ov = (a0, a1, b0, b1) => a0 < b1 - EPS && b0 < a1 - EPS;
const boxesOverlap = (a, b) =>
  ov(a.x, a.x + a.dx, b.x, b.x + b.dx) && ov(a.y, a.y + a.dy, b.y, b.y + b.dy) && ov(a.z, a.z + a.dz, b.z, b.z + b.dz);
const footprintOverlap = (a, b) => {
  const w = Math.min(a.x + a.dx, b.x + b.dx) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.dy, b.y + b.dy) - Math.max(a.y, b.y);
  return w > EPS && h > EPS ? w * h : 0;
};
const inRange = (v, lo, len) => v >= lo - EPS && v < lo + len - EPS;

function zoneViolation(zone, b, C) {
  if (!zone) return 0;
  if (zone.end === 'cab') return Math.max(0, b.x + b.dx - zone.withinCm);
  return Math.max(0, C.L - zone.withinCm - b.x);
}

function describeLimits(it) {
  const s = [];
  if (it.floor) s.push('on the floor');
  if (it.upright) s.push('not tipped over');
  if (it.noRotate) s.push('no rotation');
  if (it.zone?.hard) s.push(`within ${it.zone.withinCm} cm of the ${it.zone.end}`);
  return s.length ? ` (must be ${s.join(', ')})` : '';
}

function preCheck(inst, C) {
  const it = inst.item;
  const fits = inst.rots.some((r) => r.d[0] <= C.L + EPS && r.d[1] <= C.W + EPS && r.d[2] <= C.H + EPS);
  if (!fits) {
    return { reason: 'too-large', detail: `${it.dims.join('×')} cm does not fit the ${C.L}×${C.W}×${C.H} interior in any allowed orientation` };
  }
  const [dw, dh] = C.door;
  const throughDoor = inst.rots.some((r) => r.d[1] <= dw + EPS && r.d[2] <= dh + EPS);
  if (!throughDoor) {
    return { reason: 'door', detail: `${it.dims.join('×')} cm does not pass the ${dw}×${dh} door opening` };
  }
  return null;
}

// Hard packing tiers: load group first, then must-have before optional items ("furniture first,
// boxes last"). Reordering during the search never crosses a tier boundary.
const tier = (inst) => (inst.item.loadGroup ?? 50) * 2 + (inst.item.priority === 'must' ? 0 : 1);

function baseKey(inst, noTopLate) {
  const it = inst.item;
  return [
    tier(inst),
    it.zone?.end === 'cab' ? 0 : it.zone?.end === 'door' ? 2 : 1,
    it.floor ? 0 : 1,
    // nothing can go on top: placing it late lets it end up on top of stacks or at the door
    noTopLate && it.maxTop === 0 ? 1 : 0,
  ];
}

function makeOrder(insts, rand, noise, noTopLate) {
  const keyed = insts.map((inst) => ({
    inst,
    k: baseKey(inst, noTopLate),
    v: inst.vol * (1 + inst.item.kg / 200) * (1 + noise * (rand() - 0.5)),
  }));
  keyed.sort((a, b) => {
    for (let i = 0; i < a.k.length; i++) if (a.k[i] !== b.k[i]) return a.k[i] - b.k[i];
    return b.v - a.v;
  });
  return keyed.map((e) => e.inst);
}

const POLICIES = {
  wall: (a, b) => a.dx - b.dx || a.dz - b.dz,
  tall: (a, b) => a.dx - b.dx || b.dz - a.dz,
  flat: (a, b) => a.dz - b.dz || a.dx - b.dx,
};

// Weight travels down the stack: each piece passes its share on to whatever it rests on, so
// maxTop limits the total weight above an item, not just the piece directly on it.
// `extra` collects the added load per item (also used to apply it after placing).
function loadFits(down, kg, extra) {
  for (const [o, f] of down) {
    const w = kg * f;
    const total = (extra.get(o) ?? 0) + w;
    if (o.load + total > o.maxTop + EPS) return false;
    extra.set(o, total);
    if (o.down && !loadFits(o.down, w, extra)) return false;
  }
  return true;
}

const lexLess = (a, b) => {
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 1e-9) return a[i] < b[i];
  return false;
};

// opt.stress scales every piece (size-margin test), opt.pref maps an instance to its preferred rotation index.
function packOnce(order, C, policyName, runMode, opt = {}) {
  const policy = POLICIES[policyName];
  const stress = opt.stress ?? 1;
  const pref = opt.pref;
  const right = opt.right; // pieces pushed against the right wall
  const modeOf = opt.modeOf; // per-piece placement rule, overrides runMode
  const boxes = C.obstacles.map((o) => ({ ...o, obstacle: true, maxTop: Infinity, load: 0 }));
  const placed = [];
  const unplaced = [];
  let eps = [{ x: 0, y: 0, z: 0 }];

  const projX = (x, y, z) => {
    let m = 0;
    for (const o of boxes) if (o.x + o.dx <= x + EPS && inRange(y, o.y, o.dy) && inRange(z, o.z, o.dz)) m = Math.max(m, o.x + o.dx);
    return m;
  };
  const projY = (x, y, z) => {
    let m = 0;
    for (const o of boxes) if (o.y + o.dy <= y + EPS && inRange(x, o.x, o.dx) && inRange(z, o.z, o.dz)) m = Math.max(m, o.y + o.dy);
    return m;
  };
  const projZ = (x, y, z) => {
    let m = 0;
    for (const o of boxes) if (o.z + o.dz <= z + EPS && inRange(x, o.x, o.dx) && inRange(y, o.y, o.dy)) m = Math.max(m, o.z + o.dz);
    return m;
  };
  const addPoints = (b) => {
    const X = b.x + b.dx, Y = b.y + b.dy, Z = b.z + b.dz;
    eps.push(
      { x: X, y: b.y, z: b.z }, { x: b.x, y: Y, z: b.z }, { x: b.x, y: b.y, z: Z },
      { x: X, y: projY(X, b.y, b.z), z: b.z }, { x: X, y: b.y, z: projZ(X, b.y, b.z) },
      { x: projX(b.x, Y, b.z), y: Y, z: b.z }, { x: b.x, y: Y, z: projZ(b.x, Y, b.z) },
      { x: projX(b.x, b.y, Z), y: b.y, z: Z }, { x: b.x, y: projY(b.x, b.y, Z), z: Z },
    );
    // Projections only see boxes that exist when a point is created, so add the spots right
    // beside each obstacle (wheel arches) explicitly.
    for (const o of C.obstacles) {
      if (o === b) continue;
      eps.push({ x: X, y: o.y + o.dy, z: b.z }, { x: X, y: o.y + o.dy, z: projZ(X, o.y + o.dy, b.z) });
      eps.push({ x: o.x + o.dx, y: Y, z: b.z }, { x: b.x, y: o.y + o.dy, z: Z });
    }
    const seen = new Set();
    eps = eps.filter((p) => {
      if (p.x >= C.L - EPS || p.y >= C.W - EPS || p.z >= C.H - EPS) return false;
      const k = `${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return !boxes.some((o) => inRange(p.x, o.x, o.dx) && inRange(p.y, o.y, o.dy) && inRange(p.z, o.z, o.dz));
    });
    eps.sort((a, b) => a.x - b.x || a.z - b.z || a.y - b.y);
  };
  for (const o of C.obstacles) addPoints(o);

  // Share of the box's surface that touches walls, floor, ceiling or other boxes (not the door side)
  const contactFraction = (b) => {
    let a = 0;
    if (b.z < EPS) a += b.dx * b.dy;
    if (b.z + b.dz > C.H - EPS) a += b.dx * b.dy;
    if (b.x < EPS) a += b.dy * b.dz;
    if (b.y < EPS) a += b.dx * b.dz;
    if (b.y + b.dy > C.W - EPS) a += b.dx * b.dz;
    for (const o of boxes) {
      const ox = Math.min(b.x + b.dx, o.x + o.dx) - Math.max(b.x, o.x);
      const oy = Math.min(b.y + b.dy, o.y + o.dy) - Math.max(b.y, o.y);
      const oz = Math.min(b.z + b.dz, o.z + o.dz) - Math.max(b.z, o.z);
      if (oy > EPS && oz > EPS && (Math.abs(b.x + b.dx - o.x) < EPS || Math.abs(o.x + o.dx - b.x) < EPS)) a += oy * oz;
      if (ox > EPS && oz > EPS && (Math.abs(b.y + b.dy - o.y) < EPS || Math.abs(o.y + o.dy - b.y) < EPS)) a += ox * oz;
      if (ox > EPS && oy > EPS && (Math.abs(b.z + b.dz - o.z) < EPS || Math.abs(o.z + o.dz - b.z) < EPS)) a += ox * oy;
    }
    return a / (2 * (b.dx * b.dy + b.dx * b.dz + b.dy * b.dz));
  };

  const tryAt = (inst, p, r) => {
    const it = inst.item;
    const b = { x: p.x, y: p.y, z: p.z, dx: r.d[0] * stress, dy: r.d[1] * stress, dz: r.d[2] * stress };
    if (b.x + b.dx > C.L + EPS || b.y + b.dy > C.W + EPS || b.z + b.dz > C.H + EPS) return null;
    if (it.floor && b.z > EPS) return null;
    if (it.maxHeight != null && b.z + b.dz > it.maxHeight + EPS) return null;
    if (it.roofGapCm != null && b.z + b.dz > C.H - it.roofGapCm + EPS) return null;
    if (it.zone?.hard && zoneViolation(it.zone, b, C) > EPS) return null;
    for (const o of boxes) if (boxesOverlap(b, o)) return null;
    const supporters = [];
    if (b.z > EPS) {
      let sup = 0;
      for (const o of boxes) {
        if (Math.abs(o.z + o.dz - b.z) > EPS) continue;
        const a = footprintOverlap(b, o);
        if (a > 0) { supporters.push([o, a]); sup += a; }
      }
      if (sup < (it.minSupport ?? C.packing.minSupport) * b.dx * b.dy) return null;
      if (supporters.some(([o]) => o.maxTop <= 0)) return null;
      const down = supporters.map(([o, a]) => [o, a / sup]);
      if (!loadFits(down, it.kg, new Map())) return null;
      return { b, rot: r.rot, supporters, down };
    }
    return { b, rot: r.rot, supporters, down: [] };
  };

  // Slide a feasible placement along +y until it touches the right wall or a neighbour
  const pushRight = (inst, c) => {
    const b = c.b;
    let lim = C.W;
    for (const o of boxes) {
      if (o.y >= b.y + b.dy - EPS && ov(b.x, b.x + b.dx, o.x, o.x + o.dx) && ov(b.z, b.z + b.dz, o.z, o.z + o.dz)) lim = Math.min(lim, o.y);
    }
    const y = lim - b.dy;
    if (y <= b.y + EPS) return c;
    const r = inst.rots.find((q) => q.rot === c.rot);
    return tryAt(inst, { x: b.x, y, z: b.z }, r) || c;
  };

  for (const inst of order) {
    const it = inst.item;
    const capped = it.maxTop <= 5;
    // Optional items (boxes) fill up from the cab, on top of whatever is there, so free space collects at the door
    const mode = it.priority === 'nice' ? 'x' : (modeOf?.get(inst) ?? runMode);
    const toRight = right?.has(inst);
    let best = null, bestKey = null;
    for (const p of eps) {
      if (mode === 'contact') {
        // Best-fit: the spot touching the most walls/floor/neighbours wins, with a mild pull toward the cab
        for (const r of inst.rots) {
          const c0 = tryAt(inst, p, r);
          if (!c0) continue;
          for (const c of toRight ? [pushRight(inst, c0)] : [c0]) {
            const pen = it.zone ? (zoneViolation(it.zone, c.b, C) * 5) / C.L : 0;
            const waste = capped ? (0.3 * (C.H - c.b.z - c.b.dz)) / C.H : 0;
            const liked = pref?.get(inst) === inst.rots.indexOf(r) ? 0.5 : 0;
            const key = [-contactFraction(c.b) - liked + (CAB_PULL * (c.b.x + c.b.dx)) / C.L + waste + pen, c.b.z, c.b.x];
            if (!best || lexLess(key, bestKey)) { best = c; bestKey = key; }
          }
        }
        continue;
      }
      if (best && p.x > bestKey[0] + EPS) break; // EPs are sorted by x: nothing better further on
      const cands = [];
      for (const r of inst.rots) {
        const c = tryAt(inst, p, r);
        if (c) cands.push(c);
      }
      if (!cands.length) continue;
      cands.sort((a, b) => policy(a.b, b.b));
      const wanted = pref?.get(inst);
      let c = (wanted >= 0 && cands.find((q) => q.rot === inst.rots[wanted].rot)) || cands[0];
      if (toRight) c = pushRight(inst, c);
      const pen = it.zone ? zoneViolation(it.zone, c.b, C) * 5 : 0;
      // Nothing (heavy) can go on top: the space above it is lost, so count that height like distance
      const waste = capped ? C.H - c.b.z - c.b.dz : 0;
      const key = [(mode === 'end' ? c.b.x + c.b.dx : c.b.x) + pen + waste, c.b.z, c.b.y];
      if (!best || lexLess(key, bestKey)) { best = c; bestKey = key; }
      if (!it.zone && !capped && mode === 'x') break; // first feasible EP in (x, z, y) order is the best one
    }
    if (!best) {
      unplaced.push({ inst, reason: 'no-space', detail: `no free spot${describeLimits(it)}` });
      continue;
    }
    const pl = { ...best.b, inst, rot: best.rot, load: 0, maxTop: it.maxTop, down: best.down, supporters: [] };
    const added = new Map();
    loadFits(best.down, it.kg, added);
    for (const [o, w] of added) o.load += w;
    for (const [o] of best.supporters) if (!o.obstacle) pl.supporters.push(o);
    boxes.push(pl);
    placed.push(pl);
    addPoints(pl);
  }
  return { placed, unplaced };
}

function scorePlan(run, C) {
  let must = 0, vol = 0, pen = 0, len = 0, mz = 0, kg = 0;
  for (const p of run.placed) {
    const it = p.inst.item;
    vol += p.inst.vol;
    if (it.priority === 'must') must += p.inst.vol;
    if (it.zone && !it.zone.hard) pen += zoneViolation(it.zone, p, C);
    len = Math.max(len, p.x + p.dx);
    mz += it.kg * (p.z + p.dz / 2);
    kg += it.kg;
  }
  return [must, vol, -pen, -len, kg ? -mz / kg : 0];
}

const better = (a, b) => {
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > 1e-6) return a[i] > b[i];
  }
  return false;
};

// Loading order: cab end first, bottom up, but never before the items it rests on.
function loadOrder(placed) {
  const done = new Set(), out = [];
  while (out.length < placed.length) {
    let next = null;
    for (const p of placed) {
      if (done.has(p) || !p.supporters.every((s) => done.has(s))) continue;
      if (!next || p.x < next.x - EPS || (Math.abs(p.x - next.x) <= EPS && (p.z < next.z - EPS || (Math.abs(p.z - next.z) <= EPS && p.y < next.y)))) next = p;
    }
    done.add(next);
    out.push(next);
  }
  return out;
}

// Free space as a set of boxes (greedy merge of empty voxels), largest first.
export function findGaps(C, solids) {
  const nx = Math.ceil(C.L / VOXEL), ny = Math.ceil(C.W / VOXEL), nz = Math.ceil(C.H / VOXEL);
  const occ = new Uint8Array(nx * ny * nz);
  const idx = (i, j, k) => (k * ny + j) * nx + i;
  for (const b of solids) {
    const i0 = Math.max(0, Math.floor(b.x / VOXEL)), i1 = Math.min(nx, Math.ceil((b.x + b.dx) / VOXEL));
    const j0 = Math.max(0, Math.floor(b.y / VOXEL)), j1 = Math.min(ny, Math.ceil((b.y + b.dy) / VOXEL));
    const k0 = Math.max(0, Math.floor(b.z / VOXEL)), k1 = Math.min(nz, Math.ceil((b.z + b.dz) / VOXEL));
    for (let k = k0; k < k1; k++) for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
      const cx = (i + 0.5) * VOXEL, cy = (j + 0.5) * VOXEL, cz = (k + 0.5) * VOXEL;
      if (cx > b.x && cx < b.x + b.dx && cy > b.y && cy < b.y + b.dy && cz > b.z && cz < b.z + b.dz) occ[idx(i, j, k)] = 1;
    }
  }
  const free = (i, j, k) => !occ[idx(i, j, k)];
  const gaps = [];
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (!free(i, j, k)) continue;
    let i2 = i; while (i2 + 1 < nx && free(i2 + 1, j, k)) i2++;
    let j2 = j;
    grow: while (j2 + 1 < ny) { for (let a = i; a <= i2; a++) if (!free(a, j2 + 1, k)) break grow; j2++; }
    let k2 = k;
    growZ: while (k2 + 1 < nz) {
      for (let b = j; b <= j2; b++) for (let a = i; a <= i2; a++) if (!free(a, b, k2 + 1)) break growZ;
      k2++;
    }
    for (let c = k; c <= k2; c++) for (let b = j; b <= j2; b++) for (let a = i; a <= i2; a++) occ[idx(a, b, c)] = 2;
    const x = i * VOXEL, y = j * VOXEL, z = k * VOXEL;
    const g = { x, y, z, dx: Math.min(C.L, (i2 + 1) * VOXEL) - x, dy: Math.min(C.W, (j2 + 1) * VOXEL) - y, dz: Math.min(C.H, (k2 + 1) * VOXEL) - z };
    if (Math.min(g.dx, g.dy, g.dz) >= C.packing.minGapCm) gaps.push(g);
  }
  for (const g of gaps) g.vol = g.dx * g.dy * g.dz;
  return gaps.sort((a, b) => b.vol - a.vol);
}

const pub = (inst) => ({ uid: inst.uid, id: inst.item.id, name: inst.item.name, group: inst.item.group, kg: inst.item.kg, conf: inst.item.conf, dims: inst.item.dims });

export function pack(model, opts = {}) {
  const t0 = Date.now();
  const C = model.container;
  const rigid = [], flex = [], preUnplaced = [];
  for (const inst of model.instances) {
    if (inst.item.flex) { flex.push(inst); continue; }
    const bad = preCheck(inst, C);
    if (bad) preUnplaced.push({ inst, ...bad });
    else rigid.push(inst);
  }

  const rand = mulberry32(C.packing.seed);
  const policies = Object.keys(POLICIES), modes = ['x', 'end', 'contact'];
  const totalVol = rigid.reduce((a, i) => a + i.vol, 0);
  const mustVol = rigid.reduce((a, i) => a + (i.item.priority === 'must' ? i.vol : 0), 0);
  const budget = opts.evals ?? C.packing.evals;
  const startedAt = Date.now();

  // Flexible goods go into the free gaps, largest first, at 85% fill efficiency.
  const placeFlex = (solids) => {
    const gaps = findGaps(C, [...C.obstacles, ...solids]).map((g) => ({ ...g, left: g.vol * 0.85, flex: [] }));
    const out = [], noGap = [];
    for (const inst of [...flex].sort((a, b) => b.vol - a.vol)) {
      let g = gaps.find((g) => g.left >= inst.vol);
      if (g) { g.left -= inst.vol; g.flex.push(inst.uid); }
      else {
        // soft goods can be folded and split over several gaps (largest first)
        let need = inst.vol;
        const parts = [];
        for (const h of gaps) {
          if (need <= 1e-6) break;
          const take = Math.min(h.left, need);
          if (take > 0) { parts.push([h, take]); need -= take; }
        }
        if (need <= 1e-6 && parts.length) {
          for (const [h, t] of parts) { h.left -= t; h.flex.push(inst.uid); }
          g = parts[0][0];
        } else noGap.push(inst);
      }
      out.push({ ...pub(inst), vol: inst.vol, gap: g ? gaps.indexOf(g) : null });
    }
    return { gaps, out, noGap };
  };

  // Score of one packing run (lower is better): all pieces placed comes first (must-haves weigh most);
  // the load length only breaks ties. Once every rigid piece is placed the flexible goods have to find a gap too.
  const evaluate = (order, policy, mode, opt) => {
    const run = packOnce(order, C, policy, mode, opt);
    let vol = 0, must = 0, len = 0, pen = 0;
    for (const p of run.placed) {
      vol += p.inst.vol;
      if (p.inst.item.priority === 'must') must += p.inst.vol;
      len = Math.max(len, p.x + p.dx);
      if (p.inst.item.zone && !p.inst.item.zone.hard) pen += zoneViolation(p.inst.item.zone, p, C);
    }
    let missing = (totalVol - vol) / 1000;
    let cost = (200 * (mustVol - must)) / 1000 + 8 * missing + 2 * pen + 0.01 * len;
    let perfect = run.unplaced.length === 0;
    if (perfect && flex.length) {
      const f = placeFlex(run.placed).noGap.reduce((a, i) => a + i.vol, 0) / 1000;
      cost += 8 * f;
      perfect = f === 0;
    }
    return { run, cost, perfect };
  };

  // Phase 1: diverse starts (strategies × orderings)
  let best = null;
  const starts = Math.max(6, Math.round(C.packing.iterations * 0.4));
  for (let r = 0; r < starts; r++) {
    const noTopLate = r % 4 < 2;
    const policy = policies[r % policies.length], mode = modes[r % modes.length];
    const order = makeOrder(rigid, rand, r < 6 ? 0 : 0.8, noTopLate);
    const ev = evaluate(order, policy, mode, {});
    if (!best || ev.cost < best.cost) best = { ...ev, order, policy, mode, label: `${policy}/${mode}${noTopLate ? '' : '/noTop-early'}` };
  }

  // Phase 2: biased random-key genetic algorithm (Gonçalves & Resende): a chromosome holds one key per piece
  // (loading order inside its tier), one preferred rotation per piece and the placement strategy. The fitness
  // is "everything placed"; once a plan places everything, every piece is made 0.5% larger in each dimension and
  // the search goes on. The last size at which everything still fitted is the size margin of the plan.
  let marginPct = 0, evals = 0, champion = null;
  let lo = -1, target = 0, stepNow = 0, stale = 0; // verified margin, margin being tried, adaptive step, generations without success
  const N = rigid.length;
  const ga = { pop: 30, elite: 6, mutants: 5, cp: 0.7, step: 0.0025, stepMax: 0.02, stale: 3, ...opts.ga }; // tuned on 4 seeds: larger or smaller populations were worse
  const POP = ga.pop, ELITE = ga.elite, MUTANTS = ga.mutants, CP = ga.cp, STEP = ga.step;
  const rank = new Map(best.order.map((o, i) => [o, i / N]));
  const decode = (ind) => {
    const idx = rigid.map((_, k) => k).sort((a, b) => tier(rigid[a]) - tier(rigid[b]) || ind.key[a] - ind.key[b]);
    const pref = new Map();
    rigid.forEach((inst, k) => { if (ind.rot[k] >= 0) pref.set(inst, Math.min(inst.rots.length - 1, Math.floor(ind.rot[k] * inst.rots.length))); });
    const right = new Set(), modeOf = new Map();
    rigid.forEach((inst, k) => {
      if (ind.side[k] > 0.5) right.add(inst);
      if (ind.md[k] >= 0) modeOf.set(inst, modes[Math.min(modes.length - 1, Math.floor(ind.md[k] * modes.length))]);
    });
    return { order: idx.map((k) => rigid[k]), pref, right, modeOf, policy: policies[Math.floor(ind.g[0] * policies.length)], mode: modes[Math.floor(ind.g[1] * modes.length)] };
  };
  const score = (ind, stress) => {
    const d = decode(ind);
    evals++;
    return { ind, d, ...evaluate(d.order, d.policy, d.mode, { stress, pref: d.pref, right: d.right, modeOf: d.modeOf }) };
  };
  const fresh = (sigma) => ({
    key: rigid.map((i) => rank.get(i) + sigma * (rand() - 0.5)),
    rot: rigid.map(() => (rand() < 0.5 ? -1 : rand())),
    side: rigid.map(() => (rand() < 0.3 ? 1 : 0)),
    md: rigid.map(() => (rand() < 0.6 ? -1 : rand())),
    g: [rand(), rand()],
  });
  if (budget > 0 && N > 1) {
    const seed = { key: rigid.map((i) => rank.get(i)), rot: rigid.map(() => -1), side: rigid.map(() => 0), md: rigid.map(() => -1), g: [policies.indexOf(best.policy) / policies.length + 0.01, modes.indexOf(best.mode) / modes.length + 0.01] };
    let pop = [seed];
    while (pop.length < POP) pop.push(fresh(rand() < 0.5 ? 0.15 : 0.6));
    let scored = pop.map((ind) => score(ind, 1));
    // An individual that placed everything at the size being tried (1 + target) and also at real size becomes
    // the champion. The step doubles after every success (up to 2%) and is halved when a size resists.
    const bump = () => {
      let progressed = false;
      for (;;) {
        scored.sort((a, b) => a.cost - b.cost);
        const top = scored.find((e) => e.perfect);
        if (!top) return progressed;
        const real = target === 0 ? top : score(top.ind, 1);
        if (!real.perfect) { top.perfect = false; top.cost += 1e3; continue; }
        champion = real; lo = target; progressed = true;
        marginPct = Math.round(lo * 10000) / 100;
        if (lo >= 0.25) return progressed;
        stepNow = Math.min(Math.max(stepNow * 2, STEP), ga.stepMax);
        target = lo + stepNow;
        scored = scored.map((e) => score(e.ind, 1 + target));
        if (evals >= budget) return progressed;
      }
    };
    bump();
    while (evals < budget && Date.now() - startedAt < C.packing.maxMs) {
      scored.sort((a, b) => a.cost - b.cost);
      const kids = [];
      for (let m = 0; m < MUTANTS; m++) kids.push(fresh(0.6));
      while (ELITE + kids.length < POP) {
        const e = scored[Math.floor(rand() * ELITE)].ind, o = scored[Math.floor(rand() * scored.length)].ind;
        const mix = (u, v) => u.map((x, k) => (rand() < CP ? x : v[k]));
        kids.push({ key: mix(e.key, o.key), rot: mix(e.rot, o.rot), side: mix(e.side, o.side), md: mix(e.md, o.md), g: mix(e.g, o.g) });
      }
      scored = [...scored.slice(0, ELITE), ...kids.map((ind) => score(ind, 1 + target))];
      if (bump()) stale = 0;
      else if (lo >= 0 && ++stale >= ga.stale && target - lo > STEP + 1e-9) {
        stepNow = Math.max(STEP, (target - lo) / 2);
        target = lo + stepNow;
        stale = 0;
        scored = scored.map((e) => score(e.ind, 1 + target));
      }
    }
    // final plan: the champion (all placed at the largest size), else the best individual at real size
    const fin = champion ?? score(scored.sort((a, b) => a.cost - b.cost)[0].ind, 1);
    if (fin.cost < best.cost || fin.perfect) best = { ...fin.run, ...fin, order: fin.d.order, policy: fin.d.policy, mode: fin.d.mode, label: 'genetic' };
  }
  const unplaced = [...preUnplaced];
  best.policy = best.label ?? best.policy;
  const ordered = loadOrder(best.run ? best.run.placed : best.placed);
  best.placed = best.run ? best.run.placed : best.placed;
  best.unplaced = best.run ? best.run.unplaced : best.unplaced;

  const placements = ordered.map((p, i) => ({
    ...pub(p.inst), x: p.x, y: p.y, z: p.z, dx: p.dx, dy: p.dy, dz: p.dz, rot: p.rot, step: i + 1,
    load: Math.round(p.load),
  }));

  const { gaps, out: flexOut, noGap } = placeFlex(best.placed);
  for (const inst of noGap) unplaced.push({ inst, reason: 'no-gap', detail: 'no free gap large enough for this flexible item' });

  const allUnplaced = [...unplaced, ...best.unplaced].map((u) => ({ ...pub(u.inst), reason: u.reason, detail: u.detail }));

  // Stats
  const obstacleVol = C.obstacles.reduce((s, o) => s + o.dx * o.dy * o.dz, 0);
  const usable = C.L * C.W * C.H - obstacleVol;
  const placedVol = best.placed.reduce((s, p) => s + p.inst.vol, 0);
  const flexPlacedVol = flexOut.filter((f) => f.gap != null).reduce((s, f) => s + f.vol, 0);
  const flexVol = flexOut.reduce((s, f) => s + f.vol, 0);
  const allVol = model.instances.reduce((s, i) => s + i.vol, 0);
  const placedKg = best.placed.reduce((s, p) => s + p.inst.item.kg, 0) + flexOut.filter((f) => f.gap != null).reduce((s, f) => s + f.kg, 0);
  const allKg = model.instances.reduce((s, i) => s + i.item.kg, 0);
  let cx = 0, cy = 0, cz = 0, ck = 0;
  for (const p of best.placed) {
    const k = p.inst.item.kg;
    cx += k * (p.x + p.dx / 2); cy += k * (p.y + p.dy / 2); cz += k * (p.z + p.dz / 2); ck += k;
  }
  const usedLen = best.placed.reduce((m, p) => Math.max(m, p.x + p.dx), 0);
  const gapVol = gaps.reduce((s, g) => s + g.vol, 0);
  // Soft bags (70 l, e.g. IKEA Frakta) need gaps of at least ~25 cm; fill at 85%, after flexible items
  const bagSpace = gaps.filter((g) => Math.min(g.dx, g.dy, g.dz) >= BAG_MIN_GAP_CM).reduce((s, g) => s + g.left, 0);
  const m3 = (v) => Math.round(v / 1e4) / 100;

  const stats = {
    pieces: model.instances.length,
    placed: placements.length + flexOut.filter((f) => f.gap != null).length,
    unplaced: allUnplaced.length,
    usableM3: m3(usable),
    placedM3: m3(placedVol + flexPlacedVol),
    allM3: m3(allVol),
    volumePct: Math.round(((placedVol + flexPlacedVol) / usable) * 1000) / 10,
    rigidPct: Math.round((placedVol / usable) * 1000) / 10,
    flexM3: m3(flexVol),
    gapM3: m3(gapVol),
    bags: Math.floor(bagSpace / (BAG_LITRES * 1000)),
    bagLitres: BAG_LITRES,
    loadedKg: Math.round(placedKg),
    allKg: Math.round(allKg),
    payloadKg: C.payloadKg,
    freeLengthCm: Math.round(C.L - usedLen),
    marginPct,
    cog: ck ? [Math.round(cx / ck), Math.round(cy / ck), Math.round(cz / ck)] : null,
  };

  const violations = [];
  for (const p of best.placed) {
    const z = p.inst.item.zone;
    const v = z && !z.hard ? zoneViolation(z, p, C) : 0;
    if (v > 1) violations.push({ constraint: z.cid, uid: p.inst.uid, detail: `${Math.round(v)} cm outside the ${z.end} zone (${z.withinCm} cm)` });
  }

  const uncertain = model.items
    .filter((it) => !it.exclude && CONF[it.conf] > 0)
    .map((it) => ({ id: it.id, name: it.name, conf: it.conf, qty: it.qty, m3: m3(it.dims[0] * it.dims[1] * it.dims[2] * it.qty * CONF[it.conf]) }))
    .sort((a, b) => b.m3 - a.m3)
    .slice(0, 5);

  const warnings = [...model.warnings];
  if (C.conf !== 'measured') warnings.push(`Van dimensions are an estimate (${C.conf} confidence): replace with the rental spec`);
  if (placedKg > C.payloadKg) warnings.push(`Loaded weight ${Math.round(placedKg)} kg exceeds payload ${C.payloadKg} kg by ${Math.round(placedKg - C.payloadKg)} kg`);
  else if (allKg > C.payloadKg) warnings.push(`Everything together (${Math.round(allKg)} kg) would exceed payload ${C.payloadKg} kg`);

  return {
    container: { id: C.id, ratedPayloadKg: C.ratedPayloadKg, passengerKg: C.passengerKg, subtractPassenger: C.subtractPassenger, name: C.name, conf: C.conf, L: C.L, W: C.W, H: C.H, door: C.door, obstacles: C.obstacles, payloadKg: C.payloadKg },
    placements,
    unplaced: allUnplaced,
    flex: flexOut,
    gaps: gaps.map(({ left, ...g }) => g),
    stats,
    violations,
    uncertain,
    warnings,
    meta: { runs: starts, evals, policy: best.policy, seed: C.packing.seed, ms: Date.now() - t0 },
  };
}
