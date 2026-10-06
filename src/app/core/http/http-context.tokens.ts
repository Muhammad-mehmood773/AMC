import { HttpContextToken } from '@angular/common/http';

export const SKIP_AUTH = new HttpContextToken<boolean>(() => false);

export const SKIP_LOADING = new HttpContextToken<boolean>(() => false);

/** Set when the caller presents errors itself (suppresses the global toast and redirects). */
export const SKIP_ERROR_HANDLING = new HttpContextToken<boolean>(() => false);

/** Disables automatic retry of idempotent requests. */
export const SKIP_RETRY = new HttpContextToken<boolean>(() => false);
