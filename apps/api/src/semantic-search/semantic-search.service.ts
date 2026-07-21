import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { EmbeddingsService } from '../ai/embeddings.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class SemanticSearchService {
  private readonly logger = new Logger(SemanticSearchService.name);

  constructor(
    private prisma: PrismaService,
    private embeddings: EmbeddingsService,
    private redis: RedisService,
  ) {}

  /**
   * Semantic search: embeds the query and finds nearest neighbors by cosine
   * distance. Catches things keyword search (Phase 4) misses entirely — e.g.
   * "something for a rainy commute" matching an umbrella with no literal
   * word overlap. Complements rather than replaces the Postgres FTS search:
   * FTS is better for exact SKU/brand-name lookups, semantic search is
   * better for descriptive/intent-based queries. A production search bar
   * would blend both; exposing them as separate endpoints for now keeps
   * each one simple and lets the frontend decide when to use which.
   */
  async search(query: string, limit = 20) {
    const trimmed = query.trim();
    if (!trimmed) return { items: [] };

    const cacheKey = `semantic-search:${trimmed}:${limit}`;
    const cached = await this.redis.getJson<any>(cacheKey);
    if (cached) return cached;

    const [vector] = await this.embeddings.embedBatch([trimmed], 'query');
    const vectorLiteral = `[${vector.join(',')}]`;

    // <=> is pgvector's cosine distance operator (0 = identical, 2 = opposite).
    // Cast to ::vector explicitly — Prisma's $queryRaw passes the literal as
    // text otherwise and Postgres won't implicitly coerce it.
    const items = await this.prisma.$queryRaw<any[]>`
      SELECT id, name, slug, "basePrice", currency,
        1 - (embedding <=> ${vectorLiteral}::vector) AS similarity
      FROM "Product"
      WHERE active = true AND embedding IS NOT NULL
      ORDER BY embedding <=> ${vectorLiteral}::vector
      LIMIT ${limit}
    `;

    const result = { items };
    await this.redis.setJson(cacheKey, result, 120);
    return result;
  }

  /** Called on product create/update — keeps the embedding in sync with catalog content. */
  async embedProduct(productId: string, name: string, description: string) {
    try {
      const vector = await this.embeddings.embed(`${name}\n\n${description}`, 'document');
      const vectorLiteral = `[${vector.join(',')}]`;
      await this.prisma.$executeRaw`
        UPDATE "Product" SET embedding = ${vectorLiteral}::vector WHERE id = ${productId}
      `;
    } catch (err) {
      // Don't fail product creation if the embedding provider is down —
      // the product just won't show up in semantic search until backfilled.
      this.logger.error(`Failed to embed product ${productId}`, err as Error);
    }
  }
}
