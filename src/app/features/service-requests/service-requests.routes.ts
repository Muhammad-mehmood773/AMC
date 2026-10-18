import { Routes } from '@angular/router';
import { unsavedChangesGuard } from '@core/guards/unsaved-changes.guard';
import { provideSrData } from './data/provide-sr-data';

/** SRS 09 — Service Request Management (service demand capture). */
export const SERVICE_REQUESTS_ROUTES: Routes = [
  {
    path: '',
    providers: [provideSrData()],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', title: 'Service Request Dashboard', loadComponent: () => import('./pages/sr-dashboard.page').then((m) => m.SrDashboardPage) },
      { path: 'list', title: 'Service Requests', loadComponent: () => import('./pages/request-list.page').then((m) => m.RequestListPage) },
      { path: 'new', title: 'New Service Request', canDeactivate: [unsavedChangesGuard], loadComponent: () => import('./pages/request-form.page').then((m) => m.RequestFormPage) },
      { path: 'identification', title: 'Identification', loadComponent: () => import('./pages/identification.page').then((m) => m.IdentificationPage) },
      { path: 'classification', title: 'Classification', loadComponent: () => import('./pages/classification.page').then((m) => m.ClassificationPage) },
      { path: 'coverage', title: 'Coverage Validation', loadComponent: () => import('./pages/coverage.page').then((m) => m.SrCoveragePage) },
      { path: 'sla', title: 'SLA & Priority', loadComponent: () => import('./pages/sla-priority.page').then((m) => m.SlaPriorityPage) },
      { path: 'assignment', title: 'Assignment & Routing', loadComponent: () => import('./pages/assignment.page').then((m) => m.AssignmentPage) },
      { path: 'scheduling', title: 'Scheduling', loadComponent: () => import('./pages/scheduling.page').then((m) => m.SchedulingPage) },
      { path: 'communication', title: 'Communication & Activity', loadComponent: () => import('./pages/communication.page').then((m) => m.CommunicationPage) },
      { path: 'escalations', title: 'Escalation', loadComponent: () => import('./pages/escalation.page').then((m) => m.EscalationPage) },
      { path: 'resolution', title: 'Resolution & Closure', loadComponent: () => import('./pages/resolution.page').then((m) => m.ResolutionPage) },
      { path: 'history', title: 'Request History & Audit', loadComponent: () => import('./pages/history.page').then((m) => m.SrHistoryPage) },
      { path: 'performance', title: 'Request Performance', loadComponent: () => import('./pages/performance.page').then((m) => m.SrPerformancePage) },
      { path: ':requestId', title: 'Request 360', loadComponent: () => import('./pages/request-detail/request-detail.page').then((m) => m.RequestDetailPage) },
      { path: ':requestId/edit', title: 'Edit Service Request', canDeactivate: [unsavedChangesGuard], loadComponent: () => import('./pages/request-form.page').then((m) => m.RequestFormPage) },
    ],
  },
];
