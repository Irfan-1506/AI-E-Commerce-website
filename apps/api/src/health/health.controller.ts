import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { RedisService } from '../redis/redis.service';

@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService, private redis: RedisService) {}

  // A process that's "alive" but can't reach its database isn't actually
  // healthy — this is what makes the readiness probe meaningful instead of
  // just checking that the Node event loop is spinning.
  @Get()
  async check() {
    const checks: Record<string, 'ok' | 'error'> = {};

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = 'ok';
    } catch {
      checks.database = 'error';
    }

    try {
      await this.redis.client.ping();
      checks.redis = 'ok';
    } catch {
      checks.redis = 'error';
    }

    const healthy = Object.values(checks).every((s) => s === 'ok');
    if (!healthy) throw new ServiceUnavailableException({ status: 'unhealthy', checks });

    return { status: 'ok', checks };
  }
}
