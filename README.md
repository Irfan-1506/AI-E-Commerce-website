# AI Commerce Platform

A full-stack, production-shaped e-commerce platform with AI-powered shopping features — built with **Next.js**, **NestJS**, **Prisma/PostgreSQL**, **Redis**, **RabbitMQ**, and the **Anthropic API**.

It started as a portfolio project and grew through six build phases plus two hardening passes, so it now includes things a real e-commerce business needs: real payment capture, fraud scoring, semantic search, event-driven architecture, chaos-tested resilience, and CI/CD — not just a product list and a cart.

> **Honest scope note:** this repo is transparent about what's real vs. what's written-but-unprovisioned. See [`AUDIT.md`](./AUDIT.md) for the full line-by-line audit, and the callouts in [What's *not* included](#whats-not-included-out-of-the-box) below.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Quick Start (Docker Compose)](#quick-start-docker-compose)
  - [Manual Setup (local dev)](#manual-setup-local-dev)
  - [Environment Variables](#environment-variables)
- [Testing](#testing)
- [Project Structure](#project-structure)
- [Deployment](#deployment)
- [What's *not* included out of the box](#whats-not-included-out-of-the-box)
- [License](#license)

---

## Features

### 🛍️ Core commerce
- Product catalog with categories, variants, and inventory tracking
- Cart and checkout flows, coupons/discounts, order management
- Product reviews and wishlists
- Real payment capture via **SSLCommerz** (Bangladesh payment gateway), with sandbox and live modes
- Keyword search + AI-powered semantic/vector search
- Product recommendations

### 🤖 AI features
- **Shopping assistant** — conversational product help powered by the Anthropic API
- **Semantic search** — vector embeddings (Voyage AI) for meaning-based product search, not just keyword matching
- **Fraud scoring** — AI-assisted risk scoring on orders/transactions
- **Dynamic pricing suggestions**
- **Sales forecasting**

### 🔐 Security & auth
- JWT auth with **httpOnly cookies** (access + refresh tokens never touchable by browser JS) — dual-mode, so API clients (k6, Postman, mobile) can still use bearer tokens in the response body
- CSRF protection (double-submit cookie)
- Real **TOTP MFA** (RFC 6238 — works with Google Authenticator, Authy, 1Password)
- Account lockout (5 failed attempts → 15-minute lock, per-account)
- Progressive CAPTCHA (hCaptcha) after failed logins / on registration
- Role-based access control (RBAC)
- Least-privilege Postgres roles — the app's runtime DB user can't `DROP TABLE`

### ⚙️ Architecture & infrastructure
- Event-driven design: RabbitMQ event bus + a genuinely separate **worker** microservice
- Real-time analytics via WebSockets + Redis pub/sub
- Feature flags
- Circuit breaker (via `opossum`) around external embedding API calls
- Full Kubernetes manifests + Terraform for AWS/EKS (see [scope note](#whats-not-included-out-of-the-box))
- Zero-downtime deploy pipeline
- Chaos engineering test suite (Toxiproxy) — already found and fixed a real graceful-degradation bug in `RedisService`

### 📈 Observability & ops
- Structured logging (Pino), OpenTelemetry tracing, Sentry error tracking (frontend + backend)
- Nightly encrypted DB backups + a monthly automated restore drill
- CodeQL, Dependabot, and Trivy container scanning wired into CI
- API versioning (`/v1`) with Swagger/OpenAPI docs at `/v1/docs`

### 🎨 Frontend
- Per-product SEO metadata, JSON-LD structured data, sitemap.xml/robots.txt
- `next/image` adoption, Lighthouse CI with real performance budgets
- Automated accessibility scanning (axe-core, WCAG 2.1 AA) on every PR
- Partial English/Bangla i18n (nav + auth pages — not a full locale migration, see [scope note](#whats-not-included-out-of-the-box))

---

## Architecture

```
┌────────────┐     ┌──────────────┐      ┌────────────────┐
│  Next.js   │────▶│    NestJS    │─────▶│   PostgreSQL   │
│  (web)     │     │    (api)     │      │   + Prisma     │
└────────────┘     └──────┬───────┘      └────────────────┘
                          │  │
                          │  └────────────▶ Redis (cache, pub/sub, sessions)
                          │
                          ├───────────────▶ RabbitMQ ──▶ worker (async jobs)
                          │
                          └───────────────▶ Anthropic API / Voyage AI (embeddings)

                nginx reverse-proxies web + api in the Docker Compose stack
```

- **apps/web** — Next.js 15 (App Router) frontend, React 19, Tailwind, React Query, Zustand
- **apps/api** — NestJS 10 backend, Prisma/PostgreSQL, the source of truth for auth, commerce logic, and AI integrations
- **apps/worker** — standalone Node service consuming RabbitMQ events for async work (independent of the API process)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS, TanStack Query, Zustand, Recharts |
| Backend | NestJS 10, TypeScript, Prisma ORM, Passport/JWT, Argon2 |
| Database | PostgreSQL (+ pgvector for embeddings) |
| Cache / real-time | Redis, Socket.IO |
| Messaging | RabbitMQ (event bus), amqplib |
| AI | Anthropic API (`@anthropic-ai/sdk`), Voyage AI embeddings |
| Payments | SSLCommerz |
| Observability | Pino, OpenTelemetry, Sentry |
| Infra | Docker Compose, Kubernetes manifests, Terraform (AWS/EKS), nginx |
| Testing | Jest (unit + integration), Playwright (E2E + a11y), Vitest + React Testing Library, k6 (load), Toxiproxy (chaos) |
| CI/CD | GitHub Actions, CodeQL, Dependabot, Trivy |

---

## Getting Started

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- npm

### Quick Start (Docker Compose)

The fastest way to get the full stack running (Postgres, Redis, RabbitMQ, API, worker, web, nginx):

```bash
git clone https://github.com/<your-username>/ai-commerce.git
cd ai-commerce

# copy env files and fill in real values (see Environment Variables below)
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

docker compose up -d --build
```

The app will be available behind nginx once containers are healthy. Check `docker-compose.yml` for exposed ports.

### Manual Setup (local dev)

If you'd rather run services individually (useful for active development):

```bash
# 1. Start just the data layer
docker compose up -d postgres redis

# 2. Set up and run the API
cd apps/api
cp .env.example .env        # fill in required values
npm install
npm run prisma:generate
npm run prisma:migrate
psql "$DATABASE_URL" -f scripts/enable-search.sql
psql "$DATABASE_URL" -f scripts/enable-vector.sql
npm run prisma:seed
npm run start:dev           # API at /v1/*, Swagger docs at /v1/docs

# 3. In another terminal, set up and run the web frontend
cd apps/web
cp .env.example .env
npm install
npm run dev
```

Cookie-based auth requires same-origin requests. The Next.js dev server proxies `/api/*` to the API automatically (see `apps/web/next.config.js`), so this works out of the box in both native dev and the full Docker Compose stack behind nginx — no extra proxy setup needed.

> To exercise the event-driven features (worker, real-time analytics), also start `rabbitmq` from `docker-compose.yml` and run `apps/worker` (`npm install && npm run start:dev`).

### Environment Variables

Both `apps/api/.env.example` and `apps/web/.env.example` are checked into the repo and documented inline. Key variables:

**`apps/api/.env`**

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `RABBITMQ_URL` | Event bus connection (leave unset to skip the durable event bus) |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Generate with `openssl rand -hex 32` |
| `S3_*` | S3-compatible storage (works with AWS S3, MinIO, DigitalOcean Spaces) |
| `SSLCOMMERZ_STORE_ID` / `SSLCOMMERZ_STORE_PASSWORD` | Payment gateway — get sandbox credentials at [developer.sslcommerz.com](https://developer.sslcommerz.com/registration/) |
| `ANTHROPIC_API_KEY` | Powers the shopping assistant — get one at [console.anthropic.com](https://console.anthropic.com) |
| `VOYAGE_API_KEY` | Product/query embeddings for semantic search — [dash.voyageai.com](https://dash.voyageai.com) |
| `HCAPTCHA_SECRET` | Optional in dev — CAPTCHA is skipped entirely when unset |
| `SENTRY_DSN`, `OTEL_EXPORTER_OTLP_ENDPOINT` | Optional observability, disabled if left blank |

**`apps/web/.env`**

| Variable | Purpose |
|---|---|
| `API_ORIGIN` | Used by `next.config.js`'s rewrite to proxy `/api/*` to the NestJS API |
| `NEXT_PUBLIC_SITE_URL` | Canonical URLs, OpenGraph tags, sitemap — must be set correctly in production |
| `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` | Optional, widget just doesn't render if unset |
| `NEXT_PUBLIC_SENTRY_DSN` | Optional frontend error tracking |

---

## Testing

```bash
# Backend
cd apps/api
npm test                   # unit tests
npm run test:integration   # needs Postgres + Redis running

# Frontend
cd apps/web
npm test                   # component tests (Vitest + RTL)
npm run test:e2e           # E2E + accessibility scan (Playwright + axe-core)
```

Load testing scripts live in `apps/api/k6`. Chaos engineering tests (Toxiproxy-based, simulating network failures against Redis/Postgres/RabbitMQ) are documented and runnable via `chaos/README.md` and `docker-compose.chaos.yml`.

---

## Project Structure

```
ai-commerce/
├── apps/
│   ├── web/            # Next.js frontend
│   ├── api/            # NestJS backend
│   │   └── src/
│   │       ├── auth/            # JWT, MFA, RBAC, lockout
│   │       ├── products/ cart/ orders/ inventory/ coupons/ reviews/ wishlist/ categories/
│   │       ├── payments/        # SSLCommerz integration
│   │       ├── search/ semantic-search/ recommendations/
│   │       ├── ai/ assistant/ fraud/ pricing/ forecasting/   # AI-powered features
│   │       ├── analytics/ dashboard/ events/ feature-flags/
│   │       └── redis/ storage/ health/ common/
│   └── worker/          # RabbitMQ event consumer microservice
├── infra/
│   ├── k8s/             # Kubernetes manifests
│   └── terraform/       # Terraform for AWS/EKS
├── chaos/               # Toxiproxy-based resilience tests
├── nginx/               # Reverse proxy config
├── docker-compose.yml
└── AUDIT.md             # Full honest audit of what's built vs. what's stubbed
```

---

## Deployment

- **Kubernetes**: manifests in `infra/k8s` are complete and reviewed, but have not been applied to a live cluster (none exists in this project's environment). See `infra/README.md`.
- **Terraform**: AWS/EKS configuration in `infra/terraform` is written but unexecuted for the same reason.
- **Chaos tests**: unlike infra-as-code above, these actually run — see `chaos/README.md`.
- A zero-downtime deploy pipeline is defined in `.github/workflows`.

If you deploy this to real infrastructure, treat the K8s/Terraform code as a strong starting point that needs a first real `terraform apply`/`kubectl apply` and validation pass, not as already-proven-in-production.

## What's *not* included out of the box

This project is upfront about a few things that need real accounts/infrastructure to fully activate:

- **Secret manager** — AWS Secrets Manager integration is written and dormant (`AWS_SECRETS_ID`), but needs a real AWS account to point at.
- **TLS certificates** — nginx supports HTTPS termination; you'll need your own domain and certs.
- **hCaptcha** — code path is complete; you need your own site/secret keys.
- **i18n** — English/Bangla dictionary covers navigation and auth pages only; most of the UI is English-only. A full locale-routing migration is a separate, larger architectural decision (see `AUDIT.md`).

See [`AUDIT.md`](./AUDIT.md) for the complete, itemized before/after audit this project was built against.

## License

MIT — see [`LICENSE`](./LICENSE) for details.
