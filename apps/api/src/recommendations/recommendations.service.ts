import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { RedisService } from '../redis/redis.service';

const RECENTLY_VIEWED_MAX = 20;

@Injectable()
export class RecommendationsService {
  constructor(private prisma: PrismaService, private redis: RedisService) {}

  /** Same-category products, simplest recommendation that's actually reliable pre-scale. */
  async related(productId: string, limit = 8) {
    const product = await this.prisma.product.findUnique({ where: { id: productId }, select: { categoryId: true } });
    if (!product) return [];

    return this.prisma.product.findMany({
      where: { categoryId: product.categoryId, active: true, id: { not: productId } },
      include: { images: true },
      take: limit,
    });
  }

  /**
   * "Frequently bought together" — products that co-occur with this one in
   * past orders, ranked by co-occurrence count. This is the honest v1 of a
   * recommendation engine: a real collaborative-filtering model or embedding
   * similarity search is worth building once there's enough order volume to
   * train on — with the current schema, this SQL is the whole story.
   */
  async frequentlyBoughtWith(productId: string, limit = 6) {
    const results = await this.prisma.$queryRaw<{ productId: string; coOccurrence: bigint }[]>`
      SELECT v2."productId" AS "productId", count(*)::bigint AS "coOccurrence"
      FROM "OrderItem" oi1
      JOIN "ProductVariant" v1 ON v1.id = oi1."variantId"
      JOIN "OrderItem" oi2 ON oi2."orderId" = oi1."orderId" AND oi2.id != oi1.id
      JOIN "ProductVariant" v2 ON v2.id = oi2."variantId"
      WHERE v1."productId" = ${productId} AND v2."productId" != ${productId}
      GROUP BY v2."productId"
      ORDER BY "coOccurrence" DESC
      LIMIT ${limit}
    `;
    if (results.length === 0) return [];

    const products = await this.prisma.product.findMany({
      where: { id: { in: results.map((r) => r.productId) } },
      include: { images: true },
    });
    // Preserve the co-occurrence ranking — findMany's `in` doesn't guarantee order.
    const order = new Map<string, number>(results.map((r, i) => [r.productId, i]));
    return products.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }

  async recordView(userId: string, productId: string) {
    const key = `recently-viewed:${userId}`;
    // LREM + LPUSH: move to front if already viewed, rather than duplicating.
    await this.redis.client.lrem(key, 0, productId);
    await this.redis.client.lpush(key, productId);
    await this.redis.client.ltrim(key, 0, RECENTLY_VIEWED_MAX - 1);
    await this.redis.client.expire(key, 60 * 60 * 24 * 30); // 30 days
  }

  async recentlyViewed(userId: string, limit = 10) {
    const ids = await this.redis.client.lrange(`recently-viewed:${userId}`, 0, limit - 1);
    if (ids.length === 0) return [];

    const products = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      include: { images: true },
    });
    const order = new Map(ids.map((id, i) => [id, i]));
    return products.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }
}
