// Page glue: load data, pack, render, edit items, save, and pick up changes made on disk.
import { buildModel, FLAGS } from './model.js';
import { pack } from './pack.js';
import { groupUnplaced } from './report.js';
import { formatDataFile } from './format.js';
import { View } from './view.js';

const FILES = ['container', 'items', 'constraints'];
const LIST_KEY = { items: 'items', constraints: 'constraints' };
const PALETTE = ['#e07a5f', '#6f98d8', '#7fb08f', '#b78fd0', '#e3b75a', '#5fb0b7', '#d98fa8', '#9aa84f', '#c48a62', '#8a8fd6', '#d5734f', '#6ec3a1'];
const CARDBOARD = '#c9a36a';
const FLAG_LABEL = { upright: 'upright', floor: 'on floor', noTop: 'nothing on top', fragile: 'fragile', noRotate: 'no rotation', flex: 'flexible', nice: 'optional', exclude: 'leave out' };
const REASON = { 'too-large': 'too large', door: "doesn't fit through door", 'no-space': 'no space', 'no-gap': 'no gap' };
const LABEL_MAX_QTY = 6; // items with more pieces than this (boxes) get no 3D label unless selected

const S = { raw: {}, disk: {}, dirty: {}, model: null, plan: null, sel: null, colors: new Map(), timer: null };
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const view = new View($('#viewport'), { onPick: (d) => select(d && d.id ? { id: d.id, uid: d.uid } : null, true), onHover: tooltip });

// ---------- data ----------

async function fetchText(name) {
  const r = await fetch(`data/${name}.json`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`data/${name}.json: HTTP ${r.status}`);
  return r.text();
}

async function load(names = FILES) {
  try {
    for (const n of names) {
      const t = await fetchText(n);
      S.raw[n] = JSON.parse(t);
      S.disk[n] = t;
      S.dirty[n] = false;
    }
  } catch (e) {
    return banner(`Could not load data: ${e.message}`, [], 'error');
  }
  hideBanner();
  refreshAll();
}

function refreshAll() {
  computeColors();
  renderItems();
  renderRules();
  repack();
  updateSavebar();
}

async function poll() {
  const changed = [];
  for (const n of FILES) {
    try {
      const t = await fetchText(n);
      if (t !== S.disk[n]) changed.push([n, t]);
    } catch { /* server restarting: try again next tick */ }
  }
  if (!changed.length) return;
  const clean = changed.filter(([n]) => !S.dirty[n]);
  const conflicts = changed.filter(([n]) => S.dirty[n]).map(([n]) => n);
  for (const [n, t] of clean) {
    try {
      S.raw[n] = JSON.parse(t);
      S.disk[n] = t;
    } catch (e) {
      return banner(`data/${n}.json has a syntax error: ${e.message}`, [], 'error');
    }
  }
  if (clean.length) { hideBanner(); refreshAll(); }
  if (conflicts.length) {
    banner(`${conflicts.map((n) => n + '.json').join(', ')} changed on disk while you have unsaved edits.`, [
      ['Load disk version', () => load(conflicts)],
      ['Keep mine', () => { for (const [n, t] of changed) if (S.dirty[n]) S.disk[n] = t; hideBanner(); }],
    ]);
  }
}

async function save() {
  for (const n of FILES) {
    if (!S.dirty[n]) continue;
    const body = LIST_KEY[n] ? formatDataFile(S.raw[n], LIST_KEY[n]) : JSON.stringify(S.raw[n], null, 2) + '\n';
    const r = await fetch(`data/${n}.json`, { method: 'PUT', body });
    if (!r.ok) return banner(`Saving ${n}.json failed: ${await r.text()}`, [], 'error');
    S.disk[n] = body;
    S.dirty[n] = false;
  }
  updateSavebar();
  $('#save-status').textContent = 'Saved';
}

function markDirty(n) {
  S.dirty[n] = true;
  updateSavebar();
  clearTimeout(S.timer);
  S.timer = setTimeout(repack, 250);
}

function updateSavebar() {
  const any = FILES.some((n) => S.dirty[n]);
  $('#savebar').hidden = !any;
  if (any) $('#save-status').textContent = `Unsaved changes (${FILES.filter((n) => S.dirty[n]).join(', ')}) · already packed`;
}

