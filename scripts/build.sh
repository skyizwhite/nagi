set -eu

if ! command -v npx >/dev/null 2>&1; then
    echo "npx is not found. Run \`mise run build\`." >&2
    exit 1
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

npx rolldown nagi.js --minify --format esm --logLevel warn --file "$tmp/nagi.min.js"

mkdir -p ./dist
rm -f ./dist/*
mv "$tmp/nagi.min.js" ./dist/nagi.min.js
