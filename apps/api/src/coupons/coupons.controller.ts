import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CouponsService } from './coupons.service';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('ADMIN')
@Controller('coupons')
export class CouponsController {
  constructor(private coupons: CouponsService) {}

  @Get()
  list() {
    return this.coupons.list();
  }

  @Post()
  create(@Body() dto: any) {
    return this.coupons.create(dto);
  }
}
