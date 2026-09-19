#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
OWNER="CodnanBaig"
REPO="reprolab"
VISIBILITY="${1:---private}"
if [[ "$VISIBILITY" != "--private" && "$VISIBILITY" != "--public" ]]; then
  echo 'Usage: bash scripts/publish-github.sh [--private|--public]' >&2; exit 1
fi
command -v gh >/dev/null || { echo 'Install the GitHub CLI (gh) and run gh auth login first.' >&2; exit 1; }
gh auth status >/dev/null
ACTUAL="$(gh api user --jq .login)"
[[ "$ACTUAL" == "$OWNER" ]] || { echo "Expected $OWNER, but gh is signed in as $ACTUAL. No repository was created." >&2; exit 1; }
if gh repo view "$OWNER/$REPO" >/dev/null 2>&1; then
  echo "$OWNER/$REPO already exists. Refusing to overwrite or push without review." >&2; exit 1
fi
npm run check
if [[ ! -d .git ]]; then
  git init -b main
  git config user.name "Adnan Baig"
  git config user.email "88790490+CodnanBaig@users.noreply.github.com"
  git add .
  git commit -m "feat: build ReproLab capture-to-regression workbench"
fi
gh repo create "$OWNER/$REPO" "$VISIBILITY" --description 'Privacy-first bug capture, visual replay, source-map inspection and Playwright regression drafts.' --source . --remote origin --push
printf '\nPublished to https://github.com/%s/%s\n' "$OWNER" "$REPO"
