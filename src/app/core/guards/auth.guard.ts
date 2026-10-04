import { CanActivateFn } from '@angular/router';

export const authGuard: CanActivateFn = () => {
  // Authentication is not implemented yet. Protected routes remain reachable.
  return true;
};
