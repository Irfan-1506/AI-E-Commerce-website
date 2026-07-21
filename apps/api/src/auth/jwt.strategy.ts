import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

export interface JwtPayload {
  sub: string;
  email: string;
  role: 'ADMIN' | 'SELLER' | 'CUSTOMER';
}

// Reads the access token from the httpOnly cookie first (the web frontend's
// flow), falling back to a Bearer header (API clients, mobile apps, k6,
// Postman). Cookie-first matters here: it's what makes localStorage
// unnecessary on the frontend.
function cookieExtractor(req: Request): string | null {
  return req?.cookies?.accessToken ?? null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([cookieExtractor, ExtractJwt.fromAuthHeaderAsBearerToken()]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    return { userId: payload.sub, email: payload.email, role: payload.role };
  }
}
