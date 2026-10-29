# pickepackevoll

Checks whether our stuff fits into the rental van and shows a packing arrangement in 3D.

```
npm install      # once (three.js)
npm start        # → http://localhost:8642
npm run pack     # text report in the terminal
```

- Edit items in the page (Items tab → Save) or in `data/items.json` (one item per line); the page updates by itself.
- Rules in plain language: tell Claude; they land in `data/constraints.json`.
- Van dimensions and packing parameters: `data/container.json`.

Deployment (CI, staging, production): [DEPLOY.md](DEPLOY.md). Design and decisions: [DESIGN.md](DESIGN.md). Working rules for the assistant: [CLAUDE.md](CLAUDE.md).
