import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AnalyticsService } from './analytics.service';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('ADMIN', 'SELLER')
@Controller('analytics')
export class AnalyticsController {
  constructor(private analytics: AnalyticsService) {}

  @Get('snapshot')
  snapshot() {
    return this.analytics.getTodaySnapshot();
  }
}
