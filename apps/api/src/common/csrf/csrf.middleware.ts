import { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Paths that legitimately can't carry a CSRF token yet: login/register are
// what *establish* the session that the token would be scoped to, and the
// SSLCommerz callbacks are server-to-server (no browser, no cookies, so a
// browser-based CSRF token is meaningless there — those are protected
// instead by the gateway validation in payments.service.ts).
const EXEMPT_PATHS = [
  '/v1/auth/login',
  '/v1/auth/register',
  '/payments/sslcommerz/ipn',
  '/payments/sslcommerz/success',
  '/payments/sslcommerz/fail',
  '/payments/sslcommerz/cancel',
];

export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  if (!MUTATING_METHODS.has(req.method) || EXEMPT_PATHS.some((p) => req.path.startsWith(p))) {
    return next();
  }

  // No cookie-based session (e.g. an API client using a Bearer token
  // instead of cookies) — CSRF doesn't apply to clients that don't
  // automatically attach credentials, so skip the check.
  if (!req.cookies?.accessToken) {
    return next();
  }

  const cookieToken = req.cookies?.csrfToken;
  const headerToken = req.header('x-csrf-token');

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ statusCode: 403, message: 'CSRF token missing or invalid' });
  }

  next();
}
