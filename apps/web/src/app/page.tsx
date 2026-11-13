import Link from 'next/link';
import Image from 'next/image';
import { api } from '@/lib/api';
import { DEMO_CATEGORIES } from '@/lib/demo-products';

export const dynamic = 'force-dynamic';

const HERO_MODEL_IMAGE =
  'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1400&q=80';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  const { items } = await api.products.list().catch(() => ({ items: [] }));
  const filteredItems = category
    ? items.filter((p) => p.category?.toLowerCase() === category.toLowerCase())
    : items;

  const activeCategoryName =
    DEMO_CATEGORIES.find((c) => c.slug === category)?.name ?? 'All Products';

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <section className="relative rounded-2xl overflow-hidden bg-gray-900 text-white mb-10">
        <div className="grid md:grid-cols-2 items-center">
          <div className="p-8 md:p-12 space-y-4">
            <p className="text-xs uppercase tracking-widest text-gray-300">Welcome to AI Commerce</p>
            <h1 className="text-3xl md:text-4xl font-bold leading-tight">
              Curated essentials for everyday style and tech
            </h1>
            <p className="text-sm text-gray-300 max-w-md">
              Explore our latest collection or ask the AI shopping assistant for personalized picks.
            </p>
            <div className="pt-2">
              <a
                href="#catalog"
                className="inline-block bg-white text-gray-900 text-sm font-medium px-5 py-2.5 rounded-md hover:bg-gray-100 transition"
              >
                Shop collection
              </a>
            </div>
          </div>
          <div className="relative h-72 md:h-96">
            <Image
              src={HERO_MODEL_IMAGE}
              alt="Fashion model showcasing the new collection"
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover object-top"
              priority
            />
          </div>
        </div>
      </section>

      <div id="catalog" className="flex flex-col md:flex-row gap-8">
        <aside className="w-full md:w-52 shrink-0" aria-label="Product categories">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
            Categories
          </h2>
          <ul className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
            <li>
              <Link
                href="/"
                className={`block px-3 py-2 rounded-md text-sm whitespace-nowrap ${
                  !category
                    ? 'bg-gray-900 text-white font-medium'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                All Products
              </Link>
            </li>
            {DEMO_CATEGORIES.map((cat) => (
              <li key={cat.slug}>
                <Link
                  href={`/?category=${cat.slug}`}
                  className={`block px-3 py-2 rounded-md text-sm whitespace-nowrap ${
                    category === cat.slug
                      ? 'bg-gray-900 text-white font-medium'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {cat.name}
                </Link>
              </li>
            ))}
          </ul>
        </aside>

        <section className="flex-1">
          <div className="flex items-baseline justify-between mb-6">
            <h2 className="text-2xl font-semibold">{activeCategoryName}</h2>
            <span className="text-sm text-gray-500">{filteredItems.length} items</span>
          </div>

          {filteredItems.length === 0 ? (
            <p className="text-gray-500">
              No products found in this category.
            </p>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredItems.map((p) => (
                <Link key={p.id} href={`/products/${p.slug}`} className="group">
                  <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden mb-2 relative">
                    {p.images[0] && (
                      <Image
                        src={p.images[0].url}
                        alt={p.images[0].altText ?? p.name}
                        fill
                        sizes="(max-width: 768px) 50vw, 25vw"
                        className="object-cover group-hover:scale-105 transition"
                      />
                    )}
                  </div>
                  <p className="text-sm font-medium">{p.name}</p>
                  {p.description && (
                    <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{p.description}</p>
                  )}
                  <p className="text-sm text-gray-700 mt-1">৳{p.basePrice}</p>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
