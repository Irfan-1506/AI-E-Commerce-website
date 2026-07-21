import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { DomainEvent } from '../events/domain-events';

const TODAY_KEY = () => `analytics:today:${new Date().toISOString().slice(0, 10)}`;

@Injectable()
export class AnalyticsService {
  constructor(private redis: RedisService) {}

  /** Called for every live event — cheap counter increments, not a substitute for the real orders table (this is a fast read model, not the source of truth). */
  async recordEvent(event: DomainEvent) {
    const key = TODAY_KEY();
    if (event.type === 'order.created') {
      await this.redis.client.hincrby(key, 'orderCount', 1);
      await this.redis.client.hincrbyfloat(key, 'revenue', event.total);
      await this.redis.client.expire(key, 60 * 60 * 48); // keep 2 days so "today" is always readable even right after midnight
    }
  }

  async getTodaySnapshot() {
    const raw = await this.redis.client.hgetall(TODAY_KEY());
    return {
      orderCount: Number(raw.orderCount ?? 0),
      revenue: Number(raw.revenue ?? 0),
      date: new Date().toISOString().slice(0, 10),
    };
  }
}
