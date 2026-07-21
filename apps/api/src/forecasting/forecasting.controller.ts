import { Controller, Get, Param, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ForecastingService } from './forecasting.service';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('forecasting')
export class ForecastingController {
  constructor(private forecasting: ForecastingService) {}

  @Roles('ADMIN')
  @Get('sales')
  salesForecastAdmin() {
    return this.forecasting.salesForecast();
  }

  @Roles('SELLER')
  @Get('sales/mine')
  salesForecastSeller(@Req() req: any) {
    return this.forecasting.salesForecast(req.user.userId);
  }

  @Roles('SELLER', 'ADMIN')
  @Get('demand/:productId')
  demandForecast(@Param('productId') productId: string) {
    return this.forecasting.demandForecast(productId);
  }
}
