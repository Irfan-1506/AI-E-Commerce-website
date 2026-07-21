import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CaptchaService {
  constructor(private config: ConfigService) {}

  async verify(token: string | undefined): Promise<void> {
    const secret = this.config.get('HCAPTCHA_SECRET');
    if (!secret) return; // not configured — dev/CI mode, skip rather than block every registration on a missing key

    if (!token) throw new BadRequestException('CAPTCHA verification required');

    const res = await fetch('https://hcaptcha.com/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }),
    });
    const data = await res.json();
    if (!data.success) throw new BadRequestException('CAPTCHA verification failed');
  }
}
