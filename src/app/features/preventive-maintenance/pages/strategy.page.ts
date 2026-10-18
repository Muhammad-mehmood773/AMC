import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { toOptions } from '@shared/models/select-option';
import { type DataColumn, DataTable } from '@shared/ui/data-table';
import { FilterBar } from '@shared/ui/filter-bar';
import { FormField } from '@shared/ui/form-field';
import { Icon } from '@shared/ui/icon';
import { MiniChart } from '@shared/ui/mini-chart';
import { PageHeader } from '@shared/ui/page-header';
import { Panel } from '@shared/ui/panel';
import { Select } from '@shared/ui/select';
import { Spinner } from '@shared/ui/spinner';
import { type FilterField, type FilterValues, matchesAny } from '@shared/utils/filters';
import { formatDate } from '@shared/utils/format';
import { firstValueFrom } from 'rxjs';
import { PmReferenceStore } from '../data/pm-reference.store';
import { PlanApi, type PreviewDate } from '../data/pm.api';
import { FREQUENCY_TYPES, type PlanListItem, type PlanUpsert, STRATEGIES } from '../models/plan.model';

/** SRS 8.8 — how and when recurring maintenance is generated. */
@Component({
  selector: 'amc-strategy-page',
  imports: [DataTable, FilterBar, FormField, Icon, MiniChart, PageHeader, Panel, Select, Spinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="Maintenance Strategy & Frequency" subtitle="Strategies, frequencies, first / next due dates, grace periods and lead times of every plan." [breadcrumbs]="[{ label: 'Preventive Maintenance', path: '/app/preventive-maintenance/dashboard' }, { label: 'Strategy & Frequency' }]" />
      <ol class="flex flex-wrap items-center gap-2 text-xs" aria-label="Automation example">
        @for (s of flow; track s; let last = $last) { <li class="flex items-center gap-2"><span class="rounded-full bg-brand-subtle px-2.5 py-1 font-medium text-brand">{{ s }}</span>@if (!last) { <amc-icon name="arrow-right" [size]="12" class="text-ink-subtle" /> }</li> }
      </ol>
      <div class="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <amc-panel title="Plans by strategy" icon="layers" class="min-w-0"><div class="px-1 pb-2"><amc-mini-chart type="donut" [labels]="strategyLabels" [values]="strategyCounts()" [height]="200" ariaLabel="Plans by strategy" /></div></amc-panel>
        <amc-panel title="Recurrence preview" description="Automatic schedule generation for the next 12 months" icon="calendar-check" class="xl:col-span-2">
          <div class="flex flex-wrap items-end gap-3">
            <amc-form-field label="Maintenance Plan" for="st-plan" class="min-w-72 flex-1"><amc-select inputId="st-plan" [options]="refs.planOptions()" [(value)]="planId" /></amc-form-field>
            <button type="button" class="amc-btn-primary" [disabled]="!planId() || busy()" (click)="runPreview()">@if (busy()) { <amc-spinner [size]="14" /> } Preview</button>
          </div>
          @if (error()) { <p class="mt-3 text-sm text-danger">{{ error() }}</p> }
          @if (preview(); as pv) {
            @let plan = selected();
            <p class="mt-3 text-sm text-ink">{{ plan?.frequencyLabel }} · {{ plan?.assetIds?.length }} asset(s) → <span class="font-semibold">{{ pv.length * (plan?.assetIds?.length ?? 1) }}</span> maintenance events / year ({{ pv.length }} per asset).</p>
            <div class="mt-2 flex flex-wrap gap-1.5">
              @for (d of pv; track d.ruleDate) { <span class="rounded-full px-2 py-0.5 text-xs tabular-nums" [class]="d.adjusted ? 'bg-warn-subtle text-warn' : 'bg-brand-subtle text-brand'" [attr.title]="d.adjusted ? 'Moved from ' + d.ruleDate : ''">{{ formatDate(d.scheduledDate) }}</span> } @empty { <span class="text-sm text-ink-muted">Meter-, condition- and event-based plans generate events from readings or events.</span> }
            </div>
          }
        </amc-panel>
      </div>
      <section class="amc-card overflow-hidden">
        <div class="border-b border-line p-3 sm:p-4"><amc-filter-bar searchPlaceholder="Search plan…" [(search)]="search" [fields]="filterFields" [(filters)]="filters" /></div>
        <amc-data-table tableId="pm-strategy" [rows]="filtered()" [columns]="columns" [trackBy]="trackById" [loading]="plans.isLoading()" [initialPageSize]="25" emptyIcon="layers" emptyTitle="No plans" emptyMessage="No plans match." />
      </section>
    </div>
  `,
})
export class StrategyPage {
  private readonly api = inject(PlanApi);
  protected readonly refs = inject(PmReferenceStore);

  protected readonly plans = rxResource({ stream: () => this.api.list() });
  private readonly rows = computed(() => (this.plans.hasValue() ? this.plans.value() : []));
  protected readonly search = signal('');
  protected readonly filters = signal<FilterValues>({});
  protected readonly filterFields: FilterField[] = [
    { key: 'strategy', label: 'Strategy', type: 'multiselect', options: toOptions(STRATEGIES) },
    { key: 'frequency', label: 'Frequency Type', type: 'multiselect', options: toOptions(FREQUENCY_TYPES) },
  ];
  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    return this.rows().filter((p) => (!term || `${p.number} ${p.name}`.toLowerCase().includes(term)) && matchesAny(f, 'strategy', p.strategy.strategy) && matchesAny(f, 'frequency', p.frequency.type));
  });
  protected readonly columns: DataColumn<PlanListItem>[] = [
    { key: 'plan', label: 'Plan', value: (p) => p.name, secondary: (p) => `${p.number} · ${p.maintenanceType}`, link: (p) => `/app/preventive-maintenance/${p.id}`, mobile: 'title', sortable: true, width: 280 },
    { key: 'strategy', label: 'Strategy', value: (p) => p.strategy.strategy, type: 'badge', tone: () => 'info', sortable: true, width: 140 },
    { key: 'type', label: 'Frequency Type', value: (p) => p.frequency.type, visibility: 'md', width: 130 },
    { key: 'freq', label: 'Frequency', value: (p) => p.frequencyLabel, mobile: 'meta', width: 200 },
    { key: 'value', label: 'Value / Unit', value: (p) => `${p.frequency.value} ${p.frequency.unit}`, visibility: 'xl', width: 120 },
    { key: 'start', label: 'Start / First Due', value: (p) => p.frequency.startDate, type: 'date', visibility: 'lg', width: 120 },
    { key: 'end', label: 'End Date', value: (p) => p.frequency.endDate, type: 'date', visibility: 'xl', width: 120 },
    { key: 'next', label: 'Next Due Date', value: (p) => p.nextDueDate, type: 'date', sortable: true, visibility: 'md', width: 120 },
    { key: 'grace', label: 'Grace Period', value: (p) => `${p.frequency.graceDays} days`, visibility: 'lg', width: 110 },
    { key: 'lead', label: 'Lead Time', value: (p) => `${p.frequency.leadTimeDays} days`, visibility: 'lg', width: 100 },
    { key: 'assets', label: 'Covered Assets', value: (p) => p.assetIds.length, type: 'number', visibility: 'xl', width: 110 },
  ];
  protected readonly trackById = (p: PlanListItem) => p.id;
  protected readonly strategyLabels = [...STRATEGIES];
  protected readonly strategyCounts = computed(() => STRATEGIES.map((s) => this.rows().filter((p) => p.strategy.strategy === s).length));
  protected readonly flow = ['Maintenance Plan', 'Frequency', 'Recurrence Rule', 'Automatic Schedule Generation', '12-Month Calendar', 'Recurring Work Orders'];
  protected readonly planId = signal<string | number | null>(null);
  protected readonly selected = computed(() => this.rows().find((p) => p.id === this.planId()));
  protected readonly preview = signal<PreviewDate[] | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly formatDate = formatDate;

  protected async runPreview(): Promise<void> {
    const p = this.selected();
    if (!p) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const { id: _i, number: _n, status: _s, approval: _a, version: _v, documents: _d, createdAt: _c, createdBy: _b, updatedAt: _u, updatedBy: _y, customerName: _cn, siteName: _sn, assetNames: _an, serviceName: _svn, frequencyLabel: _fl, nextDueDate: _nd, nextScheduledDate: _ns, lastCompletedDate: _lc, kpis: _k, ...rest } = p;
      void [_i, _n, _s, _a, _v, _d, _c, _b, _u, _y, _cn, _sn, _an, _svn, _fl, _nd, _ns, _lc, _k];
      this.preview.set(['Time-Based', 'Calendar-Based'].includes(p.strategy.strategy) ? await firstValueFrom(this.api.preview(rest as PlanUpsert, 12)) : []);
    } catch (e) {
      this.error.set((e as Error).message);
      this.preview.set(null);
    } finally {
      this.busy.set(false);
    }
  }
}
