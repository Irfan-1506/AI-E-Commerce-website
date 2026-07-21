import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { RedisService } from '../redis/redis.service';
import { SemanticSearchService } from '../semantic-search/semantic-search.service';

const LIST_TTL = 60; // seconds — short TTL, catalog changes often enough that staleness matters
const DETAIL_TTL = 120;

@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private semanticSearch: SemanticSearchService,
  ) {}

  async list({ page, limit, category }: { page: number; limit: number; category?: string }) {
    const cacheKey = `products:list:${page}:${limit}:${category ?? 'all'}`;
    const cached = await this.redis.getJson<any>(cacheKey);
    if (cached) return cached;

    const where = category ? { active: true, category: { slug: category } } : { active: true };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: { images: true, variants: { include: { inventory: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count({ where }),
    ]);
    const result = { items, total, page, limit, pages: Math.ceil(total / limit) };
    await this.redis.setJson(cacheKey, result, LIST_TTL);
    return result;
  }

  async getBySlug(slug: string) {
    const cacheKey = `products:detail:${slug}`;
    const cached = await this.redis.getJson<any>(cacheKey);
    if (cached) return cached;

    const product = await this.prisma.product.findUnique({
      where: { slug },
      include: {
        images: true,
        variants: { include: { inventory: true } },
        reviews: { take: 20, orderBy: { createdAt: 'desc' } },
        category: true,
      },
    });
    if (!product) throw new NotFoundException('Product not found');
    await this.redis.setJson(cacheKey, product, DETAIL_TTL);
    return product;
  }

  async create(dto: any) {
    // TODO: validate dto with a proper class-validator DTO before Phase 3
    const product = await this.prisma.product.create({ data: dto });
    // Invalidate list caches so the new product shows up immediately rather
    // than waiting out the TTL — cheap because listings are short-lived anyway.
    const keys = await this.redis.client.keys('products:list:*');
    if (keys.length) await this.redis.client.del(...keys);

    // Fire-and-forget — embedding shouldn't block or fail product creation.
    // A seller creating a listing shouldn't see an error because the
    // embedding provider timed out.
    this.semanticSearch.embedProduct(product.id, product.name, product.description);

    return product;
  }
}
