import { Injectable, Logger, InternalServerErrorException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createBreaker } from '../common/resilience/circuit-breaker';
import type CircuitBreaker from 'opossum';

const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings';
export const EMBEDDING_DIMENSIONS = 1024; // must match the vector(1024) column in schema.prisma

@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);
  private readonly apiKey: string;
  private readonly breaker: CircuitBreaker<[string[], 'document' | 'query'], number[][]>;

  constructor(private config: ConfigService) {
    this.apiKey = config.getOrThrow('VOYAGE_API_KEY');
    this.breaker = createBreaker(this.callVoyage.bind(this), { name: 'voyage-embeddings' });
    // Semantic search degrading to "unavailable" is much better than every
    // product page hanging for 8s (the breaker timeout) waiting on a
    // provider that's clearly down — this is exactly what the breaker is for.
    this.breaker.fallback(() => {
      throw new ServiceUnavailableException('Semantic search is temporarily unavailable');
    });
  }

  async embed(text: string, inputType: 'document' | 'query'): Promise<number[]> {
    const [vector] = await this.embedBatch([text], inputType);
    return vector;
  }

  // Batch whenever possible — embedding the whole catalog one call at a time
  // during backfill is slow and needlessly expensive.
  async embedBatch(texts: string[], inputType: 'document' | 'query'): Promise<number[][]> {
    return this.breaker.fire(texts, inputType);
  }

  private async callVoyage(texts: string[], inputType: 'document' | 'query'): Promise<number[][]> {
    const res = await fetch(VOYAGE_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: texts, model: 'voyage-3', input_type: inputType }),
    });
    if (!res.ok) {
      const body = await res.text();
      this.logger.error(`Voyage embedding request failed: ${res.status} ${body}`);
      throw new InternalServerErrorException('Embedding provider error');
    }
    const data = await res.json();
    return data.data.map((d: any) => d.embedding);
  }
}
