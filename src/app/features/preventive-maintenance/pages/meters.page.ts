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
import { MiniChart } from '@shared/ui/mini-chart';
import { PageHeader } from '@shared/ui/page-header';
import { Select } from '@shared/ui/select';
import { Spinner } from '@shared/ui/spinner';
import { type FilterField, type FilterValues, matchesAny } from '@shared/utils/filters';
import { formatDateTime } from '@shared/utils/format';
import { firstValueFrom, of } from 'rxjs';
import { meterColumns } from '../components/pm-columns';
import { PmReferenceStore } from '../data/pm-reference.store';
import { MeterApi, PlanApi } from '../data/pm.api';
import { CONDITION_PARAMETERS, METER_TYPES, type MeterRuleListItem } from '../models/operations.model';

/** SRS 8.13 — meter / condition reading → rule evaluation → threshold → maintenance trigger. */
@Component({
  selector: 'amc-meters-page',
  imports: [DataTable, Dialog, FilterBar, FormField, Icon, MiniChart, PageHeader, Select, Spinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="Meter / Condition-Based Rules" subtitle="Maintenance generated from operating hours, usage and operating conditions." [breadcrumbs]="[{ label: 'Preventive Maintenance', path: '/app/preventive-maintenance/dashboard' }, { label: 'Meter / Condition Rules' }]">
        <button type="button" class="amc-btn-primary" (click)="openRule()"><amc-icon name="plus" /> Add Rule</button>
      </amc-page-header>
      <ol class="flex flex-wrap items-center gap-2 text-xs" aria-label="Workflow">
        @for (s of flow; track s; let last = $last) { <li class="flex items-center gap-2"><span class="rounded-full bg-surface-sunken px-2.5 py-1 font-medium text-ink-muted">{{ s }}</span>@if (!last) { <amc-icon name="arrow-right" [size]="12" class="text-ink-subtle" /> }</li> }
      </ol>
      <section class="amc-card overflow-hidden">
        <div class="border-b border-line p-3 sm:p-4"><amc-filter-bar searchPlaceholder="Search rule, plan or asset…" [(search)]="search" [fields]="filterFields()" [(filters)]="filters" /></div>
        <amc-data-table tableId="pm-meters" [rows]="filtered()" [columns]="columns" [trackBy]="trackById" [loading]="rules.isLoading()" [actions]="rowActions" emptyIcon="activity" emptyTitle="No rules" emptyMessage="Add a meter or condition rule to a plan." (action)="onAction($event)" />
      </section>
    </div>

    <amc-dialog size="md" [title]="'Record reading — ' + (target()?.number ?? '')" [description]="target() ? target()!.assetName + ' · ' + (target()!.kind === 'Meter' ? target()!.meterType : target()!.parameter) : ''" [open]="mode() === 'record'" (openChange)="!$event && mode.set(null)">
      @if (target(); as m) {
        <dl class="mb-4 grid grid-cols-3 gap-3 text-sm">
          <div><dt class="text-xs text-ink-muted">Current Reading</dt><dd class="font-medium">{{ m.currentReading ?? '—' }} {{ m.unit }}</dd></div>
          <div><dt class="text-xs text-ink-muted">{{ m.kind === 'Meter' ? 'Next Maintenance' : 'Threshold' }}</dt><dd class="font-medium">{{ m.kind === 'Meter' ? m.nextMaintenanceReading : m.operator + ' ' + m.interval }} {{ m.unit }}</dd></div>
          <div><dt class="text-xs text-ink-muted">State</dt><dd class="font-medium">{{ m.state }}</dd></div>
        </dl>
        <amc-form-field label="New Reading" for="mr-value" [required]="true"><input id="mr-value" type="number" step="0.1" class="amc-input tabular-nums" [value]="reading() ?? ''" (input)="reading.set($any($event.target).value === '' ? null : +$any($event.target).value)" /></amc-form-field>
        <p class="mt-2 text-xs text-ink-muted">When the threshold is reached, a maintenance event is scheduled and a work order is generated automatically (once per trigger — no duplicates).</p>
      }
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="mode.set(null)">Close</button>
        <button type="button" class="amc-btn-primary" [disabled]="busy() || reading() === null" (click)="record()">@if (busy()) { <amc-spinner [size]="14" /> } Record</button>
      </ng-container>
    </amc-dialog>

    <amc-dialog size="lg" [title]="'Reading history — ' + (target()?.number ?? '')" [open]="mode() === 'history'" (openChange)="!$event && mode.set(null)">
      @if (target(); as m) {
        <amc-mini-chart type="bar" [labels]="historyLabels()" [values]="historyValues()" [height]="180" ariaLabel="Reading history" />
        <ul class="mt-3 max-h-60 divide-y divide-line overflow-y-auto rounded-xl border border-line text-sm">
          @for (r of m.readings.slice().reverse(); track r.at) { <li class="flex items-center justify-between px-3 py-2"><span>{{ formatDateTime(r.at) }} · {{ r.by }}</span><span class="tabular-nums font-medium">{{ r.value }} {{ m.unit }}@if (r.triggered) { <span class="ml-2 rounded-full bg-accent-subtle px-1.5 text-xs text-accent">triggered</span> }</span></li> }
        </ul>
      }
    </amc-dialog>

    <amc-dialog size="lg" title="Add meter / condition rule" [open]="mode() === 'rule'" (openChange)="!$event && mode.set(null)">
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <amc-form-field label="Rule Type" for="nr-kind"><amc-select inputId="nr-kind" [options]="kindOptions" [(value)]="kind" /></amc-form-field>
        <amc-form-field label="Maintenance Plan" for="nr-plan"><amc-select inputId="nr-plan" [options]="refs.planOptions()" [(value)]="rulePlan" /></amc-form-field>
        <amc-form-field label="Asset" for="nr-asset" class="sm:col-span-2"><amc-select inputId="nr-asset" [options]="planAssets()" [(value)]="assetId" /></amc-form-field>
        @if (kind() === 'Meter') {
          <amc-form-field label="Meter" for="nr-meter"><amc-select inputId="nr-meter" [options]="meterOptions" [(value)]="meterType" /></amc-form-field>
          <amc-form-field label="Unit" for="nr-unit"><input id="nr-unit" class="amc-input" [value]="unit()" (input)="unit.set($any($event.target).value)" /></amc-form-field>
          <amc-form-field label="Maintenance Interval" for="nr-int"><input id="nr-int" type="number" min="1" class="amc-input tabular-nums" [value]="interval()" (input)="interval.set(+$any($event.target).value || 0)" /></amc-form-field>
          <amc-form-field label="Current Reading" for="nr-cur"><input id="nr-cur" type="number" min="0" class="amc-input tabular-nums" [value]="initial()" (input)="initial.set(+$any($event.target).value || 0)" /></amc-form-field>
        } @else {
          <amc-form-field label="Condition" for="nr-param"><amc-select inputId="nr-param" [options]="paramOptions" [(value)]="parameter" /></amc-form-field>
          <amc-form-field label="Operator" for="nr-op"><amc-select inputId="nr-op" [options]="operatorOptions" [(value)]="operator" /></amc-form-field>
          <amc-form-field label="Threshold" for="nr-thr"><input id="nr-thr" type="number" class="amc-input tabular-nums" [value]="interval()" (input)="interval.set(+$any($event.target).value || 0)" /></amc-form-field>
          <amc-form-field label="Unit" for="nr-unit2"><input id="nr-unit2" class="amc-input" [value]="unit()" (input)="unit.set($any($event.target).value)" /></amc-form-field>
          <amc-form-field label="Current Value" for="nr-cur2"><input id="nr-cur2" type="number" class="amc-input tabular-nums" [value]="initial()" (input)="initial.set(+$any($event.target).value || 0)" /></amc-form-field>
        }
      </div>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="mode.set(null)">Cancel</button>
        <button type="button" class="amc-btn-primary" [disabled]="busy() || !rulePlan() || !assetId()" (click)="saveRule()">@if (busy()) { <amc-spinner [size]="14" /> } Save</button>
      </ng-container>
    </amc-dialog>
  `,
})
export class MetersPage {
  private readonly api = inject(MeterApi);
  private readonly notify = inject(NotificationPort);
  protected readonly refs = inject(PmReferenceStore);

  readonly planId = input<string>();

  protected readonly rules = rxResource({ stream: () => this.api.list() });
  private readonly rows = computed(() => (this.rules.hasValue() ? this.rules.value() : []));
  protected readonly search = signal('');
  protected readonly filters = linkedSignal<FilterValues>(() => (this.planId() ? { plan: [this.planId()!] } : {}));
  protected readonly filterFields = computed<FilterField[]>(() => [
    { key: 'kind', label: 'Rule Type', type: 'multiselect', options: this.kindOptions },
    { key: 'plan', label: 'Plan', type: 'multiselect', options: this.refs.planOptions() },
    { key: 'state', label: 'State', type: 'multiselect', options: toOptions(['Normal', 'Approaching', 'Threshold Reached'] as const) },
  ]);
  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    return this.rows().filter((m) => (!term || `${m.number} ${m.planName} ${m.assetName} ${m.meterType} ${m.parameter}`.toLowerCase().includes(term)) && matchesAny(f, 'kind', m.kind) && matchesAny(f, 'plan', m.planId) && matchesAny(f, 'state', m.state));
  });
  protected readonly columns = meterColumns();
  protected readonly trackById = (m: MeterRuleListItem) => m.id;
  protected readonly rowActions = (): MenuItem[] => [{ id: 'record', label: 'Record Reading', icon: 'activity' }, { id: 'history', label: 'Reading History', icon: 'history' }];
  protected readonly flow = ['Meter / Condition Reading', 'Rule Evaluation', 'Threshold Reached', 'Maintenance Trigger', 'Maintenance Schedule', 'Work Order', 'Technician Assignment'];
  protected readonly kindOptions = toOptions(['Meter', 'Condition'] as const);
  protected readonly meterOptions = toOptions(METER_TYPES);
  protected readonly paramOptions = toOptions(CONDITION_PARAMETERS);
  protected readonly operatorOptions = [{ value: '>', label: 'Greater than (>)' }, { value: '<', label: 'Less than (<)' }];
  protected readonly formatDateTime = formatDateTime;
  protected readonly busy = signal(false);
  protected readonly mode = signal<'record' | 'history' | 'rule' | null>(null);
  protected readonly target = signal<MeterRuleListItem | null>(null);
  protected readonly reading = signal<number | null>(null);
  protected readonly historyLabels = computed(() => (this.target()?.readings ?? []).map((r) => r.at.slice(5, 10)));
  protected readonly historyValues = computed(() => (this.target()?.readings ?? []).map((r) => r.value));
  protected readonly kind = signal<string | number | null>('Meter');
  protected readonly rulePlan = signal<string | number | null>(null);
  protected readonly assetId = signal<string | number | null>(null);
  protected readonly meterType = signal<string | number | null>('Operating Hours');
  protected readonly parameter = signal<string | number | null>('Temperature');
  protected readonly operator = signal<string | number | null>('>');
  protected readonly unit = signal('Hours');
  protected readonly interval = signal(500);
  protected readonly initial = signal(0);
  private readonly planApi = inject(PlanApi);
  private readonly rulePlanRes = rxResource({ params: () => (this.rulePlan() ? String(this.rulePlan()) : null), stream: ({ params }) => (params ? this.planApi.get(params) : of(null)) });
  protected readonly planAssets = computed(() => {
    const plan = this.rulePlanRes.hasValue() ? this.rulePlanRes.value() : null;
    return (plan?.assetIds ?? []).map((id) => ({ value: id, label: this.refs.asset(id) ? `${id} · ${this.refs.asset(id)!.name}` : id }));
  });

  protected onAction({ id, row }: RowAction<MeterRuleListItem>): void {
    this.target.set(row);
    this.reading.set(null);
    this.mode.set(id as 'record' | 'history');
  }

  protected openRule(): void {
    this.rulePlan.set(this.planId() ?? null);
    this.assetId.set(null);
    this.mode.set('rule');
  }

  protected async record(): Promise<void> {
    const m = this.target();
    const v = this.reading();
    if (!m || v === null) return;
    this.busy.set(true);
    try {
      const triggered = await firstValueFrom(this.api.record(m.id, v));
      if (triggered) this.notify.success(`Threshold reached — maintenance ${triggered} scheduled and work order generated.`);
      else this.notify.success('Reading recorded.');
      this.mode.set(null);
      this.rules.reload();
    } catch (e) {
      this.notify.error((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  protected async saveRule(): Promise<void> {
    this.busy.set(true);
    try {
      const isMeter = this.kind() === 'Meter';
      await firstValueFrom(this.api.create({ kind: isMeter ? 'Meter' : 'Condition', planId: String(this.rulePlan()), assetId: String(this.assetId()), meterType: isMeter ? String(this.meterType()) : '', parameter: isMeter ? '' : String(this.parameter()), operator: (this.operator() ?? '>') as '>' | '<', unit: this.unit(), interval: this.interval(), lastTriggerReading: 0, status: 'Active', initialReading: this.initial() }));
      this.notify.success('Rule added.');
      this.mode.set(null);
      this.rules.reload();
    } catch (e) {
      this.notify.error((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
