# Deployment (GitHub Actions + GitHub Pages)

Workflow: [.github/workflows/ci.yml](.github/workflows/ci.yml).

| Stage | When | What |
|---|---|---|
| 1 · verify | every push | `npm run verify` (independent physics check of the packing plans) and a build smoke test |
| 2 · staging | push to `main` | static page → `https://<user>.github.io/pickepackevoll/staging/` |
| 3 · production | manual approval | the same build → `https://<user>.github.io/pickepackevoll/` |

Stages 2 and 3 are **off** until you switch them on. Reasons:
- A GitHub Pages site is **public**, even if the repository is private, and the page contains the household
  inventory (`data/*.json`). The built page is marked `noindex`, but anyone with the URL can read it.
- Pages from a private repository needs a paid GitHub plan (Pro, Team, Enterprise).
- The static copy is read-only: saving items needs `npm start` (the Node server).

## Switch on

1. Decide that publishing the data is fine (or remove personal items first).
2. Let the first push to `main` create the `gh-pages` branch: set the variable and push (or run the workflow):
   ```bash
   gh variable set DEPLOY_PAGES --body true
   ```
3. Enable Pages once the branch exists (Settings → Pages → Deploy from branch `gh-pages`, folder `/`), or:
   ```bash
   gh api -X POST repos/timxschroeder/pickepackevoll/pages -f 'source[branch]=gh-pages' -f 'source[path]=/'
   ```

## Approval for production

- **Free plan (default):** production only runs when you start it: Actions → *CI and deploy* → *Run workflow* on
  `main`, tick **promote**. It rebuilds the same commit and publishes it to the site root. Check
  `…/staging/` first.
- **Paid plan:** add yourself as *required reviewer* on the `production` environment (Settings → Environments),
  then `gh variable set PRODUCTION_APPROVAL --body environment`. Every push to `main` then waits for your click.

## Switch off / roll back

- Off: `gh variable delete DEPLOY_PAGES`. Delete the site: Settings → Pages → Unpublish.
- Roll back production: run the workflow with *promote* on an older commit (Run workflow → pick that tag or
  branch state), or revert on `main` and promote again.
