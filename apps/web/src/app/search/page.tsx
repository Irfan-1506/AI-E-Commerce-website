'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api, Product } from '@/lib/api';

export default function SearchPage() {
  return (
    <Suspense fallback={<main className="max-w-6xl mx-auto px-4 py-8">Loading…</main>}>
      <SearchResults />
    </Suspense>
  );
}

function SearchResults() {
  const params = useSearchParams();
  const q = params.get('q') ?? '';
  const [results, setResults] = useState<Product[] | null>(null);

  useEffect(() => {
    if (!q) {
      setResults([]);
      return;
    }
    setResults(null);
    api.search.query(q).then((r) => setResults(r.items)).catch(() => setResults([]));
  }, [q]);

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-xl font-semibold mb-6">
        {q ? `Results for "${q}"` : 'Search'}
      </h1>
      {results === null ? (
        <p className="text-gray-500">Searching…</p>
      ) : results.length === 0 ? (
        <p className="text-gray-500">No products found.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {results.map((p) => (
            <Link key={p.id} href={`/products/${p.slug}`} className="group">
              <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden mb-2">
                {p.images[0] && (
                  <img src={p.images[0].url} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition" />
                )}
              </div>
              <p className="text-sm font-medium">{p.name}</p>
              <p className="text-sm text-gray-500">৳{p.basePrice}</p>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
