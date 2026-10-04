import type { AppEnvironment } from '@core/config/app-environment';

export const environment: AppEnvironment = {
  name: 'development',
  production: false,
  apiBaseUrl: 'http://localhost:3000/api',
  defaultLocale: 'en',
  features: {
    customerPortal: true,
    notifications: true,
    profitability: true,
  },
};
