import { Global, Module } from '@nestjs/common';
import { AnthropicService } from './anthropic.service';
import { EmbeddingsService } from './embeddings.service';

@Global()
@Module({
  providers: [AnthropicService, EmbeddingsService],
  exports: [AnthropicService, EmbeddingsService],
})
export class AiModule {}
