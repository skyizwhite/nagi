#!/bin/sh

# Nagi Devourer: removes code you don't need
# Current available blocks to remove:
# data, bind, ref, fetch, morph, form, template, events, helpers
# Ex: ./scripts/devour.sh template form > nagi-custom.js

file="nagi.js"
sed_script=""

for block in "$@"; do
    sed_script="$sed_script;/--- BEGIN $block/,/--- END $block/d"
done

sed_script="$sed_script;/--- BEGIN/d;/--- END/d"

sed "$sed_script" "$file" | (command -v minify >/dev/null && minify --type js || cat)
