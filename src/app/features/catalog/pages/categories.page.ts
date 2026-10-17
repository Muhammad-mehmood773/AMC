import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { NotificationPort } from '@core/notification/notification.port';
import { toOptions } from '@shared/models/select-option';
import type { MenuItem } from '@shared/ui/action-menu';
import { type DataColumn, DataTable, type RowAction } from '@shared/ui/data-table';
import { Dialog } from '@shared/ui/dialog';
import { FilterBar } from '@shared/ui/filter-bar';
import { FormField } from '@shared/ui/form-field';
import { Icon } from '@shared/ui/icon';
import { PageHeader } from '@shared/ui/page-header';
import { Select } from '@shared/ui/select';
import { Spinner } from '@shared/ui/spinner';
import { downloadCsv, timestampedName } from '@shared/utils/file';
import { type FilterField, type FilterValues, matchesAny } from '@shared/utils/filters';
import { firstValueFrom } from 'rxjs';
import { CategoryApi } from '../data/catalog.api';
import { CATEGORY_STATUSES, type CategoryListItem, type CategoryStatus } from '../models/catalog.model';
import { CATEGORY_STATUS_TONE } from '../models/display';

/** SRS 4.7 — structured, two-level classification of the service catalog. */
@Component({
  selector: 'amc-categories-page',
  imports: [DataTable, Dialog, FilterBar, FormField, Icon, PageHeader, ReactiveFormsModule, Select, Spinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="Service Categories" subtitle="Structured parent / child classification of the service catalog." [breadcrumbs]="[{ label: 'Service Catalog', path: '/app/catalog/dashboard' }, { label: 'Categories' }]">
        <button type="button" class="amc-btn-secondary" (click)="export()"><amc-icon name="download" /> <span class="hidden sm:inline">Export</span></button>
        <button type="button" class="amc-btn-primary" (click)="openForm(null)"><amc-icon name="plus" /> Create Category</button>
      </amc-page-header>
      <section class="amc-card overflow-hidden">
        <div class="border-b border-line p-3 sm:p-4">
          <amc-filter-bar searchPlaceholder="Search code, name or description…" [(search)]="search" [fields]="filterFields()" [(filters)]="filters" />
        </div>
        <amc-data-table
          tableId="catalog-categories"
          [entity]="{ singular: 'category', plural: 'categories' }"
          [rows]="ordered()"
          [columns]="columns"
          [trackBy]="trackById"
          [loading]="categories.isLoading()"
          [actions]="rowActions"
          [initialPageSize]="50"
          emptyIcon="tag"
          emptyTitle="No categories"
          emptyMessage="Create categories to organize the service catalog."
          (action)="onAction($event)"
        />
      </section>
    </div>

    <amc-dialog size="md" [title]="editing() ? 'Edit category' : 'Create category'" description="Categories can have one level of subcategories." [(open)]="formOpen">
      <form [formGroup]="form" id="category-form" novalidate (ngSubmit)="save()">
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <amc-form-field label="Category Code" for="cat-code" [control]="form.controls.code" [hint]="editing() ? 'Codes cannot be changed.' : ''">
            <input id="cat-code" class="amc-input font-mono uppercase" formControlName="code" />
          </amc-form-field>
          <amc-form-field label="Category Name" for="cat-name" [control]="form.controls.name">
            <input id="cat-name" class="amc-input" formControlName="name" />
          </amc-form-field>
          <amc-form-field label="Parent Category" for="cat-parent" [control]="form.controls.parentId" hint="Leave empty for a top-level category.">
            <amc-select inputId="cat-parent" formControlName="parentId" [options]="parentOptions()" placeholder="None (top level)" [clearable]="true" />
          </amc-form-field>
          <amc-form-field label="Display Order" for="cat-order" [control]="form.controls.displayOrder">
            <input id="cat-order" type="number" min="0" class="amc-input tabular-nums" formControlName="displayOrder" />
          </amc-form-field>
          <amc-form-field label="Status" for="cat-status" [control]="form.controls.status">
            <amc-select inputId="cat-status" formControlName="status" [options]="statusOptions" />
          </amc-form-field>
          <amc-form-field label="Description" for="cat-desc" [control]="form.controls.description" class="sm:col-span-2">
            <textarea id="cat-desc" class="amc-textarea min-h-16" formControlName="description"></textarea>
          </amc-form-field>
        </div>
      </form>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="formOpen.set(false)">Cancel</button>
        <button type="submit" form="category-form" class="amc-btn-primary" [disabled]="saving()">@if (saving()) { <amc-spinner [size]="14" /> } Save</button>
      </ng-container>
    </amc-dialog>
  `,
})
export class CategoriesPage {
  private readonly api = inject(CategoryApi);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly notify = inject(NotificationPort);
  private readonly router = inject(Router);

  readonly action = input<string>();

  protected readonly categories = rxResource({ stream: () => this.api.list() });
  protected readonly rows = computed(() => (this.categories.hasValue() ? this.categories.value() : []));
  protected readonly search = signal('');
  protected readonly filters = signal<FilterValues>({});
  protected readonly filterFields = computed<FilterField[]>(() => [
    { key: 'status', label: 'Status', type: 'multiselect', options: toOptions(CATEGORY_STATUSES) },
    { key: 'level', label: 'Level', type: 'multiselect', options: toOptions(['Top level', 'Subcategory'] as const) },
  ]);

  /** Parents followed by their children, filtered. */
  protected readonly ordered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    const match = (c: CategoryListItem) =>
      (!term || `${c.code} ${c.name} ${c.description}`.toLowerCase().includes(term)) && matchesAny(f, 'status', c.status) && matchesAny(f, 'level', c.parentId ? 'Subcategory' : 'Top level');
    const all = this.rows();
    return all.filter((c) => !c.parentId).flatMap((p) => [p, ...all.filter((c) => c.parentId === p.id)]).filter(match);
  });

  protected readonly columns: DataColumn<CategoryListItem>[] = [
    { key: 'name', label: 'Category Name', value: (c) => (c.parentId ? `↳ ${c.name}` : c.name), secondary: (c) => c.code, link: (c) => `/app/catalog/services?category=${c.id}`, mobile: 'title', width: 280 },
    { key: 'parent', label: 'Parent Category', value: (c) => c.parentName, visibility: 'md', mobile: 'meta', width: 200 },
    { key: 'description', label: 'Description', value: (c) => c.description, visibility: 'xl', width: 320 },
    { key: 'children', label: 'Subcategories', value: (c) => c.childCount, type: 'number', visibility: 'lg', width: 120 },
    { key: 'services', label: 'Service Count', value: (c) => c.serviceCount, type: 'number', secondary: (c) => `${c.activeServiceCount} active`, mobile: 'meta', width: 130 },
    { key: 'order', label: 'Display Order', value: (c) => c.displayOrder, type: 'number', visibility: 'xl', width: 110 },
    { key: 'status', label: 'Status', value: (c) => c.status, type: 'badge', tone: (c) => CATEGORY_STATUS_TONE[c.status], mobile: 'badge', width: 110 },
  ];
  protected readonly trackById = (c: CategoryListItem) => c.id;
  protected readonly statusOptions = toOptions(CATEGORY_STATUSES);

  protected readonly rowActions = (c: CategoryListItem): MenuItem[] => [
    { id: 'edit', label: 'Edit Category', icon: 'pencil' },
    { id: 'add-child', label: 'Add Subcategory', icon: 'plus', disabled: !!c.parentId },
    { id: 'services', label: 'View Services', icon: 'list' },
    { id: 'add-service', label: 'Add Service', icon: 'plus', disabled: c.status !== 'Active' },
    c.status === 'Active' ? { id: 'deactivate', label: 'Deactivate', icon: 'ban', danger: true, dividerBefore: true } : { id: 'activate', label: 'Activate', icon: 'check-circle', dividerBefore: true },
  ];

  protected readonly formOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly editing = signal<CategoryListItem | null>(null);
  protected readonly form = this.fb.group({
    code: this.fb.control('', [Validators.required, Validators.pattern(/^[A-Za-z0-9-]{2,16}$/)]),
    name: this.fb.control('', [Validators.required, Validators.maxLength(80)]),
    parentId: this.fb.control(''),
    description: this.fb.control('', Validators.maxLength(500)),
    status: this.fb.control<CategoryStatus>('Active', Validators.required),
    displayOrder: this.fb.control(10, [Validators.required, Validators.min(0)]),
  });
  protected readonly parentOptions = computed(() => this.rows().filter((c) => !c.parentId && c.id !== this.editing()?.id).map((c) => ({ value: c.id, label: c.name })));

  constructor() {
    effect(() => {
      if (this.action() === 'add') untracked(() => this.openForm(null));
    });
  }

  protected openForm(c: CategoryListItem | null, parentId = ''): void {
    this.editing.set(c);
    this.form.reset({ code: c?.code ?? '', name: c?.name ?? '', parentId: c?.parentId ?? parentId, description: c?.description ?? '', status: c?.status ?? 'Active', displayOrder: c?.displayOrder ?? (this.rows().length + 1) * 10 });
    if (c) this.form.controls.code.disable();
    else this.form.controls.code.enable();
    this.formOpen.set(true);
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const input = { ...v, code: v.code.toUpperCase(), parentId: v.parentId || null, displayOrder: Number(v.displayOrder) };
    this.saving.set(true);
    try {
      const c = this.editing();
      await firstValueFrom(c ? this.api.update(c.id, input) : this.api.create(input));
      this.notify.success(`Category ${input.name} saved.`);
      this.formOpen.set(false);
      this.categories.reload();
    } catch (error) {
      this.notify.error((error as Error).message);
    } finally {
      this.saving.set(false);
    }
  }

  protected async onAction({ id, row }: RowAction<CategoryListItem>): Promise<void> {
    switch (id) {
      case 'edit':
        this.openForm(row);
        break;
      case 'add-child':
        this.openForm(null, row.id);
        break;
      case 'services':
        void this.router.navigate(['/app/catalog/services'], { queryParams: { category: row.id } });
        break;
      case 'add-service':
        void this.router.navigate(['/app/catalog/services/new'], { queryParams: { categoryId: row.parentId ?? row.id } });
        break;
      default:
        try {
          await firstValueFrom(this.api.setStatus(row.id, id === 'activate' ? 'Active' : 'Inactive'));
          this.notify.success(`${row.name} ${id === 'activate' ? 'activated' : 'deactivated'}.`);
          this.categories.reload();
        } catch (error) {
          this.notify.error((error as Error).message);
        }
    }
  }

  protected export(): void {
    downloadCsv(
      timestampedName('service-categories', 'csv'),
      ['Category Code', 'Category Name', 'Parent Category', 'Description', 'Status', 'Display Order', 'Service Count'],
      this.ordered().map((c) => [c.code, c.name, c.parentName, c.description, c.status, c.displayOrder, c.serviceCount]),
    );
  }
}
