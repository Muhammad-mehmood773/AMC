import { ChangeDetectionStrategy, Component, computed, effect, inject, input, linkedSignal, signal, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { NotificationPort } from '@core/notification/notification.port';
import { toOptions } from '@shared/models/select-option';
import type { MenuItem } from '@shared/ui/action-menu';
import { DataTable, type RowAction } from '@shared/ui/data-table';
import { DatePicker } from '@shared/ui/date-picker';
import { Dialog } from '@shared/ui/dialog';
import { FilterBar } from '@shared/ui/filter-bar';
import { Switch } from '@shared/ui/form-controls';
import { FormField } from '@shared/ui/form-field';
import { Icon } from '@shared/ui/icon';
import { PageHeader } from '@shared/ui/page-header';
import { MultiSelect, Select } from '@shared/ui/select';
import { Spinner } from '@shared/ui/spinner';
import { downloadCsv, downloadFile, timestampedName } from '@shared/utils/file';
import { type FilterField, type FilterValues, matchesAny, withinRange } from '@shared/utils/filters';
import { type Observable, firstValueFrom } from 'rxjs';
import { visitColumns } from '../components/amc-columns';
import { AmcReferenceStore } from '../data/amc-reference.store';
import { AmcApi, VisitApi } from '../data/amc.api';
import { AMC_LOOKUP } from '../data/amc.lookups';
import { LookupValuesStore } from '@shared/lookups/lookup-values.store';
import { LIVE_AMC_STATUSES, SERVICE_WINDOWS } from '../models/amc.model';
import { VISIT_STATUSES, VISIT_TYPES, type VisitListItem, type VisitType } from '../models/operations.model';

type Mode = 'new' | 'assign' | 'reschedule' | 'complete' | 'cancel' | 'generate';
const OPEN = ['Planned', 'Scheduled', 'Assigned', 'Confirmed', 'Rescheduled'];

@Component({
  selector: 'amc-visits-page',
  imports: [DataTable, DatePicker, Dialog, FilterBar, FormField, Icon, MultiSelect, PageHeader, Select, Spinner, Switch],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="AMC Service Visit Plan" subtitle="Operational planning for recurring AMC visits — schedule, assign, complete and report." [breadcrumbs]="[{ label: 'AMC / Service Contracts', path: '/app/amc-agreements/dashboard' }, { label: 'Visit Plan' }]">
        <button type="button" class="amc-btn-secondary" (click)="export()"><amc-icon name="download" /> <span class="hidden sm:inline">Export</span></button>
        <button type="button" class="amc-btn-secondary" (click)="open('generate', null)"><amc-icon name="calendar-check" /> Generate Visits</button>
        <button type="button" class="amc-btn-primary" (click)="open('new', null)"><amc-icon name="plus" /> Schedule Visit</button>
      </amc-page-header>
      <section class="amc-card overflow-hidden">
        <div class="border-b border-line p-3 sm:p-4"><amc-filter-bar searchPlaceholder="Search visit, AMC, customer, site, technician or work order…" [(search)]="search" [fields]="filterFields()" [(filters)]="filters" /></div>
        <amc-data-table tableId="amc-visits-all" [entity]="{ singular: 'visit', plural: 'visits' }" [totalCount]="rows().length" [rows]="filtered()" [columns]="columns" [trackBy]="trackById" [loading]="visits.isLoading()" [actions]="rowActions" [initialPageSize]="25" emptyIcon="calendar" emptyTitle="No visits" emptyMessage="Generate visits from the maintenance schedule or schedule one manually." (action)="onAction($event)" />
      </section>
    </div>

    <amc-dialog [size]="mode() === 'new' || mode() === 'complete' ? 'lg' : 'sm'" [title]="title()" [description]="target() ? target()!.number + ' · ' + target()!.siteName : ''" [open]="!!mode()" (openChange)="!$event && mode.set(null)">
      @switch (mode()) {
        @case ('generate') {
          <div class="space-y-4">
            <amc-form-field label="AMC" for="vs-gamc"><amc-select inputId="vs-gamc" [options]="liveAmcOptions()" [(value)]="amc" /></amc-form-field>
            <amc-form-field label="Planning horizon (days)" for="vs-days" hint="Scheduled PM events in this window are grouped into one visit per site and date."><input id="vs-days" type="number" min="1" class="amc-input tabular-nums" [value]="days()" (input)="days.set(+$any($event.target).value || 30)" /></amc-form-field>
          </div>
        }
        @case ('new') {
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <amc-form-field label="AMC" for="vs-amc" class="sm:col-span-2"><amc-select inputId="vs-amc" [options]="liveAmcOptions()" [(value)]="amc" /></amc-form-field>
            <amc-form-field label="Visit Type" for="vs-type"><amc-select inputId="vs-type" [options]="typeOptions" [(value)]="type" /></amc-form-field>
            <amc-form-field label="Site" for="vs-site"><amc-select inputId="vs-site" [options]="siteChoices()" [(value)]="site" /></amc-form-field>
            <amc-form-field label="Assets" for="vs-assets" class="sm:col-span-2" hint="Only assets within the AMC coverage scope."><amc-multi-select inputId="vs-assets" [options]="assetChoices()" [(value)]="assets" [maxChips]="4" /></amc-form-field>
            <amc-form-field label="Service" for="vs-svc"><amc-select inputId="vs-svc" [options]="serviceChoices()" [(value)]="service" [clearable]="true" /></amc-form-field>
            <amc-form-field label="Planned Date" for="vs-date"><amc-date-picker inputId="vs-date" [(value)]="date" /></amc-form-field>
            <amc-form-field label="Visit Window" for="vs-window"><amc-select inputId="vs-window" [options]="windowOptions" [(value)]="window" /></amc-form-field>
            <amc-form-field label="Team" for="vs-team"><amc-select inputId="vs-team" [options]="teamOptions()" [(value)]="team" /></amc-form-field>
            <amc-form-field label="Technician" for="vs-tech" hint="Territory validated against the site region."><amc-select inputId="vs-tech" [options]="refs.technicianOptions()" [(value)]="technician" [clearable]="true" /></amc-form-field>
          </div>
        }
        @case ('assign') {
          <div class="space-y-4">
            <amc-form-field label="Team" for="vs-ateam"><amc-select inputId="vs-ateam" [options]="teamOptions()" [(value)]="team" /></amc-form-field>
            <amc-form-field label="Technician" for="vs-atech" hint="Service territory is validated against the site region."><amc-select inputId="vs-atech" [options]="refs.technicianOptions()" [(value)]="technician" /></amc-form-field>
          </div>
        }
        @case ('reschedule') { <amc-form-field label="New Date" for="vs-rdate" hint="Moved to the next working day if needed."><amc-date-picker inputId="vs-rdate" [(value)]="date" /></amc-form-field> }
        @case ('cancel') { <amc-form-field label="Reason" for="vs-creason" [required]="true"><textarea id="vs-creason" class="amc-textarea min-h-16" [value]="text()" (input)="text.set($any($event.target).value)"></textarea></amc-form-field> }
        @case ('complete') {
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <amc-form-field label="Service Hours" for="vs-hours" [required]="true"><input id="vs-hours" type="number" min="0" step="0.5" class="amc-input tabular-nums" [value]="hours()" (input)="hours.set(+$any($event.target).value || 0)" /></amc-form-field>
            <amc-form-field label="Parts Value" for="vs-parts"><input id="vs-parts" type="number" min="0" class="amc-input tabular-nums" [value]="parts()" (input)="parts.set(+$any($event.target).value || 0)" /></amc-form-field>
            <amc-form-field label="Consumables Value" for="vs-cons"><input id="vs-cons" type="number" min="0" class="amc-input tabular-nums" [value]="consumables()" (input)="consumables.set(+$any($event.target).value || 0)" /></amc-form-field>
            <amc-form-field label="Service Report" for="vs-report" [required]="true" class="sm:col-span-3"><textarea id="vs-report" class="amc-textarea min-h-20" [value]="text()" (input)="text.set($any($event.target).value)"></textarea></amc-form-field>
            <amc-switch label="First-time fix" [(checked)]="firstTimeFix" class="sm:col-span-3" />
            <p class="text-xs text-ink-muted sm:col-span-3">Completing the visit consumes an included visit and records parts against the AMC limits. Parts beyond the coverage terms are chargeable.</p>
          </div>
        }
      }
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="mode.set(null)">Close</button>
        <button type="button" [class]="mode() === 'cancel' ? 'amc-btn-danger' : 'amc-btn-primary'" [disabled]="busy() || !valid()" (click)="confirm()">@if (busy()) { <amc-spinner [size]="14" /> } {{ confirmLabel() }}</button>
      </ng-container>
    </amc-dialog>
  `,
})
export class VisitsPage {
  private readonly api = inject(VisitApi);
  private readonly amcApi = inject(AmcApi);
  private readonly notify = inject(NotificationPort);
  protected readonly refs = inject(AmcReferenceStore);

  readonly amcId = input<string>();
  readonly action = input<string>();

  protected readonly visits = rxResource({ stream: () => this.api.list() });
  private readonly amcs = rxResource({ stream: () => this.amcApi.list() });
  protected readonly rows = computed(() => (this.visits.hasValue() ? this.visits.value() : []));
  private readonly amcList = computed(() => (this.amcs.hasValue() ? this.amcs.value() : []));
  protected readonly liveAmcOptions = computed(() => this.amcList().filter((a) => LIVE_AMC_STATUSES.includes(a.effectiveStatus)).map((a) => ({ value: a.id, label: `${a.number} · ${a.title}`, hint: a.customerName })));
  protected readonly columns = visitColumns();
  protected readonly trackById = (v: VisitListItem) => v.id;
  protected readonly search = signal('');
  protected readonly filters = linkedSignal<FilterValues>(() => (this.amcId() ? { amc: [this.amcId()!] } : {}));
  protected readonly filterFields = computed<FilterField[]>(() => [
    { key: 'amc', label: 'AMC', type: 'multiselect', options: this.amcList().map((a) => ({ value: a.id, label: `${a.number} · ${a.title}` })) },
    { key: 'customer', label: 'Customer', type: 'multiselect', options: this.refs.customerOptions() },
    { key: 'type', label: 'Visit Type', type: 'multiselect', options: this.typeOptions },
    { key: 'status', label: 'Visit Status', type: 'multiselect', options: toOptions(VISIT_STATUSES) },
    { key: 'technician', label: 'Technician', type: 'multiselect', options: this.refs.technicianOptions() },
    { key: 'date', label: 'Planned Date', type: 'date-range' },
  ]);
  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    const customerOf = new Map(this.amcList().map((a) => [a.id, a.customer.customerId]));
    return this.rows().filter(
      (v) =>
        (!term || `${v.number} ${v.amcNumber} ${v.customerName} ${v.siteName} ${v.technician ?? ''} ${v.workOrder ?? ''}`.toLowerCase().includes(term)) && matchesAny(f, 'amc', v.amcId) && matchesAny(f, 'customer', customerOf.get(v.amcId)) &&
        matchesAny(f, 'type', v.type) && matchesAny(f, 'status', v.status) && matchesAny(f, 'technician', v.technician) && withinRange(f, 'date', v.plannedDate),
    );
  });
  protected readonly rowActions = (v: VisitListItem): MenuItem[] => {
    const open = OPEN.includes(v.status);
    return [
      ...(open ? [{ id: 'assign', label: 'Assign Technician', icon: 'user-check' as const }] : []),
      ...(v.status === 'Assigned' ? [{ id: 'confirm', label: 'Confirm with Customer', icon: 'check' as const }] : []),
      ...(open ? [{ id: 'reschedule', label: 'Reschedule', icon: 'calendar' as const }, { id: 'start', label: 'Start Visit', icon: 'play' as const }] : []),
      ...(v.status === 'In Progress' ? [{ id: 'complete', label: 'Complete & Report', icon: 'check-circle' as const }] : []),
      ...(!v.workOrder && v.status !== 'Cancelled' ? [{ id: 'work-order', label: 'Create Work Order', icon: 'wrench' as const, dividerBefore: true }] : []),
      ...(v.status === 'Completed' ? [{ id: 'report', label: 'View Service Report', icon: 'file-text' as const }] : []),
      ...(open || v.status === 'In Progress' ? [{ id: 'cancel', label: 'Cancel', icon: 'x' as const, danger: true, dividerBefore: true }] : []),
    ];
  };

  protected readonly teamOptions = inject(LookupValuesStore).options(AMC_LOOKUP.team);
  protected readonly typeOptions = toOptions(VISIT_TYPES);
  protected readonly windowOptions = toOptions(SERVICE_WINDOWS);
  protected readonly busy = signal(false);
  protected readonly mode = signal<Mode | null>(null);
  protected readonly target = signal<VisitListItem | null>(null);
  protected readonly amc = signal<string | number | null>(null);
  protected readonly days = signal(30);
  protected readonly type = signal<string | number | null>('Breakdown');
  protected readonly site = signal<string | number | null>(null);
  protected readonly assets = signal<readonly (string | number)[]>([]);
  protected readonly service = signal<string | number | null>(null);
  protected readonly date = signal(new Date().toISOString().slice(0, 10));
  protected readonly window = signal<string | number | null>('Business Hours (08:00–17:00)');
  protected readonly team = signal<string | number | null>(null);
  protected readonly technician = signal<string | number | null>(null);
  protected readonly text = signal('');
  protected readonly hours = signal(2);
  protected readonly parts = signal(0);
  protected readonly consumables = signal(0);
  protected readonly firstTimeFix = signal(true);
  private readonly selectedAmc = computed(() => this.amcList().find((a) => a.id === this.amc()));
  protected readonly siteChoices = computed(() => this.refs.siteOptions(null, this.selectedAmc()?.scope.siteIds ?? []));
  protected readonly assetChoices = computed(() => this.refs.assetOptions(null, this.site() ? [String(this.site())] : [], this.selectedAmc()?.scope.assetIds ?? []));
  protected readonly serviceChoices = computed(() => this.refs.serviceOptions().filter((o) => this.selectedAmc()?.scope.serviceIds.includes(String(o.value))));
  protected readonly title = computed(() => ({ new: 'Schedule visit', assign: 'Assign technician', reschedule: 'Reschedule visit', complete: 'Complete visit', cancel: 'Cancel visit', generate: 'Generate visits' })[this.mode() ?? 'new']);
  protected readonly confirmLabel = computed(() => ({ new: 'Schedule', assign: 'Assign', reschedule: 'Reschedule', complete: 'Complete', cancel: 'Cancel Visit', generate: 'Generate' })[this.mode() ?? 'new']);
  protected readonly valid = computed(() => {
    switch (this.mode()) {
      case 'new':
        return !!this.amc() && !!this.site() && !!this.date();
      case 'generate':
        return !!this.amc();
      case 'assign':
        return !!this.technician();
      case 'cancel':
        return !!this.text().trim();
      case 'complete':
        return this.hours() > 0 && !!this.text().trim();
      default:
        return true;
    }
  });

  constructor() {
    effect(() => {
      if (this.action() === 'new' && this.amcList().length) untracked(() => this.open('new', null));
    });
  }

  protected open(mode: Mode, v: VisitListItem | null): void {
    this.target.set(v);
    const a = this.amcList().find((x) => x.id === (v?.amcId ?? this.amcId()));
    this.amc.set(a && LIVE_AMC_STATUSES.includes(a.effectiveStatus) ? a.id : null);
    this.site.set(v?.siteId ?? a?.scope.siteIds[0] ?? null);
    this.assets.set([]);
    this.service.set(null);
    this.date.set(v?.plannedDate ?? new Date().toISOString().slice(0, 10));
    this.team.set(v?.team ?? a?.operational.serviceTeam ?? null);
    this.technician.set(v?.technician ?? null);
    this.text.set('');
    this.hours.set(v?.hours || 2);
    this.parts.set(0);
    this.consumables.set(0);
    this.firstTimeFix.set(true);
    this.mode.set(mode);
  }

  protected async onAction({ id, row }: RowAction<VisitListItem>): Promise<void> {
    switch (id) {
      case 'confirm':
        return void this.exec(this.api.confirm(row.id), `${row.number} confirmed.`);
      case 'start':
        return void this.exec(this.api.start(row.id), `${row.number} started.`);
      case 'work-order':
        try {
          const wo = await firstValueFrom(this.api.createWorkOrder(row.id));
          this.notify.success(`Work order ${wo} created — continues in the Work Order & Field Service module.`);
          this.visits.reload();
        } catch (error) {
          this.notify.error((error as Error).message);
        }
        return;
      case 'report':
        downloadFile(`${row.number}-service-report.txt`, [`Service report ${row.number}`, `AMC: ${row.amcNumber} · ${row.customerName}`, `Site: ${row.siteName}`, `Assets: ${row.assetNames.join(', ') || '—'}`, `Type: ${row.type}`, `Technician: ${row.technician ?? '—'}`, `Completed: ${row.completedAt ?? ''}`, `Hours: ${row.hours} · Parts: ${row.partsValue} · Consumables: ${row.consumablesValue}`, `Coverage: ${row.covered ? 'Covered' : 'Billable'}`, '', row.report].join('\n'), 'text/plain');
        return;
      default:
        this.open(id as Mode, row);
    }
  }

  protected async confirm(): Promise<void> {
    const v = this.target();
    const str = (x: string | number | null) => (x === null ? null : String(x));
    let work: Observable<unknown>;
    let message: string;
    switch (this.mode()) {
      case 'generate':
        try {
          this.busy.set(true);
          const n = await firstValueFrom(this.api.generate(String(this.amc()), this.days()));
          this.notify.success(n ? `${n} visit(s) generated.` : 'No unplanned maintenance in this window.');
          this.mode.set(null);
          this.visits.reload();
        } catch (error) {
          this.notify.error((error as Error).message);
        } finally {
          this.busy.set(false);
        }
        return;
      case 'new':
        work = this.api.create({ amcId: String(this.amc()), siteId: String(this.site()), assetIds: this.assets().map(String), serviceId: str(this.service()), plannedDate: this.date(), window: String(this.window() ?? ''), type: this.type() as VisitType, team: String(this.team() ?? ''), technician: str(this.technician()) });
        message = 'Visit scheduled.';
        break;
      case 'assign':
        work = this.api.assign(v!.id, String(this.team() ?? v!.team), String(this.technician()));
        message = `${v!.number} assigned.`;
        break;
      case 'reschedule':
        work = this.api.reschedule(v!.id, this.date());
        message = `${v!.number} rescheduled.`;
        break;
      case 'cancel':
        work = this.api.cancel(v!.id, this.text());
        message = `${v!.number} cancelled.`;
        break;
      default:
        work = this.api.complete(v!.id, { hours: this.hours(), partsValue: this.parts(), consumablesValue: this.consumables(), firstTimeFix: this.firstTimeFix(), report: this.text() });
        message = `${v!.number} completed — included visit consumed.`;
    }
    if (await this.exec(work, message)) this.mode.set(null);
  }

  private async exec(work: Observable<unknown>, message: string): Promise<boolean> {
    this.busy.set(true);
    try {
      await firstValueFrom(work);
      this.notify.success(message);
      this.visits.reload();
      return true;
    } catch (error) {
      this.notify.error((error as Error).message);
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  protected export(): void {
    downloadCsv(timestampedName('amc-visits', 'csv'), ['Visit Number', 'AMC', 'Customer', 'Site', 'Assets', 'Service', 'Planned Date', 'Visit Window', 'Technician', 'Team', 'Visit Type', 'Status', 'Work Order', 'Hours', 'Parts', 'Covered'],
      this.filtered().map((v) => [v.number, v.amcNumber, v.customerName, v.siteName, v.assetNames.join('; '), v.serviceName, v.plannedDate, v.window, v.technician, v.team, v.type, v.status, v.workOrder, v.hours, v.partsValue, v.covered ? 'Yes' : 'No']));
  }
}
