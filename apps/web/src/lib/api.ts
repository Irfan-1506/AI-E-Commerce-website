import { DEMO_PRODUCTS, getDemoProductBySlug, searchDemoProducts } from './demo-products';

// All requests go to same-origin /api/v1/*, proxied server-side to the
// NestJS API by the Next.js rewrite in next.config.js (or by nginx in the
// full Docker stack — either way, same-origin from the browser's point of
// view). That's what makes httpOnly-cookie auth work without CORS
// gymnastics: no cross-site request ever happens.
const API_BASE =
  typeof window === 'undefined'
    ? `${process.env.API_ORIGIN ?? 'http://localhost:4000'}/v1`
    : '/api/v1';

export type Product = {
  id: string;
  name: string;
  slug: string;
  basePrice: string;
  description?: string;
  category?: string;
  images: { url: string; altText?: string }[];
  variants?: { id: string; sku: string; price: string; attributes: Record<string, string>; inventory?: { quantity: number } }[];
};

export type CartItem = {
  variantId: string;
  quantity: number;
  variant: { price: string; product: { name: string; slug: string }; inventory?: { quantity: number } };
};

export type Cart = { id: string; items: CartItem[] };

export type Order = {
  id: string;
  status: string;
  subtotal: string;
  discount: string;
  shippingFee: string;
  total: string;
  createdAt: string;
  items: { quantity: number; unitPrice: string; variantId: string }[];
};

