import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

@Injectable()
export class CouponsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Validates a coupon and returns the discount amount for a given subtotal.
   * Must run inside the checkout transaction and atomically increment
   * usedCount there — otherwise two concurrent checkouts could both pass
   * validation on the last remaining use (same race class as inventory).
   */
  async validate(code: string, subtotal: number): Promise<{ id: string; discount: number }> {
    const coupon = await this.prisma.coupon.findUnique({ where: { code } });
    if (!coupon || !coupon.active) throw new BadRequestException('Invalid coupon code');
    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      throw new BadRequestException('Coupon has expired');
    }
    if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
      throw new BadRequestException('Coupon usage limit reached');
    }

    const value = Number(coupon.discountValue);
    const discount =
      coupon.discountType === 'PERCENT' ? Math.round(subtotal * (value / 100) * 100) / 100 : Math.min(value, subtotal);

    return { id: coupon.id, discount };
  }

  /** Atomic, conditional on maxUses — call inside the checkout $transaction. */
  async consume(tx: Prisma.TransactionClient, couponId: string, maxUses: number | null) {
    const where = maxUses === null ? { id: couponId } : { id: couponId, usedCount: { lt: maxUses } };
    const result = await tx.coupon.updateMany({ where, data: { usedCount: { increment: 1 } } });
    if (result.count === 0) throw new BadRequestException('Coupon usage limit reached');
  }

  create(dto: {
    code: string;
    discountType: 'PERCENT' | 'FIXED';
    discountValue: number;
    maxUses?: number;
    expiresAt?: string;
  }) {
    return this.prisma.coupon.create({
      data: {
        code: dto.code,
        discountType: dto.discountType,
        discountValue: dto.discountValue,
        maxUses: dto.maxUses,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      },
    });
  }

  list() {
    return this.prisma.coupon.findMany({ orderBy: { id: 'desc' } });
  }
}
