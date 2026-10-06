import { Routes } from '@angular/router';

/** Authentication area (mock auth; see `AuthService`). */
export const AUTH_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: 'login', title: 'Sign in', loadComponent: () => import('./pages/login.page').then((m) => m.LoginPage) },
  { path: 'forgot-password', title: 'Forgot password', loadComponent: () => import('./pages/forgot-password.page').then((m) => m.ForgotPasswordPage) },
  { path: 'reset-password', title: 'Reset password', loadComponent: () => import('./pages/reset-password.page').then((m) => m.ResetPasswordPage) },
  { path: 'session-expired', title: 'Session expired', loadComponent: () => import('./pages/session-expired.page').then((m) => m.SessionExpiredPage) },
  { path: 'account-locked', title: 'Account locked', loadComponent: () => import('./pages/account-locked.page').then((m) => m.AccountLockedPage) },
];
