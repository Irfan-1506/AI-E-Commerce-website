import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('Auth flow (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const email = `auth-test-${Date.now()}@test.com`;

  it('registers a new user and returns tokens', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email, name: 'Auth Test', password: 'TestPass123' });
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
  });

  it('rejects duplicate registration', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email, name: 'Auth Test', password: 'TestPass123' });
    expect(res.status).toBe(409);
  });

  it('rejects weak passwords at the validation layer', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email: `weak-${Date.now()}@test.com`, name: 'Weak', password: 'weak' });
    expect(res.status).toBe(400);
  });

  it('logs in with correct credentials', async () => {
    const res = await request(app.getHttpServer()).post('/v1/auth/login').send({ email, password: 'TestPass123' });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });

  it('rejects wrong password with the same error as an unknown email (no user enumeration)', async () => {
    const wrongPassword = await request(app.getHttpServer()).post('/v1/auth/login').send({ email, password: 'WrongPass123' });
    const unknownEmail = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: 'nobody@test.com', password: 'WrongPass123' });
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
  });

  it('refresh rotates the token — the old refresh token cannot be reused', async () => {
    const login = await request(app.getHttpServer()).post('/v1/auth/login').send({ email, password: 'TestPass123' });
    const oldRefreshToken = login.body.refreshToken;

    const firstRefresh = await request(app.getHttpServer()).post('/v1/auth/refresh').send({ refreshToken: oldRefreshToken });
    expect(firstRefresh.status).toBe(200);
    expect(firstRefresh.body.refreshToken).not.toBe(oldRefreshToken);

    // Replaying the now-rotated-out token must fail — this is the actual
    // point of rotation: a leaked refresh token is only useful once.
    const replay = await request(app.getHttpServer()).post('/v1/auth/refresh').send({ refreshToken: oldRefreshToken });
    expect(replay.status).toBe(401);
  });

  it("logout revokes all of a user's refresh tokens", async () => {
    const login = await request(app.getHttpServer()).post('/v1/auth/login').send({ email, password: 'TestPass123' });
    const { accessToken, refreshToken } = login.body;

    const logoutRes = await request(app.getHttpServer()).post('/v1/auth/logout').set('Authorization', `Bearer ${accessToken}`);
    expect(logoutRes.status).toBe(204);

    const refreshAfterLogout = await request(app.getHttpServer()).post('/v1/auth/refresh').send({ refreshToken });
    expect(refreshAfterLogout.status).toBe(401);
  });

  it('rejects protected routes without a token', async () => {
    const res = await request(app.getHttpServer()).get('/v1/cart');
    expect(res.status).toBe(401);
  });
});
