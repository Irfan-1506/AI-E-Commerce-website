-- Run once against the database after `prisma migrate deploy`, e.g.:
--   psql "$DATABASE_URL" -f scripts/enable-search.sql
-- Prisma's schema/migrate flow doesn't manage generated columns or GIN
-- indexes well, so this stays as a plain SQL script rather than forcing it
-- through a Prisma migration.

ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B')
  ) STORED;

CREATE INDEX IF NOT EXISTS product_search_idx ON "Product" USING GIN (search_vector);

-- Trigram index for typo-tolerant fallback (e.g. "eearbud" still finds "earbud").
-- Requires the pg_trgm extension, available by default on most managed Postgres.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS product_name_trgm_idx ON "Product" USING GIN (name gin_trgm_ops);
