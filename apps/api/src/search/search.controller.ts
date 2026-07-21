import { Controller, Get, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SearchService } from './search.service';

@Controller('search')
export class SearchController {
  constructor(private searchService: SearchService) {}

  @Get()
  search(@Query('q') q: string, @Query('page') page = '1') {
    return this.searchService.search(q, Number(page));
  }

  @Get('autocomplete')
  @Throttle({ default: { limit: 30, ttl: 10_000 } }) // keystroke-triggered — needs its own headroom above the global limit
  autocomplete(@Query('q') q: string) {
    return this.searchService.autocomplete(q);
  }
}