// ---------- packing ----------

function computeColors() {
  S.colors.clear();
  let i = 0;
  for (const it of S.raw.items?.items ?? []) {
    const g = it.group ?? it.id;
    if (S.colors.has(g)) continue;
    S.colors.set(g, /karton|box/i.test(g) ? CARDBOARD : PALETTE[i++ % PALETTE.length]);
  }
}
const colorOf = (g) => S.colors.get(g) ?? '#999999';

function repack() {
  const m = buildModel(S.raw.container, S.raw.items, S.raw.constraints);
  if (!m.ok) return banner(`Data error: ${m.errors.join(' · ')}`, [], 'error');
  if (!$('#banner').classList.contains('conflict')) hideBanner();
  S.model = m;
  const plan = pack(m);
  const qty = new Map(m.items.map((it) => [it.id, it.qty]));
  for (const p of [...plan.placements, ...plan.unplaced]) p.labelled = qty.get(p.id) <= LABEL_MAX_QTY;
  const stepInput = $('#step');
  const atEnd = !S.plan || +stepInput.value >= +stepInput.max;
  S.plan = plan;
  view.setPlan(plan, colorOf);
  stepInput.max = plan.placements.length;
  if (atEnd) stepInput.value = plan.placements.length;
  onStep();
  renderStats();
  renderReport();
}

// ---------- rendering ----------

function renderStats() {
  const s = S.plan.stats, C = S.plan.container;
  $('#van-name').textContent = `${C.name} · ${C.L}×${C.W}×${C.H} cm`;
  const over = s.loadedKg > s.payloadKg;
  const stat = (k, v, cls = '') => `<div class="stat ${cls}"><div class="k">${k}</div><div class="v">${v}</div></div>`;
  $('#stats').innerHTML = [
    stat('Placed', `${s.placed} / ${s.pieces}`, s.unplaced ? 'bad' : 'good'),
    stat('Volume used', `${s.volumePct}% <span class="muted" style="font-size:12px;font-weight:400">${s.placedM3} / ${s.usableM3} m³</span>`),
    stat('Weight / payload', `${s.loadedKg} / ${s.payloadKg} kg`, over ? 'bad' : ''),
    stat('Free at door', `${s.freeLengthCm} cm`),
    stat('Room for bags', `≈ ${s.bags} <span class="muted" style="font-size:12px;font-weight:400">× ${s.bagLitres} l · gaps ${s.gapM3} m³</span>`),
  ].join('');
}

function renderReport() {
  const p = S.plan, s = p.stats;
  const h = [];
  if (p.warnings.length) h.push(`<h3>Warnings</h3><ul class="list">${p.warnings.map((w) => `<li class="warn">${esc(w)}</li>`).join('')}</ul>`);
  if (p.unplaced.length) {
    h.push(`<h3 class="bad">Not placed (${p.unplaced.length})</h3><ul class="list">`);
    for (const u of groupUnplaced(p.unplaced)) {
      h.push(`<li class="click" data-id="${esc(u.id)}">${u.count > 1 ? u.count + '× ' : ''}${esc(u.name)} <span class="badge">${REASON[u.reason] ?? u.reason}</span><div class="why">${esc(u.detail)}</div></li>`);
    }
    h.push('</ul>');
  } else {
    h.push('<h3 style="color:var(--ok)">Everything is placed</h3>');
  }
  if (p.violations.length) {
    h.push(`<h3>Preferences not met</h3><ul class="list">${p.violations.map((v) => `<li>${esc(v.uid)} <span class="badge">${esc(v.constraint)}</span><div class="why">${esc(v.detail)}</div></li>`).join('')}</ul>`);
  }
  if (p.uncertain.length) {
    h.push(`<h3>Measure these first</h3><ul class="list">${p.uncertain.map((u) => `<li class="click" data-id="${esc(u.id)}">${esc(u.name)}${u.qty > 1 ? ' ×' + u.qty : ''} <span class="conf-${u.conf}">${u.conf}</span><span class="why"> · ±${u.m3} m³</span></li>`).join('')}</ul>`);
  }
  if (p.flex.length) {
    h.push(`<h3>Flexible goods (${s.flexM3} m³ into ${s.gapM3} m³ of gaps)</h3><ul class="list">${p.flex.map((f) => `<li class="click" data-id="${esc(f.id)}">${esc(f.name)} <span class="why">${f.gap == null ? '<span class="bad">no gap</span>' : 'in gap ' + (f.gap + 1)}</span></li>`).join('')}</ul>`);
  }
  const counts = new Map();
  for (const it of S.model.items) if (!it.exclude) counts.set(it.group, (counts.get(it.group) ?? 0) + it.qty);
  h.push(`<h3>Groups</h3><div class="legend">${[...counts].map(([g, n]) => `<div><span class="swatch" style="background:${colorOf(g)}"></span>${esc(g)} <span class="muted">${n}</span></div>`).join('')}</div>`);
  h.push(`<h3>Details</h3><div class="muted" style="font-size:12px">Rigid items fill ${s.rigidPct}% of usable volume. All items together: ${s.allM3} m³, ${s.allKg} kg.${s.cog ? ` Centre of gravity ${s.cog[0]} cm from the cab, ${s.cog[1]} cm from the left wall, ${s.cog[2]} cm high.` : ''} ${p.meta.runs} runs in ${p.meta.ms} ms (best: ${p.meta.policy}).</div>`);
  $('#tab-report').innerHTML = h.join('');
}

