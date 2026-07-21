import type { Metadata } from 'next';
import ProductDetailClient from './product-detail-client';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:4000';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

async function fetchProduct(slug: string) {
  try {
    const res = await fetch(`${API_ORIGIN}/v1/products/${slug}`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// generateMetadata runs server-side per request (cached per revalidate
// window) — this is what makes each product page have its own title/
// description/OpenGraph image instead of every page sharing the generic
// site-wide metadata from the root layout. Search engines and link
// previews (WhatsApp, Facebook, Twitter) all read this.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = await fetchProduct(slug);
  if (!product) return { title: 'Product not found' };

  const description = product.description?.slice(0, 155) ?? '';
  const image = product.images?.[0]?.url;

  return {
    title: `${product.name} — AI Commerce`,
    description,
    alternates: { canonical: `${SITE_URL}/products/${product.slug}` },
    openGraph: {
      title: product.name,
      description,
      images: image ? [{ url: image, width: 600, height: 600, alt: product.name }] : undefined,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: product.name,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await fetchProduct(slug);

  // JSON-LD structured data — this is what makes Google eligible to show
  // price/availability/rating directly in search results (rich snippets)
  // instead of a plain blue link. Doesn't affect the rendered page at all;
  // it's read by crawlers, not shown to users.
  const jsonLd = product
    ? {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: product.name,
        description: product.description,
        image: product.images?.map((i: any) => i.url),
        offers: {
          '@type': 'Offer',
          priceCurrency: product.currency ?? 'BDT',
          price: product.basePrice,
          availability: product.variants?.some((v: any) => (v.inventory?.quantity ?? 0) > 0)
            ? 'https://schema.org/InStock'
            : 'https://schema.org/OutOfStock',
        },
      }
    : null;

  return (
    <>
      {jsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      )}
      <ProductDetailClient slug={slug} />
    </>
  );
}
