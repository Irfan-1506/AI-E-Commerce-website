import { api } from '@/lib/api';

export default async function HomePage() {
  const { items } = await api.products.list().catch(() => ({ items: [] }));

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">Products</h1>
      {items.length === 0 ? (
        <p className="text-gray-500">
          No products yet — API not running or catalog is empty. Start the API and seed some products.
        </p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {items.map((p) => (
            <a key={p.id} href={`/products/${p.slug}`} className="group">
              <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden mb-2">
                {p.images[0] && (
                  <img src={p.images[0].url} alt={p.images[0].altText ?? p.name} className="w-full h-full object-cover group-hover:scale-105 transition" />
                )}
              </div>
              <p className="text-sm font-medium">{p.name}</p>
              <p className="text-sm text-gray-500">৳{p.basePrice}</p>
            </a>
          ))}
        </div>
      )}
    </main>
  );
}
