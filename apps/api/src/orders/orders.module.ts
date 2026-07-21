import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrderCleanupTask } from './order-cleanup.task';
import { PrismaService } from '../prisma.service';
import { InventoryModule } from '../inventory/inventory.module';
import { CouponsModule } from '../coupons/coupons.module';
import { FraudModule } from '../fraud/fraud.module';

@Module({
  imports: [InventoryModule, CouponsModule, FraudModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrderCleanupTask, PrismaService],
  exports: [OrdersService],
})
export class OrdersModule {}
