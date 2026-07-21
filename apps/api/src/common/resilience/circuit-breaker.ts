import { Logger } from '@nestjs/common';
import CircuitBreaker from 'opossum';

const logger = new Logger('CircuitBreaker');

export interface BreakerOptions {
  name: string;
  timeoutMs?: number;
  errorThresholdPercentage?: number;
  resetTimeoutMs?: number;
}

/**
 * Why this matters: without a circuit breaker, a slow external provider
 * (Voyage/Claude/SSLCommerz having a bad day) doesn't just make individual
 * requests slow — it lets requests pile up waiting on a dependency that
 * isn't responding, exhausting the app's connection pool / event loop
 * capacity, and taking down unrelated functionality that has nothing to do
 * with the failing provider. A breaker fails fast once a provider is
 * clearly unhealthy, protecting everything else running in the same process.
 *
 * Defaults: trip after 50% of the last 10s of requests fail, stay open for
 * 15s before testing again (half-open), 8s timeout per call. These are
 * starting points, not tuned against real production traffic — there's
 * none yet to tune against.
 */
export function createBreaker<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options: BreakerOptions,
): CircuitBreaker<TArgs, TResult> {
  const breaker = new CircuitBreaker(fn, {
    name: options.name,
    timeout: options.timeoutMs ?? 8000,
    errorThresholdPercentage: options.errorThresholdPercentage ?? 50,
    resetTimeout: options.resetTimeoutMs ?? 15000,
    rollingCountTimeout: 10000,
  });

  breaker.on('open', () => logger.warn(`Circuit OPEN for ${options.name} — failing fast, not calling the provider`));
  breaker.on('halfOpen', () => logger.log(`Circuit HALF-OPEN for ${options.name} — testing if it's recovered`));
  breaker.on('close', () => logger.log(`Circuit CLOSED for ${options.name} — provider is healthy again`));
  breaker.on('timeout', () => logger.warn(`Call to ${options.name} timed out`));

  return breaker;
}
