import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import type { MenuItem } from '@shared/ui/action-menu';
import { type DataColumn, DataTable, type RowAction } from '@shared/ui/data-table';
import { Dialog } from '@shared/ui/dialog';
import { FilterBar } from '@shared/ui/filter-bar';
import { FormField } from '@shared/ui/form-field';
import { Icon } from '@shared/ui/icon';
import { PageHeader } from '@shared/ui/page-header';
import { Select } from '@shared/ui/select';
import { downloadCsv, timestampedName } from '@shared/utils/file';
import { type FilterField, type FilterValues, matchesAny, withinRange } from '@shared/utils/filters';
import { AmcActionHost } from '../components/amc-action-host';
import { AmcApi } from '../data/amc.api';
import { LIVE_AMC_STATUSES } from '../models/amc.model';
import type { SuspensionTerminationItem } from '../models/operations.model';

/** SRS 6.14 — controlled suspension and termination of active service agreements. */
@Component({
  selector: 'amc-suspensions-page',
  imports: [AmcActionHost, DataTable, Dialog, FilterBar, FormField, Icon, PageHeader, Select],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="AMC Suspension / Termination" subtitle="Suspension controls whether new services and maintenance can be initiated; termination preserves all historical records." [breadcrumbs]="[{ label: 'AMC / Service Contracts', path: '/app/amc-agreements/dashboard' }, { label: 'Suspension / Termination' }]">
        <button type="button" class="amc-btn-secondary" (click)="export()"><amc-icon name="download" /> <span class="hidden sm:inline">Export</span></button>
        <button type="button" class="amc-btn-secondary" (click)="open('suspend')"><amc-icon name="pause" /> Suspend AMC</button>
        <button type="button" class="amc-btn-danger" (click)="open('terminate')"><amc-icon name="ban" /> Terminate AMC</button>
      </amc-page-header>
      <section class="amc-card overflow-hidden">
        <div class="border-b border-line p-3 sm:p-4"><amc-filter-bar searchPlaceholder="Search AMC, customer or reason…" [(search)]="search" [fields]="filterFields" [(filters)]="filters" /></div>
        <amc-data-table tableId="amc-suspensions" [entity]="{ singular: 'record', plural: 'records' }" [rows]="filtered()" [columns]="columns" [trackBy]="trackById" [loading]="events.isLoading()" [actions]="rowActions" emptyIcon="pause" emptyTitle="No suspensions or terminations" emptyMessage="Suspended and terminated AMCs appear here." (action)="onAction($event)" />
      </section>
    </div>

    <amc-dialog size="sm" [title]="pick() === 'suspend' ? 'Suspend AMC' : 'Terminate AMC'" description="Select the AMC." [open]="!!pick()" (openChange)="!$event && pick.set(null)">
      <amc-form-field label="AMC" for="st-amc"><amc-select inputId="st-amc" [options]="candidates()" [(value)]="amc" /></amc-form-field>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="pick.set(null)">Cancel</button>
        <button type="button" class="amc-btn-primary" [disabled]="!amc()" (click)="continue()">Continue</button>
      </ng-container>
    </amc-dialog>
    <amc-amc-action-host (done)="reload()" />
  `,
})
export class SuspensionsPage {
  private readonly api = inject(AmcApi);
  private readonly host = viewChild.required(AmcActionHost);

  protected readonly events = rxResource({ stream: () => this.api.events() });
  private readonly amcs = rxResource({ stream: () => this.api.list() });
  protected readonly rows = computed(() => (this.events.hasValue() ? this.events.value() : []));
  private readonly amcList = computed(() => (this.amcs.hasValue() ? this.amcs.value() : []));
  protected readonly search = signal('');
  protected readonly filters = signal<FilterValues>({});
  protected readonly filterFields: FilterField[] = [
    { key: 'kind', label: 'Record', type: 'multiselect', options: [{ value: 'Suspension', label: 'Suspension' }, { value: 'Termination', label: 'Termination' }] },
    { key: 'status', label: 'Status', type: 'multiselect', options: ['Active', 'Resumed', 'Pending', 'In Progress', 'Settled'].map((s) => ({ value: s, label: s })) },
    { key: 'date', label: 'Date', type: 'date-range' },
  ];
  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    return this.rows().filter((r) => (!term || `${r.amcNumber} ${r.customerName} ${r.reason} ${r.type}`.toLowerCase().includes(term)) && matchesAny(f, 'kind', r.kind) && matchesAny(f, 'status', r.status) && withinRange(f, 'date', r.date));
  });
  protected readonly columns: DataColumn<SuspensionTerminationItem>[] = [
    { key: 'amc', label: 'AMC', value: (r) => r.amcNumber, secondary: (r) => r.customerName, link: (r) => `/app/amc-agreements/${r.amcId}`, mobile: 'title', width: 220 },
    { key: 'kind', label: 'Record', value: (r) => r.kind, type: 'badge', tone: (r) => (r.kind === 'Termination' ? 'danger' : 'warn'), width: 120 },
    { key: 'date', label: 'Date', value: (r) => r.date, type: 'date', sortable: true, mobile: 'meta', width: 120 },
    { key: 'type', label: 'Type / Period', value: (r) => r.type, visibility: 'md', width: 170 },
    { key: 'reason', label: 'Reason', value: (r) => r.reason, visibility: 'lg', width: 260 },
    { key: 'requested', label: 'Requested / Approved By', value: (r) => r.requestedBy, secondary: (r) => r.approvedBy, visibility: 'xl', width: 190 },
    { key: 'impact', label: 'Impact', value: (r) => r.impact, visibility: 'xl', width: 320 },
    { key: 'status', label: 'Status', value: (r) => r.status, type: 'badge', tone: (r) => (r.status === 'Active' ? 'warn' : r.status === 'Settled' || r.status === 'Resumed' ? 'ok' : 'info'), mobile: 'badge', width: 110 },
  ];
  protected readonly trackById = (r: SuspensionTerminationItem) => r.id;
  protected readonly rowActions = (r: SuspensionTerminationItem): MenuItem[] => {
    const a = this.amcList().find((x) => x.id === r.amcId);
    return [
      { id: 'view', label: 'Open AMC', icon: 'eye' },
      ...(a?.effectiveStatus === 'Suspended' ? [{ id: 'resume', label: 'Resume', icon: 'play' as const }, { id: 'terminate', label: 'Terminate', icon: 'ban' as const, danger: true }] : []),
    ];
  };
  protected readonly pick = signal<'suspend' | 'terminate' | null>(null);
  protected readonly amc = signal<string | number | null>(null);
  protected readonly candidates = computed(() =>
    this.amcList().filter((a) => LIVE_AMC_STATUSES.includes(a.effectiveStatus) || (this.pick() === 'terminate' && a.effectiveStatus === 'Suspended')).map((a) => ({ value: a.id, label: `${a.number} · ${a.title}`, hint: `${a.customerName} · ${a.effectiveStatus}` })),
  );

  protected open(kind: 'suspend' | 'terminate'): void {
    this.amc.set(null);
    this.pick.set(kind);
  }

  protected continue(): void {
    const a = this.amcList().find((x) => x.id === this.amc());
    const kind = this.pick();
    this.pick.set(null);
    if (a && kind) void this.host().run(kind, a);
  }

  protected onAction({ id, row }: RowAction<SuspensionTerminationItem>): void {
    const a = this.amcList().find((x) => x.id === row.amcId);
    if (a) void this.host().run(id, a);
  }

  protected reload(): void {
    this.events.reload();
    this.amcs.reload();
  }

  protected export(): void {
    downloadCsv(timestampedName('amc-suspension-termination', 'csv'), ['AMC', 'Customer', 'Record', 'Date', 'Type / Period', 'Reason', 'Requested By', 'Approved By', 'Impact', 'Status'],
      this.filtered().map((r) => [r.amcNumber, r.customerName, r.kind, r.date, r.type, r.reason, r.requestedBy, r.approvedBy, r.impact, r.status]));
  }
}
