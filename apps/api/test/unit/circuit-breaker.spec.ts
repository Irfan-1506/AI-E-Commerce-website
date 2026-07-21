import { createBreaker } from '../../src/common/resilience/circuit-breaker';

describe('createBreaker', () => {
  it('passes through successful calls normally', async () => {
    const breaker = createBreaker(async (x: number) => x * 2, { name: 'test-success' });
    expect(await breaker.fire(21)).toBe(42);
  });

  it('propagates the underlying error when the circuit is still closed', async () => {
    const breaker = createBreaker(
      async () => {
        throw new Error('boom');
      },
      { name: 'test-single-failure', errorThresholdPercentage: 90 },
    );
    await expect(breaker.fire()).rejects.toThrow('boom');
  });

  it('opens after repeated failures and starts failing fast via the fallback', async () => {
    let callCount = 0;
    const breaker = createBreaker(
      async () => {
        callCount++;
        throw new Error('provider down');
      },
      { name: 'test-opens', errorThresholdPercentage: 50, resetTimeoutMs: 10_000 },
    );
    breaker.fallback(() => 'fallback-value');

    // Enough failures to trip the breaker (rolling window default requires
    // a minimum volume — fire several times).
    for (let i = 0; i < 10; i++) {
      await breaker.fire();
    }

    expect(breaker.opened).toBe(true);

    const callsBeforeFallbackCheck = callCount;
    const result = await breaker.fire();
    // Once open, the underlying function should NOT be called again — that
    // is the entire point (failing fast instead of hitting a dead provider).
    expect(callCount).toBe(callsBeforeFallbackCheck);
    expect(result).toBe('fallback-value');
  });

  it('times out a call that takes too long, without waiting for it to naturally resolve', async () => {
    const breaker = createBreaker(
      () => new Promise((resolve) => setTimeout(() => resolve('too-late'), 5000)),
      { name: 'test-timeout', timeoutMs: 50 },
    );
    await expect(breaker.fire()).rejects.toThrow();
  }, 2000);
});
