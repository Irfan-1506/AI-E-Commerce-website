import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { WishlistService } from './wishlist.service';

@UseGuards(AuthGuard('jwt'))
@Controller('wishlist')
export class WishlistController {
  constructor(private wishlist: WishlistService) {}

  @Get()
  get(@Req() req: any) {
    return this.wishlist.get(req.user.userId);
  }

  @Post('toggle')
  toggle(@Req() req: any, @Body('productId') productId: string) {
    return this.wishlist.toggle(req.user.userId, productId);
  }
}
