// Turns the three data files into packer input. Pure JS, no DOM: used by the browser and the CLI.
// Axes: x = length (0 = cab wall, L = rear door), y = width (0 = left wall), z = height.

export const FLAGS = ['upright', 'noRotate', 'floor', 'noTop', 'fragile', 'flex', 'nice', 'exclude'];
export const CONF = { low: 0.2, med: 0.1, high: 0.03, measured: 0 }; // relative size uncertainty
export const RULES = ['onFloor', 'upright', 'noRotate', 'noLoadOnTop', 'maxLoadOnTop', 'zone', 'loadGroup', 'exclude', 'flex'];
const FRAGILE_MAX_TOP_KG = 5;

const PACKING_DEFAULTS = {
  clearanceCm: 1,
  minSupport: 0.75,
  estimateMarginPct: { low: 5, med: 3, high: 0, measured: 0 },
  iterations: 40,
  seed: 1,
  minGapCm: 15,
};

export function normalizeContainer(c) {
  const [L, W, H] = c.interior;
  return {
    name: c.name ?? 'Container',
    conf: c.conf ?? 'measured',
    L, W, H,
    payloadKg: c.payloadKg ?? Infinity,
    door: c.door ?? [W, H],
    obstacles: (c.obstacles ?? []).map((o) => ({
      name: o.name, x: o.pos[0], y: o.pos[1], z: o.pos[2], dx: o.dims[0], dy: o.dims[1], dz: o.dims[2],
    })),
    packing: { ...PACKING_DEFAULTS, ...c.packing },
  };
}

// Returns { errors: [], warnings: [] }. Errors make the data unusable, warnings don't.
export function validate(containerRaw, itemsRaw, constraintsRaw) {
  const errors = [], warnings = [];
  const dims3 = (d) => Array.isArray(d) && d.length === 3 && d.every((v) => typeof v === 'number' && v > 0);
  if (!dims3(containerRaw?.interior)) errors.push('container.interior must be [L, W, H] in cm');
  const ids = new Set();
  for (const [i, it] of (itemsRaw?.items ?? []).entries()) {
    const where = `item ${it.id ?? '#' + i}`;
    if (!it.id) errors.push(`${where}: missing id`);
    else if (ids.has(it.id)) errors.push(`${where}: duplicate id`);
    ids.add(it.id);
    if (!dims3(it.dims)) errors.push(`${where}: dims must be [L, W, H] > 0`);
    if (it.qty != null && !(Number.isInteger(it.qty) && it.qty >= 0)) errors.push(`${where}: qty must be a whole number`);
    if (it.kg != null && !(typeof it.kg === 'number' && it.kg >= 0)) errors.push(`${where}: kg must be a number`);
    if (it.conf && !(it.conf in CONF)) warnings.push(`${where}: unknown conf "${it.conf}"`);
    for (const f of it.flags ?? []) if (!FLAGS.includes(f)) warnings.push(`${where}: unknown flag "${f}"`);
  }
  const groups = new Set((itemsRaw?.items ?? []).map((i) => i.group));
  const tags = new Set((itemsRaw?.items ?? []).flatMap((i) => i.tags ?? []));
  for (const c of constraintsRaw?.constraints ?? []) {
    const where = `constraint ${c.id}`;
    for (const id of c.target?.items ?? []) if (!ids.has(id)) warnings.push(`${where}: unknown item "${id}"`);
    for (const g of c.target?.groups ?? []) if (!groups.has(g)) warnings.push(`${where}: unknown group "${g}"`);
    for (const t of c.target?.tags ?? []) if (!tags.has(t)) warnings.push(`${where}: unknown tag "${t}"`);
    for (const r of c.rules ?? []) if (!RULES.includes(r.type)) warnings.push(`${where}: unknown rule "${r.type}"`);
  }
  return { errors, warnings };
}

function matches(target, it) {
  if (!target) return false;
  return (target.items ?? []).includes(it.id)
    || (target.groups ?? []).includes(it.group)
    || (target.tags ?? []).some((t) => (it.tags ?? []).includes(t));
}

