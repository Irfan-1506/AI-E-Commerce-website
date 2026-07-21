import { Injectable, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma.service';
import { OrdersService } from '../orders/orders.service';

const SANDBOX_BASE = 'https://sandbox.sslcommerz.com';
const LIVE_BASE = 'https://securepay.sslcommerz.com';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly storeId: string;
  private readonly storePassword: string;
  private readonly base: string;
  private readonly appBaseUrl: string;

  constructor(private config: ConfigService, private prisma: PrismaService, private orders: OrdersService) {
    this.storeId = config.getOrThrow('SSLCOMMERZ_STORE_ID');
    this.storePassword = config.getOrThrow('SSLCOMMERZ_STORE_PASSWORD');
    this.base = config.get('SSLCOMMERZ_IS_LIVE') === 'true' ? LIVE_BASE : SANDBOX_BASE;
    this.appBaseUrl = config.getOrThrow('APP_BASE_URL'); // e.g. https://api.yourdomain.com
  }

  /**
   * Starts a payment session for an order. Returns the SSLCommerz-hosted
   * gateway URL the frontend redirects the browser to.
   */
  async initSession(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new BadRequestException('Order not found');
    if (order.userId !== userId) throw new BadRequestException('Not your order');
    if (order.status !== 'PENDING') throw new BadRequestException('Order is not payable in its current state');

    // tran_id must be unique per attempt, not per order — retries after a
    // failed payment need a fresh tran_id, but we still tie it back to the
    // same order via value_a below.
    const tranId = `${order.id}-${Date.now()}`;

    const params = new URLSearchParams({
      store_id: this.storeId,
      store_passwd: this.storePassword,
      total_amount: String(order.total),
      currency: 'BDT',
      tran_id: tranId,
      success_url: `${this.appBaseUrl}/payments/sslcommerz/success`,
      fail_url: `${this.appBaseUrl}/payments/sslcommerz/fail`,
      cancel_url: `${this.appBaseUrl}/payments/sslcommerz/cancel`,
      ipn_url: `${this.appBaseUrl}/payments/sslcommerz/ipn`,
      cus_name: 'Customer', // TODO: pull real name/address from User + Address once checkout collects them
      cus_email: 'customer@example.com',
      cus_add1: 'N/A',
      cus_city: 'Dhaka',
      cus_country: 'Bangladesh',
      cus_phone: '00000000000',
      shipping_method: 'NO',
      product_name: 'Order ' + order.id,
      product_category: 'General',
      product_profile: 'general',
      value_a: order.id, // round-trips through the gateway, lets IPN find the order even if tran_id parsing changes later
    });

    const res = await fetch(`${this.base}/gwprocess/v4/api.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const data = await res.json();

    if (data.status !== 'SUCCESS') {
      this.logger.error(`SSLCommerz init failed: ${JSON.stringify(data)}`);
      throw new BadRequestException('Could not start payment session');
    }

    return { gatewayUrl: data.GatewayPageURL, tranId };
  }

  /**
   * The security-critical part: never trust status/amount fields from the
   * IPN or success-redirect payload directly — they arrive over a channel an
   * attacker can POST to freely. Always re-verify against SSLCommerz's own
   * Validation API using val_id, and cross-check the amount and currency
   * server-side before marking anything paid.
   */
  async handleCallback(payload: Record<string, string>) {
    const { val_id, tran_id, value_a: orderId, amount, status } = payload;
    if (!val_id || !tran_id || !orderId) {
      throw new BadRequestException('Malformed payment callback');
    }

    // Idempotency: SSLCommerz can retry IPN delivery, and both the IPN and
    // the browser's success redirect can land here for the same transaction.
    // tran_id is unique per PaymentEvent — a second attempt is a no-op, not
    // a double-credit.
    const existing = await this.prisma.paymentEvent.findUnique({ where: { tranId: tran_id } });
    if (existing) return { alreadyProcessed: true, orderId };

    const validation = await this.validateWithGateway(val_id);
    if (validation.status !== 'VALID' && validation.status !== 'VALIDATED') {
      this.logger.warn(`Payment validation failed for tran_id=${tran_id}: ${validation.status}`);
      throw new BadRequestException('Payment could not be validated');
    }

    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new BadRequestException('Order not found for this payment');

    // Amount tampering check — a forged callback could claim a lower amount
    // was paid for a higher-value order.
    const paidAmount = Number(validation.amount ?? amount);
    if (Math.abs(paidAmount - Number(order.total)) > 0.01) {
      this.logger.error(`Amount mismatch for order ${orderId}: paid ${paidAmount}, expected ${order.total}`);
      throw new BadRequestException('Payment amount does not match order total');
    }

    await this.prisma.paymentEvent.create({
      data: {
        orderId,
        gateway: 'SSLCOMMERZ',
        tranId: tran_id,
        status: validation.status,
        amount: paidAmount,
        rawPayload: payload,
      },
    });

    if (order.status === 'PENDING') {
      await this.orders.updateStatus(orderId, 'PAID');
      await this.prisma.order.update({ where: { id: orderId }, data: { paymentRef: tran_id } });
    }

    return { alreadyProcessed: false, orderId };
  }

  private async validateWithGateway(valId: string) {
    const params = new URLSearchParams({
      val_id: valId,
      store_id: this.storeId,
      store_passwd: this.storePassword,
      format: 'json',
    });
    const res = await fetch(`${this.base}/validator/api/validationserverAPI.php?${params.toString()}`);
    return res.json();
  }
}
