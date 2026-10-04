import { Routes } from '@angular/router';
import { authGuard } from '@core/guards/auth.guard';
import { guestGuard } from '@core/guards/guest.guard';
import { permissionGuard } from '@core/guards/permission.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('@layout/public-layout').then((m) => m.PublicLayout),
    children: [
      {
        path: '',
        loadChildren: () => import('./features/public/public.routes').then((m) => m.PUBLIC_ROUTES),
      },
    ],
  },
  {
    path: 'auth',
    canActivate: [guestGuard],
    loadComponent: () => import('@layout/auth-layout').then((m) => m.AuthLayout),
    children: [
      {
        path: '',
        loadChildren: () => import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
      },
    ],
  },
  {
    path: 'app',
    canActivate: [authGuard],
    loadComponent: () => import('@layout/app-layout').then((m) => m.AppLayout),
    loadChildren: () => import('./features/app.routes').then((m) => m.APP_ROUTES),
  },
  {
    path: 'admin',
    canActivate: [authGuard, permissionGuard('admin.access')],
    loadComponent: () => import('@layout/admin-layout').then((m) => m.AdminLayout),
    children: [
      {
        path: '',
        loadChildren: () =>
          import('./features/administration/administration.routes').then(
            (m) => m.ADMINISTRATION_ROUTES,
          ),
      },
    ],
  },
  {
    path: 'portal',
    canActivate: [authGuard],
    loadComponent: () => import('@layout/public-layout').then((m) => m.PublicLayout),
    children: [
      {
        path: '',
        loadChildren: () =>
          import('./features/customer-portal/customer-portal.routes').then(
            (m) => m.CUSTOMER_PORTAL_ROUTES,
          ),
      },
    ],
  },
  {
    path: '**',
    redirectTo: '',
  },
];
