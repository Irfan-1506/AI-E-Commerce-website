#!/usr/bin/env bash
# Run once after `docker compose -f docker-compose.yml -f docker-compose.chaos.yml up`
# to register the proxies. Toxiproxy starts with no proxies configured —
# this wires "port 15432 forwards to postgres:5432, but can have faults
# injected" into existence.
set -euo pipefail

TOXIPROXY_URL="${TOXIPROXY_URL:-http://localhost:8474}"

echo "Creating postgres proxy..."
curl -s -X POST "$TOXIPROXY_URL/proxies" \
  -H 'Content-Type: application/json' \
  -d '{"name": "postgres", "listen": "0.0.0.0:15432", "upstream": "postgres:5432"}' | jq .

echo "Creating redis proxy..."
curl -s -X POST "$TOXIPROXY_URL/proxies" \
  -H 'Content-Type: application/json' \
  -d '{"name": "redis", "listen": "0.0.0.0:16379", "upstream": "redis:6379"}' | jq .

echo "Proxies ready. Inject faults with, e.g.:"
echo "  curl -X POST $TOXIPROXY_URL/proxies/postgres/toxics -d '{\"type\":\"latency\",\"attributes\":{\"latency\":2000}}'"
