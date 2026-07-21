import { Body, Controller, Get, Param, Post, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ReviewsService } from './reviews.service';

@Controller()
export class ReviewsController {
  constructor(private reviews: ReviewsService) {}

  @Get('products/:productId/reviews')
  list(@Param('productId') productId: string) {
    return this.reviews.list(productId);
  }

  @Get('products/:productId/reviews/summary')
  summarize(@Param('productId') productId: string) {
    return this.reviews.summarize(productId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('products/:productId/reviews')
  create(
    @Req() req: any,
    @Param('productId') productId: string,
    @Body() dto: { rating: number; title?: string; body?: string },
  ) {
    return this.reviews.create(req.user.userId, productId, dto);
  }
}
