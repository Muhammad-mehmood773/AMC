import { ChangeDetectionStrategy, Component, ElementRef, type OnInit, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { rxResource, takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { type AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, type ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { HasUnsavedChanges } from '@core/guards/unsaved-changes.guard';
import { NotificationPort } from '@core/notification/notification.port';
import { toOptions } from '@shared/models/select-option';
import { DatePicker } from '@shared/ui/date-picker';
import { ErrorState } from '@shared/ui/error-state';
import { Switch } from '@shared/ui/form-controls';
import { FormField } from '@shared/ui/form-field';
import { Icon, type IconName } from '@shared/ui/icon';
import { PageHeader } from '@shared/ui/page-header';
import { Panel } from '@shared/ui/panel';
import { MultiSelect, Select } from '@shared/ui/select';
import { Skeleton } from '@shared/ui/skeleton';
import { Spinner } from '@shared/ui/spinner';
import { StatusBadge } from '@shared/ui/status-badge';
import { firstValueFrom, map, startWith } from 'rxjs';
import { CatalogReferenceStore } from '../../data/catalog-reference.store';
import { CategoryApi, EntitlementApi, ServiceCatalogApi } from '../../data/catalog.api';
import { COVERAGE_LABOR_PARTS, COVERAGE_SERVICE_TYPES } from '../../data/catalog.config';
import { CATALOG_FIELD_HELP } from '../../data/field-help';
import { PRIORITIES, SERVICE_TYPES, type Priority } from '../../models/catalog.model';
import { ENTITLEMENT_STATUS_TONE } from '../../models/display';
import {
  COVERAGE_DESCRIPTIONS,
  COVERAGE_TYPES,
  ENTITLEMENT_STATUSES,
  ESCALATION_POLICIES,
  RESET_FREQUENCIES,
  SERVICE_WINDOWS,
  TAX_TREATMENTS,
  type CoverageType,
  type EntitlementListItem,
  type EntitlementStatus,
  type EntitlementUpsert,
  type ResetFrequency,
} from '../../models/entitlement.model';

type Section = 'basic' | 'coverage' | 'validity' | 'usage' | 'scope' | 'laborParts' | 'sla' | 'exclusions' | 'commercial';

const SECTIONS: readonly { id: Section; label: string; icon: IconName }[] = [
  { id: 'basic', label: 'Basic information', icon: 'shield-check' },
  { id: 'coverage', label: 'Service coverage', icon: 'list' },
  { id: 'validity', label: 'Validity', icon: 'calendar' },
  { id: 'usage', label: 'Usage limits', icon: 'activity' },
  { id: 'scope', label: 'Sites & assets', icon: 'map-pin' },
  { id: 'laborParts', label: 'Labor & parts', icon: 'wrench' },
  { id: 'sla', label: 'SLA coverage', icon: 'clock' },
  { id: 'exclusions', label: 'Exclusions', icon: 'ban' },
  { id: 'commercial', label: 'Commercial rules', icon: 'wallet' },
];

function validityRange(group: AbstractControl): ValidationErrors | null {
  const start = group.get('startDate')?.value as string;
  const end = group.get('endDate')?.value as string;
  return start && end && end < start ? { range: true } : null;
}

const strings = (values: readonly (string | number)[]) => values.map(String);

@Component({
  selector: 'amc-entitlement-form-page',
  imports: [DatePicker, ErrorState, FormField, Icon, MultiSelect, PageHeader, Panel, ReactiveFormsModule, RouterLink, Select, Skeleton, Spinner, StatusBadge, Switch],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './entitlement-form.page.html',
})
export class EntitlementFormPage implements HasUnsavedChanges, OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(EntitlementApi);
  private readonly servicesApi = inject(ServiceCatalogApi);
  private readonly categoriesApi = inject(CategoryApi);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationPort);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly refs = inject(CatalogReferenceStore);

  readonly entitlementId = input<string>();
  readonly serviceId = input<string>();
  readonly customerId = input<string>();
  protected readonly isEdit = computed(() => !!this.entitlementId());

  protected readonly form = this.fb.group({
    basic: this.fb.group({
      number: this.fb.control('', Validators.required),
      name: this.fb.control('', [Validators.required, Validators.maxLength(150)]),
      customerId: this.fb.control('', Validators.required),
      contractId: this.fb.control(''),
      amcId: this.fb.control(''),
      status: this.fb.control<EntitlementStatus>('Draft', Validators.required),
    }),
    coverage: this.fb.group({
      serviceIds: this.fb.control<(string | number)[]>([]),
      categoryIds: this.fb.control<(string | number)[]>([]),
      coverageType: this.fb.control<CoverageType>('Full Coverage', Validators.required),
      includedServices: this.fb.control(''),
      excludedServices: this.fb.control(''),
      coveredServiceTypes: this.fb.control<(string | number)[]>([]),
      serviceFrequency: this.fb.control(''),
      includedVisits: this.fb.control<number | null>(null, Validators.min(0)),
      emergencyService: this.fb.control(false),
      afterHoursService: this.fb.control(false),
    }),
    validity: this.fb.group(
      {
        startDate: this.fb.control(new Date().toISOString().slice(0, 10), Validators.required),
        endDate: this.fb.control('', Validators.required),
        effectiveDate: this.fb.control(''),
        autoRenewal: this.fb.control(false),
        renewalPeriodMonths: this.fb.control<number | null>(12, Validators.min(1)),
      },
      { validators: validityRange },
    ),
    usage: this.fb.group({
      limitApplicable: this.fb.control(false),
      maxVisits: this.fb.control<number | null>(null, Validators.min(0)),
      maxHours: this.fb.control<number | null>(null, Validators.min(0)),
      maxQuantity: this.fb.control<number | null>(null, Validators.min(0)),
      usedVisits: this.fb.control(0),
      usedHours: this.fb.control(0),
      usedQuantity: this.fb.control(0),
      resetFrequency: this.fb.control<ResetFrequency>('Contract Period'),
      lastResetDate: this.fb.control(''),
    }),
    scope: this.fb.group({
      siteIds: this.fb.control<(string | number)[]>([]),
      assetIds: this.fb.control<(string | number)[]>([]),
    }),
    laborParts: this.fb.group({
      labor: this.fb.control(true),
      parts: this.fb.control(true),
      consumables: this.fb.control(false),
      travel: this.fb.control(true),
      callOut: this.fb.control(true),
      overtime: this.fb.control(false),
    }),
    sla: this.fb.group({
      applicable: this.fb.control(true),
      slaId: this.fb.control(''),
      responseHours: this.fb.control<number | null>(null, Validators.min(0)),
      resolutionHours: this.fb.control<number | null>(null, Validators.min(0)),
      priority: this.fb.control<Priority>('Medium'),
      serviceWindow: this.fb.control<string>('Business Hours (08:00–17:00)'),
      escalationPolicy: this.fb.control('Standard'),
    }),
    exclusions: this.fb.group({
      serviceIds: this.fb.control<(string | number)[]>([]),
      assetIds: this.fb.control<(string | number)[]>([]),
      parts: this.fb.control(''),
      locations: this.fb.control(''),
      serviceHours: this.fb.control(''),
      notes: this.fb.control(''),
    }),
    commercial: this.fb.group({
      billableServiceIds: this.fb.control<(string | number)[]>([]),
      nonBillableServiceIds: this.fb.control<(string | number)[]>([]),
      customerPrice: this.fb.control<number | null>(null, Validators.min(0)),
      currency: this.fb.control('SAR'),
      discountRules: this.fb.control(''),
      additionalCharges: this.fb.control(''),
      taxTreatment: this.fb.control('Standard VAT'),
    }),
  });

  protected readonly sections = SECTIONS;
  protected readonly help = CATALOG_FIELD_HELP;
  protected readonly coverageDescriptions = COVERAGE_DESCRIPTIONS;
  protected readonly statusOptions = toOptions(ENTITLEMENT_STATUSES.filter((s) => s !== 'Expired'));
  protected readonly coverageOptions = toOptions(COVERAGE_TYPES);
  protected readonly resetOptions = toOptions(RESET_FREQUENCIES);
  protected readonly priorityOptions = toOptions(PRIORITIES);
  protected readonly windowOptions = toOptions(SERVICE_WINDOWS);
  protected readonly escalationOptions = toOptions(ESCALATION_POLICIES);
  protected readonly taxOptions = toOptions(TAX_TREATMENTS);
  protected readonly serviceTypeOptions = toOptions(SERVICE_TYPES);
  protected readonly frequencyOptions = toOptions(['Weekly', 'Monthly', 'Quarterly', 'Semi-Annual', 'Annual', 'On demand'] as const);
  protected readonly statusTone = ENTITLEMENT_STATUS_TONE;

  protected readonly value = toSignal(this.form.valueChanges.pipe(startWith(null), map(() => this.form.getRawValue())), { initialValue: this.form.getRawValue() });
  private readonly formEvents = toSignal(this.form.events.pipe(map(() => Symbol())));
  protected readonly existing = rxResource({ params: () => this.entitlementId(), stream: ({ params }) => this.api.get(params) });
  private readonly services = rxResource({ stream: () => this.servicesApi.list() });
  private readonly categories = rxResource({ stream: () => this.categoriesApi.list() });

  private readonly customer = computed(() => this.value().basic.customerId || null);
  protected readonly contractOptions = computed(() => this.refs.agreementOptions('Contract', this.customer()));
  protected readonly amcOptions = computed(() => this.refs.agreementOptions('AMC', this.customer()));
  protected readonly siteOptions = computed(() => this.refs.siteOptions(this.customer()));
  protected readonly assetOptions = computed(() => this.refs.assetOptions(this.customer(), strings(this.value().scope.siteIds)));
  protected readonly categoryOptions = computed(() => (this.categories.hasValue() ? this.categories.value() : []).filter((c) => !c.parentId).map((c) => ({ value: c.id, label: c.name })));
  /** Inactive services cannot be selected for new entitlements; existing selections are kept. */
  protected readonly serviceOptions = computed(() => {
    const keep = new Set(this.existing.hasValue() ? (this.existing.value()?.coverage.serviceIds ?? []) : []);
    return (this.services.hasValue() ? this.services.value() : [])
      .filter((s) => s.status === 'Active' || keep.has(s.id))
      .map((s) => ({ value: s.id, label: `${s.code} · ${s.name}`, hint: s.status === 'Active' ? s.categoryName : `${s.categoryName} · ${s.status}` }));
  });
  protected readonly coverageHint = computed(() => COVERAGE_DESCRIPTIONS[this.value().coverage.coverageType]);

  protected readonly saving = signal(false);
  private saved = false;
  private patching = false;

  constructor() {
    effect(() => {
      const current = this.existing.hasValue() ? this.existing.value() : undefined;
      if (current) untracked(() => this.patch(current));
    });
    const basic = this.form.controls.basic.controls;
    basic.customerId.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      if (this.patching) return;
      this.form.patchValue({ basic: { contractId: '', amcId: '' }, scope: { siteIds: [], assetIds: [] } });
      const c = this.refs.data().customers.find((x) => x.id === id);
      if (c) this.form.controls.commercial.controls.currency.setValue(c.currency);
    });
    const fromAgreement = (id: string) => {
      const a = this.refs.data().agreements.find((x) => x.id === id);
      if (!a || this.patching) return;
      this.form.patchValue({ validity: { startDate: a.startDate, endDate: a.endDate, effectiveDate: a.startDate }, scope: { siteIds: [...a.siteIds] } });
      if (!basic.name.dirty) basic.name.setValue(a.title);
    };
    basic.contractId.valueChanges.pipe(takeUntilDestroyed()).subscribe(fromAgreement);
    basic.amcId.valueChanges.pipe(takeUntilDestroyed()).subscribe(fromAgreement);
    this.form.controls.coverage.controls.coverageType.valueChanges.pipe(takeUntilDestroyed()).subscribe((type) => {
      if (this.patching) return;
      this.form.patchValue({ coverage: { coveredServiceTypes: [...COVERAGE_SERVICE_TYPES[type]] }, laborParts: COVERAGE_LABOR_PARTS[type] });
    });
    this.form.controls.sla.controls.slaId.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      const sla = this.refs.data().slas.find((s) => s.id === id);
      if (sla && !this.patching) this.form.patchValue({ sla: { responseHours: sla.responseHours, resolutionHours: sla.resolutionHours } });
    });
    this.form.controls.coverage.controls.includedVisits.valueChanges.pipe(takeUntilDestroyed()).subscribe((visits) => {
      const usage = this.form.controls.usage.controls;
      if (visits !== null && !this.patching && !usage.maxVisits.dirty) usage.maxVisits.setValue(visits);
    });
  }

  ngOnInit(): void {
    if (this.entitlementId()) return;
    void firstValueFrom(this.api.nextNumber()).then((n) => this.form.controls.basic.controls.number.setValue(n));
    this.form.patchValue({ coverage: { coveredServiceTypes: [...COVERAGE_SERVICE_TYPES['Full Coverage']] } });
    if (this.serviceId()) this.form.controls.coverage.controls.serviceIds.setValue([this.serviceId()!]);
  }

  private prefilled = false;
  protected readonly prefill = effect(() => {
    const customerId = this.customerId();
    if (this.prefilled || this.entitlementId() || !customerId || !this.refs.data().customers.length) return;
    this.prefilled = true;
    untracked(() => this.form.controls.basic.controls.customerId.setValue(customerId));
  });

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

  private patch(e: EntitlementListItem): void {
    this.patching = true;
    this.form.patchValue({
      basic: { number: e.number, name: e.name, customerId: e.customerId, contractId: e.contractId ?? '', amcId: e.amcId ?? '', status: e.status === 'Expired' ? 'Active' : e.status },
      coverage: { ...e.coverage, serviceIds: [...e.coverage.serviceIds], categoryIds: [...e.coverage.categoryIds], coveredServiceTypes: [...e.coverage.coveredServiceTypes] },
      validity: { ...e.validity },
      usage: { ...e.usage },
      scope: { siteIds: [...e.siteIds], assetIds: [...e.assetIds] },
      laborParts: e.laborParts,
      sla: { ...e.sla, slaId: e.sla.slaId ?? '' },
      exclusions: { ...e.exclusions, serviceIds: [...e.exclusions.serviceIds], assetIds: [...e.exclusions.assetIds] },
      commercial: { ...e.commercial, billableServiceIds: [...e.commercial.billableServiceIds], nonBillableServiceIds: [...e.commercial.nonBillableServiceIds] },
    });
    this.form.controls.basic.controls.number.disable({ emitEvent: false });
    this.form.controls.basic.controls.customerId.disable({ emitEvent: false });
    this.form.markAsPristine();
    this.patching = false;
  }

  protected async save(activate: boolean): Promise<void> {
    if (this.saving()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.notify.error('Please review the highlighted fields before saving.', 'Some fields need attention');
      return;
    }
    this.saving.set(true);
    try {
      const id = this.entitlementId();
      const payload = this.toUpsert(activate);
      const saved = await firstValueFrom(id ? this.api.update(id, payload) : this.api.create(payload));
      this.saved = true;
      this.notify.success(`${saved.number} ${id ? 'updated' : 'created'}${activate ? ' and activated' : ''}.`);
      void this.router.navigate(['/app/catalog/entitlements', saved.id]);
    } catch (error) {
      this.notify.error((error as Error).message, 'Could not save entitlement');
    } finally {
      this.saving.set(false);
    }
  }

  private toUpsert(activate: boolean): EntitlementUpsert {
    const v = this.form.getRawValue();
    const nul = (x: string) => x || null;
    const existing = this.existing.hasValue() ? this.existing.value() : null;
    return {
      number: v.basic.number,
      name: v.basic.name.trim(),
      customerId: v.basic.customerId,
      contractId: nul(v.basic.contractId),
      amcId: nul(v.basic.amcId),
      status: activate ? 'Active' : v.basic.status,
      siteIds: strings(v.scope.siteIds),
      assetIds: strings(v.scope.assetIds),
      coverage: { ...v.coverage, serviceIds: strings(v.coverage.serviceIds), categoryIds: strings(v.coverage.categoryIds), coveredServiceTypes: strings(v.coverage.coveredServiceTypes) },
      validity: { ...v.validity, effectiveDate: v.validity.effectiveDate || v.validity.startDate },
      usage: { ...v.usage, lastResetDate: v.usage.lastResetDate || v.validity.startDate },
      laborParts: v.laborParts,
      sla: { ...v.sla, slaId: nul(v.sla.slaId) },
      exclusions: { ...v.exclusions, serviceIds: strings(v.exclusions.serviceIds), assetIds: strings(v.exclusions.assetIds) },
      commercial: { ...v.commercial, billableServiceIds: strings(v.commercial.billableServiceIds), nonBillableServiceIds: strings(v.commercial.nonBillableServiceIds) },
      attachments: existing?.attachments ?? [],
    };
  }
}
