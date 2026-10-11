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

export function formatReport(plan) {
  const s = plan.stats;
  const L = [];
  L.push(`${plan.container.name}`);
  L.push(`Placed ${s.placed}/${s.pieces} pieces · ${s.placedM3} of ${s.usableM3} m³ (${s.volumePct}%) · all items ${s.allM3} m³`);
  L.push(`Weight loaded ${s.loadedKg} kg / payload ${s.payloadKg} kg · everything ${s.allKg} kg`);
  L.push(`Free length at door ${s.freeLengthCm} cm · flexible goods ${s.flexM3} m³ in ${s.gapM3} m³ of gaps`);
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
  d('placed'); d('volumePct', '%'); d('loadedKg', ' kg'); d('freeLengthCm', ' cm'); d('gapM3', ' m³');
  const was = new Set(prev.unplaced.map((u) => u.uid)), now = new Set(plan.unplaced.map((u) => u.uid));
  const newly = [...now].filter((u) => !was.has(u)), fixed = [...was].filter((u) => !now.has(u));
  if (newly.length) L.push(`  newly unplaced: ${newly.join(', ')}`);
  if (fixed.length) L.push(`  now placed: ${fixed.join(', ')}`);
  return L.length ? ['', 'CHANGES SINCE LAST RUN', ...L].join('\n') : '\n(no change since last run)';
}
