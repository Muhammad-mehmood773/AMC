import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { NotificationPort } from '@core/notification/notification.port';
import { toOptions } from '@shared/models/select-option';
import type { MenuItem } from '@shared/ui/action-menu';
import { DataTable, type RowAction } from '@shared/ui/data-table';
import { DatePicker } from '@shared/ui/date-picker';
import { Dialog } from '@shared/ui/dialog';
import { FilterBar } from '@shared/ui/filter-bar';
import { FormField } from '@shared/ui/form-field';
import { Icon } from '@shared/ui/icon';
import { KpiCard } from '@shared/ui/kpi-card';
import { PageHeader } from '@shared/ui/page-header';
import { Select } from '@shared/ui/select';
import { Spinner } from '@shared/ui/spinner';
import { downloadCsv, timestampedName } from '@shared/utils/file';
import { type FilterField, type FilterValues, matchesAny, withinRange } from '@shared/utils/filters';
import { type Observable, firstValueFrom } from 'rxjs';
import { pmColumns } from '../components/amc-columns';
import { AmcReferenceStore } from '../data/amc-reference.store';
import { AmcApi, ScheduleApi } from '../data/amc.api';
import { AMC_RULES } from '../data/amc.config';
import { AMC_LOOKUP } from '../data/amc.lookups';
import { LookupValuesStore } from '@shared/lookups/lookup-values.store';
import { LIVE_AMC_STATUSES } from '../models/amc.model';
import { PM_STATUSES, type PmEventListItem, type PmStatus } from '../models/operations.model';

const OPEN: readonly PmStatus[] = ['Planned', 'Scheduled', 'Assigned', 'Rescheduled', 'Overdue'];

