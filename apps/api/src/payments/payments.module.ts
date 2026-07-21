import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsCallbackController } from './payments-callback.controller';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../prisma.service';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [OrdersModule],
  controllers: [PaymentsController, PaymentsCallbackController],
  providers: [PaymentsService, PrismaService],
})
export class PaymentsModule {}
