# Pickepackevoll – working rules for the assistant

Van-packing tool for a move Hamburg → Zürich in a rented VW Crafter. Design: [DESIGN.md](DESIGN.md).

## Run
- Page: `npm start` → http://localhost:8642 (static server + saving of `data/*.json`). The page re-packs on its own when data files change.
- Verify: `npm run verify` (`node tools/verify.mjs --seeds 1,2,3`) packs for several seeds and checks every plan with independent physics (overlap, bounds, support, load limits, flags, weights). Run it after changing the packer.
- CI: `.github/workflows/ci.yml` runs `npm run verify` on every push; Pages deploy stages are off unless the repo variable `DEPLOY_PAGES` is set (public site, see DEPLOY.md). `node tools/build-site.mjs` builds the static copy into `dist/`.
- Report: `npm run pack` (= `node tools/pack.mjs`) prints stats, unplaced items with reasons, warnings and a diff to the previous run; writes `out/plan.json`. `npm run pack -- --compare` adds one line per van; `--van <id>` packs another van.

## Data (the only files that change during normal use)
- `data/items.json` – one item per line. `dims` = [length, width, height] cm **as packed** (furniture taken apart = several items with the same `group`). `kg` per piece. `conf` = low | med | high | measured. `flags` ⊂ upright, noRotate, floor, noTop, fragile, flex, nice, exclude. Optional `maxTop` (kg, total weight resting on it), `minSupport` (0–1), `maxHeight` (cm, top edge), `note`, `guess`.
- `data/constraints.json` – rules the user stated in words. Keep the original sentence in `text`.
- `data/container.json` – `vans` (one per line: interior, door, wheel arches, payload), `active` (the default van: packed by `npm run pack` and shown first; the page's van dropdown is remembered per browser in localStorage and does not change this file), `passengerKg` (people in the cab besides the driver, subtracted from payload), shared `packing` parameters.
- Keep the one-entry-per-line format (same as `src/format.js` writes, which the page uses on save).

## Workflow for user requests
- **New item by name** ("add a washing machine"): estimate packed dims and weight from typical product sizes, set `conf` (low/med/high) and a short `note` with the basis. Never mark a guess as `measured`.
- **Correction** ("the table top is 210 × 95"): update `dims`/`kg`, set `conf: "measured"`, and keep the previous guess in `guess: { dims, kg, conf }` (only if no `guess` exists yet).
- **Rule in plain language** ("bikes go in last, near the door"): per-item physics (upright, on floor, nothing on top, fragile) → item `flags`; placement and order rules → a new entry in `constraints.json` with `text` (the user's sentence), `target`, `rules`, and `hard: false` when it is a preference. Echo the structured rule back in one line; ask if the target is ambiguous.
- After every data change: run `npm run pack` and report the essentials (placed, unplaced + reasons, size margin, weight vs payload, notable diff). Taking furniture apart = several items with the same `group`.
- Rule types: onFloor, upright, noRotate, noLoadOnTop, maxLoadOnTop {kg}, maxHeight {cm | belowRoofCm}, minHeight {cm} (lowest bottom edge: keeps an item off the floor), zone {end: cab|door, withinCm}, loadGroup {n} (1 = loaded first), exclude, flex, optional (packed after all must-have items, dropped first). A rule `target` is `{items|groups|tags}` or `{all: true, except: {...}}`.

## Version control
- Commit after every step and iteration (code, data, docs), directly on `main`, with a descriptive message. No need to ask.

## Code map
- `src/model.js` validate data, merge rules into items, expand quantities, rotations.
- `src/packer.js` page-side packing service: foreground + background worker, plan cache per model, cancels stale packs, packs the other vans in the background (feeds the "Compare vans" table).
- `src/pack.js` extreme-point decoder + multi-start + genetic search (all placed, then size margin), gaps, flexible goods, stats. Pure JS (browser + Node). `src/worker.js` runs it for the page.
- `src/view.js` three.js scene. Plan axes: x = cab→door, y = left→right wall, z = up; three.js position = (x, z, -y).
- `src/app.js` page: loading/polling, item editor, save, report.
