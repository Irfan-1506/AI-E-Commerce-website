import { BadRequestException } from '@nestjs/common';
import { CouponsService } from '../../src/coupons/coupons.service';

function makePrismaMock(coupon: any) {
  return { coupon: { findUnique: jest.fn().mockResolvedValue(coupon) } } as any;
}

describe('CouponsService.validate', () => {
  it('rejects an unknown code', async () => {
    const service = new CouponsService(makePrismaMock(null));
    await expect(service.validate('NOPE', 1000)).rejects.toThrow(BadRequestException);
  });

  it('rejects an inactive coupon', async () => {
    const service = new CouponsService(makePrismaMock({ active: false }));
    await expect(service.validate('OFF', 1000)).rejects.toThrow(BadRequestException);
  });

  it('rejects an expired coupon', async () => {
    const service = new CouponsService(
      makePrismaMock({ active: true, expiresAt: new Date('2000-01-01'), maxUses: null, usedCount: 0 }),
    );
    await expect(service.validate('OLD', 1000)).rejects.toThrow(BadRequestException);
  });

  it('rejects a coupon at its usage limit', async () => {
    const service = new CouponsService(
      makePrismaMock({ active: true, expiresAt: null, maxUses: 5, usedCount: 5, discountType: 'FIXED', discountValue: 100 }),
    );
    await expect(service.validate('MAXED', 1000)).rejects.toThrow(BadRequestException);
  });

  it('computes a percent discount correctly', async () => {
    const service = new CouponsService(
      makePrismaMock({ id: 'c1', active: true, expiresAt: null, maxUses: null, usedCount: 0, discountType: 'PERCENT', discountValue: 10 }),
    );
    const result = await service.validate('TEN', 1000);
    expect(result.discount).toBe(100);
  });

  it('caps a fixed discount at the subtotal — never a negative order total', async () => {
    const service = new CouponsService(
      makePrismaMock({ id: 'c1', active: true, expiresAt: null, maxUses: null, usedCount: 0, discountType: 'FIXED', discountValue: 5000 }),
    );
    const result = await service.validate('BIG', 1000);
    expect(result.discount).toBe(1000); // not 5000
  });
});

describe('CouponsService.consume', () => {
  it('is a no-op success when maxUses is null (unlimited)', async () => {
    const tx = { coupon: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } } as any;
    const service = new CouponsService({} as any);
    await expect(service.consume(tx, 'c1', null)).resolves.toBeUndefined();
    expect(tx.coupon.updateMany).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { usedCount: { increment: 1 } } });
  });

  it('throws when the conditional update matches zero rows (limit hit concurrently)', async () => {
    const tx = { coupon: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) } } as any;
    const service = new CouponsService({} as any);
    await expect(service.consume(tx, 'c1', 5)).rejects.toThrow(BadRequestException);
  });
});
