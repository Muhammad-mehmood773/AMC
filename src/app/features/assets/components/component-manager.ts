import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NotificationPort } from '@core/notification/notification.port';
import { toOptions } from '@shared/models/select-option';
import type { MenuItem } from '@shared/ui/action-menu';
import { type DataColumn, DataTable, type RowAction } from '@shared/ui/data-table';
import { DatePicker } from '@shared/ui/date-picker';
import { DetailItem } from '@shared/ui/detail-item';
import { Dialog } from '@shared/ui/dialog';
import { FilterBar } from '@shared/ui/filter-bar';
import { FormField } from '@shared/ui/form-field';
import { Icon } from '@shared/ui/icon';
import { LookupSelect } from '@shared/ui/lookup-select';
import { Select } from '@shared/ui/select';
import { Spinner } from '@shared/ui/spinner';
import { StatusBadge } from '@shared/ui/status-badge';
import { downloadCsv, timestampedName } from '@shared/utils/file';
import { type FilterField, type FilterValues, matchesAny } from '@shared/utils/filters';
import { formatDate, formatDateTime } from '@shared/utils/format';
import { firstValueFrom, of } from 'rxjs';
import { AssetApi, AssetDocumentApi, ComponentApi, LifecycleApi, ServiceHistoryApi } from '../data/asset.api';
import { ASSET_LOOKUP } from '../data/asset.lookups';
import { COMPONENT_STATUSES, HISTORICAL_COMPONENT_STATUSES, type ComponentInput, type ComponentListItem, type ComponentStatus } from '../models/component.model';
import { COMPONENT_STATUS_TONE, SERVICE_RESULT_TONE } from '../models/display';

type Mode = 'add' | 'edit' | 'replace';

