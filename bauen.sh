#!/bin/sh
# Aus jedem Plugin-Verzeichnis ein Zip. Ohne Argument: alle.
set -e
cd "$(dirname "$0")"
mkdir -p build
for verzeichnis in ${*:-$(find . -maxdepth 2 -name manifest.json -exec dirname {} \;)}; do
  name=$(basename "$verzeichnis")
  rm -f "build/$name.zip"
  (cd "$name" && zip -q -r "../build/$name.zip" . -x '.*')
  echo "build/$name.zip"
done
