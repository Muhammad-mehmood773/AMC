import { Routes } from '@angular/router';
import { unsavedChangesGuard } from '@core/guards/unsaved-changes.guard';
import { provideAssetData } from './data/provide-asset-data';

/** SRS 03 — Asset / Installed Base Management. */
export const ASSETS_ROUTES: Routes = [
  {
    path: '',
    providers: [provideAssetData()],
    loadComponent: () => import('./pages/assets-shell').then((m) => m.AssetsShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        title: 'Asset Dashboard',
        loadComponent: () => import('./pages/asset-dashboard/asset-dashboard.page').then((m) => m.AssetDashboardPage),
      },
      {
        path: 'list',
        title: 'Assets',
        loadComponent: () => import('./pages/asset-list/asset-list.page').then((m) => m.AssetListPage),
      },
      {
        path: 'new',
        title: 'New Asset',
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () => import('./pages/asset-form/asset-form.page').then((m) => m.AssetFormPage),
      },
      {
        path: 'hierarchy',
        title: 'Asset Hierarchy',
        loadComponent: () => import('./pages/asset-hierarchy/asset-hierarchy.page').then((m) => m.AssetHierarchyPage),
      },
      {
        path: 'installations',
        title: 'Asset Installation / Commissioning',
        loadComponent: () => import('./pages/register-pages').then((m) => m.InstallationsPage),
      },
      {
        path: 'transfers',
        title: 'Asset Transfers',
        loadComponent: () => import('./pages/register-pages').then((m) => m.TransfersPage),
      },
      {
        path: 'warranties',
        title: 'Asset Warranties',
        loadComponent: () => import('./pages/register-pages').then((m) => m.WarrantiesPage),
      },
      {
        path: 'entitlements',
        title: 'Asset Entitlements',
        loadComponent: () => import('./pages/register-pages').then((m) => m.EntitlementsPage),
      },
      {
        path: 'documents',
        title: 'Asset Documents',
        loadComponent: () => import('./pages/register-pages').then((m) => m.AssetDocumentsPage),
      },
      {
        path: 'service-history',
        title: 'Asset Service History',
        loadComponent: () => import('./pages/register-pages').then((m) => m.ServiceHistoryPage),
      },
      {
        path: 'lifecycle',
        title: 'Asset Lifecycle History',
        loadComponent: () => import('./pages/register-pages').then((m) => m.LifecycleHistoryPage),
      },
      {
        path: ':assetId',
        title: 'Asset 360',
        loadComponent: () => import('./pages/asset-detail/asset-detail.page').then((m) => m.AssetDetailPage),
      },
      {
        path: ':assetId/edit',
        title: 'Edit Asset',
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () => import('./pages/asset-form/asset-form.page').then((m) => m.AssetFormPage),
      },
    ],
  },
];
