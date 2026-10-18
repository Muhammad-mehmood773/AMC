import { Routes } from '@angular/router';
import { unsavedChangesGuard } from '@core/guards/unsaved-changes.guard';
import { provideSlaData } from './data/provide-sla-data';

/** SRS 07 — SLA Management. */
export const SLA_ROUTES: Routes = [
  {
    path: '',
    providers: [provideSlaData()],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', title: 'SLA Dashboard', loadComponent: () => import('./pages/sla-dashboard.page').then((m) => m.SlaDashboardPage) },
      { path: 'list', title: 'SLAs', loadComponent: () => import('./pages/sla-list.page').then((m) => m.SlaListPage) },
      { path: 'new', title: 'New SLA', canDeactivate: [unsavedChangesGuard], loadComponent: () => import('./pages/sla-form/sla-form.page').then((m) => m.SlaFormPage) },
      { path: 'targets', title: 'SLA Definition & Targets', loadComponent: () => import('./pages/targets.page').then((m) => m.TargetsPage) },
      { path: 'coverage', title: 'SLA Coverage & Applicability', loadComponent: () => import('./pages/coverage.page').then((m) => m.SlaCoveragePage) },
      { path: 'calendars', title: 'SLA Calendar & Service Hours', loadComponent: () => import('./pages/calendars.page').then((m) => m.CalendarsPage) },
      { path: 'escalations', title: 'SLA Escalation Rules', loadComponent: () => import('./pages/escalations.page').then((m) => m.EscalationsPage) },
      { path: 'mapping', title: 'SLA Assignment / Mapping', loadComponent: () => import('./pages/mapping.page').then((m) => m.MappingPage) },
      { path: 'monitoring', title: 'SLA Monitoring', loadComponent: () => import('./pages/monitoring.page').then((m) => m.MonitoringPage) },
      { path: 'breaches', title: 'SLA Breach Management', loadComponent: () => import('./pages/breaches.page').then((m) => m.BreachesPage) },
      { path: 'performance', title: 'SLA Performance & History', loadComponent: () => import('./pages/performance.page').then((m) => m.PerformancePage) },
      { path: ':slaId', title: 'SLA 360', loadComponent: () => import('./pages/sla-detail/sla-detail.page').then((m) => m.SlaDetailPage) },
      { path: ':slaId/edit', title: 'Edit SLA', canDeactivate: [unsavedChangesGuard], loadComponent: () => import('./pages/sla-form/sla-form.page').then((m) => m.SlaFormPage) },
    ],
  },
];
