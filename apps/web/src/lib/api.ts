// All requests go to same-origin /api/v1/*, proxied server-side to the
// NestJS API by the Next.js rewrite in next.config.js (or by nginx in the
// full Docker stack — either way, same-origin from the browser's point of
// view). That's what makes httpOnly-cookie auth work without CORS
// gymnastics: no cross-site request ever happens.
const API_BASE = '/api/v1';

export type Product = {
  id: string;
  name: string;
  slug: string;
  basePrice: string;
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

export const api = {
  products: {
    list: (page = 1) => request<{ items: Product[]; total: number }>(`/products?page=${page}`),
    getBySlug: (slug: string) => request<Product>(`/products/${slug}`),
  },
  categories: {
    tree: () => request<any[]>('/categories'),
  },
  auth: {
    login: (email: string, password: string, captchaToken?: string) =>
      request<{ accessToken?: string; mfaRequired?: boolean; mfaToken?: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, captchaToken }),
      }),
    mfaLoginVerify: (mfaToken: string, code: string) =>
      request<{ accessToken: string }>('/auth/mfa/login-verify', {
        method: 'POST',
        body: JSON.stringify({ mfaToken, code }),
      }),
    register: (email: string, name: string, password: string, captchaToken?: string) =>
      request<{ accessToken: string }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, name, password, captchaToken }),
      }),
    me: () => request<{ userId: string; email: string; role: string }>('/auth/me'),
    logout: () => request<void>('/auth/logout', { method: 'POST' }),
    mfaSetup: () => request<{ secret: string; qrCodeDataUrl: string }>('/auth/mfa/setup', { method: 'POST' }),
    mfaVerify: (code: string) => request<{ enabled: boolean }>('/auth/mfa/verify', { method: 'POST', body: JSON.stringify({ code }) }),
    mfaDisable: () => request<{ enabled: boolean }>('/auth/mfa/disable', { method: 'POST' }),
  },
  cart: {
    get: () => request<Cart>('/cart'),
    add: (variantId: string, quantity: number) =>
      request<Cart>('/cart/items', { method: 'POST', body: JSON.stringify({ variantId, quantity }) }),
    updateQuantity: (variantId: string, quantity: number) =>
      request<Cart>(`/cart/items/${variantId}`, { method: 'PATCH', body: JSON.stringify({ quantity }) }),
    remove: (variantId: string) => request<Cart>(`/cart/items/${variantId}`, { method: 'DELETE' }),
  },
  orders: {
    checkout: (couponCode?: string) =>
      request<Order>('/orders/checkout', { method: 'POST', body: JSON.stringify({ couponCode }) }),
    mine: () => request<Order[]>('/orders/mine'),
    getById: (id: string) => request<Order>(`/orders/${id}`),
  },
  payments: {
    initSslcommerz: (orderId: string) =>
      request<{ gatewayUrl: string; tranId: string }>('/payments/sslcommerz/init', {
        method: 'POST',
        body: JSON.stringify({ orderId }),
      }),
  },
  search: {
    query: (q: string, page = 1) => request<{ items: Product[]; total: number }>(`/search?q=${encodeURIComponent(q)}&page=${page}`),
    semantic: (q: string) => request<{ items: Product[] }>(`/search/semantic?q=${encodeURIComponent(q)}`),
    autocomplete: (q: string) => request<{ name: string; slug: string }[]>(`/search/autocomplete?q=${encodeURIComponent(q)}`),
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
    }),
    reset: () => request<void>('/assistant/reset', { method: 'POST' }),
  },
  recommendations: {
    related: (productId: string) => request<Product[]>(`/products/${productId}/related`),
    frequentlyBoughtWith: (productId: string) => request<Product[]>(`/products/${productId}/frequently-bought-with`),
    recordView: (productId: string) => request<void>(`/products/${productId}/view`, { method: 'POST' }).catch(() => {}),
    recentlyViewed: () => request<Product[]>('/recently-viewed').catch(() => []),
  },
};
