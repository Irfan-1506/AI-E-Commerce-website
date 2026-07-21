import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  public readonly client: Redis;

  constructor(config: ConfigService) {
    this.client = new Redis(config.getOrThrow<string>('REDIS_URL'), {
      maxRetriesPerRequest: 3,
      // Fail fast rather than hang requests if Redis is down — cache/session
      // should degrade gracefully, never block the request indefinitely.
      enableOfflineQueue: false,
    });
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  // ---- generic cache helpers ----
  // These deliberately swallow Redis errors rather than let them propagate
  // as a 500 — a cache-aside read is optional by definition (every caller
  // falls through to Postgres on a miss already), so a Redis outage should
  // look exactly like a cache miss, not a broken endpoint. This is the fix
  // for a gap chaos/resilience-tests.sh caught: the code previously claimed
  // graceful degradation in a comment without actually implementing it.
  async getJson<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.client.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (err) {
      this.logger.warn(`Cache read failed for ${key}, treating as a miss: ${(err as Error).message}`);
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (err) {
      // A failed cache write just means the next read is also a miss —
      // never worth failing the request that triggered it.
      this.logger.warn(`Cache write failed for ${key}: ${(err as Error).message}`);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (err) {
      this.logger.warn(`Cache delete failed for ${key}: ${(err as Error).message}`);
    }
  }

  // ---- refresh token store (rotation + revocation) ----
  // Deliberately NOT wrapped like getJson/setJson above — a refresh token
  // check that silently "passes" because Redis was unreachable would mean
  // a revoked/expired token gets accepted during a Redis outage, which is
  // an authentication bug, not a graceful degradation. This should fail
  // loudly (401 the request) rather than fail open.
  private refreshKey(userId: string, jti: string) {
    return `refresh:${userId}:${jti}`;
  }

  async storeRefreshToken(userId: string, jti: string, ttlSeconds: number) {
    await this.client.set(this.refreshKey(userId, jti), '1', 'EX', ttlSeconds);
  }

  async isRefreshTokenValid(userId: string, jti: string): Promise<boolean> {
    return (await this.client.exists(this.refreshKey(userId, jti))) === 1;
  }

  async revokeRefreshToken(userId: string, jti: string) {
    await this.client.del(this.refreshKey(userId, jti));
  }

  async revokeAllRefreshTokens(userId: string) {
    const keys = await this.client.keys(`refresh:${userId}:*`);
    if (keys.length) await this.client.del(...keys);
  }
}
