#!/usr/bin/env bash
# The actual point of chaos engineering: verify the app fails the way it's
# supposed to, not just that it works when nothing is wrong. Every test
# below injects a real fault and checks a specific, falsifiable claim about
# how the system responds to it.
set -uo pipefail

TOXIPROXY_URL="${TOXIPROXY_URL:-http://localhost:8474}"
API_URL="${API_URL:-http://localhost:4000}"
PASS=0
FAIL=0

reset_toxics() {
  for name in $(curl -s "$TOXIPROXY_URL/proxies/postgres/toxics" | jq -r '.[].name' 2>/dev/null); do
    curl -s -X DELETE "$TOXIPROXY_URL/proxies/postgres/toxics/$name" > /dev/null
  done
  for name in $(curl -s "$TOXIPROXY_URL/proxies/redis/toxics" | jq -r '.[].name' 2>/dev/null); do
    curl -s -X DELETE "$TOXIPROXY_URL/proxies/redis/toxics/$name" > /dev/null
  done
}

check() {
  local description=$1 condition=$2
  if [ "$condition" = "true" ]; then
    echo "  PASS: $description"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $description"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Baseline: healthy dependencies ==="
reset_toxics
STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$API_URL/v1/health")
check "health check returns 200 when everything is up" "$([ "$STATUS" = "200" ] && echo true || echo false)"

echo ""
echo "=== Test: Postgres becomes unreachable ==="
curl -s -X POST "$TOXIPROXY_URL/proxies/postgres/toxics" \
  -d '{"type":"timeout","name":"db-down","attributes":{"timeout":0}}' > /dev/null
STATUS=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$API_URL/v1/health")
check "health check returns 503 (not a hang, not a 200) when Postgres is down" "$([ "$STATUS" = "503" ] && echo true || echo false)"
RESPONSE_TIME=$(curl -s -o /dev/null -w '%{time_total}' --max-time 10 "$API_URL/v1/health")
check "health check fails within a few seconds, not the full request timeout" "$(awk -v t="$RESPONSE_TIME" 'BEGIN{print (t<8)?"true":"false"}')"
reset_toxics

echo ""
echo "=== Test: Postgres is slow (2s latency) but not down ==="
curl -s -X POST "$TOXIPROXY_URL/proxies/postgres/toxics" \
  -d '{"type":"latency","name":"db-slow","attributes":{"latency":2000,"jitter":200}}' > /dev/null
STATUS=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$API_URL/v1/products")
check "product listing still succeeds under DB latency (just slower, not broken)" "$([ "$STATUS" = "200" ] && echo true || echo false)"
reset_toxics

echo ""
echo "=== Test: Redis becomes unreachable ==="
curl -s -X POST "$TOXIPROXY_URL/proxies/redis/toxics" \
  -d '{"type":"timeout","name":"redis-down","attributes":{"timeout":0}}' > /dev/null
STATUS=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$API_URL/v1/health")
check "health check reflects Redis outage" "$([ "$STATUS" = "503" ] && echo true || echo false)"
# Product listing should degrade (cache miss, fall through to Postgres),
# not fail outright — Redis is a cache-aside layer, not a hard dependency
# for reads. This is the actual claim worth checking: did the cache-aside
# pattern from Phase 2 hold up, or does a Redis outage take down the catalog?
PRODUCTS_STATUS=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$API_URL/v1/products")
check "product listing degrades gracefully (falls through to Postgres) when Redis is down" "$([ "$PRODUCTS_STATUS" = "200" ] && echo true || echo false)"
reset_toxics

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
