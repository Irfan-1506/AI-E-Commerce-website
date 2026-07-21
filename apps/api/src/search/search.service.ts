import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService, private redis: RedisService) {}

  /**
   * Postgres full-text search (websearch_to_tsquery + ts_rank against the
   * generated tsvector column from scripts/enable-search.sql), with a
   * trigram similarity fallback for typos when the FTS match is weak.
   *
   * Deliberately not Elasticsearch: standing up and operating an ES cluster
   * for catalog search is real ongoing infra cost that isn't justified until
   * there's a product catalog and query volume big enough for Postgres FTS
   * to actually fall short (tens of thousands of SKUs, faceting/synonym
   * needs beyond what tsvector handles well). This is a straightforward swap
   * later — the API surface (SearchService.search) doesn't change.
   */
  async search(query: string, page = 1, limit = 20) {
    const trimmed = query.trim();
    if (!trimmed) return { items: [], total: 0 };

    const cacheKey = `search:${trimmed}:${page}:${limit}`;
    const cached = await this.redis.getJson<any>(cacheKey);
    if (cached) return cached;

    const offset = (page - 1) * limit;

    const items = await this.prisma.$queryRaw<any[]>`
      SELECT id, name, slug, "basePrice", currency,
        ts_rank(search_vector, websearch_to_tsquery('english', ${trimmed})) AS rank,
        similarity(name, ${trimmed}) AS name_similarity
      FROM "Product"
      WHERE active = true
        AND (
          search_vector @@ websearch_to_tsquery('english', ${trimmed})
          OR similarity(name, ${trimmed}) > 0.25
        )
      ORDER BY rank DESC, name_similarity DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const [{ count }] = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*)::bigint AS count
      FROM "Product"
      WHERE active = true
        AND (
          search_vector @@ websearch_to_tsquery('english', ${trimmed})
          OR similarity(name, ${trimmed}) > 0.25
        )
    `;

    const result = { items, total: Number(count), page, limit };
    await this.redis.setJson(cacheKey, result, 60);
    return result;
  }

  /** Cheap autocomplete — prefix match on name, no ranking needed for a dropdown. */
  async autocomplete(prefix: string, limit = 8) {
    if (!prefix.trim()) return [];
    return this.prisma.product.findMany({
      where: { active: true, name: { startsWith: prefix, mode: 'insensitive' } },
      select: { name: true, slug: true },
      take: limit,
    });
  }
}
