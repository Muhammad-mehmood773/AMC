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
import { FormField } from '@shared/ui/form-field';
import { Icon } from '@shared/ui/icon';
import { PageHeader } from '@shared/ui/page-header';
import { MultiSelect, Select } from '@shared/ui/select';
import { Spinner } from '@shared/ui/spinner';
import { downloadCsv, timestampedName } from '@shared/utils/file';
import { type FilterField, type FilterValues, matchesAny } from '@shared/utils/filters';
import { type Observable, firstValueFrom } from 'rxjs';
import { TemplateApi } from '../data/contract.api';
import { CONTRACT_TYPES } from '../models/contract.model';
import { RECORD_TONE } from '../models/display';
import { RECORD_STATUSES, REQUIRABLE_FIELDS, type RecordStatus, TEMPLATE_LANGUAGES, type TemplateListItem } from '../models/workflow.model';

/** SRS 5.9 — standardized, versioned, multilingual contract templates. */
@Component({
  selector: 'amc-templates-page',
  imports: [DataTable, DatePicker, Dialog, FilterBar, FormField, Icon, MultiSelect, PageHeader, ReactiveFormsModule, Select, Spinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="Contract Templates" subtitle="Standardized contract structures with default terms, clauses and required fields." [breadcrumbs]="[{ label: 'Contracts', path: '/app/contracts/dashboard' }, { label: 'Templates' }]">
        <button type="button" class="amc-btn-secondary" (click)="export()"><amc-icon name="download" /> <span class="hidden sm:inline">Export</span></button>
        <button type="button" class="amc-btn-primary" (click)="openForm(null)"><amc-icon name="plus" /> Create Template</button>
      </amc-page-header>
      <section class="amc-card overflow-hidden">
        <div class="border-b border-line p-3 sm:p-4"><amc-filter-bar searchPlaceholder="Search template code, name or description…" [(search)]="search" [fields]="filterFields" [(filters)]="filters" /></div>
        <amc-data-table tableId="contract-templates" [entity]="{ singular: 'template', plural: 'templates' }" [rows]="filtered()" [columns]="columns" [trackBy]="trackById" [loading]="templates.isLoading()" [actions]="rowActions" emptyIcon="file-text" emptyTitle="No templates" emptyMessage="Create a template to standardize new contracts." (action)="onAction($event)" />
      </section>
    </div>

    <amc-dialog size="lg" [title]="editing() ? 'Edit template ' + editing()!.code + ' v' + editing()!.version : 'Create template'" [(open)]="formOpen">
      <form [formGroup]="form" id="template-form" novalidate (ngSubmit)="save()">
        @let c = form.controls;
        <div class="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
          <amc-form-field label="Template Code" for="tp-code" [control]="c.code"><input id="tp-code" class="amc-input font-mono uppercase" formControlName="code" /></amc-form-field>
          <amc-form-field label="Template Name" for="tp-name" [control]="c.name"><input id="tp-name" class="amc-input" formControlName="name" [attr.dir]="c.language.value === 'Arabic' ? 'rtl' : null" /></amc-form-field>
          <amc-form-field label="Contract Type" for="tp-type" [control]="c.contractType"><amc-select inputId="tp-type" formControlName="contractType" [options]="typeOptions" /></amc-form-field>
          <amc-form-field label="Language" for="tp-lang" [control]="c.language"><amc-select inputId="tp-lang" formControlName="language" [options]="languageOptions" /></amc-form-field>
          <amc-form-field label="Version" for="tp-version" [control]="c.version"><input id="tp-version" class="amc-input font-mono" formControlName="version" /></amc-form-field>
          <amc-form-field label="Status" for="tp-status" [control]="c.status"><amc-select inputId="tp-status" formControlName="status" [options]="statusOptions" /></amc-form-field>
          <amc-form-field label="Effective Date" for="tp-eff" [control]="c.effectiveDate"><amc-date-picker inputId="tp-eff" formControlName="effectiveDate" /></amc-form-field>
          <amc-form-field label="Expiry Date" for="tp-exp" [control]="c.expiryDate"><amc-date-picker inputId="tp-exp" formControlName="expiryDate" /></amc-form-field>
          <amc-form-field label="Description" for="tp-desc" [control]="c.description" class="sm:col-span-2"><textarea id="tp-desc" class="amc-textarea min-h-16" formControlName="description"></textarea></amc-form-field>
          <amc-form-field label="Default Terms" for="tp-terms" [control]="c.defaultTerms" class="sm:col-span-2"><textarea id="tp-terms" class="amc-textarea min-h-20" formControlName="defaultTerms" [attr.dir]="c.language.value === 'Arabic' ? 'rtl' : null"></textarea></amc-form-field>
          <amc-form-field label="Default Clauses" for="tp-clauses" [control]="c.defaultClauseIds" class="sm:col-span-2" hint="Active templates must include the mandatory payment, liability and termination clauses.">
            <amc-multi-select inputId="tp-clauses" formControlName="defaultClauseIds" [options]="clauseOptions()" [maxChips]="5" />
          </amc-form-field>
          <amc-form-field label="Required Fields" for="tp-required" [control]="c.requiredFields" class="sm:col-span-2"><amc-multi-select inputId="tp-required" formControlName="requiredFields" [options]="requirableOptions" [maxChips]="5" /></amc-form-field>
        </div>
      </form>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="formOpen.set(false)">Cancel</button>
        <button type="submit" form="template-form" class="amc-btn-primary" [disabled]="saving()">@if (saving()) { <amc-spinner [size]="14" /> } Save</button>
      </ng-container>
    </amc-dialog>
  `,
})
export class TemplatesPage {
  private readonly api = inject(TemplateApi);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly notify = inject(NotificationPort);

  protected readonly templates = rxResource({ stream: () => this.api.templates() });
  private readonly clauses = rxResource({ stream: () => this.api.clauses() });
  protected readonly rows = computed(() => (this.templates.hasValue() ? this.templates.value() : []));
  protected readonly clauseOptions = computed(() => (this.clauses.hasValue() ? this.clauses.value() : []).filter((c) => c.status === 'Active').map((c) => ({ value: c.id, label: `${c.code} · ${c.name}`, hint: `${c.type}${c.mandatory ? ' · Mandatory' : ''}` })));
  protected readonly search = signal('');
  protected readonly filters = signal<FilterValues>({});
  protected readonly typeOptions = toOptions(CONTRACT_TYPES);
  protected readonly languageOptions = toOptions(TEMPLATE_LANGUAGES);
  protected readonly statusOptions = toOptions(RECORD_STATUSES);
  protected readonly requirableOptions = toOptions(REQUIRABLE_FIELDS);
  protected readonly filterFields: FilterField[] = [
    { key: 'type', label: 'Contract Type', type: 'multiselect', options: this.typeOptions },
    { key: 'language', label: 'Language', type: 'multiselect', options: this.languageOptions },
    { key: 'status', label: 'Status', type: 'multiselect', options: this.statusOptions },
  ];
  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    return this.rows().filter((t) => (!term || `${t.code} ${t.name} ${t.description}`.toLowerCase().includes(term)) && matchesAny(f, 'type', t.contractType) && matchesAny(f, 'language', t.language) && matchesAny(f, 'status', t.status));
  });
  protected readonly columns: DataColumn<TemplateListItem>[] = [
    { key: 'name', label: 'Template', value: (t) => t.name, secondary: (t) => `${t.code} · v${t.version}`, mobile: 'title', sortable: true, width: 260 },
    { key: 'type', label: 'Contract Type', value: (t) => t.contractType, sortable: true, mobile: 'meta', width: 190 },
    { key: 'language', label: 'Language', value: (t) => t.language, sortable: true, visibility: 'md', width: 160 },
    { key: 'clauses', label: 'Default Clauses', value: (t) => `${t.defaultClauseIds.length} clauses`, secondary: (t) => t.clauseNames.slice(0, 3).join(', '), visibility: 'lg', width: 260 },
    { key: 'required', label: 'Required Fields', value: (t) => t.requiredFields.join(', '), visibility: '2xl', width: 220 },
    { key: 'effective', label: 'Effective', value: (t) => t.effectiveDate, type: 'date', sortable: true, visibility: 'xl', width: 120 },
    { key: 'expiry', label: 'Expiry', value: (t) => t.expiryDate, type: 'date', visibility: '2xl', width: 120 },
    { key: 'usage', label: 'Contracts', value: (t) => t.usageCount, type: 'number', sortable: true, visibility: 'lg', width: 100 },
    { key: 'status', label: 'Status', value: (t) => t.status, type: 'badge', tone: (t) => RECORD_TONE[t.status], sortable: true, mobile: 'badge', width: 110 },
  ];
  protected readonly trackById = (t: TemplateListItem) => t.id;
  protected readonly rowActions = (t: TemplateListItem): MenuItem[] => [
    { id: 'edit', label: 'Edit Template', icon: 'pencil' },
    { id: 'duplicate', label: 'Duplicate Template', icon: 'copy' },
    { id: 'version', label: 'New Version', icon: 'layers' },
    t.status === 'Active' ? { id: 'deactivate', label: 'Deactivate', icon: 'ban', danger: true, dividerBefore: true } : { id: 'activate', label: 'Activate', icon: 'check-circle', dividerBefore: true },
  ];

  protected readonly formOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly editing = signal<TemplateListItem | null>(null);
  protected readonly form = this.fb.group({
    code: this.fb.control('', [Validators.required, Validators.pattern(/^[A-Za-z0-9-]{3,24}$/)]),
    name: this.fb.control('', Validators.required),
    contractType: this.fb.control('AMC Contract', Validators.required),
    description: this.fb.control(''),
    version: this.fb.control('1.0', Validators.required),
    status: this.fb.control<RecordStatus>('Draft'),
    language: this.fb.control('English', Validators.required),
    effectiveDate: this.fb.control(new Date().toISOString().slice(0, 10), Validators.required),
    expiryDate: this.fb.control(''),
    defaultTerms: this.fb.control(''),
    defaultClauseIds: this.fb.control<(string | number)[]>([]),
    requiredFields: this.fb.control<(string | number)[]>([]),
  });

  protected openForm(t: TemplateListItem | null): void {
    this.editing.set(t);
    this.form.reset({
      code: t?.code ?? '', name: t?.name ?? '', contractType: t?.contractType ?? 'AMC Contract', description: t?.description ?? '', version: t?.version ?? '1.0', status: t?.status ?? 'Draft', language: t?.language ?? 'English',
      effectiveDate: t?.effectiveDate ?? new Date().toISOString().slice(0, 10), expiryDate: t?.expiryDate ?? '', defaultTerms: t?.defaultTerms ?? '', defaultClauseIds: [...(t?.defaultClauseIds ?? [])], requiredFields: [...(t?.requiredFields ?? [])],
    });
    if (t) this.form.controls.code.disable();
    else this.form.controls.code.enable();
    this.formOpen.set(true);
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const input = { ...v, expiryDate: v.expiryDate || null, defaultClauseIds: v.defaultClauseIds.map(String), requiredFields: v.requiredFields.map(String) };
    const t = this.editing();
    if (await this.exec(t ? this.api.updateTemplate(t.id, input) : this.api.createTemplate(input), `Template ${input.code} saved.`)) this.formOpen.set(false);
  }

  protected async onAction({ id, row }: RowAction<TemplateListItem>): Promise<void> {
    if (id === 'edit') return this.openForm(row);
    const work: Record<string, () => Observable<unknown>> = {
      duplicate: () => this.api.duplicateTemplate(row.id),
      version: () => this.api.versionTemplate(row.id),
      activate: () => this.api.setTemplateStatus(row.id, true),
      deactivate: () => this.api.setTemplateStatus(row.id, false),
    };
    await this.exec(work[id](), id === 'version' ? `New draft version of ${row.code} created.` : `${row.code}: ${id} done.`);
  }

  private async exec(work: Observable<unknown>, message: string): Promise<boolean> {
    this.saving.set(true);
    try {
      await firstValueFrom(work);
      this.notify.success(message);
      this.templates.reload();
      return true;
    } catch (error) {
      this.notify.error((error as Error).message);
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  protected export(): void {
    downloadCsv(timestampedName('contract-templates', 'csv'), ['Template Code', 'Template Name', 'Contract Type', 'Description', 'Version', 'Status', 'Language', 'Effective Date', 'Expiry Date', 'Default Terms', 'Default Clauses', 'Required Fields'],
      this.filtered().map((t) => [t.code, t.name, t.contractType, t.description, t.version, t.status, t.language, t.effectiveDate, t.expiryDate, t.defaultTerms, t.clauseNames.join('; '), t.requiredFields.join('; ')]));
  }
}
