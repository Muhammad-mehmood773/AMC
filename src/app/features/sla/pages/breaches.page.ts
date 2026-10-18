import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { NotificationPort } from '@core/notification/notification.port';
import { toOptions } from '@shared/models/select-option';
import type { MenuItem } from '@shared/ui/action-menu';
import { DataTable, type RowAction } from '@shared/ui/data-table';
import { Dialog } from '@shared/ui/dialog';
import { FilterBar } from '@shared/ui/filter-bar';
import { FormField } from '@shared/ui/form-field';
import { Icon } from '@shared/ui/icon';
import { KpiCard } from '@shared/ui/kpi-card';
import { PageHeader } from '@shared/ui/page-header';
import { Select } from '@shared/ui/select';
import { Spinner } from '@shared/ui/spinner';
import { downloadCsv, timestampedName } from '@shared/utils/file';
import { formatCurrency, formatDateTime } from '@shared/utils/format';
import { type FilterField, type FilterValues, matchesAny, withinRange } from '@shared/utils/filters';
import { type Observable, firstValueFrom } from 'rxjs';
import { breachColumns } from '../components/sla-columns';
import { SlaReferenceStore } from '../data/sla-reference.store';
import { SlaBreachApi } from '../data/sla.api';
import { formatMinutes } from '../models/display';
import { BREACH_REASONS, BREACH_STATUSES, BREACH_TYPES, type SlaBreachListItem } from '../models/operations.model';
import { PRIORITIES } from '../models/sla.model';

type Mode = 'view' | 'owner' | 'root' | 'corrective' | 'waiver';

