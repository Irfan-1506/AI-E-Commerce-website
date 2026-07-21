import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class CartService {
  constructor(private prisma: PrismaService) {}

  private async getOrCreateCart(userId: string) {
    return this.prisma.cart.upsert({
      where: { userId },
      update: {},
      create: { userId },
      include: { items: { include: { variant: { include: { product: true, inventory: true } } } } },
    });
  }

  async get(userId: string) {
    return this.getOrCreateCart(userId);
  }

  async addItem(userId: string, variantId: string, quantity: number) {
    if (quantity < 1) throw new BadRequestException('Quantity must be at least 1');

    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      include: { inventory: true },
    });
    if (!variant) throw new NotFoundException('Product variant not found');

    const cart = await this.prisma.cart.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });

    // Upsert on the (cartId, variantId) unique constraint — adding an item
    // already in the cart increments quantity instead of erroring or duplicating.
    await this.prisma.cartItem.upsert({
      where: { cartId_variantId: { cartId: cart.id, variantId } },
      update: { quantity: { increment: quantity } },
      create: { cartId: cart.id, variantId, quantity },
    });

    return this.get(userId);
  }

  async updateQuantity(userId: string, variantId: string, quantity: number) {
    if (quantity < 1) return this.removeItem(userId, variantId);

    const cart = await this.getOrCreateCart(userId);
    await this.prisma.cartItem.update({
      where: { cartId_variantId: { cartId: cart.id, variantId } },
      data: { quantity },
    });
    return this.get(userId);
  }

  async removeItem(userId: string, variantId: string) {
    const cart = await this.getOrCreateCart(userId);
    await this.prisma.cartItem
      .delete({ where: { cartId_variantId: { cartId: cart.id, variantId } } })
      .catch(() => null); // idempotent — removing something already gone is not an error
    return this.get(userId);
  }

  async clear(userId: string) {
    const cart = await this.getOrCreateCart(userId);
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
  }
}
