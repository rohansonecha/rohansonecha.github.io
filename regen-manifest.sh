#!/usr/bin/env bash
# Regenerate images-manifest.json — used by debug.html to list every photo on disk.
# Run this whenever you add or remove image files.
set -euo pipefail
cd "$(dirname "$0")"
find images -type f \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.webp' -o -iname '*.gif' \) \
  | sort \
  | python3 -c "import sys, json; print(json.dumps(sorted(l.strip() for l in sys.stdin if l.strip()), indent=2))" \
  > images-manifest.json
echo "wrote images-manifest.json ($(grep -c '\"images/' images-manifest.json) files)"
