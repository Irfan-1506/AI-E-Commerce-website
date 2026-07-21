import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

const LOOKBACK_DAYS = 30;

export interface PricingSuggestion {
  variantId: string;
  sku: string;
  currentPrice: number;
  suggestedPrice: number;
  changePercent: number;
  rationale: string;
}

@Injectable()
export class PricingService {
  constructor(private prisma: PrismaService) {}

  /**
   * Suggests price adjustments from sell-through velocity vs. stock on hand
   * — a deliberately simple, explainable heuristic rather than an LLM or ML
   * model. A price change is a direct, immediate revenue action; it needs a
   * reason a seller can sanity-check in one sentence, not a black-box
   * number. This never writes to Product.basePrice — sellers apply
   * suggestions manually via the existing product update flow.
   */
  async suggestForSeller(sellerId: string): Promise<PricingSuggestion[]> {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

    const variants = await this.prisma.productVariant.findMany({
      where: { product: { sellerId, active: true } },
      include: {
        inventory: true,
        product: { select: { name: true } },
        orderItems: {
          where: { order: { createdAt: { gte: since }, status: { in: ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'] } } },
        },
      },
    });

    const suggestions: PricingSuggestion[] = [];

    for (const v of variants) {
      if (!v.inventory) continue;
      const unitsSold = v.orderItems.reduce((sum, i) => sum + i.quantity, 0);
      const stockOnHand = v.inventory.quantity;
      const currentPrice = Number(v.price);
      const dailyVelocity = unitsSold / LOOKBACK_DAYS;
      const daysOfStockLeft = dailyVelocity > 0 ? stockOnHand / dailyVelocity : Infinity;

      let changePercent = 0;
      let rationale = '';

      if (dailyVelocity > 0 && daysOfStockLeft < 7) {
        // Selling fast enough to sell out within a week — demand is
        // outrunning supply, a small price increase captures margin
        // without killing volume.
        changePercent = 8;
        rationale = `Selling ~${dailyVelocity.toFixed(1)}/day, only ${daysOfStockLeft.toFixed(0)} days of stock left at this rate`;
      } else if (stockOnHand > 0 && unitsSold === 0) {
        // Zero sales in the lookback window — either overpriced or just not
        // moving. Suggest a modest discount to test demand, not a fire sale.
        changePercent = -10;
        rationale = `No units sold in ${LOOKBACK_DAYS} days with ${stockOnHand} in stock`;
      } else if (dailyVelocity > 0 && daysOfStockLeft > 90) {
        changePercent = -5;
        rationale = `At current sales pace (~${dailyVelocity.toFixed(2)}/day), stock will last ${Math.round(daysOfStockLeft)} days — a small discount could accelerate turnover`;
      }

      if (changePercent !== 0) {
        const suggestedPrice = Math.round(currentPrice * (1 + changePercent / 100) * 100) / 100;
        suggestions.push({
          variantId: v.id,
          sku: v.sku,
          currentPrice,
          suggestedPrice,
          changePercent,
          rationale,
        });
      }
    }

    return suggestions;
  }
}
