import { CanActivateFn } from '@angular/router';

export const guestGuard: CanActivateFn = () => {
  // Guest-only routing will redirect authenticated users once auth is implemented.
  return true;
};
