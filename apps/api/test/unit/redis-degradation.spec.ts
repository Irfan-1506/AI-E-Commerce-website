import { RedisService } from '../../src/redis/redis.service';

// Bypass the real constructor (which requires a live REDIS_URL connection)
// — these tests only exercise the error-handling wrapper logic, not a real
// Redis connection.
function makeService(clientOverrides: Partial<{ get: any; set: any; del: any }>) {
  const service = Object.create(RedisService.prototype) as RedisService;
  (service as any).client = {
    get: clientOverrides.get ?? jest.fn(),
    set: clientOverrides.set ?? jest.fn(),
    del: clientOverrides.del ?? jest.fn(),
  };
  (service as any).logger = { warn: jest.fn() };
  return service;
}

describe('RedisService graceful degradation', () => {
  it('getJson returns null (not a thrown error) when the client rejects', async () => {
    const service = makeService({ get: jest.fn().mockRejectedValue(new Error('connection refused')) });
    await expect(service.getJson('some-key')).resolves.toBeNull();
  });

  it('getJson still parses and returns real cached values on success', async () => {
    const service = makeService({ get: jest.fn().mockResolvedValue(JSON.stringify({ hello: 'world' })) });
    await expect(service.getJson('some-key')).resolves.toEqual({ hello: 'world' });
  });

  it('setJson does not throw when the client rejects', async () => {
    const service = makeService({ set: jest.fn().mockRejectedValue(new Error('connection refused')) });
    await expect(service.setJson('some-key', { a: 1 }, 60)).resolves.toBeUndefined();
  });

  it('del does not throw when the client rejects', async () => {
    const service = makeService({ del: jest.fn().mockRejectedValue(new Error('connection refused')) });
    await expect(service.del('some-key')).resolves.toBeUndefined();
  });
});
