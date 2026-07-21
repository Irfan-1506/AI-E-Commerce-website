import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async adminSummary() {
    const [orderCounts, revenue, allInventory, userCount] = await Promise.all([
      this.prisma.order.groupBy({ by: ['status'], _count: true }),
      this.prisma.order.aggregate({
        _sum: { total: true },
        where: { status: { in: ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'] } },
      }),
      // Prisma can't compare two columns (quantity vs lowStockAt) in a where
      // clause without raw SQL. Inventory rows stay small enough at this
      // stage to filter in memory; switch to $queryRaw if this table grows large.
      this.prisma.inventory.findMany({
        include: { variant: { include: { product: true } } },
      }),
      this.prisma.user.count({ where: { role: 'CUSTOMER' } }),
    ]);
    const lowStock = allInventory.filter((i) => i.quantity <= i.lowStockAt).slice(0, 50);
    return {
      ordersByStatus: Object.fromEntries(orderCounts.map((o) => [o.status, o._count])),
      totalRevenue: revenue._sum.total ?? 0,
      lowStockItems: lowStock.map((i) => ({
        product: i.variant.product.name,
        sku: i.variant.sku,
        quantity: i.quantity,
      })),
      customerCount: userCount,
    };
  }

  async sellerSummary(sellerId: string) {
    const [productCount, orderItems] = await Promise.all([
      this.prisma.product.count({ where: { sellerId } }),
      this.prisma.orderItem.findMany({
        where: { variant: { product: { sellerId } } },
        include: { order: true, variant: { include: { product: true } } },
      }),
    ]);

    const revenue = orderItems
      .filter((i) => ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'].includes(i.order.status))
      .reduce((sum, i) => sum + Number(i.unitPrice) * i.quantity, 0);

    return { productCount, unitsSold: orderItems.length, revenue };
  }
}
