import { FeatureFlagsService } from '../../src/feature-flags/feature-flags.service';

function makeRedisMock(flags: Record<string, any>) {
  return {
    client: {
      get: jest.fn((key: string) => Promise.resolve(flags[key] ? JSON.stringify(flags[key]) : null)),
    },
  } as any;
}

describe('FeatureFlagsService.isEnabledForUser', () => {
  it('returns false when the flag does not exist', async () => {
    const service = new FeatureFlagsService(makeRedisMock({}));
    expect(await service.isEnabledForUser('nope', 'user1')).toBe(false);
  });

  it('returns false when disabled regardless of rollout percentage', async () => {
    const service = new FeatureFlagsService(
      makeRedisMock({ 'feature-flag:x': { key: 'x', enabled: false, rolloutPercentage: 100 } }),
    );
    expect(await service.isEnabledForUser('x', 'user1')).toBe(false);
  });

  it('returns true for everyone at 100%', async () => {
    const service = new FeatureFlagsService(
      makeRedisMock({ 'feature-flag:x': { key: 'x', enabled: true, rolloutPercentage: 100 } }),
    );
    for (const u of ['a', 'b', 'c', 'd']) {
      expect(await service.isEnabledForUser('x', u)).toBe(true);
    }
  });

  it('returns false for everyone at 0%', async () => {
    const service = new FeatureFlagsService(
      makeRedisMock({ 'feature-flag:x': { key: 'x', enabled: true, rolloutPercentage: 0 } }),
    );
    for (const u of ['a', 'b', 'c', 'd']) {
      expect(await service.isEnabledForUser('x', u)).toBe(false);
    }
  });

  it('is deterministic — the same user+flag always resolves the same way', async () => {
    const service = new FeatureFlagsService(
      makeRedisMock({ 'feature-flag:x': { key: 'x', enabled: true, rolloutPercentage: 50 } }),
    );
    const first = await service.isEnabledForUser('x', 'stable-user-42');
    for (let i = 0; i < 10; i++) {
      expect(await service.isEnabledForUser('x', 'stable-user-42')).toBe(first);
    }
  });

  it('roughly distributes users across a 50% rollout (not all-or-nothing)', async () => {
    const service = new FeatureFlagsService(
      makeRedisMock({ 'feature-flag:x': { key: 'x', enabled: true, rolloutPercentage: 50 } }),
    );
    let enabledCount = 0;
    const SAMPLE = 500;
    for (let i = 0; i < SAMPLE; i++) {
      if (await service.isEnabledForUser('x', `user-${i}`)) enabledCount++;
    }
    // Not asserting exactly 50% — hash distribution has natural variance —
    // just that it's neither ~0% nor ~100%, which would indicate the
    // bucketing math is broken (e.g. always truncating to the same bucket).
    expect(enabledCount).toBeGreaterThan(SAMPLE * 0.35);
    expect(enabledCount).toBeLessThan(SAMPLE * 0.65);
  });
});
