set -eu

if ! command -v npx >/dev/null 2>&1; then
    echo "npx is not found. Run \`mise run build\`." >&2
    exit 1
fi

mkdir -p ./dist
tmp=./dist/.nagi.min.js.tmp
trap 'rm -f "$tmp"' EXIT

npx --no-install rolldown nagi.js --minify --format esm --logLevel warn --file "$tmp"

mv "$tmp" ./dist/nagi.min.js
find ./dist -maxdepth 1 -type f ! -name nagi.min.js -delete
