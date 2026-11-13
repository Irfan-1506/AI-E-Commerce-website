import type { Product } from './api';

export type DemoProduct = Product & {
  description: string;
  category: string;
  currency: string;
};

export const DEMO_CATEGORIES = [
  { slug: 'audio', name: 'Audio' },
  { slug: 'wearables', name: 'Wearables' },
  { slug: 'footwear', name: 'Footwear' },
  { slug: 'accessories', name: 'Accessories' },
  { slug: 'peripherals', name: 'Peripherals' },
  { slug: 'cameras', name: 'Cameras' },
] as const;

export const DEMO_PRODUCTS: DemoProduct[] = [
  {
    id: 'demo-1',
    name: 'Studio Wireless Headphones',
    slug: 'studio-wireless-headphones',
    category: 'audio',
    basePrice: '4490',
    currency: 'BDT',
    description: 'Active noise-canceling over-ear headphones with 35-hour battery life and USB-C fast charging.',
    images: [
      {
        url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80',
        altText: 'Studio Wireless Headphones',
      },
    ],
    variants: [
      { id: 'demo-1-blk', sku: 'HEAD-BLK', price: '4490', attributes: { color: 'Matte Black' }, inventory: { quantity: 14 } },
      { id: 'demo-1-slv', sku: 'HEAD-SLV', price: '4690', attributes: { color: 'Silver' }, inventory: { quantity: 6 } },
    ],
  },
  {
    id: 'demo-2',
    name: 'Minimalist Smart Watch',
    slug: 'minimalist-smart-watch',
    category: 'wearables',
    basePrice: '6990',
    currency: 'BDT',
    description: 'AMOLED fitness & notification smartwatch with heart-rate tracking and 7-day battery.',
    images: [
      {
        url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80',
        altText: 'Minimalist Smart Watch',
      },
    ],
    variants: [
      { id: 'demo-2-slv', sku: 'WATCH-42-SLV', price: '6990', attributes: { size: '42mm', color: 'Silver' }, inventory: { quantity: 9 } },
      { id: 'demo-2-blk', sku: 'WATCH-46-BLK', price: '7490', attributes: { size: '46mm', color: 'Graphite' }, inventory: { quantity: 5 } },
    ],
  },
  {
    id: 'demo-3',
    name: 'AeroStride Running Shoes',
    slug: 'aerostride-running-shoes',
    category: 'footwear',
    basePrice: '3850',
    currency: 'BDT',
    description: 'Lightweight breathable mesh running shoes with responsive foam cushioning.',
    images: [
      {
        url: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=800&q=80',
        altText: 'AeroStride Running Shoes',
      },
    ],
    variants: [
      { id: 'demo-3-41', sku: 'SHOE-RED-41', price: '3850', attributes: { size: 'EU 41', color: 'Crimson' }, inventory: { quantity: 11 } },
      { id: 'demo-3-42', sku: 'SHOE-RED-42', price: '3850', attributes: { size: 'EU 42', color: 'Crimson' }, inventory: { quantity: 8 } },
    ],
  },
  {
    id: 'demo-4',
    name: 'Weatherproof Commuter Backpack',
    slug: 'weatherproof-commuter-backpack',
    category: 'accessories',
    basePrice: '2790',
    currency: 'BDT',
    description: 'Water-resistant 22L daily backpack with a padded 16-inch laptop sleeve for rainy commutes.',
    images: [
      {
        url: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=800&q=80',
        altText: 'Weatherproof Commuter Backpack',
      },
    ],
    variants: [
      { id: 'demo-4-chr', sku: 'PACK-CHR', price: '2790', attributes: { color: 'Charcoal' }, inventory: { quantity: 18 } },
    ],
  },
  {
    id: 'demo-5',
    name: 'Tactile Mechanical Keyboard',
    slug: 'tactile-mechanical-keyboard',
    category: 'peripherals',
    basePrice: '5200',
    currency: 'BDT',
    description: '75% hot-swappable mechanical keyboard with PBT keycaps and tri-mode wireless connectivity.',
    images: [
      {
        url: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=800&q=80',
        altText: 'Tactile Mechanical Keyboard',
      },
    ],
    variants: [
      { id: 'demo-5-brn', sku: 'KB-75-BRN', price: '5200', attributes: { switch: 'Brown Tactile' }, inventory: { quantity: 7 } },
      { id: 'demo-5-red', sku: 'KB-75-RED', price: '5200', attributes: { switch: 'Red Linear' }, inventory: { quantity: 12 } },
    ],
  },
  {
    id: 'demo-6',
    name: 'Retro Instant Film Camera',
    slug: 'retro-instant-film-camera',
    category: 'cameras',
    basePrice: '8900',
    currency: 'BDT',
    description: 'Point-and-shoot instant film camera with auto-exposure flash and selfie mirror.',
    images: [
      {
        url: 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=800&q=80',
        altText: 'Retro Instant Film Camera',
      },
    ],
    variants: [
      { id: 'demo-6-std', sku: 'CAM-INST-01', price: '8900', attributes: { edition: 'Classic' }, inventory: { quantity: 4 } },
    ],
  },
  {
    id: 'demo-7',
    name: 'Pulse True Wireless Earbuds',
    slug: 'pulse-true-wireless-earbuds',
    category: 'audio',
    basePrice: '2499',
    currency: 'BDT',
    description: 'Compact IPX5 sweat-resistant earbuds with dual-mic call clarity and pocket charging case.',
    images: [
      {
        url: 'https://images.unsplash.com/photo-1572569511254-d8f925fe2cbb?auto=format&fit=crop&w=800&q=80',
        altText: 'Pulse True Wireless Earbuds',
      },
    ],
    variants: [
      { id: 'demo-7-wht', sku: 'EAR-WHT', price: '2499', attributes: { color: 'Pearl White' }, inventory: { quantity: 20 } },
      { id: 'demo-7-blk', sku: 'EAR-BLK', price: '2499', attributes: { color: 'Obsidian' }, inventory: { quantity: 15 } },
    ],
  },
  {
    id: 'demo-8',
    name: 'Classic Leather Sneakers',
    slug: 'classic-leather-sneakers',
    category: 'footwear',
    basePrice: '3450',
    currency: 'BDT',
    description: 'Everyday low-top sneakers crafted with full-grain leather and a durable cupsole.',
    images: [
      {
        url: 'https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?auto=format&fit=crop&w=800&q=80',
        altText: 'Classic Leather Sneakers',
      },
    ],
    variants: [
      { id: 'demo-8-42', sku: 'SNK-42', price: '3450', attributes: { size: 'EU 42' }, inventory: { quantity: 10 } },
    ],
  },
];

export function getDemoProductBySlug(slug: string): DemoProduct | null {
  return DEMO_PRODUCTS.find((p) => p.slug === slug) ?? null;
}

export function searchDemoProducts(query: string): DemoProduct[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return DEMO_PRODUCTS.filter(
    (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q),
  );
}
