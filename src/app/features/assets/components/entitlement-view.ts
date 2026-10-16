import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { NotificationPort } from '@core/notification/notification.port';
import { toOptions } from '@shared/models/select-option';
import type { MenuItem } from '@shared/ui/action-menu';
import { DataTable, type RowAction } from '@shared/ui/data-table';
import { DatePicker } from '@shared/ui/date-picker';
import { DetailItem } from '@shared/ui/detail-item';
import { Dialog } from '@shared/ui/dialog';
import { FilterBar } from '@shared/ui/filter-bar';
import { FormField } from '@shared/ui/form-field';
import { Icon } from '@shared/ui/icon';
import { Select } from '@shared/ui/select';
import { Spinner } from '@shared/ui/spinner';
import { StatusBadge } from '@shared/ui/status-badge';
import { downloadCsv, timestampedName } from '@shared/utils/file';
import { type FilterField, type FilterValues, matchesAny } from '@shared/utils/filters';
import { formatDate } from '@shared/utils/format';
import { firstValueFrom, of } from 'rxjs';
import { AssetApi, EntitlementApi } from '../data/asset.api';
import { COVERAGE_FLAGS, COVERAGE_TYPES, type CoverageListItem, type EntitlementCheck, type ServiceKind } from '../models/coverage.model';
import { AGREEMENT_STATUS_TONE } from '../models/display';
import { coverageColumns } from './asset-columns';

export const SERVICE_KINDS: readonly ServiceKind[] = ['Breakdown', 'Preventive', 'Emergency', 'Inspection', 'Remote'];

