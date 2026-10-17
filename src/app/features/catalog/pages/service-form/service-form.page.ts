import { ChangeDetectionStrategy, Component, ElementRef, type OnInit, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { rxResource, takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { type AbstractControl, type AsyncValidatorFn, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { HasUnsavedChanges } from '@core/guards/unsaved-changes.guard';
import { NotificationPort } from '@core/notification/notification.port';
import { toOptions } from '@shared/models/select-option';
import { ErrorState } from '@shared/ui/error-state';
import { Switch } from '@shared/ui/form-controls';
import { FormField } from '@shared/ui/form-field';
import { Icon, type IconName } from '@shared/ui/icon';
import { LookupSelect } from '@shared/ui/lookup-select';
import { PageHeader } from '@shared/ui/page-header';
import { Panel } from '@shared/ui/panel';
import { Select } from '@shared/ui/select';
import { Skeleton } from '@shared/ui/skeleton';
import { Spinner } from '@shared/ui/spinner';
import { StatusBadge } from '@shared/ui/status-badge';
import { formatFileSize } from '@shared/utils/format';
import { filter, firstValueFrom, map, of, startWith, switchMap, timer } from 'rxjs';
import { CatalogReferenceStore } from '../../data/catalog-reference.store';
import { CategoryApi, ServiceCatalogApi } from '../../data/catalog.api';
import { CATALOG_LOOKUP } from '../../data/catalog.lookups';
import { CATALOG_FIELD_HELP } from '../../data/field-help';
import {
  BILLING_METHODS,
  FREQUENCY_UNITS,
  MAINTENANCE_SERVICE_TYPES,
  PRIORITIES,
  SERVICE_HOURS,
  SERVICE_STATUSES,
  SERVICE_TYPES,
  SERVICE_UNITS,
  type Attachment,
  type BillingMethod,
  type FrequencyUnit,
  type Priority,
  type ServiceListItem,
  type ServiceStatus,
  type ServiceType,
  type ServiceUnit,
  type ServiceUpsert,
} from '../../models/catalog.model';
import { SERVICE_STATUS_TONE } from '../../models/display';

type Section = 'basic' | 'classification' | 'operational' | 'maintenance' | 'resources' | 'commercial' | 'sla' | 'documentation';

const SECTIONS: readonly { id: Section; label: string; icon: IconName }[] = [
  { id: 'basic', label: 'Basic information', icon: 'list' },
  { id: 'classification', label: 'Classification', icon: 'tag' },
  { id: 'operational', label: 'Operational', icon: 'clock' },
  { id: 'maintenance', label: 'Maintenance', icon: 'calendar-check' },
  { id: 'resources', label: 'Resources', icon: 'users' },
  { id: 'commercial', label: 'Commercial', icon: 'wallet' },
  { id: 'sla', label: 'SLA', icon: 'shield-check' },
  { id: 'documentation', label: 'Documentation', icon: 'file-text' },
];

@Component({
  selector: 'amc-service-form-page',
  imports: [ErrorState, FormField, Icon, LookupSelect, PageHeader, Panel, ReactiveFormsModule, RouterLink, Select, Skeleton, Spinner, StatusBadge, Switch],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './service-form.page.html',
})
export class ServiceFormPage implements HasUnsavedChanges, OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(ServiceCatalogApi);
  private readonly categoriesApi = inject(CategoryApi);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationPort);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly refs = inject(CatalogReferenceStore);

  readonly serviceId = input<string>();
  readonly categoryId = input<string>();
  protected readonly isEdit = computed(() => !!this.serviceId());

  private readonly codeAvailable: AsyncValidatorFn = (control: AbstractControl) =>
    !control.value || control.disabled
      ? of(null)
      : timer(350).pipe(switchMap(() => this.api.isCodeAvailable(String(control.value), this.serviceId())), map((ok) => (ok ? null : { codeTaken: 'This service code is already in use.' })));

  protected readonly form = this.fb.group({
    basic: this.fb.group({
      code: this.fb.control('', { validators: [Validators.required, Validators.pattern(/^[A-Za-z0-9-]{3,24}$/)], asyncValidators: [this.codeAvailable] }),
      name: this.fb.control('', [Validators.required, Validators.maxLength(120)]),
      shortName: this.fb.control('', Validators.maxLength(30)),
      categoryId: this.fb.control('', Validators.required),
      type: this.fb.control<ServiceType>('Preventive Maintenance', Validators.required),
      status: this.fb.control<ServiceStatus>('Active', Validators.required),
      description: this.fb.control('', Validators.maxLength(1000)),
    }),
    classification: this.fb.group({
      subcategoryId: this.fb.control(''),
      serviceClass: this.fb.control(''),
      priority: this.fb.control<Priority>('Medium', Validators.required),
      customerDescription: this.fb.control('', Validators.maxLength(1000)),
      internalDescription: this.fb.control('', Validators.maxLength(1000)),
    }),
    operational: this.fb.group({
      standardDuration: this.fb.control<number | null>(null, Validators.min(0)),
      minDuration: this.fb.control<number | null>(null, Validators.min(0)),
      maxDuration: this.fb.control<number | null>(null, Validators.min(0)),
      unit: this.fb.control<ServiceUnit>('Visit', Validators.required),
      territoryId: this.fb.control(''),
      serviceHours: this.fb.control('Business Hours'),
      emergencyAllowed: this.fb.control(false),
    }),
    maintenance: this.fb.group({
      maintenanceType: this.fb.control(''),
      recommendedFrequency: this.fb.control<number | null>(null, Validators.min(1)),
      frequencyUnit: this.fb.control<FrequencyUnit | ''>(''),
      checklistRequired: this.fb.control(false),
      inspectionRequired: this.fb.control(false),
      meterBased: this.fb.control(false),
      conditionBased: this.fb.control(false),
    }),
    resources: this.fb.group({
      skill: this.fb.control(''),
      certification: this.fb.control(''),
      team: this.fb.control(''),
      equipment: this.fb.control(''),
      tools: this.fb.control(''),
      parts: this.fb.control(''),
      consumables: this.fb.control(''),
    }),
    commercial: this.fb.group({
      billable: this.fb.control(true),
      billingMethod: this.fb.control<BillingMethod>('Per Visit', Validators.required),
      standardPrice: this.fb.control<number | null>(null, Validators.min(0)),
      currency: this.fb.control('SAR', Validators.required),
      taxProfileId: this.fb.control('TAX-STD'),
      costRate: this.fb.control<number | null>(null, Validators.min(0)),
      priceListId: this.fb.control('PL-STD'),
      discountAllowed: this.fb.control(true),
      contractEligible: this.fb.control(true),
      amcEligible: this.fb.control(false),
    }),
    sla: this.fb.group({
      applicable: this.fb.control(false),
      defaultSlaId: this.fb.control(''),
      responseHours: this.fb.control<number | null>(null, Validators.min(0)),
      resolutionHours: this.fb.control<number | null>(null, Validators.min(0)),
      priority: this.fb.control<Priority>('Medium'),
      escalationRequired: this.fb.control(false),
    }),
    documentation: this.fb.group({
      serviceInstructions: this.fb.control('', Validators.maxLength(2000)),
      technicianInstructions: this.fb.control('', Validators.maxLength(2000)),
      customerInstructions: this.fb.control('', Validators.maxLength(2000)),
    }),
  });

  protected readonly sections = SECTIONS;
  protected readonly lookup = CATALOG_LOOKUP;
  protected readonly help = CATALOG_FIELD_HELP;
  protected readonly typeOptions = toOptions(SERVICE_TYPES);
  protected readonly statusOptions = toOptions(SERVICE_STATUSES);
  protected readonly unitOptions = toOptions(SERVICE_UNITS);
  protected readonly billingOptions = toOptions(BILLING_METHODS);
  protected readonly priorityOptions = toOptions(PRIORITIES);
  protected readonly hoursOptions = toOptions(SERVICE_HOURS);
  protected readonly frequencyUnitOptions = toOptions(FREQUENCY_UNITS);
  protected readonly statusTone = SERVICE_STATUS_TONE;
  protected readonly formatFileSize = formatFileSize;

  protected readonly value = toSignal(this.form.valueChanges.pipe(startWith(null), map(() => this.form.getRawValue())), { initialValue: this.form.getRawValue() });
  private readonly formEvents = toSignal(this.form.events.pipe(map(() => Symbol())));
  protected readonly existing = rxResource({ params: () => this.serviceId(), stream: ({ params }) => this.api.get(params) });
  private readonly categories = rxResource({ stream: () => this.categoriesApi.list() });
  protected readonly categoryOptions = computed(() =>
    (this.categories.hasValue() ? this.categories.value() : []).filter((c) => !c.parentId).map((c) => ({ value: c.id, label: c.name, hint: c.status === 'Active' ? `${c.serviceCount} services` : 'Inactive' })),
  );
  protected readonly subcategoryOptions = computed(() =>
    (this.categories.hasValue() ? this.categories.value() : []).filter((c) => c.parentId === this.value().basic.categoryId).map((c) => ({ value: c.id, label: c.name })),
  );
  protected readonly isMaintenance = computed(() => MAINTENANCE_SERVICE_TYPES.includes(this.value().basic.type));
  protected readonly categoryInactive = computed(() => (this.categories.hasValue() ? this.categories.value() : []).find((c) => c.id === this.value().basic.categoryId)?.status === 'Inactive');
  protected readonly saving = signal(false);
  protected readonly attachments = signal<readonly Attachment[]>([]);
  private saved = false;
  private patching = false;

  constructor() {
    effect(() => {
      const current = this.existing.hasValue() ? this.existing.value() : undefined;
      if (current) untracked(() => this.patch(current));
    });
    const basic = this.form.controls.basic.controls;
    basic.categoryId.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      if (!this.patching) this.form.controls.classification.controls.subcategoryId.setValue('');
    });
    const commercial = this.form.controls.commercial.controls;
    commercial.billingMethod.valueChanges.pipe(takeUntilDestroyed()).subscribe((method) => {
      if (method === 'Non-Billable' || method === 'Contract Included') commercial.billable.setValue(false);
      else if (!this.patching) commercial.billable.setValue(true);
    });
    const sla = this.form.controls.sla.controls;
    sla.defaultSlaId.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      const ref = this.refs.data().slas.find((s) => s.id === id);
      if (!ref || this.patching) return;
      sla.responseHours.setValue(ref.responseHours);
      sla.resolutionHours.setValue(ref.resolutionHours);
    });
    effect(() => {
      const applicable = this.value().sla.applicable;
      untracked(() => {
        const control = this.form.controls.sla.controls.defaultSlaId;
        if (applicable === control.hasValidator(Validators.required)) return;
        if (applicable) control.addValidators(Validators.required);
        else control.removeValidators(Validators.required);
        control.updateValueAndValidity({ emitEvent: false });
      });
    });
  }

  ngOnInit(): void {
    if (this.serviceId()) return;
    void firstValueFrom(this.api.nextCode()).then((code) => {
      if (!this.form.controls.basic.controls.code.dirty) this.form.controls.basic.controls.code.setValue(code);
    });
    if (this.categoryId()) this.form.controls.basic.controls.categoryId.setValue(this.categoryId()!);
  }

  hasUnsavedChanges(): boolean {
    return !this.saved && this.form.dirty;
  }

  protected sectionInvalid(id: Section): boolean {
    this.formEvents();
    const control = this.form.controls[id];
    return control.invalid && control.touched;
  }

  protected scrollTo(id: string): void {
    this.host.nativeElement.querySelector(`#section-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected onFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []).map((f) => ({ id: `ATT-${Date.now()}-${f.name}`, name: f.name, size: f.size, type: f.type, uploadedBy: this.refs.data().currentUser, uploadedAt: new Date().toISOString() }));
    this.attachments.update((list) => [...list, ...files]);
    input.value = '';
    this.form.markAsDirty();
  }

  protected removeFile(id: string): void {
    this.attachments.update((list) => list.filter((f) => f.id !== id));
    this.form.markAsDirty();
  }

  private patch(s: ServiceListItem): void {
    this.patching = true;
    this.form.patchValue({
      basic: { code: s.code, name: s.name, shortName: s.shortName, categoryId: s.categoryId, type: s.type, status: s.status, description: s.description },
      classification: { subcategoryId: s.subcategoryId ?? '', serviceClass: s.serviceClass, priority: s.priority, customerDescription: s.customerDescription, internalDescription: s.internalDescription },
      operational: { ...s.operational, territoryId: s.operational.territoryId ?? '' },
      maintenance: { ...s.maintenance, frequencyUnit: s.maintenance.frequencyUnit ?? '' },
      resources: s.resources,
      commercial: { ...s.commercial, taxProfileId: s.commercial.taxProfileId ?? '', priceListId: s.commercial.priceListId ?? '' },
      sla: { ...s.sla, defaultSlaId: s.sla.defaultSlaId ?? '' },
      documentation: s.documentation,
    });
    this.attachments.set(s.attachments);
    this.form.controls.basic.controls.code.disable({ emitEvent: false });
    this.form.markAsPristine();
    this.patching = false;
  }

  protected async save(intent: 'save' | 'another' | 'duplicate'): Promise<void> {
    if (this.saving()) return;
    this.form.markAllAsTouched();
    if (this.form.pending) await firstValueFrom(this.form.statusChanges.pipe(startWith(this.form.status), filter((s) => s !== 'PENDING')));
    if (this.form.invalid) {
      this.notify.error('Please review the highlighted fields before saving.', 'Some fields need attention');
      queueMicrotask(() => this.host.nativeElement.querySelector<HTMLElement>('input.ng-invalid, textarea.ng-invalid')?.focus());
      return;
    }
    this.saving.set(true);
    try {
      const id = this.serviceId();
      const service = await firstValueFrom(id ? this.api.update(id, this.toUpsert()) : this.api.create(this.toUpsert()));
      this.saved = true;
      this.notify.success(`${service.name} (${service.code}) was ${id ? 'updated' : 'created'}.`, id ? 'Service updated' : 'Service created');
      if (intent === 'another') {
        if (id) {
          void this.router.navigate(['/app/catalog/services/new'], { queryParams: { categoryId: service.categoryId } });
        } else {
          this.saved = false;
          this.form.reset();
          this.attachments.set([]);
          this.form.controls.basic.controls.categoryId.setValue(service.categoryId);
          this.form.controls.basic.controls.code.setValue(await firstValueFrom(this.api.nextCode()));
          this.form.markAsPristine();
          this.form.markAsUntouched();
        }
      } else if (intent === 'duplicate') {
        const copy = await firstValueFrom(this.api.duplicate(service.id));
        this.notify.info(`Draft copy ${copy.code} created.`);
        void this.router.navigate(['/app/catalog/services', copy.id, 'edit']);
      } else {
        void this.router.navigate(['/app/catalog/services', service.id]);
      }
    } catch (error) {
      this.notify.error((error as Error).message, 'Could not save service');
    } finally {
      this.saving.set(false);
    }
  }

  private toUpsert(): ServiceUpsert {
    const v = this.form.getRawValue();
    const nul = (value: string) => value || null;
    return {
      code: v.basic.code.trim().toUpperCase(),
      name: v.basic.name.trim(),
      shortName: v.basic.shortName.trim(),
      categoryId: v.basic.categoryId,
      subcategoryId: nul(v.classification.subcategoryId),
      type: v.basic.type,
      status: v.basic.status,
      description: v.basic.description,
      serviceClass: v.classification.serviceClass,
      priority: v.classification.priority,
      customerDescription: v.classification.customerDescription,
      internalDescription: v.classification.internalDescription,
      operational: { ...v.operational, territoryId: nul(v.operational.territoryId) },
      maintenance: { ...v.maintenance, frequencyUnit: v.maintenance.frequencyUnit || null },
      resources: v.resources,
      commercial: { ...v.commercial, taxProfileId: nul(v.commercial.taxProfileId), priceListId: nul(v.commercial.priceListId) },
      sla: { ...v.sla, defaultSlaId: v.sla.applicable ? nul(v.sla.defaultSlaId) : null },
      documentation: v.documentation,
      attachments: this.attachments(),
    };
  }
}
