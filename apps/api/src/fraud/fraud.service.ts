import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export interface FraudAssessment {
  score: number; // 0-100
  flags: string[]; // human-readable reasons, shown to whoever reviews it
}

const VELOCITY_WINDOW_MINUTES = 60;
const VELOCITY_THRESHOLD = 3; // orders from the same account within the window
const NEW_ACCOUNT_HOURS = 1;
const NEW_ACCOUNT_HIGH_VALUE_BDT = 10_000;
const REVIEW_THRESHOLD = 50; // score at/above this sets flaggedForReview

@Injectable()
export class FraudService {
  private readonly logger = new Logger(FraudService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Scores an order for fraud risk. This NEVER blocks checkout — it only
   * flags orders for human review (flaggedForReview on the Order). Auto-
   * blocking on a heuristic score means false positives lock out real
   * customers, which is a worse failure mode than a fraudulent order
   * occasionally slipping through to manual review. Sellers/admins act on
   * flagged orders via the dashboard.
   */
  async assess(orderId: string, userId: string, orderTotal: number): Promise<FraudAssessment> {
    const flags: string[] = [];
    let score = 0;

    const [user, recentOrders, pastOrderStats] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } }),
      this.prisma.order.count({
        where: { userId, createdAt: { gte: new Date(Date.now() - VELOCITY_WINDOW_MINUTES * 60 * 1000) } },
      }),
      this.prisma.order.aggregate({
        where: { userId, status: { in: ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'] } },
        _avg: { total: true },
        _count: true,
      }),
    ]);

    // Order velocity — a burst of orders in a short window is a common
    // pattern for card-testing or promo-abuse scripts.
    if (recentOrders >= VELOCITY_THRESHOLD) {
      score += 30;
      flags.push(`${recentOrders} orders placed within ${VELOCITY_WINDOW_MINUTES} minutes`);
    }

    // New account + high-value first order — legitimate too, but disproportionately
    // represented in chargebacks, so it's worth a second look, not a block.
    const accountAgeHours = user ? (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60) : 0;
    if (accountAgeHours < NEW_ACCOUNT_HOURS && orderTotal >= NEW_ACCOUNT_HIGH_VALUE_BDT) {
      score += 25;
      flags.push(`New account (${accountAgeHours.toFixed(1)}h old) placing a ৳${orderTotal} order`);
    }

    // Order far larger than this customer's established pattern.
    const avgPastOrder = Number(pastOrderStats._avg.total ?? 0);
    if (pastOrderStats._count >= 3 && avgPastOrder > 0 && orderTotal > avgPastOrder * 5) {
      score += 20;
      flags.push(`Order is ${(orderTotal / avgPastOrder).toFixed(1)}x this customer's average order value`);
    }

    score = Math.min(score, 100);
    return { score, flags };
  }

  async recordAssessment(orderId: string, assessment: FraudAssessment) {
    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        riskScore: assessment.score,
        riskFlags: assessment.flags,
        flaggedForReview: assessment.score >= REVIEW_THRESHOLD,
      },
    });
    if (assessment.score >= REVIEW_THRESHOLD) {
      this.logger.warn(`Order ${orderId} flagged for review (score=${assessment.score}): ${assessment.flags.join('; ')}`);
    }
  }
}
