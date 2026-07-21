import { Injectable, ForbiddenException } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

const MAX_ATTEMPTS = 5;
const CAPTCHA_THRESHOLD = 3; // require CAPTCHA on the 3rd+ attempt, before the account locks entirely at MAX_ATTEMPTS
const LOCKOUT_SECONDS = 15 * 60; // 15 minutes
const ATTEMPT_WINDOW_SECONDS = 15 * 60; // failed attempts older than this don't count

@Injectable()
export class LockoutService {
  constructor(private redis: RedisService) {}

  private key(email: string) {
    return `lockout:${email.toLowerCase()}`;
  }

  async assertNotLocked(email: string) {
    const attempts = await this.redis.client.get(this.key(email));
    if (attempts && Number(attempts) >= MAX_ATTEMPTS) {
      throw new ForbiddenException('Account temporarily locked due to repeated failed login attempts. Try again in 15 minutes.');
    }
  }

  async requiresCaptcha(email: string): Promise<boolean> {
    const attempts = await this.redis.client.get(this.key(email));
    return !!attempts && Number(attempts) >= CAPTCHA_THRESHOLD;
  }

  /** Called on failed password check — the IP-based Throttler catches distributed attempts, this catches attempts against one account from many IPs. */
  async recordFailure(email: string) {
    const key = this.key(email);
    const count = await this.redis.client.incr(key);
    if (count === 1) {
      await this.redis.client.expire(key, ATTEMPT_WINDOW_SECONDS);
    }
    if (count >= MAX_ATTEMPTS) {
      // Extend to the full lockout window once the threshold is hit, rather
      // than letting it expire on the original attempt-window TTL.
      await this.redis.client.expire(key, LOCKOUT_SECONDS);
    }
  }

  async recordSuccess(email: string) {
    await this.redis.client.del(this.key(email));
  }
}
