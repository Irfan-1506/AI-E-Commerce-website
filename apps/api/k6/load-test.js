// Run: k6 run k6/load-test.js
// Against a real (staging, not prod) environment:
//   k6 run -e BASE_URL=https://staging-api.yourdomain.com k6/load-test.js
//
// This is NOT run in CI — it needs a live, seeded environment and takes
// minutes to run meaningfully. Run it manually before a launch or after any
// change to checkout/inventory/caching logic.
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';

export const options = {
  scenarios: {
    // Simulates realistic traffic: most people browse and search, a
    // fraction actually check out. Matches the real skew of an e-commerce
    // site far better than hammering one endpoint uniformly.
    browsing: {
      executor: 'ramping-vus',
      exec: 'browse',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 },
        { duration: '1m', target: 50 },
        { duration: '30s', target: 0 },
      ],
    },
    checkout: {
      executor: 'ramping-vus',
      exec: 'checkoutFlow',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 10 },
        { duration: '1m', target: 10 },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    // These are the numbers that actually matter — if p95 blows past this,
    // something (probably an unindexed query or a cache miss storm) needs
    // fixing before this ships to real traffic.
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

export function browse() {
  const listRes = http.get(`${BASE_URL}/v1/products`);
  check(listRes, { 'product list 200': (r) => r.status === 200 });

  const searchRes = http.get(`${BASE_URL}/v1/search?q=earbuds`);
  check(searchRes, { 'search 200': (r) => r.status === 200 });

  sleep(Math.random() * 2);
}

export function checkoutFlow() {
  const email = `k6-${__VU}-${__ITER}-${Date.now()}@loadtest.com`;
  const registerRes = http.post(
    `${BASE_URL}/v1/auth/register`,
    JSON.stringify({ email, name: 'Load Test', password: 'LoadTest123' }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(registerRes, { 'register 201': (r) => r.status === 201 });
  const token = registerRes.json('accessToken');
  if (!token) return;

  const authHeaders = { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } };

  const products = http.get(`${BASE_URL}/v1/products`).json('items');
  const variant = products?.[0]?.variants?.[0];
  if (!variant) return;

  const addRes = http.post(`${BASE_URL}/v1/cart/items`, JSON.stringify({ variantId: variant.id, quantity: 1 }), authHeaders);
  check(addRes, { 'add to cart 201': (r) => r.status === 201 });

  const checkoutRes = http.post(`${BASE_URL}/v1/orders/checkout`, JSON.stringify({}), authHeaders);
  check(checkoutRes, { 'checkout 201 or expected 400 (out of stock)': (r) => r.status === 201 || r.status === 400 });

  sleep(1);
}
