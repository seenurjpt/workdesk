#!/usr/bin/env bash
# Runs a local MongoDB on 127.0.0.1:27017 with data kept in .data/mongo.
# Uses the mongod binary that mongodb-memory-server downloads (run `npm test` once if missing).
set -euo pipefail
cd "$(dirname "$0")/.."
BIN="$(command -v mongod || true)"
[ -z "$BIN" ] && BIN="$(ls node_modules/.cache/mongodb-memory-server/mongod-* 2>/dev/null | grep -v '\.md5$' | head -1 || true)"
[ -z "$BIN" ] && { echo "No mongod found. Run 'npm test' once to download one, or install MongoDB."; exit 1; }
mkdir -p .data/mongo
exec "$BIN" --dbpath .data/mongo --bind_ip 127.0.0.1 --port 27017
