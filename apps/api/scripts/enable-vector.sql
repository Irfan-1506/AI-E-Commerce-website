-- Run once after `prisma migrate deploy`:
--   psql "$DATABASE_URL" -f scripts/enable-vector.sql
-- (Prisma's `extensions = [pgvector]` in schema.prisma gets the column type
-- recognized, but index creation and the extension itself are cleaner as
-- plain SQL, same reasoning as enable-search.sql in Phase 4.)

CREATE EXTENSION IF NOT EXISTS vector;

-- HNSW is the right index type here (fast approximate nearest-neighbor,
-- good recall) rather than IVFFlat, which needs a representative sample of
-- data to build well and performs poorly on a catalog that's still small
-- and growing.
CREATE INDEX IF NOT EXISTS product_embedding_hnsw_idx
  ON "Product" USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;
