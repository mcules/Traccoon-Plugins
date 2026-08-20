#!/bin/sh
# One zip per plugin directory. Without an argument: all of them.
set -e
cd "$(dirname "$0")"
mkdir -p build
for dir in ${*:-$(find . -maxdepth 2 -name manifest.json -exec dirname {} \;)}; do
  name=$(basename "$dir")
  rm -f "build/$name.zip"
  (cd "$name" && zip -q -r "../build/$name.zip" . -x '.*')
  echo "build/$name.zip"
done
