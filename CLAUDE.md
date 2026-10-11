# Pickepackevoll – working rules for the assistant

Van-packing tool for a move Hamburg → Zürich in a rented VW Crafter. Design: [DESIGN.md](DESIGN.md).

## Run
- Page: `npm start` → http://localhost:8642 (static server + saving of `data/*.json`). The page re-packs on its own when data files change.
- Report: `npm run pack` (= `node tools/pack.mjs`) prints stats, unplaced items with reasons, warnings and a diff to the previous run; writes `out/plan.json`.

## Data (the only files that change during normal use)
- `data/items.json` – one item per line. `dims` = [length, width, height] cm **as packed** (furniture taken apart = several items with the same `group`). `kg` per piece. `conf` = low | med | high | measured. `flags` ⊂ upright, noRotate, floor, noTop, fragile, flex, nice, exclude. Optional `maxTop` (kg), `note`, `guess`.
- `data/constraints.json` – rules the user stated in words. Keep the original sentence in `text`.
- `data/container.json` – van interior, door, wheel arches, payload, packing parameters.
- Keep the one-entry-per-line format (same as `src/format.js` writes, which the page uses on save).

## Workflow for user requests
- **New item by name** ("add a washing machine"): estimate packed dims and weight from typical product sizes, set `conf` (low/med/high) and a short `note` with the basis. Never mark a guess as `measured`.
- **Correction** ("the table top is 210 × 95"): update `dims`/`kg`, set `conf: "measured"`, and keep the previous guess in `guess: { dims, kg, conf }` (only if no `guess` exists yet).
- **Rule in plain language** ("bikes go in last, near the door"): per-item physics (upright, on floor, nothing on top, fragile) → item `flags`; placement and order rules → a new entry in `constraints.json` with `text` (the user's sentence), `target`, `rules`, and `hard: false` when it is a preference. Echo the structured rule back in one line; ask if the target is ambiguous.
- After every data change: run `npm run pack` and report the essentials (placed, unplaced + reasons, weight vs payload, notable diff).
- Rule types: onFloor, upright, noRotate, noLoadOnTop, maxLoadOnTop {kg}, zone {end: cab|door, withinCm}, loadGroup {n} (1 = loaded first), exclude, flex, optional (packed after all must-have items, dropped first).

## Version control
- Commit after every step and iteration (code, data, docs), directly on `main`, with a descriptive message. No need to ask.

## Code map
- `src/model.js` validate data, merge rules into items, expand quantities, rotations.
- `src/pack.js` extreme-point packer + multi-start, gaps, flexible goods, stats. Pure JS (browser + Node).
- `src/view.js` three.js scene. Plan axes: x = cab→door, y = left→right wall, z = up; three.js position = (x, z, -y).
- `src/app.js` page: loading/polling, item editor, save, report.
