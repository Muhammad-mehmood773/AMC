import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { SessionStore } from '@core/auth/session.store';

export const permissionGuard = (permission: string): CanActivateFn => {
  return () => {
    const session = inject(SessionStore);

    if (!session.session().user) {
      return true;
    }

    return session.hasPermission(permission);
  };
};
