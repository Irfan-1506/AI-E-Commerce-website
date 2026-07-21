import { OrderStatus } from '@prisma/client';

// Single source of truth for which transitions are legal. Prevents e.g.
// jumping PENDING -> DELIVERED or "un-cancelling" an order via a stray PATCH.
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['PAID', 'CANCELLED'],
  PAID: ['PROCESSING', 'CANCELLED', 'REFUNDED'],
  PROCESSING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'REFUNDED'],
  DELIVERED: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

// Statuses at which reserved inventory should be released back to available stock.
export const RELEASES_INVENTORY: OrderStatus[] = ['CANCELLED', 'REFUNDED'];
// Statuses at which reserved inventory is permanently committed (sale final).
export const COMMITS_INVENTORY: OrderStatus[] = ['DELIVERED'];
