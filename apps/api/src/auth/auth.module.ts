import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '../prisma.service';
import { MfaService } from '../common/mfa/mfa.service';
import { LockoutService } from '../common/mfa/lockout.service';
import { CaptchaService } from '../common/mfa/captcha.service';

@Module({
  imports: [PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, PrismaService, MfaService, LockoutService, CaptchaService],
})
export class AuthModule {}
