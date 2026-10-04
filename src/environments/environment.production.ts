import type { AppEnvironment } from '@core/config/app-environment';

export const environment: AppEnvironment = {
  name: 'production',
  production: true,
  apiBaseUrl: '/api',
  defaultLocale: 'en',
  features: {
    customerPortal: true,
    notifications: true,
    profitability: true,
  },
};