function itemRow(it) {
  const flags = new Set(it.flags ?? []);
  const conf = it.conf ?? 'low';
  const guess = it.guess ? `<div class="guess">first guess: ${it.guess.dims.join('×')} cm, ${it.guess.kg} kg (${it.guess.conf})</div>` : '';
  return `<div class="item${flags.has('exclude') ? ' out' : ''}" data-id="${esc(it.id)}">
    <div class="row"><span class="swatch" style="background:${colorOf(it.group ?? it.id)}"></span>
      <input class="name" data-f="name" value="${esc(it.name)}" title="Name">
      <input class="group" data-f="group" value="${esc(it.group)}" title="Group (same color, folds parts of one thing together)">
      <input class="qty" type="number" min="0" step="1" data-f="qty" value="${it.qty ?? 1}" title="Quantity"></div>
    <div class="row">
      <input type="number" min="1" data-f="l" value="${it.dims[0]}" title="Length cm"><span class="x">×</span>
      <input type="number" min="1" data-f="w" value="${it.dims[1]}" title="Width cm"><span class="x">×</span>
      <input type="number" min="1" data-f="h" value="${it.dims[2]}" title="Height cm"><span class="x">cm</span>
      <input type="number" min="0" data-f="kg" value="${it.kg ?? 0}" title="Weight per piece"><span class="x">kg</span>
      <select data-f="conf" class="conf-${conf}" title="How sure is the size?">${['low', 'med', 'high', 'measured'].map((c) => `<option${c === conf ? ' selected' : ''}>${c}</option>`).join('')}</select>
    </div>
    <div class="row"><div class="chips">${FLAGS.map((f) => `<button class="chip${flags.has(f) ? ' on' : ''}" data-flag="${f}">${FLAG_LABEL[f]}</button>`).join('')}</div>
      <button class="del" title="Remove item">remove</button></div>
    <div class="row"><input class="note" data-f="note" value="${esc(it.note)}" placeholder="note"></div>${guess}
  </div>`;
}

function renderItems() {
  const items = S.raw.items?.items ?? [];
  $('#item-list').innerHTML = items.map(itemRow).join('');
  $('#item-count').textContent = items.reduce((n, it) => n + (it.qty ?? 1), 0);
  applyFilter();
  highlightRow();
}

function applyFilter() {
  const q = $('#filter').value.trim().toLowerCase();
  for (const row of document.querySelectorAll('.item')) {
    const it = findItem(row.dataset.id);
    row.hidden = !!q && !`${it.name} ${it.group} ${it.id} ${it.note ?? ''}`.toLowerCase().includes(q);
  }
}

