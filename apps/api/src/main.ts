import './common/tracing/tracing'; // must be first import — instruments everything loaded after it

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, RequestMethod } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import * as Sentry from '@sentry/node';
import * as express from 'express';
import cookieParser from 'cookie-parser';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { csrfProtection } from './common/csrf/csrf.middleware';
import { loadSecrets } from './bootstrap-secrets';

async function bootstrap() {
  await loadSecrets(); // populates process.env from AWS Secrets Manager if AWS_SECRETS_ID is set, before any ConfigService.getOrThrow() call happens

  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV ?? 'development',
      tracesSampleRate: 0.1, // 10% of requests — full tracing is expensive at scale
    });
  }

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  // SSLCommerz posts payment callbacks as application/x-www-form-urlencoded,
  // not JSON — without this, req.body is empty for /payments/sslcommerz/*.
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(csrfProtection);

  app.enableCors({
    origin: process.env.WEB_ORIGIN?.split(',') ?? 'http://localhost:3000',
    credentials: true, // required for cookies to be sent/received cross-origin in native dev mode
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,        // strip unknown properties — reduces mass-assignment risk
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // API versioning — /v1 prefix on every route except the SSLCommerz
  // gateway callbacks, whose exact URLs are configured directly in the
  // SSLCommerz merchant dashboard (see payments-callback.controller.ts) and
  // must not move just because internal API versioning changes.
  app.setGlobalPrefix('v1', {
    exclude: [
      { path: 'payments/sslcommerz/ipn', method: RequestMethod.POST },
      { path: 'payments/sslcommerz/success', method: RequestMethod.POST },
      { path: 'payments/sslcommerz/fail', method: RequestMethod.POST },
      { path: 'payments/sslcommerz/cancel', method: RequestMethod.POST },
    ],
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('AI Commerce API')
    .setDescription('Auto-generated from route + DTO decorators — see individual controllers for details.')
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth('accessToken')
    .build();
  const swaggerDoc = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('v1/docs', app, swaggerDoc);

  await app.listen(process.env.PORT ?? 4000);
}
bootstrap();
