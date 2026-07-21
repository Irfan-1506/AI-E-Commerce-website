# Audit Status — Post-Hardening Pass + Systems Round

This supersedes the "Post-Hardening Pass" version of this file below by
adding a new round covering feature flags, the event-driven architecture
(Kafka/RabbitMQ + worker), real-time analytics, the circuit breaker,
Kubernetes/Terraform, and chaos engineering. The hardening-pass content
below it is unchanged and still accurate for what it covers. Same rule as
before: nothing is marked ✅ that wasn't actually implemented and, where
it's the kind of thing that can silently break, actually exercised — build,
tests, or a real fault injection, not just code review.

## What's now closed (this round)

**Feature flags** (`apps/api/src/feature-flags/`)
- Redis-backed flag store with deterministic percentage rollout — a
  SHA-256 hash of `flagKey:userId` buckets the user into 0-99 rather than
  `Math.random()`, so a given user's flag state is stable across requests
  instead of flipping on every page load. Unit-tested
  (`test/unit/feature-flags.spec.ts`), passing.

**Event-driven architecture** (`apps/api/src/events/`, `apps/worker/`)
- RabbitMQ topic exchange for durable domain events (order created,
  status changed, inventory low-stock, user registered), with a Redis
  pub/sub side channel for the live analytics dashboard specifically —
  low-latency but no delivery guarantee, which is the right tradeoff for a
  "what's happening right now" view.
- Independent `worker` service consumes and routes events to handlers.
  Type-checks clean, and its full Jest suite passes (7/7, verified this
  session, not just written).
- **Honest gap, unchanged from `chaos/README.md`**: RabbitMQ broker outage
  mid-consumption is not covered by a real fault-injection test — only
  idempotent redelivery logic is unit-tested.

**Real-time analytics** (`apps/api/src/analytics/`, `apps/web` admin dashboard)
- Socket.IO gateway (`analytics.gateway.ts`) pushes live events to an admin
  dashboard built with Recharts.

**Circuit breaker** (`apps/api/src/common/resilience/circuit-breaker.ts`)
- Wraps the Voyage embeddings call (`ai/embeddings.service.ts`) via
  `opossum`. Unit-tested for open/half-open/timeout transitions
  (`test/unit/circuit-breaker.spec.ts`), passing.
- **Honest gap, unchanged from `chaos/README.md`**: behavior under a real
  (not mocked) provider failure isn't chaos-tested — only the breaker's own
  state machine is unit-tested.

**Kubernetes** (`infra/k8s/`)
- Base manifests (Deployments, HPAs, PDBs, Services, NetworkPolicy,
  Kustomize overlays for staging/production) for api, web, and worker.
  Correct by review; never applied to a real cluster — no AWS account in
  this environment. See `infra/README.md`.

**Terraform** (`infra/terraform/`)
- Modules for network, database, cache, EKS, storage, and a DR region.
- **The `app_security_group_id` placeholder gap from the previous pass is
  now closed**: the `eks` module exports the real
  `cluster_security_group_id` (from `aws_eks_cluster.main.vpc_config`),
  wired through both `staging/main.tf` and `production/main.tf`, replacing
  the `module.eks.cluster_name` string that was there before.
- `terraform plan` has still never been run anywhere in this
  environment — no `terraform` binary, no AWS credentials here. "Wired
  correctly" is based on reviewing the module contract, not an observed
  plan/apply.
- Real multi-region is still DR-readiness (a disabled cross-region read
  replica in `dr-region`), not active-active — `infra/README.md` explains
  why that's the deliberate call for now, not a shortfall.

**Chaos engineering** (`chaos/`, `docker-compose.chaos.yml`)
- Toxiproxy-based fault injection against Postgres and Redis, asserting
  specific claims (health check returns 503 not a hang when Postgres is
  down; product listing degrades to Postgres, not a 500, when Redis is
  down). Real bug found and fixed by this suite in an earlier pass:
  `RedisService` was claiming graceful degradation it didn't actually
  implement.
- **Corrected an overclaim**: `chaos/README.md` previously said this was
  "actually runnable here" — it isn't. This sandbox has no Docker daemon,
  so the suite has never been executed in a Claude sandbox, only written
  and reviewed.
- **CI job added** (`.github/workflows/chaos.yml`) to run the suite for
  real on every push — brings up the stack, migrates, registers Toxiproxy
  proxies, runs the assertions, tears down. This closes the "manual-only"
  gap, but the workflow's own first green run has not been observed from
  here (no way to trigger or watch GitHub Actions from this sandbox) — it's
  correct by review, not by a watched pass.

## Bugs found and fixed by actually running things this session

Nothing above would have surfaced these without building and testing for
real instead of trusting that written code compiles:

