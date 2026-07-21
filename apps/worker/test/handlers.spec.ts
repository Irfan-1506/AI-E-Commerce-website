import { dispatch } from '../src/handlers';

function makeLogMock() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as any;
}

describe('handlers.dispatch', () => {
  it('routes order.created to the confirmation handler', async () => {
    const log = makeLogMock();
    await dispatch({ type: 'order.created', orderId: 'o1', total: 100 }, log);
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'o1' }),
      expect.stringContaining('confirmation'),
    );
  });

  it('routes order.status_changed -> SHIPPED to the shipment handler', async () => {
    const log = makeLogMock();
    await dispatch({ type: 'order.status_changed', orderId: 'o1', to: 'SHIPPED' }, log);
    expect(log.info).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('shipment'));
  });

  it('routes order.status_changed -> CANCELLED to the cancellation handler', async () => {
    const log = makeLogMock();
    await dispatch({ type: 'order.status_changed', orderId: 'o1', to: 'CANCELLED' }, log);
    expect(log.info).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('cancellation'));
  });

  it('does nothing for an in-flight status like PROCESSING (no customer-facing event yet)', async () => {
    const log = makeLogMock();
    await dispatch({ type: 'order.status_changed', orderId: 'o1', to: 'PROCESSING' }, log);
    expect(log.info).not.toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('routes inventory.low_stock to a warn-level alert, not info', async () => {
    const log = makeLogMock();
    await dispatch({ type: 'inventory.low_stock', sku: 'SKU-1', productName: 'Widget', quantity: 2 }, log);
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ sku: 'SKU-1', quantity: 2 }),
      expect.stringContaining('low stock'),
    );
  });

  it('routes user.registered to the welcome handler', async () => {
    const log = makeLogMock();
    await dispatch({ type: 'user.registered', userId: 'u1' }, log);
    expect(log.info).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1' }), expect.stringContaining('welcome'));
  });

  it('logs a warning and does not throw for an unrecognized event type', async () => {
    const log = makeLogMock();
    await expect(dispatch({ type: 'something.unexpected' }, log)).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('Unknown event type'));
  });
});