/** SRS 3.7 — components of an asset with replace / move / history while preserving the chain. */
@Component({
  selector: 'amc-component-manager',
  imports: [DataTable, DatePicker, DetailItem, Dialog, FilterBar, FormField, Icon, LookupSelect, ReactiveFormsModule, RouterLink, Select, Spinner, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="amc-card overflow-hidden">
      <div class="border-b border-line p-3 sm:p-4">
        <amc-filter-bar searchPlaceholder="Search component, type or serial…" [(search)]="search" [fields]="filterFields()" [(filters)]="filters">
          <ng-container actions>
            <button type="button" class="amc-btn-ghost hidden sm:inline-flex" [disabled]="!filtered().length" (click)="export()">
              <amc-icon name="download" /> Export
            </button>
            @if (assetId()) {
              <button type="button" class="amc-btn-primary" [disabled]="readOnly()" [attr.title]="readOnly() ? 'Not available for retired or decommissioned assets' : null" (click)="openForm('add')">
                <amc-icon name="plus" /> <span class="hidden sm:inline">Add Component</span>
              </button>
            }
          </ng-container>
        </amc-filter-bar>
      </div>
      <amc-data-table
        [tableId]="assetId() ? 'asset-components' : 'all-components'"
        [entity]="{ singular: 'component', plural: 'components' }"
        [totalCount]="rows().length"
        [rows]="filtered()"
        [columns]="columns()"
        [trackBy]="trackById"
        [loading]="components.isLoading()"
        [error]="components.error() ? 'Components could not be loaded.' : null"
        [actions]="rowActions"
        emptyIcon="layers"
        [emptyTitle]="rows().length ? 'No components match your filters' : 'No components yet'"
        [emptyMessage]="rows().length ? 'Try a different search or clear the filters.' : 'Represent complex equipment as a parent–child structure by adding components.'"
        (action)="onAction($event)"
        (retry)="components.reload()"
      />
    </section>

    <!-- Add / edit / replace -->
    <amc-dialog size="lg" [title]="formTitle()" [description]="formDescription()" [(open)]="formOpen">
      <form [formGroup]="form" id="component-form" novalidate (ngSubmit)="save()">
        @if (mode() === 'replace') {
          <div class="mb-5 grid grid-cols-1 gap-4 rounded-xl border border-warn/30 bg-warn-subtle p-4 sm:grid-cols-2">
            <p class="text-sm text-ink sm:col-span-2">
              <span class="font-semibold">{{ selected()?.name }}</span> ({{ selected()?.serialNumber || 'no serial' }}) will be marked as <span class="font-semibold">Replaced</span>. The historical link to the new component is preserved.
            </p>
            <amc-form-field label="Replacement Date" for="cmp-rdate" [control]="replaceForm.controls.replacementDate">
              <amc-date-picker inputId="cmp-rdate" [formControl]="replaceForm.controls.replacementDate" />
            </amc-form-field>
            <amc-form-field label="Reason" for="cmp-reason" [control]="replaceForm.controls.reason">
              <input id="cmp-reason" class="amc-input" [formControl]="replaceForm.controls.reason" placeholder="e.g. Failed during load test" />
            </amc-form-field>
          </div>
        }
        <div class="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
          <amc-form-field label="Component Name" for="cmp-name" [control]="form.controls.name">
            <input id="cmp-name" class="amc-input" formControlName="name" placeholder="e.g. Compressor 1" />
          </amc-form-field>
          <amc-form-field label="Component Type" for="cmp-type" [control]="form.controls.componentType">
            <amc-lookup-select inputId="cmp-type" formControlName="componentType" [type]="lookup.componentType" />
          </amc-form-field>
          <amc-form-field label="Component Serial Number" for="cmp-serial" [control]="form.controls.serialNumber" hint="Components may have independent serial numbers.">
            <input id="cmp-serial" class="amc-input font-mono" formControlName="serialNumber" />
          </amc-form-field>
          <amc-form-field label="Manufacturer" for="cmp-mfr" [control]="form.controls.manufacturer">
            <amc-lookup-select inputId="cmp-mfr" formControlName="manufacturer" [type]="lookup.manufacturer" [clearable]="true" />
          </amc-form-field>
          <amc-form-field label="Model" for="cmp-model" [control]="form.controls.model">
            <input id="cmp-model" class="amc-input" formControlName="model" />
          </amc-form-field>
          <amc-form-field label="Installation Date" for="cmp-idate" [control]="form.controls.installationDate">
            <amc-date-picker inputId="cmp-idate" formControlName="installationDate" />
          </amc-form-field>
          <amc-form-field label="Component Status" for="cmp-status" [control]="form.controls.status">
            <amc-select inputId="cmp-status" formControlName="status" [options]="statusOptions" />
          </amc-form-field>
          <amc-form-field label="Warranty Provider" for="cmp-wprov" [control]="form.controls.warrantyProvider">
            <input id="cmp-wprov" class="amc-input" formControlName="warrantyProvider" />
          </amc-form-field>
          <amc-form-field label="Warranty End" for="cmp-wend" [control]="form.controls.warrantyEnd" hint="Independent of the parent asset's warranty.">
            <amc-date-picker inputId="cmp-wend" formControlName="warrantyEnd" />
          </amc-form-field>
          <amc-form-field label="Notes" for="cmp-notes" [control]="form.controls.notes" class="sm:col-span-2">
            <textarea id="cmp-notes" class="amc-textarea min-h-16" formControlName="notes"></textarea>
          </amc-form-field>
        </div>
      </form>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="formOpen.set(false)">Cancel</button>
        <button type="submit" form="component-form" class="amc-btn-primary" [disabled]="saving()">
          @if (saving()) { <amc-spinner [size]="14" /> }
          {{ mode() === 'replace' ? 'Replace Component' : 'Save' }}
        </button>
      </ng-container>
    </amc-dialog>

    <!-- Move / remove -->
    <amc-dialog size="md" [title]="moveMode() === 'move' ? 'Move component' : 'Remove / deactivate component'" [description]="selected()?.name ?? ''" [(open)]="moveOpen">
      <div class="space-y-4">
        @if (moveMode() === 'move') {
          <amc-form-field label="Target Asset" for="cmp-target" [required]="true" hint="The component's history stays linked to its records.">
            <amc-select inputId="cmp-target" placeholder="Select asset…" [options]="assetOptions()" [(value)]="moveTarget" />
          </amc-form-field>
        } @else {
          <p class="text-sm text-ink-muted">The component is marked as removed. It is never deleted — its service history and documents remain available.</p>
        }
        <amc-form-field label="Reason" for="cmp-move-reason">
          <input id="cmp-move-reason" class="amc-input" [value]="moveReason()" (input)="moveReason.set($any($event.target).value)" />
        </amc-form-field>
      </div>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="moveOpen.set(false)">Cancel</button>
        <button type="button" [class]="moveMode() === 'move' ? 'amc-btn-primary' : 'amc-btn-danger'" [disabled]="saving() || (moveMode() === 'move' && !moveTarget())" (click)="confirmMove()">
          @if (saving()) { <amc-spinner [size]="14" /> }
          {{ moveMode() === 'move' ? 'Move' : 'Remove' }}
        </button>
      </ng-container>
    </amc-dialog>

    <!-- History -->
    <amc-dialog size="xl" [title]="selected()?.name ?? 'Component'" [description]="selected() ? selected()!.componentType + ' · ' + (selected()!.serialNumber || 'no serial') : ''" [(open)]="historyOpen">
      @if (selected(); as c) {
        <div class="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div class="space-y-5">
            <div>
              <h3 class="text-sm font-semibold text-ink">Replacement chain</h3>
              <ol class="mt-3 flex flex-wrap items-center gap-2">
                @for (link of chain(); track link.id; let last = $last) {
                  <li class="flex items-center gap-2">
                    <span class="rounded-lg border px-2.5 py-1.5 text-xs" [class]="link.id === c.id ? 'border-brand bg-brand-subtle text-ink' : 'border-line text-ink-muted'">
                      <span class="block font-medium">{{ link.serialNumber || link.name }}</span>
                      <span class="block">{{ link.status }} · {{ formatDate(link.installationDate) || '—' }}</span>
                    </span>
                    @if (!last) { <amc-icon name="arrow-right" [size]="14" class="text-ink-subtle" /> }
                  </li>
                }
              </ol>
            </div>
            <div>
              <h3 class="text-sm font-semibold text-ink">Service history</h3>
              <ul class="mt-3 divide-y divide-line rounded-xl border border-line">
                @for (r of componentServices(); track r.id) {
                  <li class="flex items-start gap-3 px-3.5 py-2.5">
                    <div class="min-w-0 flex-1">
                      <p class="text-sm text-ink">{{ r.serviceType }} — {{ r.workPerformed }}</p>
                      <p class="text-xs text-ink-muted">{{ formatDate(r.date) }} · {{ r.technician }} · {{ r.workOrder }}</p>
                    </div>
                    <amc-status-badge [label]="r.result" [tone]="resultTone[r.result]" />
                  </li>
                } @empty {
                  <li class="px-3.5 py-4 text-center text-sm text-ink-muted">No service recorded against this component.</li>
                }
              </ul>
            </div>
            <div>
              <h3 class="text-sm font-semibold text-ink">Component history</h3>
              <ul class="mt-3 space-y-2">
                @for (e of componentEvents(); track e.id) {
                  <li class="text-sm"><span class="font-medium text-ink">{{ e.eventType }}</span> <span class="text-ink-muted">· {{ e.comments }} · {{ formatDateTime(e.timestamp) }}</span></li>
                } @empty {
                  <li class="text-sm text-ink-muted">No events.</li>
                }
              </ul>
            </div>
          </div>
          <dl class="grid h-fit grid-cols-2 gap-4 rounded-xl border border-line p-4 lg:grid-cols-1">
            <div><dt class="text-xs font-medium text-ink-muted">Status</dt><dd class="mt-1"><amc-status-badge [label]="c.status" [tone]="statusTone[c.status]" /></dd></div>
            <div>
              <dt class="text-xs font-medium text-ink-muted">Parent Asset</dt>
              <dd class="mt-1 text-sm"><a class="amc-link" [routerLink]="['/app/assets', c.assetId]">{{ c.assetCode }} · {{ c.assetName }}</a></dd>
            </div>
            <amc-detail-item label="Manufacturer / Model" [value]="c.manufacturer + (c.model ? ' · ' + c.model : '')" />
            <amc-detail-item label="Installation Date" [value]="formatDate(c.installationDate)" />
            <amc-detail-item label="Replacement Date" [value]="formatDate(c.replacementDate)" />
            <amc-detail-item label="Warranty" [value]="c.warrantyEnd ? (c.warrantyProvider || 'Warranty') + ' until ' + formatDate(c.warrantyEnd) : null" />
            <amc-detail-item label="Documents" [value]="componentDocs().length ? componentDocs().join(', ') : 'None'" />
            <amc-detail-item label="Notes" [value]="c.notes" />
          </dl>
        </div>
      }
    </amc-dialog>
  `,
})
export class ComponentManager {
  private readonly api = inject(ComponentApi);
  private readonly assetsApi = inject(AssetApi);
  private readonly historyApi = inject(ServiceHistoryApi);
  private readonly lifecycleApi = inject(LifecycleApi);
  private readonly documentsApi = inject(AssetDocumentApi);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly notify = inject(NotificationPort);

  readonly assetId = input<string | null>(null);
  readonly readOnly = input(false);
  readonly openAddOnInit = input(false);
  readonly changed = output<void>();

  protected readonly lookup = ASSET_LOOKUP;
  protected readonly statusTone = COMPONENT_STATUS_TONE;
  protected readonly resultTone = SERVICE_RESULT_TONE;
  protected readonly statusOptions = toOptions(COMPONENT_STATUSES);
  protected readonly formatDate = formatDate;
  protected readonly formatDateTime = formatDateTime;
  protected readonly trackById = (c: ComponentListItem) => c.id;

  protected readonly components = rxResource({
    params: () => ({ assetId: this.assetId() ?? undefined }),
    stream: ({ params }) => this.api.list(params),
  });
  protected readonly rows = computed(() => (this.components.hasValue() ? this.components.value() : []));

  protected readonly search = signal('');
  protected readonly filters = signal<FilterValues>({ status: ['Active', 'Under Repair', 'Inactive'] });
  protected readonly filterFields = computed<FilterField[]>(() => [
    { key: 'status', label: 'Component Status', type: 'multiselect', options: toOptions(COMPONENT_STATUSES) },
    { key: 'type', label: 'Component Type', type: 'multiselect', options: toOptions([...new Set(this.rows().map((r) => r.componentType))].sort()) },
  ]);
  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    return this.rows().filter(
      (c) =>
        (!term || `${c.name} ${c.componentType} ${c.serialNumber} ${c.assetCode} ${c.assetName}`.toLowerCase().includes(term)) &&
        matchesAny(f, 'status', c.status) &&
        matchesAny(f, 'type', c.componentType),
    );
  });

  protected readonly columns = computed<DataColumn<ComponentListItem>[]>(() => [
    { key: 'name', label: 'Component', value: (c) => c.name, secondary: (c) => c.componentType, sortable: true, mobile: 'title', width: 220 },
    ...(this.assetId() ? [] : [{ key: 'parent', label: 'Parent Asset', value: (c: ComponentListItem) => c.assetName, secondary: (c: ComponentListItem) => c.assetCode, link: (c: ComponentListItem) => `/app/assets/${c.assetId}`, sortable: true, mobile: 'meta' as const, width: 220 }]),
    { key: 'serial', label: 'Serial Number', value: (c) => c.serialNumber, type: 'mono', sortable: true, visibility: 'md', width: 150 },
    { key: 'installed', label: 'Installation Date', value: (c) => c.installationDate, type: 'date', sortable: true, visibility: 'lg', width: 140 },
    { key: 'replaced', label: 'Replacement Date', value: (c) => c.replacementDate, type: 'date', sortable: true, visibility: 'xl', width: 140 },
    { key: 'warranty', label: 'Warranty', value: (c) => (c.warrantyEnd ? `${c.warrantyActive ? 'Active' : 'Expired'} · ${formatDate(c.warrantyEnd)}` : null), visibility: 'xl', width: 170 },
    { key: 'chain', label: 'Replaces / Replaced By', value: (c) => (c.replacedByName ? `→ ${c.replacedByName}` : c.replacesName ? `← ${c.replacesName}` : null), visibility: '2xl', width: 180 },
    { key: 'services', label: 'Services', value: (c) => c.serviceCount, type: 'number', sortable: true, visibility: 'xl', width: 90 },
    { key: 'status', label: 'Status', value: (c) => c.status, type: 'badge', tone: (c) => COMPONENT_STATUS_TONE[c.status], sortable: true, mobile: 'badge', width: 120 },
  ]);

  protected readonly rowActions = (c: ComponentListItem): MenuItem[] => {
    const historical = HISTORICAL_COMPONENT_STATUSES.includes(c.status);
    const disabled = this.readOnly() || historical;
    return [
      { id: 'history', label: 'View Component History', icon: 'history' },
      { id: 'edit', label: 'Edit Component', icon: 'pencil', disabled: this.readOnly() },
      { id: 'replace', label: 'Replace Component', icon: 'refresh', disabled, dividerBefore: true },
      { id: 'move', label: 'Move Component', icon: 'arrow-right', disabled },
      { id: 'remove', label: 'Remove / Deactivate', icon: 'ban', danger: true, disabled, dividerBefore: true },
    ];
  };

  // ----- Form ---------------------------------------------------------------

  protected readonly mode = signal<Mode>('add');
  protected readonly formOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly selected = signal<ComponentListItem | null>(null);

  protected readonly form = this.fb.group({
    name: this.fb.control('', [Validators.required, Validators.maxLength(120)]),
    componentType: this.fb.control('', Validators.required),
    serialNumber: this.fb.control(''),
    manufacturer: this.fb.control(''),
    model: this.fb.control(''),
    installationDate: this.fb.control(''),
    status: this.fb.control<ComponentStatus>('Active', Validators.required),
    warrantyEnd: this.fb.control(''),
    warrantyProvider: this.fb.control(''),
    notes: this.fb.control(''),
  });
  protected readonly replaceForm = this.fb.group({
    replacementDate: this.fb.control(new Date().toISOString().slice(0, 10), Validators.required),
    reason: this.fb.control(''),
  });

  protected readonly formTitle = computed(() => ({ add: 'Add component', edit: 'Edit component', replace: 'Replace component' })[this.mode()]);
  protected readonly formDescription = computed(() =>
    this.mode() === 'replace' ? 'Enter the details of the new component.' : 'Child asset / component of the parent equipment.',
  );

  constructor() {
    effect(() => {
      if (this.openAddOnInit() && this.assetId()) untracked(() => this.openForm('add'));
    });
  }

  protected openForm(mode: Mode, component: ComponentListItem | null = null): void {
    this.mode.set(mode);
    this.selected.set(component);
    this.form.reset({
      name: component?.name ?? '',
      componentType: component?.componentType ?? '',
      serialNumber: mode === 'replace' ? '' : (component?.serialNumber ?? ''),
      manufacturer: component?.manufacturer ?? '',
      model: component?.model ?? '',
      installationDate: mode === 'replace' ? new Date().toISOString().slice(0, 10) : (component?.installationDate ?? new Date().toISOString().slice(0, 10)),
      status: mode === 'replace' ? 'Active' : (component?.status ?? 'Active'),
      warrantyEnd: mode === 'replace' ? '' : (component?.warrantyEnd ?? ''),
      warrantyProvider: component?.warrantyProvider ?? '',
      notes: mode === 'replace' ? '' : (component?.notes ?? ''),
    });
    this.replaceForm.reset({ replacementDate: new Date().toISOString().slice(0, 10), reason: '' });
    this.formOpen.set(true);
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    this.replaceForm.markAllAsTouched();
    if (this.form.invalid || (this.mode() === 'replace' && this.replaceForm.invalid)) return;
    const v = this.form.getRawValue();
    const input: ComponentInput = { ...v, installationDate: v.installationDate || null, warrantyEnd: v.warrantyEnd || null, replacementDate: this.mode() === 'edit' ? (this.selected()?.replacementDate ?? null) : null };
    this.saving.set(true);
    try {
      const selected = this.selected();
      if (this.mode() === 'add') await firstValueFrom(this.api.create(this.assetId()!, input));
      else if (this.mode() === 'edit' && selected) await firstValueFrom(this.api.update(selected.id, input));
      else if (selected) {
        const r = this.replaceForm.getRawValue();
        await firstValueFrom(this.api.replace(selected.id, { replacementDate: r.replacementDate, reason: r.reason, component: input }));
      }
      this.notify.success(`${input.name} ${this.mode() === 'replace' ? 'replaced' : 'saved'}.`);
      this.formOpen.set(false);
      this.reload();
    } catch (error) {
      this.notify.error((error as Error).message);
    } finally {
      this.saving.set(false);
    }
  }

  // ----- Move / remove -------------------------------------------------------

  protected readonly moveOpen = signal(false);
  protected readonly moveMode = signal<'move' | 'remove'>('move');
  protected readonly moveTarget = signal<string | number | null>(null);
  protected readonly moveReason = signal('');
  private readonly assetsRes = rxResource({
    params: () => (this.moveOpen() && this.moveMode() === 'move' ? true : undefined),
    stream: ({ params }) => (params ? this.assetsApi.list() : of([])),
  });
  protected readonly assetOptions = computed(() =>
    (this.assetsRes.hasValue() ? this.assetsRes.value() : [])
      .filter((a) => a.id !== this.selected()?.assetId && a.status !== 'Retired' && a.status !== 'Decommissioned')
      .map((a) => ({ value: a.id, label: `${a.code} · ${a.name}`, hint: a.siteName ?? undefined })),
  );

  protected async confirmMove(): Promise<void> {
    const c = this.selected();
    if (!c) return;
    this.saving.set(true);
    try {
      if (this.moveMode() === 'move') await firstValueFrom(this.api.move(c.id, String(this.moveTarget()), this.moveReason()));
      else await firstValueFrom(this.api.remove(c.id, this.moveReason()));
      this.notify.success(`${c.name} ${this.moveMode() === 'move' ? 'moved' : 'removed'}.`);
      this.moveOpen.set(false);
      this.reload();
    } catch (error) {
      this.notify.error((error as Error).message);
    } finally {
      this.saving.set(false);
    }
  }

  // ----- History -------------------------------------------------------------

  protected readonly historyOpen = signal(false);
  private readonly historyRes = rxResource({
    params: () => (this.historyOpen() ? this.selected()?.assetId : undefined),
    stream: ({ params }) => (params ? this.historyApi.list({ assetId: params }) : of([])),
  });
  private readonly eventsRes = rxResource({
    params: () => (this.historyOpen() ? this.selected()?.assetId : undefined),
    stream: ({ params }) => (params ? this.lifecycleApi.list({ assetId: params }) : of([])),
  });
  private readonly docsRes = rxResource({
    params: () => (this.historyOpen() ? this.selected()?.assetId : undefined),
    stream: ({ params }) => (params ? this.documentsApi.list({ assetId: params }) : of([])),
  });
  protected readonly componentServices = computed(() => {
    const ids = new Set(this.chain().map((c) => c.id));
    return (this.historyRes.hasValue() ? this.historyRes.value() : []).filter((r) => r.componentId && ids.has(r.componentId));
  });
  protected readonly componentEvents = computed(() => {
    const ids = new Set(this.chain().map((c) => c.id));
    return (this.eventsRes.hasValue() ? this.eventsRes.value() : []).filter((e) => e.reference && ids.has(e.reference));
  });
  protected readonly componentDocs = computed(() => (this.docsRes.hasValue() ? this.docsRes.value() : []).filter((d) => d.componentId === this.selected()?.id).map((d) => d.name));

  /** Full replacement chain (oldest → newest) through the selected component. */
  protected readonly chain = computed(() => {
    const c = this.selected();
    if (!c) return [];
    const all = new Map(this.rows().map((r) => [r.id, r]));
    const back: ComponentListItem[] = [];
    for (let cur = c.replacesId ? all.get(c.replacesId) : undefined; cur; cur = cur.replacesId ? all.get(cur.replacesId) : undefined) back.unshift(cur);
    const forward: ComponentListItem[] = [];
    for (let cur = c.replacedById ? all.get(c.replacedById) : undefined; cur; cur = cur.replacedById ? all.get(cur.replacedById) : undefined) forward.push(cur);
    return [...back, c, ...forward];
  });

  protected onAction({ id, row }: RowAction<ComponentListItem>): void {
    this.selected.set(row);
    switch (id) {
      case 'history':
        this.historyOpen.set(true);
        break;
      case 'edit':
        this.openForm('edit', row);
        break;
      case 'replace':
        this.openForm('replace', row);
        break;
      case 'move':
      case 'remove':
        this.moveMode.set(id as 'move' | 'remove');
        this.moveTarget.set(null);
        this.moveReason.set('');
        this.moveOpen.set(true);
        break;
    }
  }

  protected export(): void {
    downloadCsv(
      timestampedName('asset-components', 'csv'),
      ['Parent Asset ID', 'Parent Asset', 'Component', 'Component Type', 'Serial Number', 'Manufacturer', 'Model', 'Installation Date', 'Replacement Date', 'Status', 'Warranty End', 'Replaces', 'Replaced By'],
      this.filtered().map((c) => [c.assetCode, c.assetName, c.name, c.componentType, c.serialNumber, c.manufacturer, c.model, c.installationDate, c.replacementDate, c.status, c.warrantyEnd, c.replacesName, c.replacedByName]),
    );
  }

  private reload(): void {
    this.components.reload();
    this.changed.emit();
  }
}
