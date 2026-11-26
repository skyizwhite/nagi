mkdir -p ./dist
rm -f ./dist/*

./scripts/devour.sh > ./dist/nagi.min.js

./scripts/devour.sh template form fetch morph helpers events > ./dist/nagi.core.min.js
