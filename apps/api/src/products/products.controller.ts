import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private products: ProductsService) {}

  // Public — anyone can browse the catalog
  @Get()
  list(@Query('page') page = '1', @Query('limit') limit = '20', @Query('category') category?: string) {
    return this.products.list({ page: Number(page), limit: Math.min(Number(limit), 100), category });
  }

  @Get(':slug')
  getOne(@Param('slug') slug: string) {
    return this.products.getBySlug(slug);
  }

  // Protected — only sellers and admins can create listings
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SELLER', 'ADMIN')
  @Post()
  create(@Body() dto: any) {
    return this.products.create(dto);
  }
}
