import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { authenticator } from 'otplib';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma.service';

describe('MFA and account lockout (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('MFA', () => {
    const email = `mfa-test-${Date.now()}@test.com`;
    let accessToken: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({ email, name: 'MFA Test', password: 'TestPass123' });
      accessToken = res.body.accessToken;
    });

    it('login works normally before MFA is enabled', async () => {
      const res = await request(app.getHttpServer()).post('/v1/auth/login').send({ email, password: 'TestPass123' });
      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.mfaRequired).toBeUndefined();
    });

    it('enrolling requires a valid TOTP code to confirm, not just calling verify blindly', async () => {
      const setup = await request(app.getHttpServer())
        .post('/v1/auth/mfa/setup')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(setup.status).toBe(201);
      expect(setup.body.secret).toBeDefined();
      expect(setup.body.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);

      const badCode = await request(app.getHttpServer())
        .post('/v1/auth/mfa/verify')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ code: '000000' });
      expect(badCode.status).toBe(400);

      const validCode = authenticator.generate(setup.body.secret);
      const goodCode = await request(app.getHttpServer())
        .post('/v1/auth/mfa/verify')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ code: validCode });
      expect(goodCode.status).toBe(201);
      expect(goodCode.body.enabled).toBe(true);
    });

    it('login now returns a challenge instead of tokens', async () => {
      const res = await request(app.getHttpServer()).post('/v1/auth/login').send({ email, password: 'TestPass123' });
      expect(res.status).toBe(200);
      expect(res.body.mfaRequired).toBe(true);
      expect(res.body.mfaToken).toBeDefined();
      expect(res.body.accessToken).toBeUndefined(); // no session established from password alone anymore
    });

    it('completes login with a valid TOTP code against the challenge', async () => {
      const login = await request(app.getHttpServer()).post('/v1/auth/login').send({ email, password: 'TestPass123' });
      const user = await prisma.user.findUniqueOrThrow({ where: { email } });

      const validCode = authenticator.generate(user.mfaSecret!);
      const verify = await request(app.getHttpServer())
        .post('/v1/auth/mfa/login-verify')
        .send({ mfaToken: login.body.mfaToken, code: validCode });

      expect(verify.status).toBe(200);
      expect(verify.body.accessToken).toBeDefined();
    });

    it('rejects a wrong TOTP code against a valid challenge', async () => {
      const login = await request(app.getHttpServer()).post('/v1/auth/login').send({ email, password: 'TestPass123' });
      const verify = await request(app.getHttpServer())
        .post('/v1/auth/mfa/login-verify')
        .send({ mfaToken: login.body.mfaToken, code: '000000' });
      expect(verify.status).toBe(401);
    });
  });

  describe('Account lockout', () => {
    const email = `lockout-test-${Date.now()}@test.com`;

    beforeAll(async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({ email, name: 'Lockout Test', password: 'TestPass123' });
    });

    it('locks the account after 5 failed attempts, even with the correct password on the 6th try', async () => {
      for (let i = 0; i < 5; i++) {
        const res = await request(app.getHttpServer()).post('/v1/auth/login').send({ email, password: 'WrongPassword' });
        expect(res.status).toBe(401);
      }

      // Correct password, but the account is now locked — this is the
      // actual point of lockout: it stops a slow-and-steady guessing
      // attack even if attempt #6 happens to be the right password.
      const lockedAttempt = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email, password: 'TestPass123' });
      expect(lockedAttempt.status).toBe(403);
    }, 15_000);

    it('a fresh account is not locked and can log in normally', async () => {
      const freshEmail = `lockout-fresh-${Date.now()}@test.com`;
      await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({ email: freshEmail, name: 'Fresh', password: 'TestPass123' });

      const res = await request(app.getHttpServer()).post('/v1/auth/login').send({ email: freshEmail, password: 'TestPass123' });
      expect(res.status).toBe(200);
    });
  });
});
