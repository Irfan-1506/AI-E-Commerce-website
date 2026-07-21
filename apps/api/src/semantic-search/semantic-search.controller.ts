import { Controller, Get, Query } from '@nestjs/common';
import { SemanticSearchService } from './semantic-search.service';

@Controller('search/semantic')
export class SemanticSearchController {
  constructor(private semanticSearch: SemanticSearchService) {}

  @Get()
  search(@Query('q') q: string) {
    return this.semanticSearch.search(q);
  }
}
