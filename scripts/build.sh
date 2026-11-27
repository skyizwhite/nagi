mkdir -p ./dist
rm -f ./dist/*

npx rolldown nagi.js --minify --format esm --logLevel warn --file ./dist/nagi.min.js
