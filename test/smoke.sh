#!/bin/sh
# Smoke-Test für die Pipeline (und lokal): startet den Server und prüft Seite,
# Healthcheck und eingesetzte Version. Fragt die LVB nicht an.
#   sh test/smoke.sh                      # Version aus package.json
#   APP_VERSION=1.2.0 sh test/smoke.sh    # wie in der Pipeline mit Release-Tag
set -eu

PORT="${SMOKE_PORT:-3999}"
TMP="$(mktemp -d)"

node --check server.js

PORT="$PORT" node server.js > "$TMP/server.log" 2>&1 &
PID=$!
trap 'kill "$PID" 2> /dev/null || true; rm -rf "$TMP"' EXIT

for _ in 1 2 3 4 5 6 7 8 9 10; do
  wget -qO "$TMP/health.json" "http://127.0.0.1:$PORT/healthz" 2> /dev/null && break
  sleep 0.5
done
wget -qO "$TMP/index.html" "http://127.0.0.1:$PORT/"

fail() { echo "Smoke-Test fehlgeschlagen: $1"; cat "$TMP/server.log"; exit 1; }

grep -q '"ok":true' "$TMP/health.json" || fail "/healthz antwortet nicht"
grep -q 'LVB Abfahrten' "$TMP/index.html" || fail "Seite wird nicht ausgeliefert"
if grep -q '__APP_VERSION__' "$TMP/index.html"; then fail "Versions-Platzhalter nicht ersetzt"; fi

if [ -n "${APP_VERSION:-}" ]; then
  V="$APP_VERSION"
  grep -q "Version $V<" "$TMP/index.html" || fail "Fußzeile zeigt nicht Version $V"
  grep -q "\"version\":\"$V\"" "$TMP/health.json" || fail "/healthz meldet nicht Version $V"
fi

echo "Smoke-Test ok: $(cat "$TMP/health.json")"
