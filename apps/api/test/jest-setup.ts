// These are read via ConfigService.getOrThrow() in various constructors —
// if they're missing, Nest's DI container throws at module init even for
// tests that never touch payments/storage/AI. Dummy values are fine because
// unit tests mock their services directly, and the integration tests only
// exercise auth/cart/orders — not the modules that would actually call out
// to these providers.
const defaults: Record<string, string> = {
  JWT_ACCESS_SECRET: 'test-access-secret',
  JWT_REFRESH_SECRET: 'test-refresh-secret',
  S3_BUCKET: 'test-bucket',
  S3_ACCESS_KEY: 'test-key',
  S3_SECRET_KEY: 'test-secret',
  SSLCOMMERZ_STORE_ID: 'test-store',
  SSLCOMMERZ_STORE_PASSWORD: 'test-password',
  APP_BASE_URL: 'http://localhost:4000',
  ANTHROPIC_API_KEY: 'test-anthropic-key',
  VOYAGE_API_KEY: 'test-voyage-key',
};

for (const [key, value] of Object.entries(defaults)) {
  if (!process.env[key]) process.env[key] = value;
}
