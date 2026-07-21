import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';
import { OrdersService } from './orders.service';

const ABANDONED_AFTER_MINUTES = 30;

@Injectable()
export class OrderCleanupTask {
  private readonly logger = new Logger(OrderCleanupTask.name);

  constructor(private prisma: PrismaService, private orders: OrdersService) {}

  // A PENDING order reserves stock the moment checkout runs. If the payment
  // is never completed (closed tab, abandoned gateway page), that stock
  // would stay locked away forever without this — a slow, invisible way to
  // "sell out" of things nobody actually bought.
  @Cron(CronExpression.EVERY_10_MINUTES)
  async releaseAbandonedOrders() {
    const cutoff = new Date(Date.now() - ABANDONED_AFTER_MINUTES * 60 * 1000);
    const stale = await this.prisma.order.findMany({
      where: { status: 'PENDING', createdAt: { lt: cutoff } },
      select: { id: true },
    });

    for (const { id } of stale) {
      try {
        await this.orders.updateStatus(id, 'CANCELLED');
        this.logger.log(`Released abandoned order ${id}`);
      } catch (err) {
        this.logger.error(`Failed to release abandoned order ${id}`, err as Error);
      }
    }
  }
}
