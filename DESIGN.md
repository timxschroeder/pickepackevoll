# pickepackevoll – Design Decisions

Goal: check that our stuff fits into a rental van (Hamburg → Zürich) and find a good
packing arrangement. Private, local, single user, as few moving parts as possible.

---

## 1. Architecture & persistence

**Decision (revised when building v1): a tiny Node server that also saves.** `serve.mjs`
(~40 lines, no dependencies) serves the page and accepts `PUT` for the three
`data/*.json` files. You can edit items directly in the page (Items tab → Save), and
the assistant can still edit the same files from chat. The page polls the files every
2 s. If a file changed on disk while you have unsaved edits, it asks which version to
keep. The original plan was assistant-only editing, but an item list that is easy to
change in the page outweighed the extra script.

| Option | Pros | Cons |
|---|---|---|
| **Tiny local server with PUT** (chosen) | Edits in the page persist; any browser; Node is needed for the CLI anyway | Two writers (page and assistant): handled by polling and a conflict prompt |
| File System Access API | No write server needed | Chromium only. Asks for permission again every session. Still needs a server to load ES modules |
| Assistant edits JSON only | No write code at all | No editing in the page |

**The packer is shared.** `src/pack.js` is a pure function with no DOM:
`pack(container, items, constraints) → plan`. The browser imports it, and so does a
Node CLI. The CLI lets the assistant run a pack and read the result without a browser,
which closes the feedback loop. The packer is deterministic: it uses a seeded RNG, so
the same input always gives the same plan.

```
index.html, style.css   page shell; import map → node_modules/three
serve.mjs               static server + PUT data/*.json (`npm start`)
src/model.js            validate, merge rules into items, expand qty → pieces, rotations
src/pack.js             packer (pure, Node + browser), gaps, flexible goods, stats
src/report.js           text report + diff (CLI)
src/format.js           writes data files with one entry per line
src/view.js             three.js scene
src/app.js              page: polling, item editor, save, report, step slider, toggles
tools/pack.mjs          `npm run pack` → prints report, writes out/plan.json (+ diff vs previous)
data/container.json, data/items.json, data/constraints.json
package.json            one dependency: three@0.180.0 (pinned, served locally)
CLAUDE.md               the workflow rules for the assistant (section 6)
```

The page polls `data/*.json` every 2 s. When something changes, it re-packs and redraws,
so an edit by the assistant shows up in the open tab without reloading.

**Conventions**
- Units: cm and kg, as integers.
- Origin: front-left floor corner, at the cab wall.
- Axes: `x` runs along the length toward the rear door, `y` across the width, `z` up.
- A placement is given by the item's minimum corner.

## 2. 3D library

**three.js**, vendored and loaded with an import map, so there is no build step. It brings:
- OrbitControls for rotate, zoom and pan
- CSS2DRenderer for labels
- simple box geometry and edge lines

Alternatives:
- **Babylon.js:** heavier, and its extra features don't help here.
- **Plotly mesh3d:** poor fit for step-through and picking.
- **Raw WebGL:** too much work.

## 3. Packing approach

**Decision: a heuristic with multi-start, not a solver.**

Why not a MILP or CP solver:
- 3D packing with support and load rules is hard to model.
- The solver tools (e.g. OR-Tools) are Python or native code, which breaks "static HTML + JS".
- They get slow above about 20 items.
- The input dimensions are mostly guesses, so a provably optimal answer isn't worth much.

The heuristic is about 300 lines, runs in milliseconds, and can explain every failure.

**Algorithm (extreme-point placement, "back-bottom-left")**

1. **Expand items.** Turn quantities into instances (`umzugskarton#7`). Drop items marked
   `exclude`. Add `clearanceCm` to each item. Add `estimateMarginPct` to items whose size
   is an estimate.
