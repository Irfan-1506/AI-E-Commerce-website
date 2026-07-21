import { BadRequestException } from '@nestjs/common';
import { InventoryService } from '../../src/inventory/inventory.service';

function makeTxMock(updateManyResult: { count: number }) {
  return { inventory: { updateMany: jest.fn().mockResolvedValue(updateManyResult) } } as any;
}

// checkLowStock() is fire-and-forget and queries prisma directly (not the
// tx) — give it a harmless prisma mock so it doesn't throw unhandled
// rejections during these tests. It's not what's under test here; the
// atomicity of reserve/release/commit is (see the event-publishing test at
// the bottom for low-stock behavior specifically).
function makePrismaMock() {
  return { inventory: { findUnique: jest.fn().mockResolvedValue(null) } } as any;
}
function makeEventsMock() {
  return { publish: jest.fn().mockResolvedValue(undefined) } as any;
}

describe('InventoryService', () => {
  it('reserve() succeeds when the conditional update matches a row', async () => {
    const tx = makeTxMock({ count: 1 });
    const service = new InventoryService(makePrismaMock(), makeEventsMock());
    await expect(service.reserve(tx, 'variant1', 2)).resolves.toBeUndefined();
    // The where clause is the whole mechanism: quantity >= qty, checked and
    // decremented atomically in one statement rather than read-then-write.
    expect(tx.inventory.updateMany).toHaveBeenCalledWith({
      where: { variantId: 'variant1', quantity: { gte: 2 } },
      data: { quantity: { decrement: 2 }, reserved: { increment: 2 } },
    });
  });

  it('reserve() throws when the conditional update matches zero rows (insufficient stock)', async () => {
    const tx = makeTxMock({ count: 0 });
    const service = new InventoryService(makePrismaMock(), makeEventsMock());
    await expect(service.reserve(tx, 'variant1', 100)).rejects.toThrow(BadRequestException);
  });

  it('release() moves quantity back and decrements reserved', async () => {
    const tx = makeTxMock({ count: 1 });
    const service = new InventoryService(makePrismaMock(), makeEventsMock());
    await service.release(tx, 'variant1', 3);
    expect(tx.inventory.updateMany).toHaveBeenCalledWith({
      where: { variantId: 'variant1' },
      data: { quantity: { increment: 3 }, reserved: { decrement: 3 } },
    });
  });

  it('commit() only decrements reserved, never touches quantity (already deducted at reserve time)', async () => {
    const tx = makeTxMock({ count: 1 });
    const service = new InventoryService(makePrismaMock(), makeEventsMock());
    await service.commit(tx, 'variant1', 3);
    expect(tx.inventory.updateMany).toHaveBeenCalledWith({
      where: { variantId: 'variant1' },
      data: { reserved: { decrement: 3 } },
    });
  });

  it('publishes inventory.low_stock when a reservation drops quantity at/below the threshold', async () => {
    const tx = makeTxMock({ count: 1 });
    const prisma = {
      inventory: {
        findUnique: jest.fn().mockResolvedValue({
          quantity: 2,
          lowStockAt: 5,
          variant: { sku: 'SKU-1', product: { name: 'Test Product' } },
        }),
      },
    } as any;
    const events = makeEventsMock();
    const service = new InventoryService(prisma, events);

    await service.reserve(tx, 'variant1', 1);
    await new Promise((r) => setImmediate(r)); // let the fire-and-forget low-stock check resolve

    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'inventory.low_stock', sku: 'SKU-1', quantity: 2 }),
    );
  });

  it('does NOT publish low_stock when quantity is comfortably above the threshold', async () => {
    const tx = makeTxMock({ count: 1 });
    const prisma = {
      inventory: {
        findUnique: jest.fn().mockResolvedValue({
          quantity: 50,
          lowStockAt: 5,
          variant: { sku: 'SKU-1', product: { name: 'Test Product' } },
        }),
      },
    } as any;
    const events = makeEventsMock();
    const service = new InventoryService(prisma, events);

    await service.reserve(tx, 'variant1', 1);
    await new Promise((r) => setImmediate(r));

    expect(events.publish).not.toHaveBeenCalled();
  });
});
