import { Routes } from '@angular/router';
import { unsavedChangesGuard } from '@core/guards/unsaved-changes.guard';
import { providePmData } from './data/provide-pm-data';

/** SRS 08 — Preventive Maintenance / Recurring Maintenance Automation. */
export const PREVENTIVE_MAINTENANCE_ROUTES: Routes = [
  {
    path: '',
    providers: [providePmData()],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', title: 'Preventive Maintenance Dashboard', loadComponent: () => import('./pages/pm-dashboard.page').then((m) => m.PmDashboardPage) },
      { path: 'list', title: 'Maintenance Plans', loadComponent: () => import('./pages/plan-list.page').then((m) => m.PlanListPage) },
      { path: 'new', title: 'New Maintenance Plan', canDeactivate: [unsavedChangesGuard], loadComponent: () => import('./pages/plan-form/plan-form.page').then((m) => m.PlanFormPage) },
      { path: 'strategy', title: 'Maintenance Strategy & Frequency', loadComponent: () => import('./pages/strategy.page').then((m) => m.StrategyPage) },
      { path: 'schedule', title: 'Recurring Maintenance Schedule', loadComponent: () => import('./pages/schedule.page').then((m) => m.SchedulePage) },
      { path: 'calendar', title: 'Maintenance Calendar', loadComponent: () => import('./pages/calendar.page').then((m) => m.CalendarPage) },
      { path: 'checklists', title: 'Maintenance Checklists', loadComponent: () => import('./pages/checklists.page').then((m) => m.ChecklistsPage) },
      { path: 'tasks', title: 'Maintenance Tasks & Procedures', loadComponent: () => import('./pages/tasks.page').then((m) => m.TasksPage) },
      { path: 'meters', title: 'Meter / Condition-Based Rules', loadComponent: () => import('./pages/meters.page').then((m) => m.MetersPage) },
      { path: 'work-orders', title: 'Automatic Work Order Generation', loadComponent: () => import('./pages/work-orders.page').then((m) => m.WorkOrdersPage) },
      { path: 'dispatch', title: 'Maintenance Assignment & Dispatch', loadComponent: () => import('./pages/dispatch.page').then((m) => m.DispatchPage) },
      { path: 'due', title: 'Maintenance Due / Overdue', loadComponent: () => import('./pages/due.page').then((m) => m.DuePage) },
      { path: 'performance', title: 'Maintenance History & Performance', loadComponent: () => import('./pages/performance.page').then((m) => m.PerformancePage) },
      { path: ':planId', title: 'PM 360', loadComponent: () => import('./pages/plan-detail/plan-detail.page').then((m) => m.PlanDetailPage) },
      { path: ':planId/edit', title: 'Edit Maintenance Plan', canDeactivate: [unsavedChangesGuard], loadComponent: () => import('./pages/plan-form/plan-form.page').then((m) => m.PlanFormPage) },
    ],
  },
];
