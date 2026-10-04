import { Injectable, computed, signal } from '@angular/core';
import { EMPTY_SESSION, type SessionState } from './auth.models';

@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly sessionState = signal<SessionState>(EMPTY_SESSION);

  readonly session = this.sessionState.asReadonly();
  readonly isAuthenticated = computed(() => this.sessionState().user !== null);
  readonly accessToken = computed(() => this.sessionState().accessToken);
  readonly tenant = computed(() => this.sessionState().tenant);
  readonly permissions = computed(() => this.sessionState().permissions);

  setSession(session: SessionState): void {
    this.sessionState.set(session);
  }

  clear(): void {
    this.sessionState.set(EMPTY_SESSION);
  }

  hasPermission(permission: string): boolean {
    return this.sessionState().permissions.includes(permission);
  }
}
