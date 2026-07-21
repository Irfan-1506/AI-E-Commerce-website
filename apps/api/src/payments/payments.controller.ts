import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PaymentsService } from './payments.service';

// Versioned like everything else — only our own authenticated frontend
// calls this, so there's no external gateway configuration depending on
// its exact URL the way there is for the callback endpoints below.
@Controller('payments/sslcommerz')
export class PaymentsController {
  constructor(private payments: PaymentsService) {}

  @UseGuards(AuthGuard('jwt'))
  @Post('init')
  init(@Req() req: any, @Body('orderId') orderId: string) {
    return this.payments.initSession(orderId, req.user.userId);
  }
}
