import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { RedisService } from '../redis/redis.service';

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  rolloutPercentage: number; // 0-100, applies only when enabled=true
  description?: string;
  updatedAt: string;
}

const FLAG_PREFIX = 'feature-flag:';

@Injectable()
export class FeatureFlagsService {
  constructor(private redis: RedisService) {}

  async list(): Promise<FeatureFlag[]> {
    const keys = await this.redis.client.keys(`${FLAG_PREFIX}*`);
    if (keys.length === 0) return [];
    const values = await this.redis.client.mget(...keys);
    return values.filter((v): v is string => !!v).map((v) => JSON.parse(v));
  }

  async get(key: string): Promise<FeatureFlag | null> {
    const raw = await this.redis.client.get(`${FLAG_PREFIX}${key}`);
    return raw ? JSON.parse(raw) : null;
  }

  async upsert(key: string, data: { enabled: boolean; rolloutPercentage: number; description?: string }) {
    const flag: FeatureFlag = { key, ...data, updatedAt: new Date().toISOString() };
    await this.redis.client.set(`${FLAG_PREFIX}${key}`, JSON.stringify(flag));
    return flag;
  }

  async delete(key: string) {
    await this.redis.client.del(`${FLAG_PREFIX}${key}`);
  }

  /**
   * Deterministic percentage rollout: hash(flagKey + userId) into a stable
   * 0-99 bucket rather than Math.random(). This matters — random rollout
   * means the same user flips in and out of a flag on every request/page
   * load, which is confusing to debug and breaks any feature that expects
   * a consistent experience per user within a rollout.
   */
  async isEnabledForUser(key: string, userId: string): Promise<boolean> {
    const flag = await this.get(key);
    if (!flag || !flag.enabled) return false;
    if (flag.rolloutPercentage >= 100) return true;
    if (flag.rolloutPercentage <= 0) return false;

    const hash = createHash('sha256').update(`${key}:${userId}`).digest('hex');
    const bucket = parseInt(hash.slice(0, 8), 16) % 100;
    return bucket < flag.rolloutPercentage;
  }
}
