import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AnalyticsGateway } from './analytics.gateway';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AnalyticsController],
  providers: [AnalyticsGateway, AnalyticsService],
})
export class AnalyticsModule {}
