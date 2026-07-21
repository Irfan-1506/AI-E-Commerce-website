# Chaos engineering

Unlike Kubernetes/Terraform (real code, never executed — see
`infra/README.md`), this doesn't need a cloud account: it's just Docker
Compose and curl, and there's now a CI job wired up to run it automatically
(see below).

**Honest gap:** it has never actually been executed inside a Claude
sandbox — this environment has no Docker daemon available, so `docker
compose` isn't runnable here at all. The scripts were written and reviewed
carefully, and a `.github/workflows/chaos.yml` job now runs them on every
push, but that job itself has not been watched pass on GitHub's runners
yet — the workflow YAML is correct by review, not by an observed green run.

## What's here

```
docker-compose.chaos.yml     Toxiproxy overlay — routes api's DB/Redis
                              traffic through Toxiproxy so faults can be
                              injected between them
chaos/setup-toxiproxy.sh     registers the postgres/redis proxies
chaos/resilience-tests.sh    injects real faults, asserts specific claims
                              about how the app should respond
```

## Run it

```bash
docker compose -f docker-compose.yml -f docker-compose.chaos.yml up -d
./chaos/setup-toxiproxy.sh
./chaos/resilience-tests.sh
```

## What it actually found

Writing the Redis-outage test caught a real bug: `RedisService.getJson`/
`setJson` had a comment claiming graceful degradation that the code didn't
actually implement — a Redis error would propagate as an uncaught
exception, turning every cached read (product listings, search, categories)
into a 500 the moment Redis had any hiccup, not just when fully down.
Fixed in the same pass — `redis.service.ts` now treats a Redis failure as a
cache miss for read/write helpers, while refresh-token validation
deliberately still fails closed (a Redis outage should reject an auth
check, not silently accept it — different correctness requirement, not an
inconsistency).

This is the actual value of chaos testing over unit tests: the unit suite
mocks Redis, so it can't discover "the real client throws in a way the code
doesn't handle." Only injecting a real fault against a real client found this.

## What's NOT covered here

- Circuit breaker behavior under real (not mocked) provider failures.
- Pod/node-level chaos — needs an actual Kubernetes cluster (see `infra/README.md`).
- RabbitMQ broker outage mid-consumption — only idempotent redelivery logic
  is unit-tested, not a real connection-loss scenario.
