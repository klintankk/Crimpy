#!/usr/bin/env bash
set -e
rm -rf www && mkdir -p www
cp -r index.html manifest.json sw.js favicon.ico css js icons www/
mkdir -p www/data && [ -f data/backup.json ] && cp data/backup.json www/data/ || true
echo "www built:"; ls www
