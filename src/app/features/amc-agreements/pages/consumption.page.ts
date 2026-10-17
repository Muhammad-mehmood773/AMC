import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import type { MenuItem } from '@shared/ui/action-menu';
import { type DataColumn, DataTable, type RowAction } from '@shared/ui/data-table';
import { FilterBar } from '@shared/ui/filter-bar';
import { Icon } from '@shared/ui/icon';
import { PageHeader } from '@shared/ui/page-header';
import { Panel } from '@shared/ui/panel';
import { type TabItem, Tabs } from '@shared/ui/tabs';
import { downloadCsv, timestampedName } from '@shared/utils/file';
import { type FilterField, type FilterValues, matchesAny } from '@shared/utils/filters';
import { formatDate } from '@shared/utils/format';
import { of } from 'rxjs';
import { ConsumptionMeters } from '../components/consumption-meters';
import { AmcReferenceStore } from '../data/amc-reference.store';
import { AmcApi, VisitApi } from '../data/amc.api';
import { AMC_RULES } from '../data/amc.config';
import { type AmcListItem, LIVE_AMC_STATUSES } from '../models/amc.model';
import type { VisitListItem } from '../models/operations.model';

interface UsageRow {
  readonly id: string;
  readonly label: string;
  readonly secondary: string;
  readonly visits: number;
  readonly hours: number;
  readonly parts: number;
  readonly callOuts: number;
}

