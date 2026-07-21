import { Injectable, BadRequestException, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { CouponsService } from '../coupons/coupons.service';
import { FraudService } from '../fraud/fraud.service';
import { EventsService } from '../events/events.service';
import { canTransition, RELEASES_INVENTORY, COMMITS_INVENTORY } from './order-state-machine';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private prisma: PrismaService,
    private inventory: InventoryService,
    private coupons: CouponsService,
    private fraud: FraudService,
    private events: EventsService,
  ) {}

  /**
   * Checkout: cart -> order, all-or-nothing.
   *
   * Everything happens in one Prisma transaction: read cart, reserve stock
   * per line item, validate + consume coupon, create the order, clear the
   * cart. If any line item is out of stock, the whole transaction rolls
   * back — no partial orders, no stuck reservations from earlier items in
   * the same checkout.
   */
  async checkout(userId: string, couponCode?: string) {
    return this.prisma.$transaction(async (tx) => {
      const cart = await tx.cart.findUnique({
        where: { userId },
        include: { items: { include: { variant: true } } },
      });
      if (!cart || cart.items.length === 0) throw new BadRequestException('Cart is empty');

      let subtotal = 0;
      for (const item of cart.items) {
        subtotal += Number(item.variant.price) * item.quantity;
      }

      let discount = 0;
      let couponId: string | undefined;
      if (couponCode) {
        const result = await this.coupons.validate(couponCode, subtotal);
        discount = result.discount;
        couponId = result.id;
      }

      // Reserve stock for every line item before creating the order. If any
      // one fails, the transaction throws and everything reserved so far in
      // this same transaction is rolled back automatically by Prisma.
      for (const item of cart.items) {
        await this.inventory.reserve(tx, item.variantId, item.quantity);
      }

      if (couponId) {
        const coupon = await tx.coupon.findUniqueOrThrow({ where: { id: couponId } });
        await this.coupons.consume(tx, couponId, coupon.maxUses);
      }

      const shippingFee = subtotal >= 2000 ? 0 : 60; // flat BD courier rate, free over ৳2000 — tune later
      const total = Math.max(subtotal - discount + shippingFee, 0);

      const order = await tx.order.create({
        data: {
          userId,
          status: 'PENDING',
          subtotal,
          discount,
          shippingFee,
          total,
          couponCode,
          statusHistory: [{ status: 'PENDING', at: new Date().toISOString() }],
          items: {
            create: cart.items.map((item) => ({
              variantId: item.variantId,
              quantity: item.quantity,
              unitPrice: item.variant.price,
            })),
          },
        },
        include: { items: true },
      });

      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

      return order;
    }).then(async (order) => {
      // Fraud scoring runs after the transaction commits — it only reads
      // history and writes a flag, so there's no reason to hold the
      // checkout transaction (and its inventory locks) open for it. A
      // flagged order is still a normal PENDING order; nothing here blocks
      // the purchase.
      try {
        const assessment = await this.fraud.assess(order.id, userId, Number(order.total));
        await this.fraud.recordAssessment(order.id, assessment);
      } catch (err) {
        this.logger.error(`Fraud assessment failed for order ${order.id}`, err as Error);
      }

      await this.events.publish({
        type: 'order.created',
        orderId: order.id,
        userId,
        total: Number(order.total),
        itemCount: order.items.length,
        at: new Date().toISOString(),
      });

      return order;
    });
  }

  async getById(orderId: string, requester: { userId: string; role: string }) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { variant: { include: { product: true } } } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    // Customers can only see their own orders; sellers/admins handle authorization
    // at a coarser level for now (full seller-scoped order view is a Phase-3.5 nicety).
    if (requester.role === 'CUSTOMER' && order.userId !== requester.userId) {
      throw new ForbiddenException();
    }
    return order;
  }

  listMine(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  listAll(status?: OrderStatus) {
    return this.prisma.order.findMany({
      where: status ? { status } : undefined,
      include: { items: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  /** Admin/seller transition — e.g. PENDING -> PAID on payment webhook, -> SHIPPED on fulfillment. */
  async updateStatus(orderId: string, newStatus: OrderStatus) {
    const previousStatus = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
      if (!order) throw new NotFoundException('Order not found');

      if (!canTransition(order.status, newStatus)) {
        throw new BadRequestException(`Cannot transition order from ${order.status} to ${newStatus}`);
      }

      if (RELEASES_INVENTORY.includes(newStatus)) {
        for (const item of order.items) {
          await this.inventory.release(tx, item.variantId, item.quantity);
        }
      }
      if (COMMITS_INVENTORY.includes(newStatus)) {
        for (const item of order.items) {
          await this.inventory.commit(tx, item.variantId, item.quantity);
        }
      }

      const history = Array.isArray(order.statusHistory) ? (order.statusHistory as any[]) : [];
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: newStatus,
          statusHistory: [...history, { status: newStatus, at: new Date().toISOString() }],
        },
      });

      return order.status; // pre-transition status, captured before the update above
    });

    await this.events.publish({
      type: 'order.status_changed',
      orderId,
      from: previousStatus,
      to: newStatus,
      at: new Date().toISOString(),
    });

    return this.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  }
}
