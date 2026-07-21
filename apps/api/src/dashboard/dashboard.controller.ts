import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { DashboardService } from './dashboard.service';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private dashboard: DashboardService) {}

  @Roles('ADMIN')
  @Get('admin')
  admin() {
    return this.dashboard.adminSummary();
  }

  @Roles('SELLER', 'ADMIN')
  @Get('seller')
  seller(@Req() req: any) {
    return this.dashboard.sellerSummary(req.user.userId);
  }
}