@Component({
  selector: 'amc-consumption-page',
  imports: [ConsumptionMeters, DataTable, FilterBar, Icon, PageHeader, Panel, RouterLink, Tabs],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="AMC Consumption & Utilization" subtitle="How much of the contracted service has been consumed — usage is calculated automatically from completed visits." [breadcrumbs]="[{ label: 'AMC / Service Contracts', path: '/app/amc-agreements/dashboard' }, { label: 'Consumption' }]">
        <button type="button" class="amc-btn-secondary" (click)="export()"><amc-icon name="download" /> <span class="hidden sm:inline">Export</span></button>
      </amc-page-header>
      <section class="amc-card overflow-hidden">
        <div class="border-b border-line p-3 sm:p-4"><amc-filter-bar searchPlaceholder="Search AMC or customer…" [(search)]="search" [fields]="filterFields()" [(filters)]="filters" /></div>
        <amc-data-table tableId="amc-consumption" [entity]="{ singular: 'AMC', plural: 'AMCs' }" [rows]="filtered()" [columns]="columns" [trackBy]="trackById" [loading]="amcs.isLoading()" [actions]="rowActions" emptyIcon="activity" emptyTitle="No AMCs" emptyMessage="Try different filters." (action)="onAction($event)" />
      </section>

      @if (selected(); as a) {
        <div class="grid grid-cols-1 gap-5 xl:grid-cols-5">
          <amc-panel class="xl:col-span-2" [title]="a.number + ' · utilization'" [description]="a.title + ' · ' + a.customerName" icon="activity">
            <a panelActions [routerLink]="['/app/amc-agreements', a.id]" [queryParams]="{ tab: 'consumption' }" class="amc-link text-xs">AMC 360</a>
            <amc-consumption-meters [consumption]="a.consumption" [currency]="a.commercial.currency" />
          </amc-panel>
          <section class="amc-card overflow-hidden xl:col-span-3">
            <div class="border-b border-line px-4 pt-3 sm:px-5"><amc-tabs [items]="levelTabs" [active]="level()" (activeChange)="level.set($any($event))" /></div>
            @if (level() === 'history') {
              <ol class="max-h-96 divide-y divide-line overflow-y-auto">
                @for (v of usageHistory(); track v.id) {
                  <li class="flex items-center gap-3 px-4 py-2.5 text-sm sm:px-5">
                    <span class="w-24 shrink-0 text-xs tabular-nums text-ink-muted">{{ formatDate(v.completedAt) }}</span>
                    <span class="min-w-0 flex-1 truncate">{{ v.type }} · {{ v.siteName }}</span>
                    <span class="text-xs tabular-nums text-ink-muted">{{ v.hours }} h · parts {{ v.partsValue }}</span>
                    <span class="text-xs font-medium" [class]="v.covered ? 'text-ok' : 'text-danger'">{{ v.covered ? 'Covered' : 'Billable' }}</span>
                  </li>
                } @empty { <li class="p-6 text-center text-sm text-ink-muted">No consumption yet.</li> }
              </ol>
            } @else {
              <amc-data-table [rows]="usageRows()" [columns]="usageColumns()" [trackBy]="trackById" emptyIcon="activity" emptyTitle="No usage" emptyMessage="Usage appears when visits are completed." />
            }
          </section>
        </div>
      }
    </div>
  `,
})
export class ConsumptionPage {
  private readonly api = inject(AmcApi);
  private readonly visitApi = inject(VisitApi);
  protected readonly refs = inject(AmcReferenceStore);

  readonly amcId = input<string>();

  protected readonly amcs = rxResource({ stream: () => this.api.list() });
  protected readonly rows = computed(() => (this.amcs.hasValue() ? this.amcs.value() : []).filter((a) => a.activatedAt || LIVE_AMC_STATUSES.includes(a.effectiveStatus)));
  protected readonly selectedId = linkedSignal<string | null>(() => this.amcId() ?? null);
  protected readonly selected = computed(() => this.rows().find((a) => a.id === this.selectedId()) ?? this.filtered()[0] ?? null);
  private readonly visitsRes = rxResource({ params: () => this.selected()?.id, stream: ({ params }) => (params ? this.visitApi.list(params) : of([])) });
  private readonly visits = computed(() => (this.visitsRes.hasValue() ? this.visitsRes.value() : []).filter((v) => v.status === 'Completed'));
  protected readonly search = signal('');
  protected readonly filters = signal<FilterValues>({ status: ['Active', 'Expiring Soon', 'Suspended'] });
  protected readonly filterFields = computed<FilterField[]>(() => [
    { key: 'customer', label: 'Customer', type: 'multiselect', options: this.refs.customerOptions() },
    { key: 'status', label: 'Status', type: 'multiselect', options: ['Active', 'Expiring Soon', 'Suspended', 'Expired', 'Terminated', 'Renewed'].map((s) => ({ value: s, label: s })) },
    { key: 'alert', label: 'Usage', type: 'select', options: [{ value: 'threshold', label: `At or above ${AMC_RULES.usageAlertPercent}%` }, { value: 'over', label: 'Over-consumed' }] },
  ]);
  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    const alert = f['alert'];
    return this.rows().filter(
      (a) =>
        (!term || `${a.number} ${a.title} ${a.customerName}`.toLowerCase().includes(term)) && matchesAny(f, 'customer', a.customer.customerId) && matchesAny(f, 'status', a.effectiveStatus) &&
        (!alert || (alert === 'over' ? a.consumption.overConsumed : a.consumption.alerts.length > 0)),
    );
  });
  protected readonly columns: DataColumn<AmcListItem>[] = [
    { key: 'amc', label: 'AMC', value: (a) => a.title, secondary: (a) => `${a.number} · ${a.customerName}`, mobile: 'title', width: 260 },
    { key: 'visits', label: 'Visits (used / included)', value: (a) => `${a.consumption.usedVisits} / ${a.consumption.includedVisits}`, secondary: (a) => `${a.consumption.remainingVisits} remaining`, mobile: 'meta', width: 170 },
    { key: 'hours', label: 'Service Hours', value: (a) => `${a.consumption.usedHours} / ${a.consumption.includedHours ?? '∞'}`, visibility: 'lg', width: 140 },
    { key: 'parts', label: 'Parts Value', value: (a) => `${a.consumption.usedPartsValue.toLocaleString('en-US')} / ${a.consumption.includedPartsValue?.toLocaleString('en-US') ?? '∞'}`, visibility: 'xl', width: 170 },
    { key: 'callouts', label: 'Call-Outs', value: (a) => `${a.consumption.usedCallOuts} / ${a.consumption.includedCallOuts ?? '∞'}`, visibility: 'xl', width: 110 },
    { key: 'visitPct', label: 'Visit %', value: (a) => a.consumption.visitUtilization, type: 'number', sortable: true, visibility: 'md', width: 90 },
    { key: 'overall', label: 'Overall Utilization', value: (a) => `${a.consumption.overallUtilization}%`, type: 'badge', tone: (a) => (a.consumption.overConsumed ? 'danger' : a.consumption.alerts.length ? 'warn' : 'ok'), mobile: 'badge', width: 150 },
  ];
  protected readonly trackById = (r: { id: string }) => r.id;
  protected readonly rowActions = (): MenuItem[] => [{ id: 'details', label: 'View Usage', icon: 'activity' }];

  protected readonly levelTabs: TabItem[] = [
    { id: 'site', label: 'Customer / Site Level' },
    { id: 'asset', label: 'Asset Level' },
    { id: 'service', label: 'Service Level' },
    { id: 'history', label: 'Usage History' },
  ];
  protected readonly level = signal<'site' | 'asset' | 'service' | 'history'>('site');
  protected readonly usageHistory = computed(() => [...this.visits()].sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')));
  protected readonly usageRows = computed<UsageRow[]>(() => {
    const groups = new Map<string, UsageRow>();
    const add = (id: string, label: string, secondary: string, v: VisitListItem, share = 1) => {
      const g = groups.get(id) ?? { id, label, secondary, visits: 0, hours: 0, parts: 0, callOuts: 0 };
      groups.set(id, { ...g, visits: g.visits + share, hours: Math.round((g.hours + v.hours * share) * 10) / 10, parts: Math.round(g.parts + v.partsValue * share), callOuts: g.callOuts + (v.type === 'Breakdown' || v.type === 'Emergency' ? share : 0) });
    };
    for (const v of this.visits()) {
      if (this.level() === 'site') add(v.siteId, v.siteName, v.customerName, v);
      else if (this.level() === 'service') add(v.serviceId ?? 'none', v.serviceName ?? 'Unspecified service', v.type, v);
      else {
        const share = v.assetIds.length ? 1 / v.assetIds.length : 1;
        (v.assetIds.length ? v.assetIds : ['none']).forEach((id, i) => add(id, v.assetNames[i] ?? 'No asset', v.siteName, v, share));
      }
    }
    return [...groups.values()].map((g) => ({ ...g, visits: Math.round(g.visits * 10) / 10 })).sort((a, b) => b.visits - a.visits);
  });
  protected readonly usageColumns = computed<DataColumn<UsageRow>[]>(() => [
    { key: 'label', label: this.level() === 'site' ? 'Site' : this.level() === 'asset' ? 'Asset' : 'Service', value: (r) => r.label, secondary: (r) => r.secondary, mobile: 'title', width: 260 },
    { key: 'visits', label: 'Visits', value: (r) => r.visits, type: 'number', mobile: 'meta', width: 90 },
    { key: 'hours', label: 'Hours', value: (r) => r.hours, type: 'number', width: 90 },
    { key: 'parts', label: 'Parts Value', value: (r) => r.parts, type: 'number', visibility: 'md', width: 110 },
    { key: 'callouts', label: 'Call-Outs', value: (r) => r.callOuts, type: 'number', visibility: 'md', width: 100 },
  ]);
  protected readonly formatDate = formatDate;

  protected onAction({ row }: RowAction<AmcListItem>): void {
    this.selectedId.set(row.id);
  }

  protected export(): void {
    downloadCsv(timestampedName('amc-consumption', 'csv'), ['AMC', 'Customer', 'Included Visits', 'Used Visits', 'Remaining Visits', 'Included Hours', 'Used Hours', 'Remaining Hours', 'Included Parts Value', 'Used Parts Value', 'Remaining Parts Value', 'Included Call-Outs', 'Used Call-Outs', 'Remaining Call-Outs', 'Visit %', 'Hour %', 'Parts %', 'Overall %'],
      this.filtered().map((a) => {
        const c = a.consumption;
        return [a.number, a.customerName, c.includedVisits, c.usedVisits, c.remainingVisits, c.includedHours, c.usedHours, c.remainingHours, c.includedPartsValue, c.usedPartsValue, c.remainingPartsValue, c.includedCallOuts, c.usedCallOuts, c.remainingCallOuts, c.visitUtilization, c.hourUtilization, c.partsUtilization, c.overallUtilization];
      }));
  }
}