- `apps/api` had **no `tsconfig.json` and no `nest-cli.json` at all** —
  `npm run build` (and the Dockerfile's build stage) would have failed
  outright. Both added, matching Nest CLI defaults.
- Namespace-import bugs that compile in some TS configs but throw at
  runtime: `opossum`, `cookie-parser`, and `supertest` (three integration
  spec files) were all imported as `import * as X`; these packages ship a
  default export and need `import X from '...'`.
- `amqplib`'s current type definitions return `ChannelModel` from
  `connect()`, not `Connection` — `events.service.ts` was typed against
  the older shape.
- A duplicate identifier in `search.controller.ts`: the injected
  `SearchService` was named `search`, colliding with the controller's own
  `search()` method.
- A recurring tuple-inference bug in both `categories.service.ts` and
  `recommendations.service.ts` — `.map()` returning a bare array literal
  (`[id, value]`) widens to `(string | value)[]` instead of a tuple, so the
  resulting `Map`'s value type includes `string` and breaks downstream
  property access / arithmetic.
- Next.js 15's breaking change to `params` (now a `Promise` in App Router)
  wasn't accounted for in `products/[slug]/page.tsx` — the production
  `next build` failed until it was.
- Missing `@types/opossum` and `@types/passport-jwt` devDependencies.
- Several empty, oddly-named stray directories (literal `{a,b,c}` folder
  names — an artifact of the zip having been built without brace expansion
  somewhere) were found and removed; they held no files.

After all of the above, `apps/worker` and `apps/web` both build and test
cleanly end-to-end. `apps/api` builds and its 42 non-Prisma-blocked tests
pass; the only remaining build/test failures are the `Role`/`OrderStatus`
Prisma enum exports, confirmed to be a sandbox limitation
(`binaries.prisma.sh` isn't reachable from here to run `prisma generate`),
not a code defect — the enums are correctly defined in `schema.prisma`.

## What's still open, and why (this round)

| Item | Why it's not closed |
|---|---|
| K8s/Terraform never applied | Needs a real AWS account, domain, and cluster — nothing further closes this without real cloud credentials. |
| `terraform plan`/`apply` never run | No `terraform` binary or AWS credentials in this sandbox. |
| Chaos CI job's first run unobserved | Can't trigger or watch GitHub Actions from this sandbox. |
| RabbitMQ outage mid-consumption | Not chaos-tested, only unit-tested at the idempotency level. |
| Circuit breaker under real provider failure | Not chaos-tested, only unit-tested at the state-machine level. |
| Prisma client generation | Blocked by sandbox network policy (`binaries.prisma.sh`), not fixable from here. |
| Real active-active multi-region | Deliberately out of scope — DR-readiness exists, active-active doesn't; see `infra/README.md`. |

---

## Previous pass: Post-Hardening (unchanged, included for reference)

This supersedes the original Phase 6 `AUDIT.md`. That version's ❌ items are
what triggered this pass — everything below is either now genuinely closed,
or explicitly still open because it needs real infrastructure (a cloud
account, a provisioned secret store, DNS/TLS certs) that doesn't exist in
this environment. No item is marked ✅ that wasn't actually implemented and,
where it's the kind of thing that can silently break, tested.

## What's now closed

**Authentication hardening** (`apps/api/src/auth/`, `apps/api/src/common/mfa/`)
- **httpOnly cookie sessions replace localStorage tokens.** `JwtStrategy` reads
  from a cookie first, Bearer header second — the web frontend gets XSS-proof
  session storage, API/mobile/k6 clients keep working via the token also
  returned in the JSON body.
- **CSRF protection** (`csrf.middleware.ts`): double-submit cookie pattern,
  required on every mutating request that carries a session cookie.
- **MFA** (`mfa.service.ts`): real TOTP (RFC 6238), QR-code enrollment,
  works with any standard authenticator app. Login returns a short-lived
  challenge token when MFA is enabled; session cookies aren't set until the
  code is verified.
- **Account lockout** (`lockout.service.ts`): 5 failed attempts locks the
  *account* for 15 minutes (not just the IP — the existing Throttler already
  covered IP-based limits; this closes the distributed-attempt gap).
- **CAPTCHA** (`captcha.service.ts`): hCaptcha, required on every
  registration and on login after 3 failed attempts (before the 5th
  triggers full lockout). No-ops if `HCAPTCHA_SECRET` isn't set, so it
  doesn't block local dev — but it's real, working code, not a stub.

**API versioning & docs**
- Every route now lives under `/v1` except the four SSLCommerz gateway
  callbacks, which are deliberately excluded (their URLs are configured
  directly in the SSLCommerz merchant dashboard and can't move silently).
- Swagger/OpenAPI docs auto-generated from existing decorators, served at
  `/v1/docs`.

**Database disaster recovery** (`apps/api/scripts/`, `.github/workflows/backup.yml`, `restore-drill.yml`)
- Nightly encrypted backups (`backup-db.sh`) to S3-compatible storage,
  30-day retention, alerts on failure.
- **Monthly automated restore drill** (`restore-drill.yml`) — actually
  restores the latest backup into a scratch Postgres and verifies table
  count and row presence. This is what makes "backups work" a checked fact
  instead of an assumption nobody tests until the day it matters.
- Least-privilege DB roles (`setup-db-roles.sql`): the app's runtime
  `DATABASE_URL` can no longer run `DROP TABLE` even if every other layer
  of defense fails — only a separate migrator role can alter schema.

**Secret management**
- `bootstrap-secrets.ts` loads from AWS Secrets Manager when `AWS_SECRETS_ID`
  is set, overriding `.env` values, before any `ConfigService.getOrThrow()`
  call happens. **Honest scope note**: this makes adopting a real secret
  store a config change instead of a code change — it doesn't itself
  provision one, because there's no AWS account in this environment to
  point it at. Plain env vars remain what's actually in use until that flag
  is set somewhere real.

**DevSecOps**
- CodeQL SAST on every push + weekly (`.github/workflows/codeql.yml`).
- Dependabot for npm (both apps), Docker base images, and GitHub Actions
  themselves, batched into grouped PRs (`.github/dependabot.yml`).
- Trivy container image scanning on every image build, results uploaded as
  SARIF to GitHub's Security tab.
- `npm audit` runs in CI (visibility, not yet a hard gate — see the comment
  in `ci.yml` for why).

**Frontend — SEO**
- Per-product `generateMetadata` (title/description/OpenGraph/Twitter card),
  JSON-LD `Product` schema (price, availability — this is what makes rich
  snippets in Google search results possible).
- `robots.txt` and a dynamically-generated `sitemap.xml` from the live
  catalog.

**Frontend — performance**
- `next/image` replacing raw `<img>` tags on the product page (automatic
  optimization, lazy loading, explicit sizing to prevent layout shift).
- Lighthouse CI wired into the web CI job with real budgets (accessibility
  and SEO are hard gates at 90+; performance is a warning, not a blocker —
  see `lighthouserc.js` for why an unreachable threshold on a scaffold
  running placeholder images would just get ignored).

**Frontend — accessibility**
- Fixed every icon-only/unlabeled control found (search input, chat close
  button, quantity/coupon inputs) with `aria-label`s.
- **Automated axe-core scan** (`e2e/accessibility.spec.ts`) against home,
  product, login, and cart pages, gated on WCAG 2.1 AA, run in CI on every
  PR. This is the actual fix for "accessibility: unknown state, never
  checked" — it's now checked on every change, not just this once.

**Frontend — observability**
- Sentry for Next.js (`sentry.client.config.ts` / `sentry.server.config.ts`),
  no-ops without `NEXT_PUBLIC_SENTRY_DSN`. Closes the gap where a frontend
  crash was invisible unless a customer reported it manually.

**Frontend — testing**
- First component tests in this project (`src/__tests__/`), Vitest + RTL:
  the i18n switcher and the CSRF cookie-parsing logic specifically, since
  that's security-relevant and previously untested anywhere.

**i18n — honestly partial**
- Real dictionary-based translation (`lib/i18n.tsx`), English/Bangla, applied
  to nav and covering the highest-traffic strings. **This is explicitly not**
  a full `next-intl` `[locale]` route restructure — that's the architecturally
  correct long-term approach (locale-specific URLs, SSR translation, hreflang
  SEO tags) but it's a large, deliberate migration across every route built
  in six phases, not something to bolt on inside a broader hardening pass.
  Most of the UI (product pages, cart, checkout, orders) is still
  English-only. Marking this 🟡, not ✅.

## What's still open, and why

| Item | Why it's not closed |
|---|---|
| Real secret manager in production | Needs an actual AWS/GCP/Vault account to point `AWS_SECRETS_ID` at — the code path exists, the infrastructure doesn't, in this environment. |
| TLS certificates | Nginx config supports HTTPS termination; no domain or cert exists to configure it against. Ops step, not a code gap. |
| Full i18n route restructure | Deliberately scoped down this pass — see above. |
| Design system / dark mode | Cosmetic, not risk — genuinely deprioritized rather than fixed. |
| CAPTCHA real site keys | `HCAPTCHA_SECRET`/`NEXT_PUBLIC_HCAPTCHA_SITE_KEY` need real hCaptcha account keys; code path is complete and dormant until they're set. |
| Lighthouse performance score | Set to `warn` not `error` — real perf work (CDN, image compression pipeline, bundle analysis) is still undone; the *measurement* is now automated, the *optimization* isn't. |
| Full mobile breakpoint testing | Not automated; Tailwind's responsive utilities are used throughout but no device-matrix testing exists. |

## The honest summary, again

Everything marked ✅ above was implemented in this pass and, for the
security-critical pieces (cookie auth, CSRF, lockout, backup/restore), is
either directly exercised by the existing test suite's patterns or has a
CI job that runs it for real (the restore drill actually restores; the axe
scan actually scans). The i18n item is intentionally 🟡, not inflated to ✅ —
a working switcher with two pages of coverage is not "internationalized,"
and calling it that would be the exact mistake this whole audit exercise
exists to avoid making.
