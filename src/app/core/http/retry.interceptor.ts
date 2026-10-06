import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { retry, timer } from 'rxjs';
import { SKIP_RETRY } from './http-context.tokens';

const MAX_RETRIES = 2;
const BASE_DELAY_MS = 400;
const TRANSIENT = new Set([0, 502, 503, 504]);

/** Retries idempotent (GET/HEAD) requests on transient failures with exponential backoff. */
export const retryInterceptor: HttpInterceptorFn = (req, next) => {
  if (!['GET', 'HEAD'].includes(req.method) || req.context.get(SKIP_RETRY)) {
    return next(req);
  }
  return next(req).pipe(
    retry({
      count: MAX_RETRIES,
      delay: (error, attempt) =>
        error instanceof HttpErrorResponse && TRANSIENT.has(error.status) && (error.status !== 0 || navigator.onLine)
          ? timer(BASE_DELAY_MS * 2 ** (attempt - 1))
          : (() => {
              throw error;
            })(),
    }),
  );
};
