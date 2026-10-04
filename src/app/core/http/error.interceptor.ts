import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Logger } from '@core/logging/logger';
import { catchError, throwError } from 'rxjs';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const logger = inject(Logger);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      logger.error('HTTP request failed', {
        url: req.url,
        method: req.method,
        status: error.status,
      });

      return throwError(() => error);
    }),
  );
};
