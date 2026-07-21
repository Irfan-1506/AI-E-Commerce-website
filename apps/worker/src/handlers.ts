import { Logger } from 'pino';

// Deliberately not implemented as real email/SMS sends — this worker's job
// is to demonstrate correct event-driven decomposition (durable queue,
// idempotent consumption, independent scaling/deployment from the api
// process), not to duplicate the notification-provider integration that
// would be its own piece of work. Swap the log line for a real provider
// call (SES, Twilio, whatever's chosen) without touching anything else here
// — that's the actual point of this being an isolated handler.

export async function handleOrderCreated(event: any, log: Logger) {
  log.info({ orderId: event.orderId, total: event.total }, 'Would send order confirmation to customer');
}

export async function handleOrderStatusChanged(event: any, log: Logger) {
  if (event.to === 'SHIPPED') {
    log.info({ orderId: event.orderId }, 'Would send shipment notification to customer');
  } else if (event.to === 'DELIVERED') {
    log.info({ orderId: event.orderId }, 'Would send delivery confirmation + review request to customer');
  } else if (event.to === 'CANCELLED' || event.to === 'REFUNDED') {
    log.info({ orderId: event.orderId, to: event.to }, 'Would send cancellation/refund notice to customer');
  }
}

export async function handleLowStock(event: any, log: Logger) {
  log.warn({ sku: event.sku, product: event.productName, quantity: event.quantity }, 'Would alert seller: low stock');
}

export async function handleUserRegistered(event: any, log: Logger) {
  log.info({ userId: event.userId }, 'Would send welcome email');
}

export async function dispatch(event: any, log: Logger) {
  switch (event.type) {
    case 'order.created':
      return handleOrderCreated(event, log);
    case 'order.status_changed':
      return handleOrderStatusChanged(event, log);
    case 'inventory.low_stock':
      return handleLowStock(event, log);
    case 'user.registered':
      return handleUserRegistered(event, log);
    default:
      log.warn({ event }, 'Unknown event type, ignoring');
  }
}