@Component({
  selector: 'amc-schedule-page',
  imports: [DataTable, DatePicker, Dialog, FilterBar, FormField, Icon, KpiCard, PageHeader, Select, Spinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="Preventive Maintenance Schedule" subtitle="AMC → Service Plan → Frequency → Schedule → Work Order → Technician → Visit → Completion → Service Report." [breadcrumbs]="[{ label: 'AMC / Service Contracts', path: '/app/amc-agreements/dashboard' }, { label: 'PM Schedule' }]">
        <button type="button" class="amc-btn-secondary" (click)="export()"><amc-icon name="download" /> <span class="hidden sm:inline">Export</span></button>
        <button type="button" class="amc-btn-primary" (click)="generateOpen.set(true)"><amc-icon name="calendar-check" /> Generate Schedule</button>
      </amc-page-header>
      <section class="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <amc-kpi-card label="Planned / Scheduled" icon="calendar" [value]="count(['Planned', 'Scheduled'])" />
        <amc-kpi-card label="Assigned" icon="user-check" tone="accent" [value]="count(['Assigned'])" />
        <amc-kpi-card label="Rescheduled" icon="calendar" tone="warn" [value]="count(['Rescheduled'])" />
        <amc-kpi-card label="Overdue" icon="alert-triangle" tone="danger" [value]="count(['Overdue'])" [hint]="escalated() + ' escalated'" />
        <amc-kpi-card label="Completed / Missed" icon="check-circle" tone="ok" [value]="count(['Completed']) + ' / ' + count(['Missed'])" />
      </section>
      <section class="amc-card overflow-hidden">
        <div class="border-b border-line p-3 sm:p-4"><amc-filter-bar searchPlaceholder="Search event, asset, site, AMC or technician…" [(search)]="search" [fields]="filterFields()" [(filters)]="filters" /></div>
        <amc-data-table tableId="amc-pm" [entity]="{ singular: 'event', plural: 'events' }" [totalCount]="rows().length" [rows]="filtered()" [columns]="columns" [trackBy]="trackById" [loading]="events.isLoading()" [actions]="rowActions" [initialPageSize]="25" emptyIcon="calendar-check" emptyTitle="No maintenance events" emptyMessage="Generate the schedule from an AMC service plan." (action)="onAction($event)" />
      </section>
      <p class="text-xs text-ink-subtle">Non-working days ({{ weekend }}) and public holidays are skipped automatically. Events past their due date are flagged Overdue and can be escalated.</p>
    </div>

    <amc-dialog size="sm" title="Generate schedule" description="Creates maintenance events from the active service plan for the next 12 months." [(open)]="generateOpen">
      <amc-form-field label="AMC" for="sc-amc"><amc-select inputId="sc-amc" [options]="liveAmcOptions()" [(value)]="generateAmc" /></amc-form-field>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="generateOpen.set(false)">Cancel</button>
        <button type="button" class="amc-btn-primary" [disabled]="busy() || !generateAmc()" (click)="generate()">@if (busy()) { <amc-spinner [size]="14" /> } Generate</button>
      </ng-container>
    </amc-dialog>

    <amc-dialog size="sm" [title]="(mode() === 'assign' ? 'Assign technician · ' : 'Reschedule · ') + (target()?.number ?? '')" [description]="target() ? target()!.assetName + ' · ' + target()!.siteName : ''" [open]="!!mode()" (openChange)="!$event && mode.set(null)">
      @if (mode() === 'assign') {
        <div class="space-y-4">
          <amc-form-field label="Team" for="sc-team"><amc-select inputId="sc-team" [options]="teamOptions()" [(value)]="team" /></amc-form-field>
          <amc-form-field label="Technician" for="sc-tech" hint="Service territory is validated against the site region."><amc-select inputId="sc-tech" [options]="refs.technicianOptions()" [(value)]="technician" [clearable]="true" /></amc-form-field>
        </div>
      } @else {
        <div class="space-y-4">
          <amc-form-field label="New Date" for="sc-date" hint="Moved to the next working day if needed."><amc-date-picker inputId="sc-date" [(value)]="date" /></amc-form-field>
          <amc-form-field label="Reason" for="sc-reason"><input id="sc-reason" class="amc-input" [value]="reason()" (input)="reason.set($any($event.target).value)" /></amc-form-field>
        </div>
      }
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="mode.set(null)">Cancel</button>
        <button type="button" class="amc-btn-primary" [disabled]="busy()" (click)="confirm()">@if (busy()) { <amc-spinner [size]="14" /> } Save</button>
      </ng-container>
    </amc-dialog>
  `,
})
export class SchedulePage {
  private readonly api = inject(ScheduleApi);
  private readonly amcApi = inject(AmcApi);
  private readonly notify = inject(NotificationPort);
  protected readonly refs = inject(AmcReferenceStore);

  readonly amcId = input<string>();
  readonly status = input<string>();

  protected readonly events = rxResource({ stream: () => this.api.list() });
  private readonly amcs = rxResource({ stream: () => this.amcApi.list() });
  protected readonly rows = computed(() => (this.events.hasValue() ? this.events.value() : []));
  private readonly amcList = computed(() => (this.amcs.hasValue() ? this.amcs.value() : []));
  protected readonly liveAmcOptions = computed(() => this.amcList().filter((a) => LIVE_AMC_STATUSES.includes(a.effectiveStatus)).map((a) => ({ value: a.id, label: `${a.number} · ${a.title}`, hint: a.customerName })));
  protected readonly columns = pmColumns();
  protected readonly trackById = (e: PmEventListItem) => e.id;
  protected readonly search = signal('');
  protected readonly filters = linkedSignal<FilterValues>(() => {
    const seed: Record<string, string[]> = {};
    if (this.amcId()) seed['amc'] = [this.amcId()!];
    seed['status'] = this.status() ? [this.status()!] : this.amcId() ? [] : [...OPEN];
    return seed;
  });
  protected readonly filterFields = computed<FilterField[]>(() => [
    { key: 'amc', label: 'AMC', type: 'multiselect', options: this.amcList().map((a) => ({ value: a.id, label: `${a.number} · ${a.title}` })) },
    { key: 'customer', label: 'Customer', type: 'multiselect', options: this.refs.customerOptions() },
    { key: 'site', label: 'Site', type: 'multiselect', options: this.refs.siteOptions(null).filter((o) => this.rows().some((e) => e.siteId === o.value)) },
    { key: 'status', label: 'Status', type: 'multiselect', options: toOptions(PM_STATUSES) },
    { key: 'team', label: 'Assigned Team', type: 'multiselect', options: toOptions([...new Set(this.rows().map((e) => e.team))].sort()) },
    { key: 'technician', label: 'Technician', type: 'multiselect', options: this.refs.technicianOptions() },
    { key: 'date', label: 'Scheduled Date', type: 'date-range' },
  ]);
  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    const customerOf = new Map(this.amcList().map((a) => [a.id, a.customer.customerId]));
    return this.rows().filter(
      (e) =>
        (!term || `${e.number} ${e.assetName} ${e.siteName} ${e.amcNumber} ${e.technician ?? ''} ${e.customerName}`.toLowerCase().includes(term)) && matchesAny(f, 'amc', e.amcId) && matchesAny(f, 'customer', customerOf.get(e.amcId)) &&
        matchesAny(f, 'site', e.siteId) && matchesAny(f, 'status', e.effectiveStatus) && matchesAny(f, 'team', e.team) && matchesAny(f, 'technician', e.technician) && withinRange(f, 'date', e.scheduledDate),
    );
  });
  protected count(statuses: readonly PmStatus[]): number {
    return this.rows().filter((e) => statuses.includes(e.effectiveStatus)).length;
  }
  protected readonly escalated = computed(() => this.rows().filter((e) => e.escalated && e.effectiveStatus === 'Overdue').length);
  protected readonly rowActions = (e: PmEventListItem): MenuItem[] => {
    const open = OPEN.includes(e.effectiveStatus);
    return [
      ...(open ? [{ id: 'assign', label: 'Assign Technician', icon: 'user-check' as const }, { id: 'reschedule', label: 'Reschedule', icon: 'calendar' as const }] : []),
      ...(open ? [{ id: 'start', label: 'Start', icon: 'play' as const, dividerBefore: true }] : []),
      ...(open || e.effectiveStatus === 'In Progress' ? [{ id: 'complete', label: 'Complete', icon: 'check-circle' as const }] : []),
      ...(e.effectiveStatus === 'Overdue' && !e.escalated ? [{ id: 'escalate', label: 'Escalate Overdue', icon: 'alert-triangle' as const, danger: true }] : []),
      ...(open ? [{ id: 'missed', label: 'Mark Missed', icon: 'x' as const, dividerBefore: true }, { id: 'cancel', label: 'Cancel', icon: 'ban' as const, danger: true }] : []),
    ];
  };

  protected readonly teamOptions = inject(LookupValuesStore).options(AMC_LOOKUP.team);
  protected readonly weekend = AMC_RULES.nonWorkingDays.map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(' / ');
  protected readonly busy = signal(false);
  protected readonly generateOpen = signal(false);
  protected readonly generateAmc = linkedSignal<string | number | null>(() => this.amcId() ?? null);
  protected readonly mode = signal<'assign' | 'reschedule' | null>(null);
  protected readonly target = signal<PmEventListItem | null>(null);
  protected readonly team = signal<string | number | null>(null);
  protected readonly technician = signal<string | number | null>(null);
  protected readonly date = signal('');
  protected readonly reason = signal('');

  protected async generate(): Promise<void> {
    this.busy.set(true);
    try {
      const n = await firstValueFrom(this.api.generate(String(this.generateAmc())));
      this.notify.success(n ? `${n} maintenance events generated.` : 'The schedule is already up to date.');
      this.generateOpen.set(false);
      this.events.reload();
    } catch (error) {
      this.notify.error((error as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  protected onAction({ id, row }: RowAction<PmEventListItem>): void {
    this.target.set(row);
    switch (id) {
      case 'assign':
        this.team.set(row.team);
        this.technician.set(row.technician);
        this.mode.set('assign');
        return;
      case 'reschedule':
        this.date.set(row.scheduledDate);
        this.reason.set('');
        this.mode.set('reschedule');
        return;
      case 'start':
        return void this.exec(this.api.setStatus(row.id, 'In Progress'), `${row.number} started.`);
      case 'complete':
        return void this.exec(this.api.setStatus(row.id, 'Completed'), `${row.number} completed — visit consumed.`);
      case 'escalate':
        return void this.exec(this.api.escalate(row.id), `${row.number} escalated.`);
      case 'missed':
        return void this.exec(this.api.setStatus(row.id, 'Missed'), `${row.number} marked missed.`);
      case 'cancel':
        return void this.exec(this.api.setStatus(row.id, 'Cancelled'), `${row.number} cancelled.`);
    }
  }

  protected async confirm(): Promise<void> {
    const e = this.target();
    if (!e) return;
    const ok = this.mode() === 'assign'
      ? await this.exec(this.api.assign(e.id, String(this.team() ?? e.team), this.technician() ? String(this.technician()) : null), `${e.number} assigned.`)
      : await this.exec(this.api.reschedule(e.id, this.date(), this.reason()), `${e.number} rescheduled.`);
    if (ok) this.mode.set(null);
  }

  private async exec(work: Observable<unknown>, message: string): Promise<boolean> {
    this.busy.set(true);
    try {
      await firstValueFrom(work);
      this.notify.success(message);
      this.events.reload();
      return true;
    } catch (error) {
      this.notify.error((error as Error).message);
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  protected export(): void {
    downloadCsv(timestampedName('amc-pm-schedule', 'csv'), ['Event', 'AMC', 'Customer', 'Asset', 'Site', 'Service', 'Maintenance Type', 'Scheduled Date', 'Due Date', 'Service Window', 'Assigned Team', 'Assigned Technician', 'Priority', 'Status', 'Work Order'],
      this.filtered().map((e) => [e.number, e.amcNumber, e.customerName, e.assetName, e.siteName, e.serviceName, e.maintenanceType, e.scheduledDate, e.dueDate, e.window, e.team, e.technician, e.priority, e.effectiveStatus, e.workOrder]));
  }
}
