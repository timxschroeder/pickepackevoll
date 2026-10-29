// Page-side packing service. A pack takes seconds, so it runs in workers, finished plans are cached per model,
// stale work is killed, and the vans that are not shown are packed in the background so switching is instant.
const WORKER_URL = new URL('./worker.js', import.meta.url);
const CACHE_MAX = 16;

// Same model → same key (FNV-1a over the JSON), so an edit that is undone hits the cache again.
function keyOf(model) {
  const s = JSON.stringify(model);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return `${s.length}:${(h >>> 0).toString(36)}`;
}

// One pack at a time in its own worker. A running pack cannot be interrupted, so cancel() terminates the worker.
class Slot {
  worker = null;
  settle = null;

  get busy() { return !!this.worker; }

  run(model) {
    this.cancel();
    return new Promise((resolve, reject) => {
      const w = this.worker = new Worker(WORKER_URL, { type: 'module' });
      const done = (fn, v) => { w.terminate(); this.worker = this.settle = null; fn(v); };
      this.settle = resolve; // cancel() resolves with null
      w.onmessage = (e) => done(resolve, e.data.plan);
      w.onerror = (e) => done(reject, new Error(e.message || 'packing worker failed'));
      w.postMessage({ id: 0, model });
    });
  }

  cancel() {
    if (!this.worker) return;
    this.worker.terminate();
    this.worker = null;
    this.settle(null);
    this.settle = null;
  }
}

// onBackground(vanId) is called whenever a background pack has finished.
export function createPacker(onBackground) {
  const cache = new Map(); // model key → plan (oldest first)
  const fg = new Slot();   // the van on screen
  const bg = new Slot();   // the other vans, one after the other
  let wanted = new Map();  // key → { id, model } for every van of the current data
  let bgKey = null, bgDone = null;

  const remember = (key, plan) => {
    cache.delete(key);
    cache.set(key, plan);
    while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  };

  async function pump() {
    if (bgKey || fg.busy) return; // the shown van has the CPU first
    const next = [...wanted].find(([k]) => !cache.has(k));
    if (!next) return;
    const [key, { id, model }] = next;
    bgKey = key;
    bgDone = bg.run(model).catch(() => null).then((plan) => { if (plan) remember(key, plan); return plan; });
    const plan = await bgDone;
    bgKey = null;
    if (plan && wanted.has(key)) onBackground(id);
    pump();
  }

  return {
    // entries = [{ id, model }] for all vans (models that are ok); resolves with the plan of `activeId`, or null if superseded.
    async request(entries, activeId) {
      fg.cancel(); // whatever was being packed for the screen is superseded
      wanted = new Map(entries.map((e) => [keyOf(e.model), e]));
      if (bgKey && !wanted.has(bgKey)) bg.cancel(); // data changed: that pack is useless now
      const active = entries.find((e) => e.id === activeId) ?? entries[0];
      const key = keyOf(active.model);
      let plan = cache.get(key);
      if (plan) remember(key, plan);
      else if (bgKey === key) plan = await bgDone;
      else {
        plan = await fg.run(active.model);
        if (plan) remember(key, plan);
      }
      pump();
      return plan;
    },
    // Plan of a van for the current data if it is already packed.
    peek(entry) { return cache.get(keyOf(entry.model)) ?? null; },
  };
}
