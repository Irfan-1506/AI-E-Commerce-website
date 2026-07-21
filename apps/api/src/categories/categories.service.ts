import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService, private redis: RedisService) {}

  async tree() {
    const cached = await this.redis.getJson<any>('categories:tree');
    if (cached) return cached;

    // Categories change rarely — fetch all, build tree in memory rather than
    // recursive queries.
    const all = await this.prisma.category.findMany();
    const byId = new Map<string, (typeof all)[number] & { children: any[] }>(
      all.map((c) => [c.id, { ...c, children: [] as any[] }]),
    );
    const roots: any[] = [];
    for (const cat of byId.values()) {
      if (cat.parentId && byId.has(cat.parentId)) {
        byId.get(cat.parentId)!.children.push(cat);
      } else {
        roots.push(cat);
      }
    }
    await this.redis.setJson('categories:tree', roots, 300); // 5 min — near-static data
    return roots;
  }

  async getBySlug(slug: string) {
    const category = await this.prisma.category.findUnique({ where: { slug } });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  async create(data: { name: string; slug: string; parentId?: string }) {
    const category = await this.prisma.category.create({ data });
    await this.redis.del('categories:tree');
    return category;
  }
}
