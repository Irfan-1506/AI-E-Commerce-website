import { Body, Controller, Delete, Get, Param, Post, Patch, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CartService } from './cart.service';

@UseGuards(AuthGuard('jwt'))
@Controller('cart')
export class CartController {
  constructor(private cart: CartService) {}

  @Get()
  get(@Req() req: any) {
    return this.cart.get(req.user.userId);
  }

  @Post('items')
  add(@Req() req: any, @Body() dto: { variantId: string; quantity: number }) {
    return this.cart.addItem(req.user.userId, dto.variantId, dto.quantity);
  }

  @Patch('items/:variantId')
  update(@Req() req: any, @Param('variantId') variantId: string, @Body('quantity') quantity: number) {
    return this.cart.updateQuantity(req.user.userId, variantId, quantity);
  }

  @Delete('items/:variantId')
  remove(@Req() req: any, @Param('variantId') variantId: string) {
    return this.cart.removeItem(req.user.userId, variantId);
  }

  @Delete()
  clear(@Req() req: any) {
    return this.cart.clear(req.user.userId);
  }
}
