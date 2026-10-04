import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { LoadingStore } from '@core/loading/loading.store';
import { finalize } from 'rxjs';
import { SKIP_LOADING } from './http-context.tokens';

export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.context.get(SKIP_LOADING)) {
    return next(req);
  }

  const loadingStore = inject(LoadingStore);
  loadingStore.begin();

  return next(req).pipe(finalize(() => loadingStore.end()));
};
