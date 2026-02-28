#!/usr/bin/env bash
# Bump package.json version and optionally write VERSION file.
# Usage: ./scripts/bump-version.sh patch|minor|major

set -e
TYPE="${1:-patch}"
if [[ "$TYPE" != "patch" && "$TYPE" != "minor" && "$TYPE" != "major" ]]; then
  echo "Usage: $0 patch|minor|major"
  exit 1
fi

npm version "$TYPE" --no-git-tag-version
NEW=$(node -p "require('./package.json').version")
echo "Version set to $NEW"

if [[ -f VERSION ]]; then
  echo "$NEW" > VERSION
  echo "Wrote VERSION"
fi
