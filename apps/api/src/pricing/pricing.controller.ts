import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { PricingService } from './pricing.service';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('SELLER')
@Controller('pricing/suggestions')
export class PricingController {
  constructor(private pricing: PricingService) {}

  @Get()
  suggestions(@Req() req: any) {
    return this.pricing.suggestForSeller(req.user.userId);
  }
}
