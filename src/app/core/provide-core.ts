import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';
import { AppearanceStore } from './appearance/appearance.store';
import { APP_ENVIRONMENT } from './config/app-environment.token';
import { environment } from '@env';
import { APP_LOCALE } from './i18n/locale.token';
import { authInterceptor } from './http/auth.interceptor';
import { errorInterceptor } from './http/error.interceptor';
import { loadingInterceptor } from './http/loading.interceptor';
import { retryInterceptor } from './http/retry.interceptor';

export function provideCore(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideHttpClient(withInterceptors([authInterceptor, loadingInterceptor, retryInterceptor, errorInterceptor])),
    { provide: APP_ENVIRONMENT, useValue: environment },
    { provide: APP_LOCALE, useValue: environment.defaultLocale },
    provideAppInitializer(() => inject(AppearanceStore).initialize()),
  ]);
}
