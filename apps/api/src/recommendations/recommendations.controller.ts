import { Controller, Get, Post, Param, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RecommendationsService } from './recommendations.service';

@Controller()
export class RecommendationsController {
  constructor(private recs: RecommendationsService) {}

  @Get('products/:productId/related')
  related(@Param('productId') productId: string) {
    return this.recs.related(productId);
  }

  @Get('products/:productId/frequently-bought-with')
  frequentlyBoughtWith(@Param('productId') productId: string) {
    return this.recs.frequentlyBoughtWith(productId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('products/:productId/view')
  recordView(@Req() req: any, @Param('productId') productId: string) {
    return this.recs.recordView(req.user.userId, productId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('recently-viewed')
  recentlyViewed(@Req() req: any) {
    return this.recs.recentlyViewed(req.user.userId);
  }
}
