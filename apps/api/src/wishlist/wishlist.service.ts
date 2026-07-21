import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class WishlistService {
  constructor(private prisma: PrismaService) {}

  async get(userId: string) {
    const wishlist = await this.prisma.wishlist.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
    const productIds = wishlist.items as string[];
    if (productIds.length === 0) return { items: [] };

    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      include: { images: true },
    });
    return { items: products };
  }

  async toggle(userId: string, productId: string) {
    const wishlist = await this.prisma.wishlist.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
    const current = new Set(wishlist.items as string[]);
    current.has(productId) ? current.delete(productId) : current.add(productId);

    await this.prisma.wishlist.update({
      where: { userId },
      data: { items: Array.from(current) },
    });
    return this.get(userId);
  }
}
