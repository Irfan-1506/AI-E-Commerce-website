import { Body, Controller, Post, Get, HttpCode, UseGuards, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '@nestjs/passport';
import { Response, Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { MfaService } from '../common/mfa/mfa.service';
import { generateCsrfToken } from '../common/csrf/csrf.middleware';
import { RegisterDto, LoginDto } from './dto';

const ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000;
const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService, private mfa: MfaService, private config: ConfigService) {}

  private cookieOptions(maxAgeMs: number, httpOnly = true) {
    return {
      httpOnly,
      secure: this.config.get('NODE_ENV') === 'production', // allows plain HTTP in local dev, requires HTTPS in prod
      sameSite: 'lax' as const,
      path: '/',
      maxAge: maxAgeMs,
    };
  }

  /**
   * Dual-mode on purpose: sets httpOnly cookies (what the web frontend
   * uses — JS on the page can never read these, so an XSS payload can't
   * exfiltrate a session the way it could with the old localStorage
   * approach) AND returns the tokens in the JSON body (what API clients,
   * the mobile app, k6, and Postman use via a Bearer header). Both paths
   * are validated identically by JwtStrategy's dual extractor.
   */
  private setSessionCookies(res: Response, tokens: { accessToken: string; refreshToken: string }) {
    res.cookie('accessToken', tokens.accessToken, this.cookieOptions(ACCESS_TOKEN_MAX_AGE_MS));
    res.cookie('refreshToken', tokens.refreshToken, this.cookieOptions(REFRESH_TOKEN_MAX_AGE_MS));
    res.cookie('csrfToken', generateCsrfToken(), this.cookieOptions(REFRESH_TOKEN_MAX_AGE_MS, false));
  }

  private clearSessionCookies(res: Response) {
    for (const name of ['accessToken', 'refreshToken', 'csrfToken']) {
      res.clearCookie(name, { path: '/' });
    }
  }

  @Post('register')
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.auth.register(dto);
    this.setSessionCookies(res, tokens);
    return tokens;
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto);
    if ('mfaRequired' in result) {
      return result; // no cookies yet — session isn't established until MFA passes
    }
    this.setSessionCookies(res, result);
    return result;
  }

  @Post('mfa/login-verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 8, ttl: 60_000 } }) // TOTP is 6 digits — bound guessing attempts
  async mfaLoginVerify(
    @Body('mfaToken') mfaToken: string,
    @Body('code') code: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.auth.completeMfaLogin(mfaToken, code, (userId, c) => this.mfa.verifyCode(userId, c));
    this.setSessionCookies(res, tokens);
    return tokens;
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Body('refreshToken') bodyRefreshToken: string, @Res({ passthrough: true }) res: Response) {
    // Cookie first (web flow), body fallback (API/mobile clients that never had a cookie to begin with).
    const refreshToken = req.cookies?.refreshToken ?? bodyRefreshToken;
    const tokens = await this.auth.refresh(refreshToken);
    this.setSessionCookies(res, tokens);
    return tokens;
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.user.userId);
    this.clearSessionCookies(res);
  }

  // Lets the frontend check "am I logged in, and as whom" without trying to
  // parse its own cookie (which it can't — accessToken is httpOnly by design).
  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  me(@Req() req: any) {
    return { userId: req.user.userId, email: req.user.email, role: req.user.role };
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('mfa/setup')
  async mfaSetup(@Req() req: any) {
    return this.mfa.beginSetup(req.user.userId, req.user.email);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('mfa/verify')
  async mfaVerify(@Req() req: any, @Body('code') code: string) {
    return this.mfa.verifyAndEnable(req.user.userId, code);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('mfa/disable')
  async mfaDisable(@Req() req: any) {
    await this.mfa.disable(req.user.userId);
    return { enabled: false };
  }
}
