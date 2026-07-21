export const EVENT_EXCHANGE = 'commerce.events';

export type DomainEvent =
  | { type: 'order.created'; orderId: string; userId: string; total: number; itemCount: number; at: string }
  | { type: 'order.status_changed'; orderId: string; from: string; to: string; at: string }
  | { type: 'inventory.low_stock'; variantId: string; productName: string; sku: string; quantity: number; at: string }
  | { type: 'user.registered'; userId: string; at: string };

// Routing key = event type (e.g. "order.created") — lets consumers bind to
// specific event types or wildcard patterns ("order.*") without every
// consumer needing to filter every message itself.
export function routingKeyFor(event: DomainEvent): string {
  return event.type;
}
