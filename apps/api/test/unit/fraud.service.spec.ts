import { FraudService } from '../../src/fraud/fraud.service';

function makePrismaMock(overrides: Partial<{ user: any; orderCount: number; avgTotal: number | null; pastOrderCount: number }>) {
  const {
    user = { createdAt: new Date('2020-01-01') }, // old account by default
    orderCount = 0,
    avgTotal = null,
    pastOrderCount = 0,
  } = overrides;

  return {
    user: { findUnique: jest.fn().mockResolvedValue(user) },
    order: {
      count: jest.fn().mockResolvedValue(orderCount),
      aggregate: jest.fn().mockResolvedValue({ _avg: { total: avgTotal }, _count: pastOrderCount }),
      update: jest.fn(),
    },
  } as any;
}

describe('FraudService', () => {
  it('scores a normal order as low-risk', async () => {
    const prisma = makePrismaMock({});
    const fraud = new FraudService(prisma);
    const result = await fraud.assess('order1', 'user1', 1500);
    expect(result.score).toBe(0);
    expect(result.flags).toEqual([]);
  });

  it('flags high order velocity', async () => {
    const prisma = makePrismaMock({ orderCount: 5 });
    const fraud = new FraudService(prisma);
    const result = await fraud.assess('order1', 'user1', 1500);
    expect(result.score).toBeGreaterThanOrEqual(30);
    expect(result.flags[0]).toMatch(/orders placed within/);
  });

  it('flags a brand-new account placing a high-value order', async () => {
    const prisma = makePrismaMock({ user: { createdAt: new Date() } });
    const fraud = new FraudService(prisma);
    const result = await fraud.assess('order1', 'user1', 15000);
    expect(result.score).toBeGreaterThanOrEqual(25);
    expect(result.flags.some((f: string) => f.includes('New account'))).toBe(true);
  });

  it('does NOT flag a new account placing a small order', async () => {
    const prisma = makePrismaMock({ user: { createdAt: new Date() } });
    const fraud = new FraudService(prisma);
    const result = await fraud.assess('order1', 'user1', 500);
    expect(result.flags.some((f: string) => f.includes('New account'))).toBe(false);
  });

  it("flags an order far above the customer's historical average", async () => {
    const prisma = makePrismaMock({ avgTotal: 1000, pastOrderCount: 5 });
    const fraud = new FraudService(prisma);
    const result = await fraud.assess('order1', 'user1', 8000); // 8x average
    expect(result.flags.some((f: string) => f.includes('average order value'))).toBe(true);
  });

  it('caps the combined score at 100 even when every rule fires', async () => {
    const prisma = makePrismaMock({ orderCount: 10, user: { createdAt: new Date() }, avgTotal: 100, pastOrderCount: 5 });
    const fraud = new FraudService(prisma);
    const result = await fraud.assess('order1', 'user1', 50000);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('recordAssessment sets flaggedForReview only at/above the review threshold', async () => {
    const prisma = makePrismaMock({});
    const fraud = new FraudService(prisma);

    await fraud.recordAssessment('order1', { score: 49, flags: [] });
    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ flaggedForReview: false }) }),
    );

    await fraud.recordAssessment('order2', { score: 50, flags: ['x'] });
    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ flaggedForReview: true }) }),
    );
  });
});
