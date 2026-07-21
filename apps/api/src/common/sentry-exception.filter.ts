import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import * as Sentry from '@sentry/node';

@Catch()
export class SentryExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    // Only 5xx goes to Sentry — 4xx are expected client errors, not incidents.
    if (status >= 500) {
      Sentry.captureException(exception, { extra: { path: req.url, method: req.method } });
    }

    const message = isHttpException ? exception.getResponse() : 'Internal server error';
    res.status(status).json(
      typeof message === 'string' ? { statusCode: status, message } : { statusCode: status, ...message },
    );
  }
}
