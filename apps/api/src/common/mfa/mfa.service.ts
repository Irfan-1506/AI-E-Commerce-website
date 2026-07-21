import { Injectable, BadRequestException } from '@nestjs/common';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import { PrismaService } from '../../prisma.service';

const ISSUER = 'AI Commerce';

@Injectable()
export class MfaService {
  constructor(private prisma: PrismaService) {}

  /** Generates a new TOTP secret and a QR code the user scans with an authenticator app. Not enabled until verify() succeeds. */
  async beginSetup(userId: string, email: string) {
    const secret = authenticator.generateSecret();
    await this.prisma.user.update({ where: { id: userId }, data: { mfaSecret: secret, mfaEnabled: false } });

    const otpauthUrl = authenticator.keyuri(email, ISSUER, secret);
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);
    return { secret, qrCodeDataUrl };
  }

  /** Confirms the user actually has the secret working (scanned + can produce valid codes) before turning MFA on. */
  async verifyAndEnable(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.mfaSecret) throw new BadRequestException('No MFA setup in progress');

    const valid = authenticator.check(code, user.mfaSecret);
    if (!valid) throw new BadRequestException('Invalid code');

    await this.prisma.user.update({ where: { id: userId }, data: { mfaEnabled: true } });
    return { enabled: true };
  }

  async verifyCode(userId: string, code: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.mfaSecret || !user.mfaEnabled) return false;
    return authenticator.check(code, user.mfaSecret);
  }

  async disable(userId: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { mfaEnabled: false, mfaSecret: null } });
  }
}
