import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NotificationPort } from '@core/notification/notification.port';
import { toOptions } from '@shared/models/select-option';
import type { MenuItem } from '@shared/ui/action-menu';
import { type DataColumn, DataTable, type RowAction } from '@shared/ui/data-table';
import { DatePicker } from '@shared/ui/date-picker';
import { Dialog } from '@shared/ui/dialog';
import { FilterBar } from '@shared/ui/filter-bar';
import { Switch } from '@shared/ui/form-controls';
import { FormField } from '@shared/ui/form-field';
import { Icon } from '@shared/ui/icon';
import { PageHeader } from '@shared/ui/page-header';
import { Select } from '@shared/ui/select';
import { Spinner } from '@shared/ui/spinner';
import { downloadCsv, timestampedName } from '@shared/utils/file';
import { type FilterField, type FilterValues, matchesAny } from '@shared/utils/filters';
import { type Observable, firstValueFrom } from 'rxjs';
import { TemplateApi } from '../data/contract.api';
import { RECORD_TONE } from '../models/display';
import { CLAUSE_TYPES, type ClauseListItem, type ClauseType, RECORD_STATUSES, type RecordStatus } from '../models/workflow.model';

/** SRS 5.10 — reusable legal and commercial clauses with versions. */
@Component({
  selector: 'amc-clauses-page',
  imports: [DataTable, DatePicker, Dialog, FilterBar, FormField, Icon, PageHeader, ReactiveFormsModule, Select, Spinner, Switch],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="Contract Clauses" subtitle="Reusable legal and commercial clauses — versioned; executed contracts keep the version they were signed with." [breadcrumbs]="[{ label: 'Contracts', path: '/app/contracts/dashboard' }, { label: 'Clauses' }]">
        <button type="button" class="amc-btn-secondary" (click)="export()"><amc-icon name="download" /> <span class="hidden sm:inline">Export</span></button>
        <button type="button" class="amc-btn-primary" (click)="openForm(null)"><amc-icon name="plus" /> Create Clause</button>
      </amc-page-header>
      <section class="amc-card overflow-hidden">
        <div class="border-b border-line p-3 sm:p-4"><amc-filter-bar searchPlaceholder="Search clause code, name or text…" [(search)]="search" [fields]="filterFields" [(filters)]="filters" /></div>
        <amc-data-table tableId="contract-clauses" [entity]="{ singular: 'clause', plural: 'clauses' }" [rows]="filtered()" [columns]="columns" [trackBy]="trackById" [loading]="clauses.isLoading()" [actions]="rowActions" emptyIcon="file-text" emptyTitle="No clauses" emptyMessage="Create reusable clauses for templates and contracts." (action)="onAction($event)" />
      </section>
    </div>

    <amc-dialog size="lg" [title]="mode() === 'version' ? 'New version of ' + editing()?.code : editing() ? 'Edit clause ' + editing()!.code : 'Create clause'" [description]="mode() === 'version' ? 'Templates move to the new version; executed contracts keep v' + editing()?.version + '.' : ''" [(open)]="formOpen">
      <form [formGroup]="form" id="clause-form" novalidate (ngSubmit)="save()">
        @let c = form.controls;
        <div class="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
          @if (mode() !== 'version') {
            <amc-form-field label="Clause Code" for="cl-code" [control]="c.code"><input id="cl-code" class="amc-input font-mono uppercase" formControlName="code" /></amc-form-field>
            <amc-form-field label="Clause Name" for="cl-name" [control]="c.name"><input id="cl-name" class="amc-input" formControlName="name" /></amc-form-field>
            <amc-form-field label="Clause Type" for="cl-type" [control]="c.type"><amc-select inputId="cl-type" formControlName="type" [options]="typeOptions" /></amc-form-field>
            <amc-form-field label="Version" for="cl-version" [control]="c.version"><input id="cl-version" class="amc-input font-mono" formControlName="version" /></amc-form-field>
            <amc-form-field label="Status" for="cl-status" [control]="c.status"><amc-select inputId="cl-status" formControlName="status" [options]="statusOptions" /></amc-form-field>
            <amc-form-field label="Effective Date" for="cl-eff" [control]="c.effectiveDate"><amc-date-picker inputId="cl-eff" formControlName="effectiveDate" /></amc-form-field>
            <amc-switch formControlName="mandatory" label="Mandatory" description="Mandatory clauses must be included in active templates." />
            <amc-switch formControlName="approvalRequired" label="Approval Requirement" description="Changes to this clause require Legal approval." />
          }
          @if (mode() === 'version') {
            <div class="sm:col-span-2 rounded-lg border border-line bg-surface-muted p-3 text-sm text-ink-muted"><p class="text-xs font-medium uppercase">Current v{{ editing()?.version }}</p><p class="mt-1">{{ editing()?.text }}</p></div>
          }
          <amc-form-field [label]="mode() === 'version' ? 'New Clause Text' : 'Clause Text'" for="cl-text" [control]="c.text" class="sm:col-span-2"><textarea id="cl-text" class="amc-textarea min-h-32" formControlName="text"></textarea></amc-form-field>
        </div>
      </form>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="formOpen.set(false)">Cancel</button>
        <button type="submit" form="clause-form" class="amc-btn-primary" [disabled]="saving()">@if (saving()) { <amc-spinner [size]="14" /> } {{ mode() === 'version' ? 'Create Version' : 'Save' }}</button>
      </ng-container>
    </amc-dialog>
  `,
})
export class ClausesPage {
  private readonly api = inject(TemplateApi);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly notify = inject(NotificationPort);

  protected readonly clauses = rxResource({ stream: () => this.api.clauses() });
  protected readonly rows = computed(() => (this.clauses.hasValue() ? this.clauses.value() : []));
  protected readonly search = signal('');
  protected readonly filters = signal<FilterValues>({ status: ['Active'] });
  protected readonly typeOptions = toOptions(CLAUSE_TYPES);
  protected readonly statusOptions = toOptions(RECORD_STATUSES);
  protected readonly filterFields: FilterField[] = [
    { key: 'type', label: 'Clause Type', type: 'multiselect', options: this.typeOptions },
    { key: 'mandatory', label: 'Mandatory / Optional', type: 'multiselect', options: toOptions(['Mandatory', 'Optional'] as const) },
    { key: 'status', label: 'Status', type: 'multiselect', options: this.statusOptions },
  ];
  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    return this.rows().filter((c) => (!term || `${c.code} ${c.name} ${c.text}`.toLowerCase().includes(term)) && matchesAny(f, 'type', c.type) && matchesAny(f, 'mandatory', c.mandatory ? 'Mandatory' : 'Optional') && matchesAny(f, 'status', c.status));
  });
  protected readonly columns: DataColumn<ClauseListItem>[] = [
    { key: 'name', label: 'Clause', value: (c) => c.name, secondary: (c) => `${c.code} · v${c.version}`, mobile: 'title', sortable: true, width: 240 },
    { key: 'type', label: 'Clause Type', value: (c) => c.type, sortable: true, mobile: 'meta', width: 160 },
    { key: 'text', label: 'Clause Text', value: (c) => c.text, visibility: 'lg', width: 380 },
    { key: 'mandatory', label: 'Mandatory', value: (c) => (c.mandatory ? 'Mandatory' : 'Optional'), type: 'badge', tone: (c) => (c.mandatory ? 'brand' : 'neutral'), sortable: true, visibility: 'md', width: 110 },
    { key: 'approval', label: 'Approval', value: (c) => (c.approvalRequired ? 'Required' : '—'), visibility: 'xl', width: 100 },
    { key: 'effective', label: 'Effective', value: (c) => c.effectiveDate, type: 'date', visibility: 'xl', width: 120 },
    { key: 'usage', label: 'Templates / Contracts', value: (c) => `${c.templateCount} / ${c.contractCount}`, visibility: 'lg', width: 150 },
    { key: 'status', label: 'Status', value: (c) => c.status, type: 'badge', tone: (c) => RECORD_TONE[c.status], sortable: true, mobile: 'badge', width: 110 },
  ];
  protected readonly trackById = (c: ClauseListItem) => c.id;
  protected readonly rowActions = (c: ClauseListItem): MenuItem[] => [
    { id: 'edit', label: 'Edit Clause', icon: 'pencil' },
    { id: 'version', label: 'Version Clause', icon: 'layers', disabled: c.status !== 'Active' },
    c.mandatory ? { id: 'optional', label: 'Mark Optional', icon: 'check' } : { id: 'mandatory', label: 'Mark Mandatory', icon: 'lock' },
    c.status === 'Active' ? { id: 'deactivate', label: 'Deactivate', icon: 'ban', danger: true, dividerBefore: true } : { id: 'activate', label: 'Activate', icon: 'check-circle', dividerBefore: true },
  ];

  protected readonly formOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly editing = signal<ClauseListItem | null>(null);
  protected readonly mode = signal<'create' | 'edit' | 'version'>('create');
  protected readonly form = this.fb.group({
    code: this.fb.control('', [Validators.required, Validators.pattern(/^[A-Za-z0-9-]{3,24}$/)]),
    name: this.fb.control('', Validators.required),
    type: this.fb.control<ClauseType>('Other', Validators.required),
    text: this.fb.control('', [Validators.required, Validators.minLength(10)]),
    version: this.fb.control('1.0', Validators.required),
    mandatory: this.fb.control(false),
    status: this.fb.control<RecordStatus>('Active'),
    effectiveDate: this.fb.control(new Date().toISOString().slice(0, 10), Validators.required),
    approvalRequired: this.fb.control(false),
  });

  protected openForm(c: ClauseListItem | null, mode: 'create' | 'edit' | 'version' = c ? 'edit' : 'create'): void {
    this.editing.set(c);
    this.mode.set(mode);
    this.form.reset({
      code: c?.code ?? '', name: c?.name ?? '', type: c?.type ?? 'Other', text: mode === 'version' ? '' : (c?.text ?? ''), version: c?.version ?? '1.0', mandatory: c?.mandatory ?? false,
      status: c?.status ?? 'Active', effectiveDate: c?.effectiveDate ?? new Date().toISOString().slice(0, 10), approvalRequired: c?.approvalRequired ?? false,
    });
    if (c) this.form.controls.code.disable();
    else this.form.controls.code.enable();
    this.formOpen.set(true);
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const c = this.editing();
    const work = this.mode() === 'version' && c ? this.api.versionClause(c.id, v.text) : c ? this.api.updateClause(c.id, v) : this.api.createClause(v);
    if (await this.exec(work, this.mode() === 'version' ? `New version of ${c?.code} created.` : `Clause ${v.code} saved.`)) this.formOpen.set(false);
  }

  protected async onAction({ id, row }: RowAction<ClauseListItem>): Promise<void> {
    if (id === 'edit') return this.openForm(row, 'edit');
    if (id === 'version') return this.openForm(row, 'version');
    const changes = id === 'mandatory' || id === 'optional' ? { mandatory: id === 'mandatory' } : { active: id === 'activate' };
    await this.exec(this.api.setClauseFlags(row.id, changes), `${row.code} updated.`);
  }

  private async exec(work: Observable<unknown>, message: string): Promise<boolean> {
    this.saving.set(true);
    try {
      await firstValueFrom(work);
      this.notify.success(message);
      this.clauses.reload();
      return true;
    } catch (error) {
      this.notify.error((error as Error).message);
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  protected export(): void {
    downloadCsv(timestampedName('contract-clauses', 'csv'), ['Clause Code', 'Clause Name', 'Clause Type', 'Clause Text', 'Version', 'Mandatory', 'Status', 'Effective Date', 'Approval Requirement'],
      this.filtered().map((c) => [c.code, c.name, c.type, c.text, c.version, c.mandatory ? 'Mandatory' : 'Optional', c.status, c.effectiveDate, c.approvalRequired ? 'Yes' : 'No']));
  }
}
