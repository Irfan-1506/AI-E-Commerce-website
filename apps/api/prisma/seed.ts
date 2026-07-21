import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const sellerPassword = await argon2.hash('SellerPass123', { type: argon2.argon2id });
  const seller = await prisma.user.upsert({
    where: { email: 'seller@example.com' },
    update: {},
    create: { email: 'seller@example.com', name: 'Demo Seller', passwordHash: sellerPassword, role: 'SELLER' },
  });

  const adminPassword = await argon2.hash('AdminPass123', { type: argon2.argon2id });
  await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: { email: 'admin@example.com', name: 'Demo Admin', passwordHash: adminPassword, role: 'ADMIN' },
  });

  const category = await prisma.category.upsert({
    where: { slug: 'electronics' },
    update: {},
    create: { name: 'Electronics', slug: 'electronics' },
  });

  const product = await prisma.product.upsert({
    where: { slug: 'wireless-earbuds' },
    update: {},
    create: {
      sellerId: seller.id,
      name: 'Wireless Earbuds',
      slug: 'wireless-earbuds',
      description: 'Bluetooth 5.3 earbuds with active noise cancellation.',
      categoryId: category.id,
      basePrice: 2499,
      currency: 'BDT',
      images: { create: [{ url: 'https://placehold.co/600x600?text=Earbuds', altText: 'Wireless earbuds', position: 0 }] },
      variants: {
        create: [
          {
            sku: 'EARBUD-BLK-001',
            attributes: { color: 'black' },
            price: 2499,
            inventory: { create: { quantity: 100, lowStockAt: 10 } },
          },
          {
            sku: 'EARBUD-WHT-001',
            attributes: { color: 'white' },
            price: 2499,
            inventory: { create: { quantity: 5, lowStockAt: 10 } }, // intentionally low, to test the low-stock dashboard alert
          },
        ],
      },
    },
  });

  await prisma.coupon.upsert({
    where: { code: 'WELCOME10' },
    update: {},
    create: { code: 'WELCOME10', discountType: 'PERCENT', discountValue: 10, maxUses: 100 },
  });

  console.log('Seeded:', { seller: seller.email, product: product.slug });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