function renderRules() {
  const list = S.raw.constraints?.constraints ?? [];
  $('#rule-count').textContent = list.length || '';
  const target = (t) => [...(t?.items ?? []), ...(t?.groups ?? []).map((g) => 'group ' + g), ...(t?.tags ?? []).map((g) => 'tag ' + g)].join(', ');
  const rule = (r) => r.type + (r.kg != null ? ` ${r.kg} kg` : '') + (r.end ? ` ${r.end} ≤ ${r.withinCm} cm` : '') + (r.n != null ? ` ${r.n}` : '');
  $('#tab-rules').innerHTML = `<p class="muted" style="font-size:13px">Rules in plain language go to Claude in chat, which adds them here. Untick a rule to see the plan without it; Save makes that permanent.</p>`
    + (list.length ? '' : '<p class="muted">No rules yet. Per-item basics (upright, on floor, nothing on top, fragile) are the chips on each item.</p>')
    + list.map((c, i) => `<div class="rule${c.active === false ? ' off' : ''}" data-i="${i}">
      <label class="row" style="display:flex;gap:8px;align-items:flex-start"><input type="checkbox" data-act="toggle"${c.active === false ? '' : ' checked'}>
      <span><span class="t">${esc(c.text)}</span><br><code>${esc(c.id)} · ${esc(target(c.target))} → ${esc((c.rules ?? []).map(rule).join(', '))}${c.hard === false ? ' (preference)' : ''}</code></span></label>
      <div style="text-align:right"><button class="del" data-act="delete">remove</button></div></div>`).join('');
}

// ---------- selection, tooltip, step ----------

function select(sel, fromView = false) {
  S.sel = sel;
  view.select(sel);
  highlightRow(fromView);
}

