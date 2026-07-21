/** @type {import('next').NextConfig} */
const { withSentryConfig } = require('@sentry/nextjs');
const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:4000';

const nextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
  // Proxies browser requests to /api/v1/* through to the NestJS API server-
  // side. This is what makes cookie-based auth work cleanly: the browser
  // only ever talks to its own origin (localhost:3000 in dev, the real
  // domain in prod), so there's no cross-site cookie problem to solve and
  // no CORS complexity on the happy path. Behind nginx in the full Docker
  // stack this is redundant (nginx already puts everything on one origin)
  // but harmless — requests just get proxied twice.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_ORIGIN}/:path*` }];
  },
};

// withSentryConfig no-ops gracefully if SENTRY_DSN/SENTRY_AUTH_TOKEN aren't
// set — safe to leave wrapped even in environments that haven't configured
// Sentry yet.
module.exports = withSentryConfig(nextConfig, { silent: true }, { hideSourceMaps: true });

