import { Module } from '@nestjs/common';
import { ForecastingController } from './forecasting.controller';
import { ForecastingService } from './forecasting.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [ForecastingController],
  providers: [ForecastingService, PrismaService],
})
export class ForecastingModule {}