// Double-submit CSRF: the server sets a non-httpOnly `csrfToken` cookie
// alongside the httpOnly session cookies specifically so this can read it
// and echo it back as a header. An XSS payload could technically read this
// cookie too (it's not httpOnly) — but that's fine, CSRF tokens are meant
// to prove "this request came from JS running on our own origin", not to be
// secret from that JS. What it can't do is stop a *different* site's forged
// request, since that site has no way to read our cookie to build the header.
export function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|; )csrfToken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const csrfHeaders: Record<string, string> = {};
  if (method !== 'GET') {
    const token = getCsrfToken();
    if (token) csrfHeaders['x-csrf-token'] = token;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include', // send/receive the httpOnly session cookies
    headers: { 'Content-Type': 'application/json', ...csrfHeaders, ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.message ?? `Request failed: ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

const DEMO_CART_KEY = 'ai_commerce_demo_cart';
const DEMO_ORDERS_KEY = 'ai_commerce_demo_orders';

function isApiUnavailable(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  return status === undefined || status >= 500;
}

function readDemoCart(): Cart {
  if (typeof window === 'undefined') return { id: 'demo-cart', items: [] };
  try {
    const raw = window.localStorage.getItem(DEMO_CART_KEY);
    return raw ? JSON.parse(raw) : { id: 'demo-cart', items: [] };
  } catch {
    return { id: 'demo-cart', items: [] };
  }
}

function writeDemoCart(cart: Cart): Cart {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(DEMO_CART_KEY, JSON.stringify(cart));
  }
  return cart;
}

function addDemoCartItem(variantId: string, quantity: number): Cart {
  const cart = readDemoCart();
  const existing = cart.items.find((i) => i.variantId === variantId);
  if (existing) {
    existing.quantity += quantity;
    return writeDemoCart(cart);
  }
  const product = DEMO_PRODUCTS.find((p) => p.variants?.some((v) => v.id === variantId));
  const variant = product?.variants?.find((v) => v.id === variantId);
  if (!product || !variant) return cart;
  cart.items.push({
    variantId,
    quantity,
    variant: {
      price: variant.price,
      product: { name: product.name, slug: product.slug },
      inventory: variant.inventory,
    },
  });
  return writeDemoCart(cart);
}

function readDemoOrders(): Order[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(DEMO_ORDERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function createDemoOrder(couponCode?: string): Order {
  const cart = readDemoCart();
  const subtotal = cart.items.reduce((sum, i) => sum + Number(i.variant.price) * i.quantity, 0);
  const discount = couponCode ? Math.round(subtotal * 0.1) : 0;
  const shippingFee = subtotal > 0 ? 60 : 0;
  const total = Math.max(0, subtotal - discount + shippingFee);
  const order: Order = {
    id: `demo-${Date.now().toString(36)}`,
    status: 'CONFIRMED',
    subtotal: subtotal.toFixed(2),
    discount: discount.toFixed(2),
    shippingFee: shippingFee.toFixed(2),
    total: total.toFixed(2),
    createdAt: new Date().toISOString(),
    items: cart.items.map((i) => ({ quantity: i.quantity, unitPrice: i.variant.price, variantId: i.variantId })),
  };
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(DEMO_ORDERS_KEY, JSON.stringify([order, ...readDemoOrders()]));
    writeDemoCart({ id: 'demo-cart', items: [] });
  }
  return order;
}

const DEMO_STOP_WORDS = new Set([
  'i', 'me', 'my', 'a', 'an', 'the', 'is', 'are', 'for', 'to', 'of', 'in', 'on', 'with',
  'want', 'need', 'looking', 'show', 'find', 'recommend', 'suggest', 'get', 'buy', 'have',
  'some', 'something', 'anything', 'good', 'best', 'nice', 'under', 'below', 'less', 'than',
  'please', 'can', 'you', 'what', 'whats', 'which', 'do', 'any',
]);

function demoAssistantReply(message: string): { reply: string; products: Product[] } {
  const maxMatch = message.match(/(?:under|below|less than)\s*৳?\s*(\d+)/i);
  const maxPrice = maxMatch ? Number(maxMatch[1]) : null;
  const tokens = message
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !DEMO_STOP_WORDS.has(w) && !/^\d+$/.test(w))
    .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w));

  const pool = maxPrice !== null
    ? DEMO_PRODUCTS.filter((p) => Number(p.basePrice) <= maxPrice)
    : DEMO_PRODUCTS;

  const scored = pool
    .map((p) => {
      const haystack = `${p.name} ${p.category} ${p.description}`.toLowerCase();
      const score = tokens.reduce((acc, t) => acc + (haystack.includes(t) ? 1 : 0), 0);
      return { p, score };
    })
    .filter((x) => (tokens.length > 0 ? x.score > 0 : true))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.p);

  if (scored.length === 0) {
    return {
      reply: 'No exact match found in the demo catalog — here are some popular picks:',
      products: pool.slice(0, 3),
    };
  }

  return {
    reply: `Here ${scored.length === 1 ? 'is a match' : `are ${Math.min(scored.length, 3)} picks`} from the demo catalog:`,
    products: scored.slice(0, 3),
  };
}

export const api = {
  products: {
    list: (page = 1) => request<{ items: Product[]; total: number }>(`/products?page=${page}`).catch(() => ({ items: DEMO_PRODUCTS, total: DEMO_PRODUCTS.length })),
    getBySlug: (slug: string) => request<Product>(`/products/${slug}`).catch((err) => { const d = getDemoProductBySlug(slug); if (d) return d; throw err; }),
  },
  categories: {
    tree: () => request<any[]>('/categories'),
  },
  auth: {
    login: (email: string, password: string, captchaToken?: string) =>
      request<{ accessToken?: string; mfaRequired?: boolean; mfaToken?: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, captchaToken }),
      }).catch((err) => { if (isApiUnavailable(err)) return { accessToken: 'demo-token' } as { accessToken?: string; mfaRequired?: boolean; mfaToken?: string }; throw err; }),
    mfaLoginVerify: (mfaToken: string, code: string) =>
      request<{ accessToken: string }>('/auth/mfa/login-verify', {
        method: 'POST',
        body: JSON.stringify({ mfaToken, code }),
      }),
    register: (email: string, name: string, password: string, captchaToken?: string) =>
      request<{ accessToken: string }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, name, password, captchaToken }),
      }).catch((err) => { if (isApiUnavailable(err)) return { accessToken: 'demo-token' } as { accessToken?: string; mfaRequired?: boolean; mfaToken?: string }; throw err; }),
    me: () => request<{ userId: string; email: string; role: string }>('/auth/me'),
    logout: () => request<void>('/auth/logout', { method: 'POST' }),
    mfaSetup: () => request<{ secret: string; qrCodeDataUrl: string }>('/auth/mfa/setup', { method: 'POST' }),
    mfaVerify: (code: string) => request<{ enabled: boolean }>('/auth/mfa/verify', { method: 'POST', body: JSON.stringify({ code }) }),
    mfaDisable: () => request<{ enabled: boolean }>('/auth/mfa/disable', { method: 'POST' }),
  },
  cart: {
    get: () => request<Cart>('/cart').catch((err) => { if (isApiUnavailable(err)) return readDemoCart(); throw err; }),
    add: (variantId: string, quantity: number) => request<Cart>('/cart/items', { method: 'POST', body: JSON.stringify({ variantId, quantity }) }).catch((err) => { if (isApiUnavailable(err)) return addDemoCartItem(variantId, quantity); throw err; }),
    updateQuantity: (variantId: string, quantity: number) => request<Cart>(`/cart/items/${variantId}`, { method: 'PATCH', body: JSON.stringify({ quantity }) }).catch((err) => { if (!isApiUnavailable(err)) throw err; const cart = readDemoCart(); const item = cart.items.find((i) => i.variantId === variantId); if (item) item.quantity = quantity; return writeDemoCart(cart); }),
    remove: (variantId: string) => request<Cart>(`/cart/items/${variantId}`, { method: 'DELETE' }).catch((err) => { if (!isApiUnavailable(err)) throw err; const cart = readDemoCart(); cart.items = cart.items.filter((i) => i.variantId !== variantId); return writeDemoCart(cart); }),
  },
  orders: {
    checkout: (couponCode?: string) =>
      request<Order>('/orders/checkout', { method: 'POST', body: JSON.stringify({ couponCode }) }).catch((err) => { if (isApiUnavailable(err)) return createDemoOrder(couponCode); throw err; }),
    mine: () => request<Order[]>('/orders/mine').catch((err) => { if (isApiUnavailable(err)) return readDemoOrders(); throw err; }),
    getById: (id: string) => request<Order>(`/orders/${id}`).catch((err) => { if (isApiUnavailable(err)) { const o = readDemoOrders().find((x) => x.id === id); if (o) return o; } throw err; }),
  },
  payments: {
    initSslcommerz: (orderId: string) =>
      request<{ gatewayUrl: string; tranId: string }>('/payments/sslcommerz/init', {
        method: 'POST',
        body: JSON.stringify({ orderId }),
      }).catch((err) => { if (isApiUnavailable(err)) return { gatewayUrl: `/orders/${orderId}`, tranId: `demo-${orderId}` }; throw err; }),
  },
  search: {
    query: (q: string, page = 1) => request<{ items: Product[]; total: number }>(`/search?q=${encodeURIComponent(q)}&page=${page}`).catch(() => { const items = searchDemoProducts(q); return { items, total: items.length }; }),
    semantic: (q: string) => request<{ items: Product[] }>(`/search/semantic?q=${encodeURIComponent(q)}`),
    autocomplete: (q: string) => request<{ name: string; slug: string }[]>(`/search/autocomplete?q=${encodeURIComponent(q)}`).catch(() => searchDemoProducts(q).map((p) => ({ name: p.name, slug: p.slug }))),
  },
  reviews: {
    summary: (productId: string) =>
      request<{ available: boolean; summary?: string; pros?: string[]; cons?: string[]; avgRating?: number; reviewCount: number }>(
        `/products/${productId}/reviews/summary`,
      ),
  },
  assistant: {
    chat: (message: string) => request<{ reply: string; products: Product[] }>('/assistant/chat', {
      method: 'POST',
      body: JSON.stringify({ message }),
    }).catch(async (err) => { if (!isApiUnavailable(err)) throw err; try { const res = await fetch('/api/demo-assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }) }); if (res.ok) return res.json(); } catch {} return demoAssistantReply(message); }),
    reset: () => request<void>('/assistant/reset', { method: 'POST' }),
  },
  recommendations: {
    related: (productId: string) => request<Product[]>(`/products/${productId}/related`).catch(() => DEMO_PRODUCTS.filter((p) => p.id !== productId).slice(0, 4)),
    frequentlyBoughtWith: (productId: string) => request<Product[]>(`/products/${productId}/frequently-bought-with`).catch(() => DEMO_PRODUCTS.filter((p) => p.id !== productId).slice(0, 2)),
    recordView: (productId: string) => request<void>(`/products/${productId}/view`, { method: 'POST' }).catch(() => {}),
    recentlyViewed: () => request<Product[]>('/recently-viewed').catch(() => []),
  },
};