// Item-level properties after merging the item's own flags with active constraints.
export function resolveItems(itemsRaw, constraintsRaw) {
  const constraints = (constraintsRaw?.constraints ?? []).filter((c) => c.active !== false);
  return (itemsRaw?.items ?? []).map((it) => {
    const flags = new Set(it.flags ?? []);
    const r = {
      id: it.id, name: it.name ?? it.id, group: it.group ?? it.id, tags: it.tags ?? [],
      qty: it.qty ?? 1, dims: it.dims, kg: it.kg ?? 0, conf: it.conf ?? 'low', note: it.note ?? '',
      upright: flags.has('upright'), noRotate: flags.has('noRotate'), floor: flags.has('floor'),
      fragile: flags.has('fragile'), flex: flags.has('flex'), exclude: flags.has('exclude'),
      priority: flags.has('nice') ? 'nice' : 'must',
      maxTop: it.maxTop ?? Infinity,
      zone: null, loadGroup: null, constraintIds: [],
    };
    if (flags.has('noTop')) r.maxTop = 0;
    for (const c of constraints) {
      if (!matches(c.target, it)) continue;
      r.constraintIds.push(c.id);
      for (const rule of c.rules ?? []) {
        switch (rule.type) {
          case 'onFloor': r.floor = true; break;
          case 'upright': r.upright = true; break;
          case 'noRotate': r.noRotate = true; break;
          case 'noLoadOnTop': r.maxTop = 0; break;
          case 'maxLoadOnTop': r.maxTop = Math.min(r.maxTop, rule.kg); break;
          case 'zone': r.zone = { end: rule.end, withinCm: rule.withinCm, hard: c.hard !== false, cid: c.id }; break;
          case 'loadGroup': r.loadGroup = rule.n; break;
          case 'exclude': r.exclude = true; break;
          case 'flex': r.flex = true; break;
        }
      }
    }
    if (r.fragile) r.maxTop = Math.min(r.maxTop, FRAGILE_MAX_TOP_KG);
    return r;
  });
}

const ROTS = { lwh: [0, 1, 2], wlh: [1, 0, 2], lhw: [0, 2, 1], hlw: [2, 0, 1], whl: [1, 2, 0], hwl: [2, 1, 0] };

export function rotations(item, dims) {
  const names = item.noRotate ? ['lwh'] : item.upright ? ['lwh', 'wlh'] : Object.keys(ROTS);
  const seen = new Set(), out = [];
  for (const n of names) {
    const d = ROTS[n].map((i) => dims[i]);
    const k = d.join('x');
    if (!seen.has(k)) { seen.add(k); out.push({ rot: n, d }); }
  }
  return out;
}

// One instance per physical piece. Packing dims include clearance and the estimate safety margin.
export function expand(resolved, container) {
  const { clearanceCm, estimateMarginPct } = container.packing;
  const out = [];
  for (const it of resolved) {
    if (it.exclude || it.qty <= 0) continue;
    const margin = (estimateMarginPct[it.conf] ?? 0) / 100;
    const pdims = it.dims.map((v) => Math.round((v * (1 + margin) + clearanceCm) * 10) / 10);
    for (let k = 1; k <= it.qty; k++) {
      out.push({
        uid: it.qty > 1 ? `${it.id}#${k}` : it.id,
        item: it,
        pdims,
        vol: it.dims[0] * it.dims[1] * it.dims[2],
        rots: rotations(it, pdims),
      });
    }
  }
  return out;
}

export function buildModel(containerRaw, itemsRaw, constraintsRaw) {
  const check = validate(containerRaw, itemsRaw, constraintsRaw);
  if (check.errors.length) return { ...check, ok: false };
  const container = normalizeContainer(containerRaw);
  const items = resolveItems(itemsRaw, constraintsRaw);
  return { ...check, ok: true, container, items, instances: expand(items, container) };
}