function highlightRow(scroll = false) {
  for (const row of document.querySelectorAll('.item')) row.classList.toggle('sel', row.dataset.id === S.sel?.id);
  if (scroll && S.sel) {
    const row = document.querySelector(`.item[data-id="${CSS.escape(S.sel.id)}"]`);
    if (row && !$('#tab-items').hidden) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function tooltip(d, x, y) {
  const el = $('#tooltip');
  if (!d) { el.hidden = true; return; }
  el.innerHTML = `<b>${esc(d.title)}</b>${(d.lines ?? []).map((l) => `<div>${esc(l)}</div>`).join('')}`;
  el.style.left = `${x + 14}px`;
  el.style.top = `${y + 14}px`;
  el.hidden = false;
}

function onStep() {
  const k = +$('#step').value, n = S.plan.placements.length;
  view.setStep(k);
  const cur = S.plan.placements.find((p) => p.step === k);
  $('#step-label').textContent = `${k} / ${n}${cur ? ' · ' + cur.name : ''}${k === n ? ' (all)' : ''}`;
}

function banner(msg, actions = [], kind = '') {
  const el = $('#banner');
  el.className = `banner ${kind} ${actions.length ? 'conflict' : ''}`;
  el.innerHTML = `<span>${esc(msg)}</span>`;
  for (const [label, fn] of actions) {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = fn;
    el.append(b);
  }
  el.hidden = false;
}
function hideBanner() { $('#banner').hidden = true; $('#banner').className = 'banner'; }

// ---------- item editing ----------

const findItem = (id) => S.raw.items.items.find((it) => it.id === id);

function keepGuess(it) {
  if (!it.guess && it.conf !== 'measured') it.guess = { dims: [...it.dims], kg: it.kg, conf: it.conf ?? 'low' };
}

function setField(it, f, v, row) {
  if (f === 'name' || f === 'note') it[f] = v;
  else if (f === 'group') { it.group = v; computeColors(); row.querySelector('.swatch').style.background = colorOf(v); }
  else if (f === 'qty') it.qty = Math.max(0, Math.round(+v || 0));
  else if (f === 'conf') { it.conf = v; row.querySelector('select').className = `conf-${v}`; }
  else if (f === 'kg') { if (!(+v >= 0) || v === '') return; keepGuess(it); it.kg = +v; }
  else {
    const n = +v;
    if (!(n > 0)) return;
    keepGuess(it);
    it.dims[{ l: 0, w: 1, h: 2 }[f]] = n;
    if (it.conf !== 'measured') { it.conf = 'measured'; const s = row.querySelector('select'); s.value = 'measured'; s.className = 'conf-measured'; }
  }
  if (f === 'qty') $('#item-count').textContent = S.raw.items.items.reduce((n, x) => n + (x.qty ?? 1), 0);
  markDirty('items');
}

function newId(base) {
  const ids = new Set(S.raw.items.items.map((it) => it.id));
  let i = 1;
  while (ids.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

$('#item-list').addEventListener('input', (e) => {
  const f = e.target.dataset.f, row = e.target.closest('.item');
  if (f && row) setField(findItem(row.dataset.id), f, e.target.value, row);
});
$('#item-list').addEventListener('click', (e) => {
  const row = e.target.closest('.item');
  if (!row) return;
  const it = findItem(row.dataset.id);
  if (e.target.dataset.flag) {
    const flags = new Set(it.flags ?? []), f = e.target.dataset.flag;
    flags.has(f) ? flags.delete(f) : flags.add(f);
    it.flags = FLAGS.filter((x) => flags.has(x));
    if (!it.flags.length) delete it.flags;
    e.target.classList.toggle('on', flags.has(f));
    row.classList.toggle('out', flags.has('exclude'));
    markDirty('items');
  } else if (e.target.classList.contains('del')) {
    S.raw.items.items.splice(S.raw.items.items.indexOf(it), 1);
    renderItems();
    markDirty('items');
  } else if (!e.target.matches('input, select, button')) {
    select(S.sel?.id === it.id ? null : { id: it.id });
  }
});
$('#item-list').addEventListener('focusin', (e) => {
  const row = e.target.closest('.item');
  if (row && S.sel?.id !== row.dataset.id) select({ id: row.dataset.id });
});
$('#add-item').onclick = () => {
  const it = { id: newId('item'), name: 'New item', group: 'Misc', qty: 1, dims: [50, 50, 50], kg: 10, conf: 'low' };
  S.raw.items.items.unshift(it);
  computeColors();
  renderItems();
  markDirty('items');
  $('#filter').value = '';
  applyFilter();
  const name = document.querySelector(`.item[data-id="${it.id}"] .name`);
  name.focus();
  name.select();
};
$('#filter').addEventListener('input', applyFilter);

$('#tab-rules').addEventListener('click', (e) => {
  const act = e.target.dataset.act, box = e.target.closest('.rule');
  if (!act || !box) return;
  const list = S.raw.constraints.constraints, c = list[+box.dataset.i];
  if (act === 'toggle') c.active = e.target.checked;
  if (act === 'delete') list.splice(+box.dataset.i, 1);
  renderRules();
  markDirty('constraints');
});

// ---------- controls ----------

$('#tab-report').addEventListener('click', (e) => {
  const li = e.target.closest('[data-id]');
  if (li) select({ id: li.dataset.id });
});
for (const b of document.querySelectorAll('.tabs button')) {
  b.onclick = () => {
    for (const x of document.querySelectorAll('.tabs button')) x.classList.toggle('on', x === b);
    for (const t of ['report', 'items', 'rules']) $(`#tab-${t}`).hidden = t !== b.dataset.tab;
    highlightRow(true);
  };
}
$('#step').addEventListener('input', onStep);
const OPTS = { 'opt-gaps': 'gaps', 'opt-estimates': 'estimates', 'opt-labels': 'labels', 'opt-unplaced': 'unplaced' };
for (const [id, key] of Object.entries(OPTS)) $(`#${id}`).addEventListener('change', (e) => view.setOptions({ [key]: e.target.checked }));
view.setOptions(Object.fromEntries(Object.entries(OPTS).map(([id, key]) => [key, $(`#${id}`).checked])));
for (const b of document.querySelectorAll('[data-cam]')) b.onclick = () => view.setCamera(b.dataset.cam);
$('#save').onclick = save;
$('#discard').onclick = () => load(FILES.filter((n) => S.dirty[n]));
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save(); }
  if (e.target.matches('input, select')) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    const s = $('#step');
    s.value = Math.max(0, Math.min(+s.max, +s.value + (e.key === 'ArrowRight' ? 1 : -1)));
    onStep();
  }
  if (e.key === 'Escape') select(null);
});
window.addEventListener('beforeunload', (e) => { if (FILES.some((n) => S.dirty[n])) e.preventDefault(); });

await load();
setInterval(poll, 2000);
