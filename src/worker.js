// Packs in a background thread: the genetic search takes a few seconds and must not freeze the page.
import { pack } from './pack.js';
self.onmessage = (e) => {
  const { id, model, opts } = e.data;
  self.postMessage({ id, plan: pack(model, opts) });
};