/** SRS 7.14 — centralized control over SLA violations; SRS 7.19 breach workflow. */
@Component({
  selector: 'amc-breaches-page',
  imports: [DataTable, Dialog, FilterBar, FormField, Icon, KpiCard, PageHeader, Select, Spinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="SLA Breach Management" subtitle="Breach record → management escalation → root cause → corrective action → closure. Original target and actual times are preserved." [breadcrumbs]="[{ label: 'SLA Management', path: '/app/sla/dashboard' }, { label: 'Breaches' }]">
        <button type="button" class="amc-btn-secondary" (click)="export()"><amc-icon name="download" /> <span class="hidden sm:inline">Export</span></button>
      </amc-page-header>
      <section class="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <amc-kpi-card label="Detected / Under Review" icon="alert-circle" tone="danger" [value]="count(['Detected', 'Under Review'])" />
        <amc-kpi-card label="Acknowledged" icon="check" tone="info" [value]="count(['Acknowledged'])" />
        <amc-kpi-card label="Root Cause / Corrective" icon="wrench" tone="accent" [value]="count(['Root Cause Identified', 'Corrective Action'])" />
        <amc-kpi-card label="Closed / Waived" icon="check-circle" tone="ok" [value]="count(['Closed', 'Waived'])" [hint]="pendingWaivers() + ' waiver request(s)'" />
        <amc-kpi-card label="Penalties / Credits" icon="wallet" tone="warn" [value]="formatCurrency(penalties(), 'SAR', true)" />
      </section>
      <section class="amc-card overflow-hidden">
        <div class="border-b border-line p-3 sm:p-4"><amc-filter-bar searchPlaceholder="Search breach, SLA, customer, request or work order…" [(search)]="search" [fields]="filterFields()" [(filters)]="filters" /></div>
        <amc-data-table tableId="sla-breaches-all" [entity]="{ singular: 'breach', plural: 'breaches' }" [totalCount]="rows().length" [rows]="filtered()" [columns]="columns" [trackBy]="trackById" [loading]="breaches.isLoading()" [actions]="rowActions" [initialPageSize]="25" emptyIcon="check-circle" emptyTitle="No breaches" emptyMessage="No SLA breaches match your filters." (action)="onAction($event)" />
      </section>
    </div>

    <amc-dialog [size]="mode() === 'view' ? 'lg' : 'md'" [title]="title()" [description]="target() ? target()!.number + ' · ' + target()!.breachType + ' · ' + target()!.transactionNumber : ''" [open]="!!mode()" (openChange)="!$event && mode.set(null)">
      @if (target(); as b) {
        @switch (mode()) {
          @case ('view') {
            <dl class="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              <div><dt class="text-xs text-ink-muted">SLA</dt><dd>{{ b.slaNumber }} · {{ b.slaName }}</dd></div>
              <div><dt class="text-xs text-ink-muted">Customer</dt><dd>{{ b.customerName }}</dd></div>
              <div><dt class="text-xs text-ink-muted">{{ b.transactionType }}</dt><dd class="font-mono">{{ b.transactionNumber }}</dd></div>
              <div><dt class="text-xs text-ink-muted">Site / Asset</dt><dd>{{ b.siteName }}{{ b.assetName ? ' · ' + b.assetName : '' }}</dd></div>
              <div><dt class="text-xs text-ink-muted">Priority / Target Type</dt><dd>{{ b.priority }} · {{ b.targetType }}</dd></div>
              <div><dt class="text-xs text-ink-muted">Target</dt><dd>{{ fm(b.targetMinutes) }}</dd></div>
              <div><dt class="text-xs text-ink-muted">Target Time</dt><dd>{{ fdt(b.targetAt) }}</dd></div>
              <div><dt class="text-xs text-ink-muted">Actual Time</dt><dd>{{ b.actualAt ? fdt(b.actualAt) : 'Still open' }}</dd></div>
              <div><dt class="text-xs text-ink-muted">Breach Duration</dt><dd class="font-semibold text-danger">{{ fm(b.breachMinutes) }}</dd></div>
              <div><dt class="text-xs text-ink-muted">Breach Reason</dt><dd>{{ b.reason ?? '—' }}</dd></div>
              <div><dt class="text-xs text-ink-muted">Responsible</dt><dd>{{ b.technician ?? '—' }} · {{ b.team }}</dd></div>
              <div><dt class="text-xs text-ink-muted">Owner</dt><dd>{{ b.owner ?? '—' }}</dd></div>
              <div><dt class="text-xs text-ink-muted">Escalation</dt><dd>{{ b.escalationStatus }}</dd></div>
              <div><dt class="text-xs text-ink-muted">Penalty / Credit</dt><dd>{{ b.penalty ? formatCurrency(b.penalty, b.currency) : '—' }}</dd></div>
              <div><dt class="text-xs text-ink-muted">Repeated Breach</dt><dd>{{ b.repeated ? 'Yes — within 30 days' : 'No' }}</dd></div>
              <div class="col-span-2 sm:col-span-3"><dt class="text-xs text-ink-muted">Root Cause</dt><dd>{{ b.rootCause || '—' }}</dd></div>
              <div class="col-span-2 sm:col-span-3"><dt class="text-xs text-ink-muted">Corrective Action</dt><dd>{{ b.correctiveAction || '—' }}</dd></div>
              @if (b.waiver) { <div class="col-span-2 sm:col-span-3"><dt class="text-xs text-ink-muted">Waiver</dt><dd>{{ b.waiver.reason }} · requested by {{ b.waiver.requestedBy }}{{ b.waiver.approvedBy ? ' · approved by ' + b.waiver.approvedBy : ' · pending approval' }}</dd></div> }
            </dl>
          }
          @case ('owner') { <amc-form-field label="Owner" for="br-owner"><amc-select inputId="br-owner" [options]="refs.userOptions()" [(value)]="owner" /></amc-form-field> }
          @case ('root') {
            <div class="space-y-4">
              <amc-form-field label="Breach Reason" for="br-reason"><amc-select inputId="br-reason" [options]="reasonOptions" [(value)]="reason" /></amc-form-field>
              <amc-form-field label="Root Cause" for="br-root" [required]="true"><textarea id="br-root" class="amc-textarea min-h-20" [value]="text()" (input)="text.set($any($event.target).value)"></textarea></amc-form-field>
            </div>
          }
          @case ('corrective') { <amc-form-field label="Corrective Action" for="br-ca" [required]="true"><textarea id="br-ca" class="amc-textarea min-h-20" [value]="text()" (input)="text.set($any($event.target).value)"></textarea></amc-form-field> }
          @case ('waiver') {
            <amc-form-field label="Waiver Reason" for="br-waiver" [required]="true"><textarea id="br-waiver" class="amc-textarea min-h-20" [value]="text()" (input)="text.set($any($event.target).value)"></textarea></amc-form-field>
            <p class="mt-2 text-xs text-ink-muted">Waivers require approval by an authorized manager. An approved waiver removes the penalty / service credit.</p>
          }
        }
      }
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary sm:mr-auto" (click)="mode.set(null)">Close</button>
        @if (mode() !== 'view') { <button type="button" class="amc-btn-primary" [disabled]="busy() || !valid()" (click)="confirm()">@if (busy()) { <amc-spinner [size]="14" /> } Save</button> }
      </ng-container>
    </amc-dialog>
  `,
})
export class BreachesPage {
  private readonly api = inject(SlaBreachApi);
  private readonly notify = inject(NotificationPort);
  protected readonly refs = inject(SlaReferenceStore);

  readonly slaId = input<string>();
  readonly type = input<string>();

  protected readonly breaches = rxResource({ stream: () => this.api.list() });
  protected readonly rows = computed(() => (this.breaches.hasValue() ? this.breaches.value() : []));
  protected readonly columns = breachColumns();
  protected readonly trackById = (b: SlaBreachListItem) => b.id;
  protected readonly search = signal('');
  protected readonly filters = linkedSignal<FilterValues>(() => {
    const seed: Record<string, string[]> = {};
    if (this.slaId()) seed['sla'] = [this.slaId()!];
    if (this.type()) seed['type'] = [this.type()!];
    return seed;
  });
  protected readonly filterFields = computed<FilterField[]>(() => [
    { key: 'status', label: 'Breach Status', type: 'multiselect', options: toOptions(BREACH_STATUSES) },
    { key: 'type', label: 'Breach Type', type: 'multiselect', options: toOptions(BREACH_TYPES) },
    { key: 'reason', label: 'Breach Reason', type: 'multiselect', options: this.reasonOptions },
    { key: 'sla', label: 'SLA', type: 'multiselect', options: this.refs.slaOptions() },
    { key: 'customer', label: 'Customer', type: 'multiselect', options: this.refs.customerOptions() },
    { key: 'priority', label: 'Priority', type: 'multiselect', options: toOptions(PRIORITIES) },
    { key: 'team', label: 'Responsible Team', type: 'multiselect', options: this.refs.teamOptions() },
    { key: 'date', label: 'Target Time', type: 'date-range' },
  ]);
  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    return this.rows().filter(
      (b) =>
        (!term || `${b.number} ${b.slaNumber} ${b.customerName} ${b.transactionNumber} ${b.siteName}`.toLowerCase().includes(term)) && matchesAny(f, 'status', b.status) && matchesAny(f, 'type', b.breachType) && matchesAny(f, 'reason', b.reason) &&
        matchesAny(f, 'sla', b.slaId) && matchesAny(f, 'customer', b.customerId) && matchesAny(f, 'priority', b.priority) && matchesAny(f, 'team', b.team) && withinRange(f, 'date', b.targetAt),
    );
  });
  protected count(statuses: readonly string[]): number {
    return this.filtered().filter((b) => statuses.includes(b.status)).length;
  }
  protected readonly pendingWaivers = computed(() => this.filtered().filter((b) => b.waiver && !b.waiver.approvedBy).length);
  protected readonly penalties = computed(() => this.filtered().reduce((s, b) => s + b.penalty, 0));
  protected readonly rowActions = (b: SlaBreachListItem): MenuItem[] => {
    const open = !['Closed', 'Waived'].includes(b.status);
    return [
      { id: 'view', label: 'View', icon: 'eye' },
      ...(open && ['Detected', 'Under Review'].includes(b.status) ? [{ id: 'ack', label: 'Acknowledge', icon: 'check' as const, dividerBefore: true }] : []),
      ...(open ? [{ id: 'owner', label: 'Assign Owner', icon: 'user-check' as const }, { id: 'root', label: 'Add Root Cause', icon: 'search' as const }, { id: 'corrective', label: 'Add Corrective Action', icon: 'wrench' as const }] : []),
      ...(open && !b.waiver ? [{ id: 'waiver', label: 'Request Waiver', icon: 'ban' as const, dividerBefore: true }] : []),
      ...(b.waiver && !b.waiver.approvedBy ? [{ id: 'approve', label: 'Approve Waiver', icon: 'check-circle' as const, dividerBefore: true }, { id: 'reject', label: 'Reject Waiver', icon: 'x' as const }] : []),
      ...(open ? [{ id: 'close', label: 'Close Breach', icon: 'check-circle' as const, dividerBefore: true }] : []),
    ];
  };
  protected readonly reasonOptions = toOptions(BREACH_REASONS);
  protected readonly formatCurrency = formatCurrency;
  protected readonly fm = formatMinutes;
  protected readonly fdt = formatDateTime;
  protected readonly busy = signal(false);
  protected readonly mode = signal<Mode | null>(null);
  protected readonly target = signal<SlaBreachListItem | null>(null);
  protected readonly owner = signal<string | number | null>(null);
  protected readonly reason = signal<string | number | null>(null);
  protected readonly text = signal('');
  protected readonly title = computed(() => ({ view: 'Breach details', owner: 'Assign owner', root: 'Root cause', corrective: 'Corrective action', waiver: 'Request waiver' })[this.mode() ?? 'view']);
  protected readonly valid = computed(() => (this.mode() === 'owner' ? !!this.owner() : !!this.text().trim()));

  protected onAction({ id, row }: RowAction<SlaBreachListItem>): void {
    this.target.set(row);
    switch (id) {
      case 'ack':
        return void this.exec(this.api.acknowledge(row.id), `${row.number} acknowledged.`);
      case 'approve':
        return void this.exec(this.api.approveWaiver(row.id, true), `${row.number} waived.`);
      case 'reject':
        return void this.exec(this.api.approveWaiver(row.id, false), 'Waiver rejected.');
      case 'close':
        return void this.exec(this.api.close(row.id), `${row.number} closed.`);
      default:
        this.owner.set(null);
        this.reason.set(row.reason);
        this.text.set(id === 'root' ? row.rootCause : id === 'corrective' ? row.correctiveAction : '');
        this.mode.set(id as Mode);
    }
  }

  protected async confirm(): Promise<void> {
    const b = this.target()!;
    const users = this.refs.data().users;
    let work: Observable<unknown>;
    switch (this.mode()) {
      case 'owner':
        work = this.api.update(b.id, { owner: users.find((u) => u.id === this.owner())?.name ?? String(this.owner()) });
        break;
      case 'root':
        work = this.api.update(b.id, { reason: this.reason() ? String(this.reason()) : null, rootCause: this.text() });
        break;
      case 'corrective':
        work = this.api.update(b.id, { correctiveAction: this.text() });
        break;
      default:
        work = this.api.requestWaiver(b.id, this.text());
    }
    if (await this.exec(work, `${b.number} updated.`)) this.mode.set(null);
  }

  private async exec(work: Observable<unknown>, message: string): Promise<boolean> {
    this.busy.set(true);
    try {
      await firstValueFrom(work);
      this.notify.success(message);
      this.breaches.reload();
      return true;
    } catch (error) {
      this.notify.error((error as Error).message);
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  protected export(): void {
    downloadCsv(timestampedName('sla-breaches', 'csv'), ['Breach Number', 'SLA', 'Customer', 'Service Request / Work Order', 'Site', 'Asset', 'Priority', 'Target Type', 'Breach Type', 'Target Time', 'Actual Time', 'Breach Duration (min)', 'Breach Reason', 'Responsible Team', 'Responsible Technician', 'Escalation Status', 'Penalty', 'Status'],
      this.filtered().map((b) => [b.number, b.slaNumber, b.customerName, b.transactionNumber, b.siteName, b.assetName, b.priority, b.targetType, b.breachType, b.targetAt, b.actualAt, b.breachMinutes, b.reason, b.team, b.technician, b.escalationStatus, b.penalty, b.status]));
  }
}
