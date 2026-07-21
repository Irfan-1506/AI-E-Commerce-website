import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CategoriesService } from './categories.service';

@Controller('categories')
export class CategoriesController {
  constructor(private categories: CategoriesService) {}

  @Get()
  tree() {
    return this.categories.tree();
  }

  @Get(':slug')
  getBySlug(@Param('slug') slug: string) {
    return this.categories.getBySlug(slug);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  @Post()
  create(@Body() dto: { name: string; slug: string; parentId?: string }) {
    return this.categories.create(dto);
  }
}
