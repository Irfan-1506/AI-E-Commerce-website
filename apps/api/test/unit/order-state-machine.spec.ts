import { canTransition, ORDER_TRANSITIONS, RELEASES_INVENTORY, COMMITS_INVENTORY } from '../../src/orders/order-state-machine';
import { OrderStatus } from '@prisma/client';

describe('order-state-machine', () => {
  it('allows the standard happy path', () => {
    expect(canTransition('PENDING', 'PAID')).toBe(true);
    expect(canTransition('PAID', 'PROCESSING')).toBe(true);
    expect(canTransition('PROCESSING', 'SHIPPED')).toBe(true);
    expect(canTransition('SHIPPED', 'DELIVERED')).toBe(true);
  });

  it('allows cancellation from PENDING and PAID, but not later', () => {
    expect(canTransition('PENDING', 'CANCELLED')).toBe(true);
    expect(canTransition('PAID', 'CANCELLED')).toBe(true);
    expect(canTransition('PROCESSING', 'CANCELLED')).toBe(true);
    expect(canTransition('SHIPPED', 'CANCELLED')).toBe(false);
    expect(canTransition('DELIVERED', 'CANCELLED')).toBe(false);
  });

  it('rejects skipping states', () => {
    expect(canTransition('PENDING', 'SHIPPED')).toBe(false);
    expect(canTransition('PENDING', 'DELIVERED')).toBe(false);
    expect(canTransition('PAID', 'DELIVERED')).toBe(false);
  });

  it('rejects any transition out of terminal states', () => {
    expect(ORDER_TRANSITIONS.CANCELLED).toEqual([]);
    expect(ORDER_TRANSITIONS.REFUNDED).toEqual([]);
    const allStatuses: OrderStatus[] = ['PENDING', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'];
    for (const to of allStatuses) {
      expect(canTransition('CANCELLED', to)).toBe(false);
      expect(canTransition('REFUNDED', to)).toBe(false);
    }
  });

  it('rejects transitioning to the same state (not in any transition list)', () => {
    expect(canTransition('PENDING', 'PENDING')).toBe(false);
  });

  it('releases inventory exactly on CANCELLED and REFUNDED, nowhere else', () => {
    expect(RELEASES_INVENTORY.sort()).toEqual(['CANCELLED', 'REFUNDED'].sort());
  });

  it('commits inventory exactly on DELIVERED', () => {
    expect(COMMITS_INVENTORY).toEqual(['DELIVERED']);
  });
});
