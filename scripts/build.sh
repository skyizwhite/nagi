mkdir -p ./dist
rm -f ./dist/*

npx rolldown nagi.js --minify --format esm --logLevel warn --postBanner "$(sed -n '1,6p' nagi.js)" --file ./dist/nagi.min.js
