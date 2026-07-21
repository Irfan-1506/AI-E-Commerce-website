import { test, expect } from '@playwright/test';

const PRODUCT = {
  id: 'prod_1',
  name: 'Wireless Earbuds',
  slug: 'wireless-earbuds',
  basePrice: '2499',
  description: 'Bluetooth earbuds for testing.',
  images: [{ url: 'https://placehold.co/600x600', altText: 'Earbuds' }],
  variants: [
    { id: 'var_1', sku: 'EARBUD-1', price: '2499', attributes: { color: 'black' }, inventory: { quantity: 10 } },
  ],
};

const ORDER = {
  id: 'order_1',
  status: 'PENDING',
  subtotal: '2499',
  discount: '0',
  shippingFee: '60',
  total: '2559',
  items: [{ quantity: 1, unitPrice: '2499', variantId: 'var_1' }],
};

test.describe('Shopping flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/v1/products?*', (route) =>
      route.fulfill({ json: { items: [PRODUCT], total: 1 } }),
    );
    await page.route('**/api/v1/products/wireless-earbuds', (route) => route.fulfill({ json: PRODUCT }));
    await page.route('**/api/v1/products/prod_1/related', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/v1/products/prod_1/frequently-bought-with', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/v1/products/prod_1/view', (route) => route.fulfill({ json: {} }));
    await page.route('**/api/v1/products/prod_1/reviews/summary', (route) => route.fulfill({ json: { available: false, reviewCount: 0 } }));
  });

  test('browsing the catalog shows the seeded product', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Wireless Earbuds')).toBeVisible();
  });

  test('product detail page shows price and add-to-cart', async ({ page }) => {
    await page.goto('/products/wireless-earbuds');
    await expect(page.getByRole('heading', { name: 'Wireless Earbuds' })).toBeVisible();
    await expect(page.getByText('৳2499')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add to cart' })).toBeVisible();
  });

  test('full flow: add to cart, checkout, land on order confirmation', async ({ page, context }) => {
    // The app no longer stores tokens in localStorage — it uses httpOnly
    // cookies the page's own JS can't read. Simulating "logged in" for this
    // test means setting cookies directly, the same way the real login
    // response does via Set-Cookie.
    await context.addCookies([
      { name: 'accessToken', value: 'fake-token-for-e2e', domain: 'localhost', path: '/' },
      { name: 'csrfToken', value: 'fake-csrf-for-e2e', domain: 'localhost', path: '/' },
    ]);

    let cartItems: any[] = [];
    await page.route('**/api/v1/cart/items', (route) => {
      cartItems = [{ variantId: 'var_1', quantity: 1, variant: { price: '2499', product: { name: PRODUCT.name, slug: PRODUCT.slug } } }];
      return route.fulfill({ json: { id: 'cart_1', items: cartItems } });
    });
    await page.route('**/api/v1/cart', (route) => route.fulfill({ json: { id: 'cart_1', items: cartItems } }));
    await page.route('**/api/v1/orders/checkout', (route) => route.fulfill({ status: 201, json: ORDER }));
    await page.route('**/api/v1/payments/sslcommerz/init', (route) =>
      route.fulfill({ json: { gatewayUrl: 'http://localhost:3000/orders/order_1', tranId: 'tran_1' } }),
    );
    await page.route('**/api/v1/orders/order_1', (route) => route.fulfill({ json: ORDER }));

    await page.goto('/products/wireless-earbuds');
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await expect(page.getByText('Added to cart.')).toBeVisible();

    await page.goto('/cart');
    await expect(page.getByText('Wireless Earbuds')).toBeVisible();
    await expect(page.getByText('৳2499.00')).toBeVisible(); // subtotal

    await page.getByRole('button', { name: 'Checkout' }).click();

    // Checkout hands off to the (mocked) payment gateway, which redirects
    // back to the order confirmation page — same as the real SSLCommerz flow.
    await page.waitForURL('**/api/v1/orders/order_1');
    await expect(page.getByText('Order confirmed')).toBeVisible();
    await expect(page.getByText('৳2559')).toBeVisible(); // total
  });

  test('unauthenticated add-to-cart redirects to login', async ({ page }) => {
    await page.route('**/api/v1/cart/items', (route) => route.fulfill({ status: 401, json: { message: 'Unauthorized' } }));
    await page.goto('/products/wireless-earbuds');
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await page.waitForURL('**/login');
  });
});
