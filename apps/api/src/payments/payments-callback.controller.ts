import { Body, Controller, Post, Res, HttpCode } from '@nestjs/common';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { PaymentsService } from './payments.service';

@Controller('payments/sslcommerz')
export class PaymentsCallbackController {
  constructor(private payments: PaymentsService, private config: ConfigService) {}

  // SSLCommerz calls this server-to-server — this is the source of truth for
  // marking an order paid. Must respond 200 quickly or the gateway retries.
  @Post('ipn')
  @HttpCode(200)
  async ipn(@Body() body: Record<string, string>) {
    await this.payments.handleCallback(body);
    return { received: true };
  }

  // Browser redirects — user-facing only. Also runs validation as a fast
  // path (in case IPN hasn't landed yet), but IPN remains authoritative;
  // both are idempotent so whichever arrives first wins, harmlessly.
  @Post('success')
  async success(@Body() body: Record<string, string>, @Res() res: Response) {
    const webOrigin = this.config.get('WEB_ORIGIN') ?? 'http://localhost:3000';
    try {
      const { orderId } = await this.payments.handleCallback(body);
      return res.redirect(`${webOrigin}/orders/${orderId}`);
    } catch {
      return res.redirect(`${webOrigin}/orders?paymentError=1`);
    }
  }

  @Post('fail')
  fail(@Res() res: Response) {
    const webOrigin = this.config.get('WEB_ORIGIN') ?? 'http://localhost:3000';
    return res.redirect(`${webOrigin}/cart?paymentFailed=1`);
  }

  @Post('cancel')
  cancel(@Res() res: Response) {
    const webOrigin = this.config.get('WEB_ORIGIN') ?? 'http://localhost:3000';
    return res.redirect(`${webOrigin}/cart?paymentCancelled=1`);
  }
}
