import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

@Injectable()
export class AnthropicService {
  private readonly logger = new Logger(AnthropicService.name);
  readonly client: Anthropic;
  readonly model = 'claude-sonnet-4-6'; // pin explicitly — don't silently ride a moving "latest" alias in production

  constructor(config: ConfigService) {
    this.client = new Anthropic({ apiKey: config.getOrThrow('ANTHROPIC_API_KEY') });
  }
}
