#!/bin/sh
# Serves this folder at http://localhost:8642 (the map extractor doesn't run from file://).
cd "$(dirname "$0")"
echo "Open http://localhost:8642/  (Ctrl+C to stop)"
( sleep 1; command -v xdg-open >/dev/null && xdg-open http://localhost:8642/ || open http://localhost:8642/ ) >/dev/null 2>&1 &
exec python3 -m http.server 8642 --bind 127.0.0.1
