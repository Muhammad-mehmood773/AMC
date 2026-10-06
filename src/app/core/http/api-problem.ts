import { HttpErrorResponse } from '@angular/common/http';

export type ApiProblemKind =
  | 'offline'
  | 'network'
  | 'timeout'
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'validation'
  | 'rate-limited'
  | 'server'
  | 'unavailable'
  | 'unknown';

/** User-presentable description of a failed API call. */
export interface ApiProblem {
  readonly kind: ApiProblemKind;
  readonly status: number;
  readonly title: string;
  readonly message: string;
  /** Whether trying the same request again may succeed. */
  readonly retryable: boolean;
  /** Correlation id returned by the server, for support. */
  readonly requestId: string | null;
}

const PROBLEMS: Record<ApiProblemKind, Pick<ApiProblem, 'title' | 'message' | 'retryable'>> = {
  offline: { title: 'You are offline', message: 'Check your internet connection. Changes will work again once you are back online.', retryable: true },
  network: { title: 'Connection lost', message: 'We could not reach the server. Please try again.', retryable: true },
  timeout: { title: 'Request timed out', message: 'The server took too long to respond. Please try again.', retryable: true },
  unauthorized: { title: 'Session expired', message: 'Please sign in again to continue.', retryable: false },
  forbidden: { title: 'Access denied', message: 'You do not have permission to perform this action.', retryable: false },
  'not-found': { title: 'Not found', message: 'The requested record no longer exists or was moved.', retryable: false },
  conflict: { title: 'Conflicting change', message: 'This record was changed by someone else. Refresh and try again.', retryable: true },
  validation: { title: 'Invalid data', message: 'Some of the submitted information is not valid.', retryable: false },
  'rate-limited': { title: 'Too many requests', message: 'Please wait a moment before trying again.', retryable: true },
  server: { title: 'Server error', message: 'Something went wrong on our side. Please try again shortly.', retryable: true },
  unavailable: { title: 'Service unavailable', message: 'The service is temporarily unavailable. Please try again shortly.', retryable: true },
  unknown: { title: 'Something went wrong', message: 'An unexpected error occurred.', retryable: false },
};

export function kindForStatus(status: number): ApiProblemKind {
  switch (status) {
    case 400:
    case 422:
      return 'validation';
    case 401:
      return 'unauthorized';
    case 403:
      return 'forbidden';
    case 404:
    case 410:
      return 'not-found';
    case 408:
    case 504:
      return 'timeout';
    case 409:
    case 412:
      return 'conflict';
    case 429:
      return 'rate-limited';
    case 502:
    case 503:
      return 'unavailable';
    default:
      return status >= 500 ? 'server' : 'unknown';
  }
}

/** Maps any thrown value (HttpErrorResponse, TimeoutError, Error) to a presentable problem. */
export function toApiProblem(error: unknown): ApiProblem {
  let kind: ApiProblemKind = 'unknown';
  let status = 0;
  let requestId: string | null = null;
  let serverMessage: string | null = null;

  if (error instanceof HttpErrorResponse) {
    status = error.status;
    requestId = error.headers?.get('x-request-id') ?? (error.error as { requestId?: string } | null)?.requestId ?? null;
    serverMessage = (error.error as { message?: string } | null)?.message ?? null;
    kind = status === 0 ? (typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'network') : kindForStatus(status);
  } else if (error instanceof Error && error.name === 'TimeoutError') {
    kind = 'timeout';
  }

  const base = PROBLEMS[kind];
  const useServerMessage = !!serverMessage && (kind === 'validation' || kind === 'conflict');
  return { kind, status, requestId, ...base, message: useServerMessage ? (serverMessage as string) : base.message };
}
