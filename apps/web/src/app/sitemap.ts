import type { MetadataRoute } from 'next';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:4000';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/search`, changeFrequency: 'weekly', priority: 0.5 },
  ];

  try {
    // Pagination is intentionally not handled here — fine for a catalog
    // this size. Once there are thousands of products, this needs to walk
    // pages and probably split into a sitemap index rather than one file.
    const res = await fetch(`${API_ORIGIN}/v1/products?limit=1000`, { next: { revalidate: 3600 } });
    const { items } = await res.json();
    const productRoutes: MetadataRoute.Sitemap = items.map((p: any) => ({
      url: `${SITE_URL}/products/${p.slug}`,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }));
    return [...staticRoutes, ...productRoutes];
  } catch {
    return staticRoutes; // API unreachable at build time — ship the static routes rather than fail the build
  }
}
