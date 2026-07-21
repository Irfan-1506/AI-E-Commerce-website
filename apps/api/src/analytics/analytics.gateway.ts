import { Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import Redis from 'ioredis';
import { AnalyticsService } from './analytics.service';
import { ANALYTICS_LIVE_CHANNEL } from '../events/events.service';

// A dedicated Redis connection is required for pub/sub — ioredis puts a
// connection in subscriber mode and it can no longer run normal commands,
// so this can't share RedisService's main client.
@WebSocketGateway({ namespace: 'analytics', cors: { origin: true, credentials: true } })
export class AnalyticsGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
  private readonly logger = new Logger(AnalyticsGateway.name);
  private subscriber: Redis;

  @WebSocketServer()
  server: Server;

  constructor(private config: ConfigService, private jwt: JwtService, private analytics: AnalyticsService) {
    this.subscriber = new Redis(this.config.getOrThrow('REDIS_URL'));
  }

  async onModuleInit() {
    await this.subscriber.subscribe(ANALYTICS_LIVE_CHANNEL);
    this.subscriber.on('message', async (_channel, message) => {
      try {
        const event = JSON.parse(message);
        await this.analytics.recordEvent(event);
        this.server.emit('event', event);

        if (event.type === 'order.created') {
          this.server.emit('snapshot', await this.analytics.getTodaySnapshot());
        }
      } catch (err) {
        this.logger.warn(`Failed to relay analytics event: ${(err as Error).message}`);
      }
    });
  }

  // Socket.IO connections bypass NestJS's HTTP guard pipeline entirely —
  // auth has to be checked manually on handshake, here, or every connected
  // client (including an unauthenticated one) would see live order/revenue
  // data, which is exactly the kind of thing RBAC exists to prevent.
  async handleConnection(client: Socket) {
    try {
      const cookie = client.handshake.headers.cookie ?? '';
      const match = cookie.match(/(?:^|; )accessToken=([^;]+)/);
      const token = match?.[1] ?? (client.handshake.auth?.token as string | undefined);
      if (!token) throw new Error('No token');

      const payload = this.jwt.verify(token, { secret: this.config.getOrThrow('JWT_ACCESS_SECRET') });
      if (payload.role !== 'ADMIN' && payload.role !== 'SELLER') throw new Error('Insufficient role');

      client.data.userId = payload.sub;
      client.emit('snapshot', await this.analytics.getTodaySnapshot());
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect() {
    // No per-connection state to clean up currently — present for the
    // OnGatewayDisconnect interface and future use (e.g. presence tracking).
  }
}
