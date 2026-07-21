'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { api, Product } from '@/lib/api';

export default function ProductDetailClient({ slug }: { slug: string }) {
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [related, setRelated] = useState<Product[]>([]);
  const [boughtWith, setBoughtWith] = useState<Product[]>([]);
  const [reviewSummary, setReviewSummary] = useState<any>(null);

  useEffect(() => {
    api.products.getBySlug(slug).then((p) => {
      setProduct(p);
      setSelectedVariant(p.variants?.[0]?.id ?? null);
      api.recommendations.recordView(p.id);
      api.recommendations.related(p.id).then(setRelated);
      api.recommendations.frequentlyBoughtWith(p.id).then(setBoughtWith);
      api.reviews.summary(p.id).then(setReviewSummary).catch(() => {});
    });
  }, [slug]);

  async function addToCart() {
    if (!selectedVariant) return;
    setStatus(null);
    try {
      await api.cart.add(selectedVariant, 1);
      setStatus('Added to cart.');
    } catch (err: any) {
      if (err.status === 401) {
        router.push('/login');
        return;
      }
      setStatus(err.message ?? 'Could not add to cart');
    }
  }

  if (!product) return <main className="max-w-3xl mx-auto px-4 py-8">Loading…</main>;

  const variant = product.variants?.find((v) => v.id === selectedVariant);
  const outOfStock = variant && (variant.inventory?.quantity ?? 0) <= 0;

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <div className="grid md:grid-cols-2 gap-8">
        <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden relative">
          {product.images[0] && (
            <Image
              src={product.images[0].url}
              alt={product.images[0].altText || product.name}
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
              priority
            />
          )}
        </div>
        <div>
          <h1 className="text-2xl font-semibold">{product.name}</h1>
          <p className="text-xl text-gray-700 mt-2">৳{variant?.price ?? product.basePrice}</p>

          {product.variants && product.variants.length > 1 && (
            <div className="mt-4 flex gap-2">
              {product.variants.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setSelectedVariant(v.id)}
                  className={`px-3 py-1.5 rounded-md border text-sm ${v.id === selectedVariant ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300'}`}
                >
                  {Object.values(v.attributes).join(' / ')}
                </button>
              ))}
            </div>
          )}

          {outOfStock ? (
            <p className="mt-6 text-sm text-red-600">Out of stock</p>
          ) : (
            <button onClick={addToCart} className="mt-6 bg-gray-900 text-white rounded-md px-6 py-2.5">
              Add to cart
            </button>
          )}
          {status && <p className="mt-3 text-sm text-gray-600">{status}</p>}
        </div>
      </div>

      {reviewSummary?.available && (
        <section className="mt-10 border-t pt-6">
          <h2 className="text-lg font-medium mb-2">What customers are saying</h2>
          <p className="text-sm text-gray-500 mb-3">
            {reviewSummary.avgRating?.toFixed(1)}★ average across {reviewSummary.reviewCount} reviews
          </p>
          <p className="text-sm mb-3">{reviewSummary.summary}</p>
          <div className="grid grid-cols-2 gap-4 text-sm">
            {reviewSummary.pros?.length > 0 && (
              <div>
                <p className="font-medium text-green-700 mb-1">Pros</p>
                <ul className="list-disc list-inside text-gray-600">
                  {reviewSummary.pros.map((p: string, i: number) => <li key={i}>{p}</li>)}
                </ul>
              </div>
            )}
            {reviewSummary.cons?.length > 0 && (
              <div>
                <p className="font-medium text-red-700 mb-1">Cons</p>
                <ul className="list-disc list-inside text-gray-600">
                  {reviewSummary.cons.map((c: string, i: number) => <li key={i}>{c}</li>)}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {boughtWith.length > 0 && (
        <ProductRow title="Frequently bought together" products={boughtWith} />
      )}
      {related.length > 0 && (
        <ProductRow title="You might also like" products={related} />
      )}
    </main>
  );
}

function ProductRow({ title, products }: { title: string; products: Product[] }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-medium mb-4">{title}</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {products.map((p) => (
          <Link key={p.id} href={`/products/${p.slug}`} className="group">
            <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden mb-2 relative">
              {p.images[0] && (
                <Image
                  src={p.images[0].url}
                  alt={p.images[0].altText || p.name}
                  fill
                  sizes="(max-width: 768px) 50vw, 25vw"
                  className="object-cover group-hover:scale-105 transition"
                />
              )}
            </div>
            <p className="text-sm font-medium">{p.name}</p>
            <p className="text-sm text-gray-500">৳{p.basePrice}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
