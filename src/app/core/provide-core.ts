import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { APP_ENVIRONMENT } from './config/app-environment.token';
import { environment } from '@env';
import { APP_LOCALE } from './i18n/locale.token';
import { authInterceptor } from './http/auth.interceptor';
import { errorInterceptor } from './http/error.interceptor';
import { loadingInterceptor } from './http/loading.interceptor';

export function provideCore(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideHttpClient(withInterceptors([authInterceptor, loadingInterceptor, errorInterceptor])),
    { provide: APP_ENVIRONMENT, useValue: environment },
    { provide: APP_LOCALE, useValue: environment.defaultLocale },
  ]);
}
