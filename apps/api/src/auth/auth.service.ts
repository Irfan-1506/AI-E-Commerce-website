import { ConflictException, Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma.service';
import { RedisService } from '../redis/redis.service';
import { LockoutService } from '../common/mfa/lockout.service';
import { CaptchaService } from '../common/mfa/captcha.service';
import { RegisterDto, LoginDto } from './dto';
import { EventsService } from '../events/events.service';

const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const MFA_CHALLENGE_TTL_SECONDS = 5 * 60; // 5 minutes to complete the MFA step

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private redis: RedisService,
    private lockout: LockoutService,
    private captcha: CaptchaService,
    private events: EventsService,
  ) {}

  async register(dto: RegisterDto) {
    await this.captcha.verify(dto.captchaToken);

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });

    const user = await this.prisma.user.create({
      data: { email: dto.email, name: dto.name, passwordHash, role: 'CUSTOMER' },
    });

    await this.events.publish({ type: 'user.registered', userId: user.id, at: new Date().toISOString() });

    return this.issueTokens(user.id, user.email, user.role);
  }

  /**
   * Two possible outcomes: a normal login returns tokens directly. If the
   * account has MFA enabled, this returns a short-lived mfaToken instead —
   * the caller must then hit /auth/mfa/login-verify with a TOTP code to get
   * real tokens. Account lockout is checked BEFORE the password check (not
   * after) so a locked-out attacker can't use timing to distinguish "locked"
   * from "wrong password". CAPTCHA kicks in after repeated failures on this
   * specific account — not on every login, which would just be friction for
   * everyone to stop an attack pattern most logins never exhibit.
   */
  async login(dto: LoginDto) {
    await this.lockout.assertNotLocked(dto.email);
    if (await this.lockout.requiresCaptcha(dto.email)) {
      await this.captcha.verify(dto.captchaToken);
    }

    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      await this.lockout.recordFailure(dto.email);
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) {
      await this.lockout.recordFailure(dto.email);
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.lockout.recordSuccess(dto.email);

    if (user.mfaEnabled) {
      const mfaToken = randomUUID();
      await this.redis.setJson(`mfa-challenge:${mfaToken}`, { userId: user.id }, MFA_CHALLENGE_TTL_SECONDS);
      return { mfaRequired: true, mfaToken };
    }

    return this.issueTokens(user.id, user.email, user.role);
  }

  async completeMfaLogin(mfaToken: string, code: string, verifyFn: (userId: string, code: string) => Promise<boolean>) {
    const challenge = await this.redis.getJson<{ userId: string }>(`mfa-challenge:${mfaToken}`);
    if (!challenge) throw new UnauthorizedException('MFA challenge expired or invalid — please log in again');

    const valid = await verifyFn(challenge.userId, code);
    if (!valid) throw new UnauthorizedException('Invalid MFA code');

    await this.redis.del(`mfa-challenge:${mfaToken}`);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: challenge.userId } });
    return this.issueTokens(user.id, user.email, user.role);
  }

  private async issueTokens(sub: string, email: string, role: string) {
    const jti = randomUUID();
    const accessToken = this.jwt.sign(
      { sub, email, role },
      { secret: this.config.getOrThrow('JWT_ACCESS_SECRET'), expiresIn: '15m' },
    );
    const refreshToken = this.jwt.sign(
      { sub, email, role, jti },
      { secret: this.config.getOrThrow('JWT_REFRESH_SECRET'), expiresIn: '7d' },
    );
    await this.redis.storeRefreshToken(sub, jti, REFRESH_TTL_SECONDS);
    return { accessToken, refreshToken };
  }

  async refresh(refreshToken: string) {
    let payload: { sub: string; email: string; role: string; jti: string };
    try {
      payload = this.jwt.verify(refreshToken, { secret: this.config.getOrThrow('JWT_REFRESH_SECRET') });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const valid = await this.redis.isRefreshTokenValid(payload.sub, payload.jti);
    if (!valid) throw new UnauthorizedException('Refresh token revoked or expired');

    await this.redis.revokeRefreshToken(payload.sub, payload.jti);
    return this.issueTokens(payload.sub, payload.email, payload.role);
  }

  async logout(userId: string) {
    await this.redis.revokeAllRefreshTokens(userId);
  }
}
