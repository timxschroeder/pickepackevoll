// Plain-text report of a plan, plus a diff against the previous plan. Used by tools/pack.mjs.

const REASONS = {
  'too-large': 'too large',
  door: 'does not fit through door',
  'no-space': 'no space',
  'no-gap': 'no gap for flexible item',
};

export function groupUnplaced(unplaced) {
  const m = new Map();
  for (const u of unplaced) {
    const k = `${u.id}|${u.reason}`;
    if (!m.has(k)) m.set(k, { ...u, count: 0 });
    m.get(k).count++;
  }
  return [...m.values()];
}

// Passengers besides the driver: either already taken off the payload, or shown next to it (subtractPassenger: false).
export function paxNote(C, kg) {
  if (!C.passengerKg) return '';
  if (C.subtractPassenger) return ` (${C.ratedPayloadKg} rated − ${C.passengerKg} passengers)`;
  const left = C.payloadKg - kg - C.passengerKg;
  return ` · with ${C.passengerKg} kg passengers: ${left < 0 ? `${-left} kg over` : `${left} kg spare`}`;
}

export function formatReport(plan) {
  const s = plan.stats;
  const L = [];
  L.push(`${plan.container.name}`);
  L.push(`Placed ${s.placed}/${s.pieces} pieces · ${s.placedM3} of ${s.usableM3} m³ (${s.volumePct}%) · all items ${s.allM3} m³`);
  const C = plan.container;
  const pax = paxNote(C, s.loadedKg);
  L.push(`Weight loaded ${s.loadedKg} kg / payload ${s.payloadKg} kg${pax} · everything ${s.allKg} kg`);
  L.push(`Free length at door ${s.freeLengthCm} cm · flexible goods ${s.flexM3} m³ in ${s.gapM3} m³ of gaps`);
  L.push(`Room left for about ${s.bags} soft bags of ${s.bagLitres} l in the gaps`);
  if (s.cog) L.push(`Centre of gravity x=${s.cog[0]} y=${s.cog[1]} z=${s.cog[2]} cm`);
  if (plan.unplaced.length) {
    L.push('', 'NOT PLACED');
    for (const u of groupUnplaced(plan.unplaced)) L.push(`  ${u.count}× ${u.name} — ${REASONS[u.reason] ?? u.reason}: ${u.detail}`);
  }
  if (plan.violations.length) {
    L.push('', 'PREFERENCES NOT MET');
    for (const v of plan.violations) L.push(`  ${v.uid} (${v.constraint}): ${v.detail}`);
  }
  if (plan.warnings.length) {
    L.push('', 'WARNINGS');
    for (const w of plan.warnings) L.push(`  ${w}`);
  }
  if (plan.uncertain.length) {
    L.push('', 'MEASURE THESE FIRST (largest size uncertainty)');
    for (const u of plan.uncertain) L.push(`  ${u.name}${u.qty > 1 ? ` ×${u.qty}` : ''} — ${u.conf} confidence, ±${u.m3} m³`);
  }
  L.push('', `(${plan.meta.runs} runs, best policy "${plan.meta.policy}", seed ${plan.meta.seed}, ${plan.meta.ms} ms)`);
  return L.join('\n');
}

export function formatDiff(prev, plan) {
  if (!prev) return '';
  const a = prev.stats, b = plan.stats, L = [];
  const d = (k, unit = '') => {
    const v = Math.round((b[k] - a[k]) * 100) / 100;
    if (v) L.push(`  ${k}: ${a[k]}${unit} → ${b[k]}${unit} (${v > 0 ? '+' : ''}${v}${unit})`);
  };
  d('placed'); d('volumePct', '%'); d('loadedKg', ' kg'); d('freeLengthCm', ' cm'); d('gapM3', ' m³'); d('bags');
  const was = new Set(prev.unplaced.map((u) => u.uid)), now = new Set(plan.unplaced.map((u) => u.uid));
  const newly = [...now].filter((u) => !was.has(u)), fixed = [...was].filter((u) => !now.has(u));
  if (newly.length) L.push(`  newly unplaced: ${newly.join(', ')}`);
  if (fixed.length) L.push(`  now placed: ${fixed.join(', ')}`);
  return L.length ? ['', 'CHANGES SINCE LAST RUN', ...L].join('\n') : '\n(no change since last run)';
}

// One line per van: how well the same load fits each configuration.
export function formatComparison(plans, activeId) {
  const L = ['VAN COMPARISON (same items, each van packed on its own)'];
  for (const p of plans) {
    const s = p.stats, C = p.container;
    const kg = s.allKg - s.payloadKg;
    const missing = groupUnplaced(p.unplaced).map((u) => `${u.count > 1 ? u.count + '× ' : ''}${u.name}`).join(', ');
    L.push(`${C.id === activeId ? '*' : ' '} ${C.name}  ${C.L}×${C.W}×${C.H} cm`);
    L.push(`    placed ${s.placed}/${s.pieces} · ${s.volumePct}% of ${s.usableM3} m³ · everything ${s.allKg} kg vs payload ${s.payloadKg} kg → ${kg > 0 ? `${kg} kg OVER` : `${-kg} kg spare`}${C.subtractPassenger ? '' : paxNote(C, s.allKg)}`);
    if (missing) L.push(`    not placed: ${missing}`);
  }
  L.push('  (* = active van)');
  return L.join('\n');
}
