import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal, viewChild } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { NotificationPort } from '@core/notification/notification.port';
import { toOptions } from '@shared/models/select-option';
import type { MenuItem } from '@shared/ui/action-menu';
import { type BulkAction, DataTable, type RowAction, type SortState } from '@shared/ui/data-table';
import { FilterBar } from '@shared/ui/filter-bar';
import { Icon } from '@shared/ui/icon';
import { PageHeader } from '@shared/ui/page-header';
import { downloadCsv, timestampedName } from '@shared/utils/file';
import { type FilterField, type FilterValues, filterList, matchesAny, withinRange } from '@shared/utils/filters';
import { PlanActionHost, planActions } from '../components/plan-action-host';
import { planColumns } from '../components/pm-columns';
import { PmReferenceStore } from '../data/pm-reference.store';
import { PlanApi } from '../data/pm.api';
import { FREQUENCY_TYPES, PLAN_STATUSES, PM_TYPES, type PlanListItem } from '../models/plan.model';

@Component({
  selector: 'amc-plan-list-page',
  imports: [DataTable, FilterBar, Icon, PageHeader, PlanActionHost, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="Maintenance Plans" subtitle="All preventive and recurring maintenance plans." [breadcrumbs]="[{ label: 'Preventive Maintenance', path: '/app/preventive-maintenance/dashboard' }, { label: 'Plans' }]">
        <button type="button" class="amc-btn-secondary" [disabled]="!filtered().length" (click)="export()"><amc-icon name="download" /> <span class="hidden sm:inline">Export</span></button>
        <a routerLink="/app/preventive-maintenance/new" class="amc-btn-primary"><amc-icon name="plus" /> Create Plan</a>
      </amc-page-header>
      <section class="amc-card overflow-hidden">
        <div class="border-b border-line p-3 sm:p-4"><amc-filter-bar searchPlaceholder="Search plan number, name, customer, site, asset, serial number or service…" [(search)]="search" [fields]="filterFields()" [(filters)]="filters" /></div>
        <amc-data-table tableId="pm-plans" [entity]="{ singular: 'plan', plural: 'plans' }" [totalCount]="rows().length" [rows]="filtered()" [columns]="columns" [trackBy]="trackById" [loading]="plans.isLoading()" [error]="plans.error() ? 'Plans could not be loaded.' : null" [actions]="rowActions" [selectable]="true" [bulkActions]="bulkActions" [(sort)]="sort" emptyIcon="calendar-check" [emptyTitle]="rows().length ? 'No plans match your filters' : 'No maintenance plans yet'" emptyMessage="Try a different search or clear the filters." (action)="onAction($event)" (bulkAction)="onBulk($event)" (retry)="plans.reload()" />
      </section>
    </div>
    <amc-plan-action-host (done)="plans.reload()" />
  `,
})
export class PlanListPage {
  private readonly api = inject(PlanApi);
  private readonly notify = inject(NotificationPort);
  protected readonly refs = inject(PmReferenceStore);
  private readonly host = viewChild.required(PlanActionHost);

  readonly status = input<string>();
  readonly assetId = input<string>();

  protected readonly plans = rxResource({ stream: () => this.api.list() });
  protected readonly rows = computed(() => (this.plans.hasValue() ? this.plans.value() : []));
  protected readonly columns = planColumns();
  protected readonly trackById = (p: PlanListItem) => p.id;
  protected readonly sort = signal<SortState | null>(null);
  protected readonly search = signal('');
  protected readonly filters = linkedSignal<FilterValues>(() => {
    const seed: Record<string, string[]> = {};
    if (this.status()) seed['status'] = [this.status()!];
    if (this.assetId()) seed['asset'] = [this.assetId()!];
    return seed;
  });
  protected readonly filterFields = computed<FilterField[]>(() => {
    const customers = filterList(this.filters(), 'customer');
    const cust = customers.length === 1 ? customers[0] : null;
    return [
      { key: 'customer', label: 'Customer', type: 'multiselect', options: this.refs.customerOptions() },
      { key: 'site', label: 'Site', type: 'multiselect', options: this.refs.siteOptions(cust) },
      { key: 'asset', label: 'Asset', type: 'multiselect', options: this.refs.assetOptions(cust) },
      { key: 'category', label: 'Asset Category', type: 'multiselect', options: this.refs.categoryOptions() },
      { key: 'type', label: 'Maintenance Type', type: 'multiselect', options: toOptions(PM_TYPES) },
      { key: 'frequency', label: 'Frequency', type: 'multiselect', options: toOptions(FREQUENCY_TYPES) },
      { key: 'status', label: 'Status', type: 'multiselect', options: toOptions(PLAN_STATUSES) },
      { key: 'team', label: 'Technician Team', type: 'multiselect', options: this.refs.teamOptions() },
      { key: 'due', label: 'Due Date', type: 'date-range' },
      { key: 'next', label: 'Next Schedule Date', type: 'date-range' },
    ];
  });
  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    const assets = filterList(f, 'asset');
    return this.rows().filter((p) => {
      const serials = p.assetIds.map((id) => this.refs.asset(id)?.serialNumber ?? '').join(' ');
      return (
        (!term || `${p.number} ${p.name} ${p.customerName} ${p.siteName} ${p.assetNames.join(' ')} ${serials} ${p.serviceName ?? ''}`.toLowerCase().includes(term)) && matchesAny(f, 'customer', p.location.customerId) && matchesAny(f, 'site', p.location.siteId) &&
        (!assets.length || p.assetIds.some((a) => assets.includes(a))) && matchesAny(f, 'category', p.assetCategory) && matchesAny(f, 'type', p.maintenanceType) && matchesAny(f, 'frequency', p.frequency.type) && matchesAny(f, 'status', p.status) &&
        matchesAny(f, 'team', p.resources.team) && withinRange(f, 'due', p.nextDueDate) && withinRange(f, 'next', p.nextScheduledDate)
      );
    });
  });
  protected readonly rowActions = (p: PlanListItem): MenuItem[] => [...planActions(p, true), { id: 'export', label: 'Export', icon: 'download', dividerBefore: true }];
  protected readonly bulkActions: MenuItem[] = [{ id: 'export', label: 'Export', icon: 'download' }];

  protected onAction({ id, row }: RowAction<PlanListItem>): void {
    if (id === 'export') this.export([row]);
    else void this.host().run(id, row);
  }

  protected onBulk({ rows }: BulkAction<PlanListItem>): void {
    this.export(rows);
  }

  protected export(rows: readonly PlanListItem[] = this.filtered()): void {
    downloadCsv(timestampedName('maintenance-plans', 'csv'), ['Plan Number', 'Plan Name', 'Maintenance Type', 'Customer', 'Site', 'Asset', 'Asset Category', 'Service', 'Frequency', 'Next Due Date', 'Last Completed Date', 'Next Scheduled Date', 'Assigned Team', 'Status'],
      rows.map((p) => [p.number, p.name, p.maintenanceType, p.customerName, p.siteName, p.assetNames.join('; '), p.assetCategory, p.serviceName, p.frequencyLabel, p.nextDueDate, p.lastCompletedDate, p.nextScheduledDate, p.resources.team, p.status]));
    this.notify.success(`${rows.length} plan${rows.length === 1 ? '' : 's'} exported.`);
  }
}
