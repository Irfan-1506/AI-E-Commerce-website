import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Prisma } from '@prisma/client';
import { EventsService } from '../events/events.service';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService, private events: EventsService) {}

  /**
   * Atomically reserve stock for a variant. Uses a conditional updateMany
   * (quantity >= requested) rather than read-then-write — that's the part
   * that actually prevents overselling under concurrent checkouts. A plain
   * "read quantity, check in app code, then decrement" has a race window
   * where two requests both read qty=1 and both proceed.
   *
   * Must be called inside a Prisma $transaction alongside order creation so
   * a reservation never survives an order that failed to create.
   */
  async reserve(tx: Prisma.TransactionClient, variantId: string, qty: number) {
    const result = await tx.inventory.updateMany({
      where: { variantId, quantity: { gte: qty } },
      data: { quantity: { decrement: qty }, reserved: { increment: qty } },
    });
    if (result.count === 0) {
      throw new BadRequestException(`Insufficient stock for variant ${variantId}`);
    }

    // Fire-and-forget low-stock check — reads the post-decrement row and
    // alerts if it just crossed the threshold. Not awaited: this is a
    // notification side effect, not part of the correctness-critical path
    // above, and shouldn't add latency to checkout.
    this.checkLowStock(variantId).catch(() => {});
  }

  private async checkLowStock(variantId: string) {
    const inventory = await this.prisma.inventory.findUnique({
      where: { variantId },
      include: { variant: { include: { product: true } } },
    });
    if (inventory && inventory.quantity <= inventory.lowStockAt) {
      await this.events.publish({
        type: 'inventory.low_stock',
        variantId,
        productName: inventory.variant.product.name,
        sku: inventory.variant.sku,
        quantity: inventory.quantity,
        at: new Date().toISOString(),
      });
    }
  }

  /** Release a reservation back to available stock — order cancelled/failed before shipping. */
  async release(tx: Prisma.TransactionClient, variantId: string, qty: number) {
    await tx.inventory.updateMany({
      where: { variantId },
      data: { quantity: { increment: qty }, reserved: { decrement: qty } },
    });
  }

  /** Commit a reservation — order shipped/fulfilled, stock is permanently gone. */
  async commit(tx: Prisma.TransactionClient, variantId: string, qty: number) {
    await tx.inventory.updateMany({
      where: { variantId },
      data: { reserved: { decrement: qty } },
    });
  }
}
