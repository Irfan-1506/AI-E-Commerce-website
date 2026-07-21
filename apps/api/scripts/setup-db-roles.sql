-- Run once, as a Postgres superuser, against the target database:
--   psql "$SUPERUSER_DATABASE_URL" -f scripts/setup-db-roles.sql
--
-- Two roles instead of one:
--   ai_commerce_migrator — owns the schema, runs `prisma migrate deploy`.
--     Used only in CI/deploy, never by the running application.
--   ai_commerce_app       — read/write on data, cannot alter schema, cannot
--     touch other databases, cannot create new roles. This is what
--     DATABASE_URL points to for the running api/worker processes.
--
-- Why this matters: every query the app makes already goes through Prisma's
-- parameterized queries (see the copyright/security notes elsewhere in this
-- codebase about the three $queryRaw call sites) — but least-privilege is
-- defense in depth for the case that protection ever fails, whether via a
-- future raw-SQL bug or a compromised dependency. A role that physically
-- cannot run DROP TABLE is a much stronger guarantee than "the code
-- shouldn't do that."

CREATE ROLE ai_commerce_migrator WITH LOGIN PASSWORD :'migrator_password';
CREATE ROLE ai_commerce_app WITH LOGIN PASSWORD :'app_password';

GRANT ALL PRIVILEGES ON DATABASE ai_commerce TO ai_commerce_migrator;

\c ai_commerce

GRANT CONNECT ON DATABASE ai_commerce TO ai_commerce_app;
GRANT USAGE ON SCHEMA public TO ai_commerce_app;

-- Data access only — no CREATE/DROP/ALTER. Prisma's migrator role handles
-- all schema changes; the app role should never be able to.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ai_commerce_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ai_commerce_app;

-- Future tables created by migrations automatically get the same grants —
-- otherwise every new table needs a manual GRANT before the app can use it.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ai_commerce_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO ai_commerce_app;

-- Usage:
--   Migrator: DATABASE_URL=postgresql://ai_commerce_migrator:...@host/ai_commerce
--     -> used only by `prisma migrate deploy` in CI/deploy
--   App:      DATABASE_URL=postgresql://ai_commerce_app:...@host/ai_commerce
--     -> what apps/api's running process actually uses (.env DATABASE_URL)
