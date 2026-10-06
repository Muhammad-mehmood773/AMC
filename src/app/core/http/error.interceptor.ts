import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { SessionStore } from '@core/auth/session.store';
import { Logger } from '@core/logging/logger';
import { NotificationPort } from '@core/notification/notification.port';
import { catchError, throwError } from 'rxjs';
import { toApiProblem } from './api-problem';
import { SKIP_AUTH, SKIP_ERROR_HANDLING } from './http-context.tokens';

const DEDUPE_MS = 4000;
let lastMessage = '';
let lastAt = 0;

/** Central API error handling: logging, session expiry redirect and a single user-facing toast. */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const logger = inject(Logger);
  const notifications = inject(NotificationPort);
  const session = inject(SessionStore);
  const router = inject(Router);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      const problem = toApiProblem(error);
      logger.error('HTTP request failed', { url: req.url, method: req.method, status: problem.status, kind: problem.kind, requestId: problem.requestId });

      if (!req.context.get(SKIP_ERROR_HANDLING)) {
        if (problem.kind === 'unauthorized' && !req.context.get(SKIP_AUTH)) {
          session.clear();
          if (!router.url.startsWith('/auth')) {
            void router.navigate(['/auth/session-expired'], { queryParams: { returnUrl: router.url } });
          }
        } else if (problem.kind !== 'validation') {
          const now = Date.now();
          const key = `${problem.kind}:${problem.message}`;
          if (key !== lastMessage || now - lastAt > DEDUPE_MS) {
            lastMessage = key;
            lastAt = now;
            const ref = problem.requestId ? ` (ref ${problem.requestId})` : '';
            notifications.show({ kind: problem.kind === 'offline' ? 'warning' : 'error', title: problem.title, message: problem.message + ref });
          }
        }
      }
      return throwError(() => error);
    }),
  );
};
