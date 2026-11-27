mkdir -p ./dist
rm -f ./dist/*

(command -v minify >/dev/null && minify --type js || cat) < nagi.js > ./dist/nagi.min.js
