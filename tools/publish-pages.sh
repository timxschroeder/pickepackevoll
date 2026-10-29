#!/usr/bin/env bash
# Publishes ./dist to the gh-pages branch (the branch GitHub Pages serves).
#   staging     → <site>/staging/
#   production  → <site>/        (keeps /staging/)
# Used by .github/workflows/ci.yml; needs GITHUB_TOKEN and GITHUB_REPOSITORY.
set -euo pipefail

target="${1:?usage: publish-pages.sh staging|production}"
src="$(cd "$(dirname "$0")/.." && pwd)/dist"
[ -f "$src/index.html" ] || { echo "no build in $src (run node tools/build-site.mjs)" >&2; exit 1; }

url="https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"
work="$(mktemp -d)"
if git ls-remote --exit-code --heads "$url" gh-pages >/dev/null 2>&1; then
  git clone --quiet --depth 1 --branch gh-pages "$url" "$work"
else
  git init --quiet -b gh-pages "$work"
  git -C "$work" remote add origin "$url"
fi

case "$target" in
  staging)
    rm -rf "$work/staging"
    mkdir -p "$work/staging"
    cp -R "$src/." "$work/staging/"
    ;;
  production)
    find "$work" -mindepth 1 -maxdepth 1 ! -name .git ! -name staging -exec rm -rf {} +
    cp -R "$src/." "$work/"
    ;;
  *) echo "unknown target: $target" >&2; exit 1 ;;
esac

cd "$work"
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add -A
if git diff --cached --quiet; then
  echo "$target is already up to date"
else
  git commit --quiet -m "$target: ${GITHUB_SHA:-local}"
  # staging and production may publish at the same time; they touch different paths, so a rebase is enough
  git push --quiet origin HEAD:gh-pages || { git pull --quiet --rebase origin gh-pages && git push --quiet origin HEAD:gh-pages; }
  echo "$target published (${GITHUB_SHA:-local})"
fi
