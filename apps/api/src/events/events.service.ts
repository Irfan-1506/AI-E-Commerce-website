import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { randomUUID } from 'crypto';
import { RedisService } from '../redis/redis.service';
import { DomainEvent, EVENT_EXCHANGE, routingKeyFor } from './domain-events';

export const ANALYTICS_LIVE_CHANNEL = 'analytics:live';

@Injectable()
export class EventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventsService.name);
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.Channel | null = null;

  constructor(private config: ConfigService, private redis: RedisService) {}

  async onModuleInit() {
    const url = this.config.get('RABBITMQ_URL');
    if (!url) {
      this.logger.warn('RABBITMQ_URL not set — domain events will only publish to the Redis live-dashboard channel, not the durable event bus. Fine for local dev without docker-compose up rabbitmq; not fine for production.');
      return;
    }
    try {
      this.connection = await amqp.connect(url);
      this.channel = await this.connection.createChannel();
      // Topic exchange: consumers bind with patterns like "order.*" rather
      // than every consumer needing every event pushed to it and filtering
      // client-side.
      await this.channel.assertExchange(EVENT_EXCHANGE, 'topic', { durable: true });
      this.logger.log('Connected to RabbitMQ event bus');
    } catch (err) {
      this.logger.error('Failed to connect to RabbitMQ — events will not be durably published', err as Error);
    }
  }

  async onModuleDestroy() {
    await this.channel?.close().catch(() => {});
    await this.connection?.close().catch(() => {});
  }

  async publish(event: DomainEvent): Promise<void> {
    // Low-latency side channel for the live dashboard — Redis pub/sub has
    // no persistence or delivery guarantee, which is exactly right for a
    // "what's happening right now" view that a page refresh naturally
    // resyncs from the durable read model anyway.
    this.redis.client.publish(ANALYTICS_LIVE_CHANNEL, JSON.stringify(event)).catch((err) => {
      this.logger.warn(`Failed to publish to analytics live channel: ${(err as Error).message}`);
    });

    if (!this.channel) return; // RabbitMQ not configured/reachable — degrade gracefully, don't throw

    try {
      this.channel.publish(EVENT_EXCHANGE, routingKeyFor(event), Buffer.from(JSON.stringify(event)), {
        persistent: true, // survives a broker restart — matters for events the worker hasn't consumed yet
        contentType: 'application/json',
        messageId: randomUUID(), // lets consumers dedupe on redelivery — RabbitMQ's at-least-once guarantee means "delivered twice" is normal, not a bug
      });
    } catch (err) {
      this.logger.error(`Failed to publish event ${event.type}`, err as Error);
    }
  }
}
