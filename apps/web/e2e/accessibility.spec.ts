import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PRODUCT = {
  id: 'prod_1',
  name: 'Wireless Earbuds',
  slug: 'wireless-earbuds',
  basePrice: '2499',
  description: 'Bluetooth earbuds for testing.',
  images: [{ url: 'https://placehold.co/600x600', altText: 'Earbuds' }],
  variants: [{ id: 'var_1', sku: 'EARBUD-1', price: '2499', attributes: { color: 'black' }, inventory: { quantity: 10 } }],
};

test.describe('Accessibility (axe-core)', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/v1/products?*', (route) => route.fulfill({ json: { items: [PRODUCT], total: 1 } }));
    await page.route('**/api/v1/products/wireless-earbuds', (route) => route.fulfill({ json: PRODUCT }));
    await page.route('**/api/v1/products/prod_1/**', (route) => route.fulfill({ json: [] }));
  });

  // WCAG 2.0/2.1 Level A+AA is the standard baseline most accessibility
  // audits target — matching that here rather than a looser or stricter
  // ruleset keeps this comparable to an external audit's findings.
  const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

  test('home page has no serious/critical violations', async ({ page }) => {
    await page.goto('/');
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    const serious = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''));
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test('product detail page has no serious/critical violations', async ({ page }) => {
    await page.goto('/products/wireless-earbuds');
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    const serious = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''));
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test('login page has no serious/critical violations', async ({ page }) => {
    await page.goto('/login');
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    const serious = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''));
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test('cart page has no serious/critical violations', async ({ page, context }) => {
    await context.addCookies([{ name: 'accessToken', value: 'fake', domain: 'localhost', path: '/' }]);
    await page.route('**/api/v1/cart', (route) => route.fulfill({ json: { id: 'cart_1', items: [] } }));
    await page.goto('/cart');
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    const serious = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''));
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
