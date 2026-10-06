import { Routes } from '@angular/router';

const errorPage = () => import('../errors/error-page').then((m) => m.ErrorPage);

/** Public / unauthenticated area: system error and maintenance pages. */
export const PUBLIC_ROUTES: Routes = [
  { path: 'error/:code', title: 'Error', loadComponent: errorPage },
  { path: 'maintenance', title: 'Maintenance', data: { code: 'maintenance' }, loadComponent: errorPage },
  { path: 'offline', title: 'Offline', data: { code: 'offline' }, loadComponent: errorPage },
];
