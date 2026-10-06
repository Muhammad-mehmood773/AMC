import { Injectable, inject } from '@angular/core';
import { type Observable, defer, delay, of, throwError } from 'rxjs';
import { SessionStore } from './session.store';

export type AuthErrorCode = 'invalid-credentials' | 'account-locked';

export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    message: string,
    readonly attemptsLeft?: number,
  ) {
    super(message);
  }
}

export const DEMO_ACCOUNT = { email: 'ahmed.harbi@gfs.sa', password: 'Demo@1234' } as const;
export const MAX_FAILED_ATTEMPTS = 5;

const LATENCY_MS = 600;

/**
 * Mock authentication. Replace with an HTTP implementation later; the page components depend only
 * on this API. After 5 failed attempts for an email the account is locked (demo behaviour).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly session = inject(SessionStore);
  private readonly failures = new Map<string, number>();

  login(email: string, password: string): Observable<void> {
    return defer(() => {
      const key = email.trim().toLowerCase();
      if ((this.failures.get(key) ?? 0) >= MAX_FAILED_ATTEMPTS) {
        return throwError(() => new AuthError('account-locked', 'This account is locked.'));
      }
      if (key !== DEMO_ACCOUNT.email || password !== DEMO_ACCOUNT.password) {
        const count = (this.failures.get(key) ?? 0) + 1;
        this.failures.set(key, count);
        return count >= MAX_FAILED_ATTEMPTS
          ? throwError(() => new AuthError('account-locked', 'This account is locked.'))
          : throwError(() => new AuthError('invalid-credentials', 'Incorrect email or password.', MAX_FAILED_ATTEMPTS - count));
      }
      this.failures.delete(key);
      this.session.setSession({
        user: { id: 'USR-01', displayName: 'Ahmed Al-Harbi', email: DEMO_ACCOUNT.email },
        tenant: { id: 'TEN-01', name: 'Gulf Facility Services Co.' },
        roles: ['account-manager'],
        permissions: ['admin.access'],
        accessToken: 'demo-token',
      });
      return of(undefined);
    }).pipe(delay(LATENCY_MS));
  }

  requestPasswordReset(email: string): Observable<void> {
    void email;
    return of(undefined).pipe(delay(LATENCY_MS));
  }

  resetPassword(token: string, password: string): Observable<void> {
    void password;
    return token === 'expired'
      ? defer(() => throwError(() => new Error('This reset link has expired. Request a new one.'))).pipe(delay(LATENCY_MS))
      : of(undefined).pipe(delay(LATENCY_MS));
  }

  /** Demo helper so a locked account can be recovered. */
  unlock(email: string): Observable<void> {
    return defer(() => {
      this.failures.delete(email.trim().toLowerCase());
      return of(undefined);
    }).pipe(delay(LATENCY_MS));
  }

  logout(): void {
    this.session.clear();
  }
}