/** Result card of an entitlement evaluation. */
@Component({
  selector: 'amc-entitlement-result',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let c = check();
    <div class="rounded-xl border p-4" [class]="c.covered ? 'border-ok/30 bg-ok-subtle' : 'border-warn/30 bg-warn-subtle'">
      <div class="flex items-start gap-3">
        <amc-icon [name]="c.covered ? 'shield-check' : 'alert-triangle'" [size]="20" [class]="c.covered ? 'text-ok' : 'text-warn'" />
        <div class="min-w-0 flex-1">
          <p class="text-sm font-semibold text-ink">{{ c.covered ? 'Covered — ' + c.serviceKind.toLowerCase() + ' service is entitled' : 'Not covered — chargeable service' }}</p>
          <ul class="mt-1.5 space-y-1 text-sm text-ink-muted">
            @for (reason of c.reasons; track reason) {
              <li>{{ reason }}</li>
            }
          </ul>
        </div>
      </div>
      <dl class="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3 text-sm sm:grid-cols-4">
        <div><dt class="text-xs text-ink-muted">Labor</dt><dd class="font-medium text-ink">{{ c.laborIncluded ? 'Included' : 'Chargeable' }}</dd></div>
        <div><dt class="text-xs text-ink-muted">Parts</dt><dd class="font-medium text-ink">{{ c.partsIncluded ? 'Included' : 'Chargeable' }}</dd></div>
        <div><dt class="text-xs text-ink-muted">Warranty</dt><dd class="font-medium text-ink">{{ c.warrantyActive ? 'Active' : 'None' }}</dd></div>
        <div><dt class="text-xs text-ink-muted">Visits Remaining</dt><dd class="font-medium text-ink">{{ c.visitsRemaining ?? '—' }}</dd></div>
        @if (c.coverage; as cov) {
          <div class="col-span-2"><dt class="text-xs text-ink-muted">SLA</dt><dd class="font-medium text-ink">{{ cov.slaName ?? '—' }}{{ cov.responseHours ? ' · ' + cov.responseHours + 'h response / ' + cov.resolutionHours + 'h resolution' : '' }}</dd></div>
          <div class="col-span-2"><dt class="text-xs text-ink-muted">Agreement</dt><dd class="font-medium text-ink">{{ cov.agreementNumber }} · ends {{ formatDate(cov.endDate) }}</dd></div>
        }
      </dl>
    </div>
  `,
})
export class EntitlementResult {
  readonly check = input.required<EntitlementCheck>();
  protected readonly formatDate = formatDate;
}

/** SRS 3.11 — commercial and service entitlements of assets, with entitlement evaluation. */
@Component({
  selector: 'amc-entitlement-view',
  imports: [DataTable, DatePicker, DetailItem, Dialog, EntitlementResult, FilterBar, FormField, Icon, RouterLink, Select, Spinner, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block space-y-4' },
  template: `
    <!-- Entitlement evaluation -->
    <section class="amc-card p-4 sm:p-5">
      <div class="flex flex-col gap-1">
        <h2 class="text-sm font-semibold text-ink">Evaluate entitlement</h2>
        <p class="text-xs text-ink-muted">The active entitlement is evaluated when creating service requests and work orders. Expired agreements never provide entitlement.</p>
      </div>
      <div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
        @if (!assetId()) {
          <amc-form-field label="Asset" for="ent-asset" class="lg:col-span-2">
            <amc-select inputId="ent-asset" placeholder="Select asset…" [options]="assetOptions()" [(value)]="checkAsset" />
          </amc-form-field>
        }
        <amc-form-field label="Service Type" for="ent-kind">
          <amc-select inputId="ent-kind" [options]="kindOptions" [(value)]="checkKind" />
        </amc-form-field>
        <amc-form-field label="Service Date" for="ent-date">
          <amc-date-picker inputId="ent-date" [(value)]="checkDate" />
        </amc-form-field>
        <div [class]="assetId() ? 'lg:col-span-2' : ''">
          <button type="button" class="amc-btn-primary w-full sm:w-auto" [disabled]="!effectiveAsset() || evaluating()" (click)="evaluate()">
            @if (evaluating()) { <amc-spinner [size]="14" /> } @else { <amc-icon name="shield-check" /> }
            Check Entitlement
          </button>
        </div>
      </div>
      @if (result(); as r) {
        <amc-entitlement-result class="mt-4" [check]="r" />
      }
    </section>

    @if (assetId() && activeCoverage()) {
      <section class="amc-card p-4 sm:p-5">
        <h2 class="text-sm font-semibold text-ink">Active coverage</h2>
        <div class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          @for (flag of flags; track flag.key) {
            <div class="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm" [class]="activeFlags()[flag.key] ? 'border-ok/30 bg-ok-subtle text-ink' : 'border-line text-ink-muted'">
              <amc-icon [name]="activeFlags()[flag.key] ? 'check-circle' : 'x'" [size]="14" [class]="activeFlags()[flag.key] ? 'text-ok' : 'text-ink-subtle'" />
              {{ flag.label }}
            </div>
          }
        </div>
      </section>
    }

    <section class="amc-card overflow-hidden">
      <div class="border-b border-line p-3 sm:p-4">
        <amc-filter-bar searchPlaceholder="Search asset, contract, AMC or SLA…" [(search)]="search" [fields]="filterFields()" [(filters)]="filters">
          <ng-container actions>
            <button type="button" class="amc-btn-ghost" [disabled]="!filtered().length" (click)="export()"><amc-icon name="download" /> <span class="hidden sm:inline">Export</span></button>
          </ng-container>
        </amc-filter-bar>
      </div>
      <amc-data-table
        [tableId]="assetId() ? 'asset-entitlements' : 'entitlements'"
        [entity]="{ singular: 'entitlement', plural: 'entitlements' }"
        [totalCount]="rows().length"
        [rows]="filtered()"
        [columns]="columns()"
        [trackBy]="trackById"
        [loading]="coverages.isLoading()"
        [error]="coverages.error() ? 'Entitlements could not be loaded.' : null"
        [actions]="rowActions"
        emptyIcon="file-check"
        [emptyTitle]="rows().length ? 'No entitlements match your filters' : 'No contracts or AMCs cover this asset'"
        [emptyMessage]="rows().length ? 'Try a different search or clear the filters.' : 'Link the asset to a contract or AMC from the asset record.'"
        (action)="onAction($event)"
        (retry)="coverages.reload()"
      />
    </section>

    <amc-dialog size="lg" [title]="selected() ? selected()!.agreementNumber + ' · ' + selected()!.agreementTitle : 'Entitlement'" [description]="selected()?.entitlement ?? ''" [(open)]="detailsOpen">
      @if (selected(); as c) {
        <dl class="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div><dt class="text-xs font-medium text-ink-muted">Asset</dt><dd class="mt-1 text-sm"><a class="amc-link" [routerLink]="['/app/assets', c.assetId]">{{ c.assetCode }} · {{ c.assetName }}</a></dd></div>
          <div><dt class="text-xs font-medium text-ink-muted">Contract Status</dt><dd class="mt-1"><amc-status-badge [label]="c.status" [tone]="statusTone[c.status]" /></dd></div>
          <amc-detail-item label="Kind" [value]="c.kind" />
          <amc-detail-item label="Contract Start Date" [value]="formatDate(c.startDate)" />
          <amc-detail-item label="Contract End Date" [value]="formatDate(c.endDate)" />
          <amc-detail-item label="Coverage Type" [value]="c.coverageType" />
          <amc-detail-item label="SLA" [value]="c.slaName" />
          <amc-detail-item label="Response Time" [value]="c.responseHours ? c.responseHours + ' hours' : null" />
          <amc-detail-item label="Resolution Time" [value]="c.resolutionHours ? c.resolutionHours + ' hours' : null" />
          <amc-detail-item label="Service Frequency" [value]="c.serviceFrequency" />
          <amc-detail-item label="Parts Coverage" [value]="c.partsCoverage" />
          <amc-detail-item label="Labor Coverage" [value]="c.laborCoverage" />
          <amc-detail-item label="Visit Coverage" [value]="c.visitCoverage" />
        </dl>
        <div class="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <h3 class="text-sm font-semibold text-ink">Included services</h3>
            <ul class="mt-2 space-y-1">
              @for (s of c.includedServices; track s) {
                <li class="flex items-center gap-2 text-sm text-ink"><amc-icon name="check-circle" [size]="14" class="text-ok" />{{ s }}</li>
              }
            </ul>
          </div>
          <div>
            <h3 class="text-sm font-semibold text-ink">Excluded services</h3>
            <ul class="mt-2 space-y-1">
              @for (s of c.excludedServices; track s) {
                <li class="flex items-center gap-2 text-sm text-ink-muted"><amc-icon name="x" [size]="14" class="text-danger" />{{ s }}</li>
              }
            </ul>
          </div>
        </div>
      }
    </amc-dialog>
  `,
})
export class EntitlementView {
  private readonly api = inject(EntitlementApi);
  private readonly assetsApi = inject(AssetApi);
  private readonly notify = inject(NotificationPort);

  readonly assetId = input<string | null>(null);
  /** Restrict the table to one agreement kind (Asset 360 "Contracts / AMCs" tab). */
  readonly kind = input<'all' | 'agreements'>('all');

  protected readonly flags = COVERAGE_FLAGS;
  protected readonly statusTone = AGREEMENT_STATUS_TONE;
  protected readonly formatDate = formatDate;
  protected readonly kindOptions = toOptions(SERVICE_KINDS);
  protected readonly trackById = (c: CoverageListItem) => c.id;

  protected readonly coverages = rxResource({ params: () => ({ assetId: this.assetId() ?? undefined }), stream: ({ params }) => this.api.list(params) });
  protected readonly rows = computed(() => (this.coverages.hasValue() ? this.coverages.value() : []));
  private readonly assets = rxResource({ params: () => (this.assetId() ? undefined : true), stream: ({ params }) => (params ? this.assetsApi.list() : of([])) });
  protected readonly assetOptions = computed(() => (this.assets.hasValue() ? this.assets.value() : []).map((a) => ({ value: a.id, label: `${a.code} · ${a.name}`, hint: a.customerName ?? undefined })));

  protected readonly columns = computed(() => coverageColumns(!this.assetId()));
  protected readonly search = signal('');
  protected readonly filters = signal<FilterValues>({});
  protected readonly filterFields = computed<FilterField[]>(() => [
    { key: 'status', label: 'Contract Status', type: 'multiselect', options: toOptions(['Active', 'Expiring', 'Expired', 'Terminated'] as const) },
    { key: 'kind', label: 'Kind', type: 'multiselect', options: toOptions(['Contract', 'AMC'] as const) },
    { key: 'coverage', label: 'Coverage Type', type: 'multiselect', options: toOptions(COVERAGE_TYPES) },
    { key: 'sla', label: 'SLA', type: 'multiselect', options: toOptions([...new Set(this.rows().map((r) => r.slaName ?? ''))].filter(Boolean).sort()) },
  ]);
  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    return this.rows().filter(
      (c) =>
        (!term || `${c.assetCode} ${c.assetName} ${c.agreementNumber} ${c.agreementTitle} ${c.slaName ?? ''} ${c.customerName}`.toLowerCase().includes(term)) &&
        matchesAny(f, 'status', c.status) &&
        matchesAny(f, 'kind', c.kind) &&
        matchesAny(f, 'coverage', c.coverageType) &&
        matchesAny(f, 'sla', c.slaName),
    );
  });

  protected readonly activeCoverage = computed(() => this.rows().find((c) => c.status === 'Active' || c.status === 'Expiring') ?? null);
  protected readonly activeFlags = computed(() => {
    const live = this.rows().filter((c) => c.status === 'Active' || c.status === 'Expiring');
    return Object.fromEntries(COVERAGE_FLAGS.map((f) => [f.key, live.some((c) => c.flags[f.key])])) as Record<string, boolean>;
  });

  protected readonly rowActions = (): MenuItem[] => [
    { id: 'details', label: 'View Entitlement', icon: 'eye' },
    { id: 'check', label: 'Check Entitlement', icon: 'shield-check' },
  ];

  protected readonly selected = signal<CoverageListItem | null>(null);
  protected readonly detailsOpen = signal(false);

  protected readonly checkAsset = signal<string | number | null>(null);
  protected readonly checkKind = signal<string | number | null>('Breakdown');
  protected readonly checkDate = signal(new Date().toISOString().slice(0, 10));
  protected readonly effectiveAsset = computed(() => this.assetId() ?? (this.checkAsset() ? String(this.checkAsset()) : null));
  protected readonly result = signal<EntitlementCheck | null>(null);
  protected readonly evaluating = signal(false);

  protected async evaluate(): Promise<void> {
    const assetId = this.effectiveAsset();
    if (!assetId) return;
    this.evaluating.set(true);
    try {
      this.result.set(await firstValueFrom(this.api.evaluate(assetId, String(this.checkKind()) as ServiceKind, this.checkDate() || undefined)));
    } catch (error) {
      this.notify.error((error as Error).message);
    } finally {
      this.evaluating.set(false);
    }
  }

  protected onAction({ id, row }: RowAction<CoverageListItem>): void {
    this.selected.set(row);
    if (id === 'details') this.detailsOpen.set(true);
    else {
      this.checkAsset.set(row.assetId);
      void this.evaluate();
    }
  }

  protected export(): void {
    downloadCsv(
      timestampedName('asset-entitlements', 'csv'),
      ['Asset ID', 'Asset', 'Customer', 'Agreement', 'Kind', 'Entitlement', 'Coverage Type', 'SLA', 'Response (h)', 'Resolution (h)', 'Start', 'End', 'Status', 'Parts Coverage', 'Labor Coverage', 'Visit Coverage', 'Included Services', 'Excluded Services'],
      this.filtered().map((c) => [c.assetCode, c.assetName, c.customerName, c.agreementNumber, c.kind, c.entitlement, c.coverageType, c.slaName, c.responseHours, c.resolutionHours, c.startDate, c.endDate, c.status, c.partsCoverage, c.laborCoverage, c.visitCoverage, c.includedServices.join('; '), c.excludedServices.join('; ')]),
    );
  }
}
