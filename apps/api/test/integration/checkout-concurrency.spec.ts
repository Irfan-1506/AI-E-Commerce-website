import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma.service';

/**
 * These tests exist because Phases 3-5 repeatedly claimed "atomic
 * conditional updates prevent overselling / coupon double-spend under
 * concurrency" without ever actually firing concurrent requests at a real
 * database to check. This is that check. If Prisma's query builder, the
 * transaction isolation level, or a future refactor ever breaks the
 * atomicity, this is what catches it — the unit tests with mocked Prisma
 * can't, because the mock can't race with itself.
 */
describe('Checkout concurrency (integration)', () => {
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

  async function registerAndLogin(email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email, name: 'Test User', password: 'TestPass123' });
    return res.body.accessToken;
  }

  async function setupSeller() {
    const sellerEmail = `seller-${Date.now()}-${Math.random()}@test.com`;
    await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email: sellerEmail, name: 'Test Seller', password: 'TestPass123' });
    const seller = await prisma.user.update({ where: { email: sellerEmail }, data: { role: 'SELLER' } });

    const category = await prisma.category.create({
      data: { name: `Cat-${Date.now()}`, slug: `cat-${Date.now()}-${Math.random().toString(36).slice(2)}` },
    });

    return { seller, category };
  }

  it('allows only one concurrent checkout to succeed when stock is limited to 1', async () => {
    const { seller, category } = await setupSeller();

    const product = await prisma.product.create({
      data: {
        sellerId: seller.id,
        name: 'Race Condition Test Product',
        slug: `race-test-${Date.now()}`,
        description: 'For testing.',
        categoryId: category.id,
        basePrice: 100,
        variants: {
          create: [{ sku: `RACE-${Date.now()}`, attributes: {}, price: 100, inventory: { create: { quantity: 1 } } }],
        },
      },
      include: { variants: true },
    });
    const variantId = product.variants[0].id;

    // 5 different customers, each with exactly 1 unit of the same variant
    // in their cart, all checking out at effectively the same moment.
    const CONCURRENCY = 5;
    const tokens = await Promise.all(
      Array.from({ length: CONCURRENCY }, (_, i) => registerAndLogin(`racer-${Date.now()}-${i}@test.com`)),
    );

    await Promise.all(
      tokens.map((token) =>
        request(app.getHttpServer())
          .post('/v1/cart/items')
          .set('Authorization', `Bearer ${token}`)
          .send({ variantId, quantity: 1 }),
      ),
    );

    const results = await Promise.allSettled(
      tokens.map((token) =>
        request(app.getHttpServer()).post('/v1/orders/checkout').set('Authorization', `Bearer ${token}`).send({}),
      ),
    );

    const succeeded = results.filter(
      (r) => r.status === 'fulfilled' && (r.value as any).status === 201,
    );
    const failed = results.filter(
      (r) => r.status === 'fulfilled' && (r.value as any).status === 400,
    );

    // This is the actual claim under test: exactly one checkout wins the
    // last unit of stock, not zero (over-cautious locking) and not more
    // than one (the overselling bug this whole mechanism exists to prevent).
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(CONCURRENCY - 1);

    const inventory = await prisma.inventory.findUnique({ where: { variantId } });
    expect(inventory?.quantity).toBe(0);
    expect(inventory?.reserved).toBe(1);
  }, 30_000);

  it('allows only one concurrent checkout to consume a single-use coupon', async () => {
    const { seller, category } = await setupSeller();

    const product = await prisma.product.create({
      data: {
        sellerId: seller.id,
        name: 'Coupon Race Test Product',
        slug: `coupon-race-${Date.now()}`,
        description: 'For testing.',
        categoryId: category.id,
        basePrice: 100,
        variants: {
          create: [{ sku: `CRACE-${Date.now()}`, attributes: {}, price: 100, inventory: { create: { quantity: 100 } } }],
        },
      },
      include: { variants: true },
    });
    const variantId = product.variants[0].id;

    const couponCode = `RACE${Date.now()}`;
    await prisma.coupon.create({
      data: { code: couponCode, discountType: 'PERCENT', discountValue: 10, maxUses: 1 },
    });

    const CONCURRENCY = 5;
    const tokens = await Promise.all(
      Array.from({ length: CONCURRENCY }, (_, i) => registerAndLogin(`couponracer-${Date.now()}-${i}@test.com`)),
    );
    await Promise.all(
      tokens.map((token) =>
        request(app.getHttpServer())
          .post('/v1/cart/items')
          .set('Authorization', `Bearer ${token}`)
          .send({ variantId, quantity: 1 }),
      ),
    );

    await Promise.allSettled(
      tokens.map((token) =>
        request(app.getHttpServer())
          .post('/v1/orders/checkout')
          .set('Authorization', `Bearer ${token}`)
          .send({ couponCode }),
      ),
    );

    const coupon = await prisma.coupon.findUnique({ where: { code: couponCode } });
    // The number that matters: usedCount must be exactly 1, never higher,
    // no matter how many requests raced for it.
    expect(coupon?.usedCount).toBe(1);
  }, 30_000);
});