2. **Pre-check each instance** and give a reason when it fails:
   - it must fit the interior in at least one allowed rotation
   - it must fit through the door opening (door width × height against the item's cross-section)
   - the running total weight must stay within payload
3. **Order the instances:**
   1. `loadGroup` (cab end first)
   2. `onFloor` items
   3. `priority`
   4. weight × volume, largest first

   Multi-start shuffles this order with a seeded RNG but keeps hard group order.
4. **Place each instance** by trying every extreme point × every allowed rotation and
   keeping the first that passes these checks:
   - inside the bounds, with no overlap with placed items or obstacles
   - **support:** at least `minSupport` (default 75%) of the base rests on the floor or on
     top faces at exactly the same height
   - **load:** each supporting item can carry the share of weight it gets (split by overlap
     area). Items with `noLoadOnTop` carry nothing, and `maxTopLoadKg` sets the limit
   - item constraints: `onFloor` means z = 0, and `zone` limits the x range

   Candidates are ranked by smallest x-end, then z, then y. This fills from the cab toward
   the door and from the bottom up, which is also an order you can physically load in.
5. **Rotations.** There are 6 axis-aligned orientations, stored as a permutation string
   (`"lwh"`, `"wlh"`, `"lhw"`, …). `upright` limits an item to `lwh` and `wlh`.
   `noRotate` limits it to `lwh` only.
6. **Score each plan** in this order:
   1. "must" volume placed
   2. total volume placed
   3. soft-constraint penalty
   4. length used (lower is better)
   5. centre-of-gravity height

   Keep the best of N runs (default 300, about 1 s; move it to a Web Worker only if it lags).
7. **Flexible goods (`flex: true`)** are handled after the rigid packing. Examples are
   duvets, pillows, clothes bags and rolled rugs. They are not placed as boxes:
   - The packer computes the **free gaps**: maximal empty boxes at least 15 cm on each side.
   - It fills those gaps with flex volume, largest gap first.
   - If flex volume is left over, it uses space at the door.

   Any item can be switched between rigid and flex, in chat or as an in-browser what-if.
   This lets you decide what to put in boxes and what to pack loose into gaps.

**Update 2026-10-27: genetic search and size margin.** The multi-start above is only phase 1 (the best
start seeds the search). Phase 2 is a biased random-key genetic algorithm (Gonçalves & Resende 2012, with the
maximal-space/extreme-point ideas of Parreño et al. and Crainic et al. for the decoder). A chromosome holds, per
piece: a key (loading order inside its tier), a preferred rotation, a side (pushed against the right wall, so the
long items can sit on both side walls) and a placement rule (`x`, `end`, `contact`), plus a global strategy.
Population 30, 6 elite, 5 mutants, 70% of a child's genes from an elite parent.

- **Objective:** *all pieces placed*, then *size margin*. Minimising the load length was the wrong target: once
  everything fits it gives the search nothing to follow. Instead, whenever a plan places everything, all pieces are
  made 0.25% bigger in each dimension and the search goes on (a ratchet); the last size at which everything
  still fitted, and still fits at real size, is the **size margin** (`stats.marginPct`, reported and shown on
  the page). Length only breaks ties.
- **Budget:** `packing.evals` (default 600 packing runs, about 5 s) and `packing.maxMs` as a safety stop; the same
  seed gives the same plan. The page packs in a worker (`src/worker.js`). Measured on 4–9 seeds: margin 0.6% at
  200 runs, 0.9% at 300, 1.4% at 600, 1.7% at 2400; one long run beats several short ones.
- **Flexible goods** may be split over several gaps (a topper can be folded).
- **Verification:** `npm run verify` re-derives overlap, bounds, support, load limits, flags and weights from
  scratch (it does not use the packer's geometry) for several seeds; it was mutation-tested.
- **What did not help:** more runs (diminishing), a compaction stage that keeps the margin and shortens the load,
  more or fewer individuals, best-of-several short runs. Relaxing any single rule gains at most ~2 points of
  margin; the limit is the placement method and the shape of the pieces, so the biggest lever is making pieces
  smaller (taking furniture apart) and measuring the low-confidence ones.

**Report**
- placed / total
- unplaced items, each with a *reason*: `too large`, `door`, `payload`, `no space`, or
  `constraint c3`
- volume used, as a percentage of the interior and of the item volume
- weight against payload
- **free length at the door** (the most intuitive "does it fit" number)
- centre of gravity (x, y)
- soft-constraint violations
- the 5 estimated items that contribute the most uncertainty
- flex volume against usable gap volume, e.g. "0.6 m³ soft goods, 1.1 m³ usable gaps → OK"

**Expected quality for 20–60 items.** For household goods that are roughly box-shaped,
expect 65–80% of the volume used, close to what a careful person achieves with rigid
boxes. Rule of thumb:
- **Below ~70%** of usable volume: it fits.
- **70–85%:** the tool's arrangement matters.
- **Above ~85%:** it won't fit without disassembling furniture or stuffing soft items
  into gaps.

So read "doesn't fit" as "doesn't fit as rigid boxes". The guessed dimensions will be a
bigger source of error than the algorithm.

## 4. JSON schemas

### `data/container.json`
```json
{
  "name": "VW Crafter …", "conf": "low",
  "interior": [430, 183, 196],
  "payloadKg": 1100,
  "door": [155, 184],
  "obstacles": [ { "name": "Radkasten links", "pos": [300, 0, 0], "dims": [100, 22, 35] }, … ],
  "packing": { "clearanceCm": 1, "minSupport": 0.75, "estimateMarginPct": { "low": 5, "med": 3, "high": 0, "measured": 0 },
               "iterations": 80, "seed": 1, "minGapCm": 15 }
}
```
These are placeholder values from my memory of the long, high-roof Crafter: about
4.3 m × 1.83 m × 1.96 m, 1.38 m between the wheel arches, roughly 15 m³. Replace them
with the rental company's figures. The container carries `conf` just like the items,
so the report says "van dimensions are estimates" until they are confirmed.
(The schemas below were simplified while building v1; the files in `data/` are the reference.)

### `data/items.json`
Compact, one item per line, so it is easy to edit by hand:
```json
{ "id": "piano", "name": "Digitalpiano", "group": "Klavier", "qty": 1, "dims": [140, 45, 90], "kg": 45,
  "conf": "measured", "flags": ["upright", "fragile"], "note": "…",
  "guess": { "dims": [140, 45, 90], "kg": 45, "conf": "low" } }
```
- `dims` = [length, width, height] in cm, **as packed**. `kg` per piece.
- `conf` = low | med | high | measured. It sets the uncertainty used in the report and the
  safety margin used for packing.
- `guess` is the original estimate. It is added automatically when you change the size or
  weight of an estimated item, and never deleted.
- `flags`: upright (keep the given height vertical; may still turn in plan), noRotate, floor, noTop, fragile (default: at most 5 kg on top, unless the item has its own `maxTop`), flex, nice (optional item), exclude
  (leave it out). Optional `maxTop` sets the kg allowed on top.
- **Items are listed as packed.** Furniture you take apart becomes several items that
  share a `group`. The view colors each group in one hue.

### `data/constraints.json`
```json
{
  "constraints": [
    {
      "id": "c1",
      "text": "Die Waschmaschine muss auf den Boden und aufrecht bleiben",
      "target": { "items": ["washing-machine"] },
      "rules": [ { "type": "onFloor" }, { "type": "upright" } ],
      "hard": true,
      "active": true,
      "added": "2026-10-11"
    },
    {
      "id": "c2",
      "text": "Kiste mit Bettzeug als letztes rein, nah an der Tür",
      "target": { "items": ["box-bedding"] },
      "rules": [ { "type": "zone", "end": "door", "withinCm": 80 } ],
      "hard": false, "weight": 5, "active": true, "added": "2026-10-11"
    }
  ]
}
```
- `target` selects items by `items` (ids) or `tags`.
- `text` stores the original sentence, so every rule can be traced back to what was said.
- A user-stated constraint overrides the item's `props`.

**Rule vocabulary for v1 (a closed list):**

| Type | Meaning |
|---|---|
| `onFloor` | the item sits on the floor |
| `upright` | the item keeps its height axis vertical |
| `noRotate` | the item keeps its original orientation |
| `noLoadOnTop` | nothing goes on top of it |
| `maxLoadOnTop {kg}` | at most this much weight on top |
| `zone {end: "cab"\|"door", withinCm}` | the item sits within this distance of the cab or the door |
| `maxHeight {cm}` or `{belowRoofCm}` | highest allowed top edge from the floor, or keep that much free under the roof (adapts to each van; e.g. a deck for bikes lying on top) |
| `minHeight {cm}` | lowest allowed bottom edge from the floor: the piece must sit on top of other things (e.g. a fragile keyboard) |
| `loadGroup {n}` | packing group; 1 = loaded first, at the cab end |
| `exclude` | the item is not packed (e.g. shipped separately) |

Deferred to v2: `keepTogether`, `notOnTopOf {items}`, and `pin {x, y, z, rot}`.

### `out/plan.json` (generated)
```json
{
  "inputsHash": "…", "seed": 1,
  "placements": [ { "instance": "billy#1", "x": 0, "y": 0, "z": 0, "rot": "hwl", "dims": [202,80,28], "step": 1 } ],
  "unplaced":   [ { "instance": "sofa#1", "reason": "door", "detail": "min cross-section 95×210 > door 156×184" } ],
  "stats": { "volumePct": 71.4, "weightKg": 840, "payloadKg": 1100, "freeLengthCm": 62, "cog": [180, 88, 55] },
  "violations": [ { "constraint": "c2", "instance": "box-bedding#1", "detail": "x-end 290, wanted ≥ 350" } ]
}
```

## 5. Size guessing

- **Who guesses: the assistant**, from its own knowledge (product specs, typical
  appliance sizes, standard moving boxes). This needs no API key and no network call in
  the page. The assistant writes:
  - the dims and weight
  - `conf` low / med / high (never `measured` for a guess)
  - a one-line `note` with the basis
- **Persistence:** the guess lives on the item in `items.json`, committed to git, so it
  is never re-guessed. When you give a real measurement (in chat or in the page), `dims`
  change, `conf` becomes `measured`, and the original guess is kept in `guess`.
- **Visibility in 3D:** estimated items are drawn with dashed edges (toggle "Mark estimates").
- **Uncertainty ranking:** the report ranks estimated items by volume × uncertainty
  (low = ±20%, med = ±10%, high = ±3%) and lists the top 5 under "measure these first".
- **Safety margin:** `estimateMarginPct` inflates estimated items while packing, so a
  "fits" result based on guesses is conservative.

## 6. Feedback workflow (written into `CLAUDE.md`)

1. **You say:** "Bücherkartons nur auf den Boden, nichts Schweres drauf" (book boxes on
   the floor only, nothing heavy on top).
2. **The assistant maps it** to the selector `tags: ["books"]`. If that is ambiguous, it
   asks which items you mean.
3. **It writes the constraint:** `onFloor` + `maxLoadOnTop {kg: 15}`, with the original
   sentence in `text`. It shows you the structured rule in one line.
4. **It runs** `node tools/pack.mjs`, which validates the input first (unknown ids,
   impossible hard constraints) and then prints the report and a **diff against the
   previous plan**: newly unplaced items, change in volume %, change in free length.
5. **The open browser tab** picks up the change and re-packs. You check the result in 3D.
6. **It commits.** Each change is one git commit, so undo is `git revert`.

Adding items works the same way: "add washing machine, 3× Billy, 25 Umzugskartons"
(moving boxes). The assistant adds the items with estimates and points out the
low-confidence ones.

## 7. Visualization

- **Container:** wireframe with a translucent floor, obstacles in grey, and the door
  plane marked.
- **Items:** colored by `group`, with labels on hover (or all labels shown with a
  toggle). Clicking an item highlights it both in the 3D view and in the list.
- **Estimates:** items whose size is guessed are semi-transparent with dashed edges.
- **Unplaced items:** drawn in a "staging area" on the ground next to the van with red
  outlines, and listed with their reasons.
- **Gap view (toggle):** shows the free gaps as translucent boxes with their size in cm.
  Flex goods are drawn hatched inside the gaps they fill. Clicking a box or bag switches
  it between rigid and flex as a what-if. This is the visual aid for deciding what goes
  in boxes and what goes loose.
- **Step slider:** shows the first k placements in load order. Running it in reverse
  gives the unloading order in Zürich.
- **Camera presets:** rear door, top, side.

## 8. Risks

- **Dimension guesses** cause most of the error. Mitigated by marking estimates, the
  safety margin, and the "measure these first" list.
- **Irregular shapes** (chairs, plants, bikes) packed as bounding boxes give a
  pessimistic result. Flex goods and the gap view make up for some of it.
- **Payload is likely the binding limit**, not volume (see section 10). The report shows
  weight against payload at the top.
- **A placement may be valid but hard to load in practice** (lifting heights, reaching
  in). Mitigated by the back-bottom-left order and the step view; the plan is not
  guaranteed to be loadable.
- **Conflicting hard constraints:** the item is left unplaced and the reason names the
  constraint. Nothing fails silently.
- **Ambiguous natural language:** the assistant echoes the structured rule and asks when
  unsure.

**Cut from v1:**
- editing in the browser (write-back)
- assembled/packed variants (items are always listed as packed)
- non-box shapes
- `keepTogether`, `notOnTopOf`, `pin`
- drag-and-drop in 3D
- side-door loading
- axle-load calculation (only centre of gravity is reported)

## 9. Build phases

| Phase | Scope | You get |
|---|---|---|
| **1 – Fits?** (smallest useful) | container + items JSON seeded from the inventory (section 10), model expansion, packer (rotations, bounds, overlap, floor support only, single run), CLI report, basic 3D (boxes, colors, orbit, unplaced list) | A first answer to "does it fit?" and a picture |
| **2 – Physics & gaps** | obstacles and door check, support ratio, top-load and fragile rules, payload, multi-start and scoring, free-length and centre-of-gravity stats, flex goods and gap view | Realistic arrangements; deciding boxes vs loose |
| **3 – Feedback loop** | constraints.json and the rule vocabulary, validation, plan diff, `CLAUDE.md` workflow, browser auto-reload, what-if toggles | "Natural-language rule → re-pack" |
| **4 – Estimates & polish** | estimate rendering, uncertainty ranking, safety margin, step slider, labels and picking, camera presets | Trust in the result, a loading plan |
| **5 – Optional** | `serve.py` write-back with editing in the browser, `keepTogether`, `notOnTopOf`, `pin`, Web Worker | Only if needed |

**Status (2026-10-11):** Phases 1–3 are built, plus most of Phase 4 (estimate rendering,
uncertainty ranking, safety margin, step slider, labels, picking, camera presets) and the
editing part of Phase 5.

## 10. Initial inventory (packed state) and first sanity check

Taken from the Confern/Yembo inventory of 7 Sept 2026: 24 items plus 50 "packing
materials". Only the item lines are copied here, no contact data. Every size and weight
below is my **estimate**, made from the item names and photos.

| Group | Inventory line | Packed as | Est. L×W×H cm | kg each | Notes |
|---|---|---|---|---|---|
| piano | Klavier – Kleinklavier ×1 | body | 140×45×90 | 45 | Assumes a **digital** piano (photo). An acoustic one would be ~150×60×120 and 200+ kg |
| piano | Bank – Klein ×1 | bench | 60×35×50 | 8 | |
| desk | Tisch – Mittel ×2 | top + frame bundle | 140×70×15 | 45 | Standing desks? Frames are heavy |
| desk | Computerbildschirm ×2 | boxed | 70×20×50 | 7 | fragile |
| living | Stuhl – Büro ×2 | as is | 70×70×115 | 15 | |
| living | Kamin-Werkzeuge ×1 | as is | 50×40×80 | 25 | Low confidence: the photo shows a stove-like cabinet |
| plants | Pflanze mittel ×2 | pot + plant | 60×60×180 / 45×45×120 | 35 / 15 | upright, nothing on top |
| bed | Bett 180×200 ×1 | 2 bases + 2 mattresses (if box-spring) | 200×90×30 / 200×90×25 | 35 / 25 | Bases and mattresses go on their edge along a wall |
| bed | Kopfende ×1 | headboard | 185×12×130 | 20 | |
| dining | Tisch – Esstisch ×1 | top + leg bundle | 200×100×5 / 90×20×75 | 60 / 20 | The solid wood top is heavy; carry it on its edge |
| dining | Stuhl – Klein ×4 | as is | 60×58×85 | 7 | Upholstered; can be stacked seat on seat in pairs |
| dining | Vitrine/Glasschrank ×2 | upper glass part / base | 150×40×120 / 150×50×95 | 55 / 75 | glass, upright; the base sits on the floor |
| rugs | Teppich Klein + Mittel | rolled | 130×25×25 / 200×30×30 | 5 / 10 | flex |
| bikes | Fahrrad ×2 | handlebar turned | 180×25×105 | 15 | upright, nothing on top |
| boxes | Verpackungsmaterialien ×50 | moving box | 60×33×34 | ~15 avg | Assumed: standard Umzugskarton (moving box) |

**Sanity check.** These are bounding boxes against the placeholder van (~15.3 m³ usable):

| | Volume | Weight |
|---|---|---|
| Rigid items | ≈ 12.6 m³ (**~82%** of the van) | ≈ 690 kg furniture + 50 boxes × 10–15 kg |
| Flex items | ≈ 0.5 m³ | |
| Total | | ≈ **1.2–1.45 t** |
| Limit | | Crafter 3.5 t payload ≈ 1.0–1.2 t |

So:
- **Volume:** tight but plausible in the long Crafter. 82% sits in the band where the
  arrangement decides, which is exactly what this tool is for. In the shorter Crafter
  (~3.45 m) it would not fit.
- **Weight:** probably **over payload**, depending mostly on how heavy the 50 boxes are.
  Weighing a few packed boxes is the cheapest way to make the plan more accurate.

## 11. Open questions

Already decided from your answers:
- the van is a VW Crafter
- items are listed as packed
- soft goods can be switched between rigid and flex, with the gap view to help decide
- edits go through chat
- Node is installed
- one trip

Still open:
1. **Which Crafter exactly?** I need the interior L×W×H, wheel arches, rear door
   opening and payload. The rental company's spec sheet is enough. "3 m wide" can't be
   the inside: a Crafter's cargo area is about 1.83 m wide (1.38 m between the wheel
   arches). It's probably the outside width with mirrors.
2. **Piano: digital or acoustic?** It's about 45 kg versus 200+ kg, and an acoustic one
   changes how it is loaded.
3. **Bed: box-spring** (2 bases + 2 mattresses), or a frame with slats and one mattress?
   It is the second-largest volume after the boxes.
4. **The 50 "packing materials":** are they 50 moving boxes? Which size, and how many are
   book boxes?
5. **Things in the photos that aren't on the list:** green sofa, live-edge coffee table,
   wooden chest of drawers. Also no wardrobe, kitchen items or washing machine. Are they
   staying, or did the inventory miss them?
6. **Vitrine ×2:** is that one cabinet in two parts (glass top + base), as the photo
   suggests?
