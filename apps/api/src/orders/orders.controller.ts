import { Body, Controller, Get, Param, Post, Patch, Query, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { OrderStatus } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { OrdersService } from './orders.service';

@UseGuards(AuthGuard('jwt'))
@Controller('orders')
export class OrdersController {
  constructor(private orders: OrdersService) {}

  @Post('checkout')
  checkout(@Req() req: any, @Body('couponCode') couponCode?: string) {
    return this.orders.checkout(req.user.userId, couponCode);
  }

  @Get('mine')
  mine(@Req() req: any) {
    return this.orders.listMine(req.user.userId);
  }

  @Get(':id')
  getOne(@Req() req: any, @Param('id') id: string) {
    return this.orders.getById(id, req.user);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SELLER')
  @Get()
  listAll(@Query('status') status?: OrderStatus) {
    return this.orders.listAll(status);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SELLER')
  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body('status') status: OrderStatus) {
    return this.orders.updateStatus(id, status);
  }
}
