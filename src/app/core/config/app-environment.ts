export interface AppFeatureFlags {
  readonly customerPortal: boolean;
  readonly notifications: boolean;
  readonly profitability: boolean;
}

export type AppEnvironmentName = 'development' | 'production';

export interface AppEnvironment {
  readonly name: AppEnvironmentName;
  readonly production: boolean;
  readonly apiBaseUrl: string;
  readonly defaultLocale: string;
  readonly features: AppFeatureFlags;
}
