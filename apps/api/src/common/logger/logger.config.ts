import { randomUUID } from 'crypto';
import type { Params } from 'nestjs-pino';

// Structured JSON logs with per-request correlation IDs. In production these
// ship straight to your log aggregator (see docker-compose / Loki setup);
// in dev, pino-pretty makes them readable.
export const loggerConfig: Params = {
  pinoHttp: {
    genReqId: (req) => req.headers['x-request-id'] ?? randomUUID(),
    transport:
      process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true, singleLine: true } }
        : undefined,
    redact: {
      // Never log credentials, tokens, or card data even accidentally.
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.body.password',
        'req.body.refreshToken',
        'req.body.cardNumber',
        'req.body.cvv',
      ],
      censor: '[REDACTED]',
    },
    customLogLevel: (req, res, err) => {
      if (res.statusCode >= 500 || err) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
  },
};
