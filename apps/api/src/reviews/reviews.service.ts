import { Injectable, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { RedisService } from '../redis/redis.service';
import { AnthropicService } from '../ai/anthropic.service';

const SUMMARY_TTL_SECONDS = 60 * 60 * 24; // 24h — reviews don't change fast enough to warrant shorter
const MIN_REVIEWS_TO_SUMMARIZE = 3; // a 1-2 review "summary" isn't worth an LLM call, just show them directly

@Injectable()
export class ReviewsService {
  constructor(private prisma: PrismaService, private redis: RedisService, private anthropic: AnthropicService) {}

  async create(userId: string, productId: string, dto: { rating: number; title?: string; body?: string }) {
    if (dto.rating < 1 || dto.rating > 5) throw new BadRequestException('Rating must be 1-5');

    // Verified-purchase gate: only let people who actually received the
    // product review it. Cheap to check, meaningfully cuts down fake reviews.
    const purchased = await this.prisma.orderItem.findFirst({
      where: {
        variant: { productId },
        order: { userId, status: 'DELIVERED' },
      },
    });
    if (!purchased) throw new ForbiddenException('Only verified purchasers can review this product');

    try {
      const review = await this.prisma.review.create({
        data: { productId, userId, rating: dto.rating, title: dto.title, body: dto.body },
      });
      await this.redis.client.keys(`products:detail:*`).then((keys) => keys.length && this.redis.client.del(...keys));
      await this.redis.del(`review-summary:${productId}`);
      return review;
    } catch (e: any) {
      if (e.code === 'P2002') throw new ConflictException('You already reviewed this product');
      throw e;
    }
  }

  list(productId: string) {
    return this.prisma.review.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /**
   * Summarizes reviews into common themes (pros/cons), so a shopper doesn't
   * have to read 40 reviews to get the gist. Caches for 24h and only
   * regenerates when a new review invalidates it — an LLM call on every page
   * view would be slow and needlessly expensive for content that changes
   * rarely.
   */
  async summarize(productId: string) {
    const cacheKey = `review-summary:${productId}`;
    const cached = await this.redis.getJson<any>(cacheKey);
    if (cached) return cached;

    const reviews = await this.prisma.review.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { rating: true, title: true, body: true },
    });

    if (reviews.length < MIN_REVIEWS_TO_SUMMARIZE) {
      const result = { available: false, reviewCount: reviews.length };
      await this.redis.setJson(cacheKey, result, SUMMARY_TTL_SECONDS);
      return result;
    }

    const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
    const reviewText = reviews
      .map((r, i) => `${i + 1}. [${r.rating}/5] ${r.title ?? ''} — ${r.body ?? ''}`)
      .join('\n');

    const response = await this.anthropic.client.messages.create({
      model: this.anthropic.model,
      max_tokens: 300,
      system:
        'Summarize customer reviews into a short, honest overview for shoppers. Respond ONLY with JSON: ' +
        '{"summary": "2-3 sentence overview", "pros": ["short phrase", ...], "cons": ["short phrase", ...]}. ' +
        'Pros/cons should be things multiple reviewers actually mentioned, not invented. If reviews are mixed, say so plainly.',
      messages: [{ role: 'user', content: reviewText }],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    let parsed: { summary: string; pros: string[]; cons: string[] };
    try {
      parsed = JSON.parse((textBlock as any)?.text ?? '{}');
    } catch {
      parsed = { summary: 'Reviews are mixed — worth reading a few directly.', pros: [], cons: [] };
    }

    const result = { available: true, reviewCount: reviews.length, avgRating, ...parsed };
    await this.redis.setJson(cacheKey, result, SUMMARY_TTL_SECONDS);
    return result;
  }
}
