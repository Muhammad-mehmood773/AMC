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
import { LookupSelect } from '@shared/ui/lookup-select';
import { PageHeader } from '@shared/ui/page-header';
import { Panel } from '@shared/ui/panel';
import { MultiSelect, Select } from '@shared/ui/select';
import { Skeleton } from '@shared/ui/skeleton';
import { Spinner } from '@shared/ui/spinner';
import { StatusBadge } from '@shared/ui/status-badge';
import { formatFileSize } from '@shared/utils/format';
import { firstValueFrom, map, startWith } from 'rxjs';
import { AmcReferenceStore } from '../../data/amc-reference.store';
import { AmcApi } from '../../data/amc.api';
import { AMC_RULES, FREQUENCY_PER_YEAR } from '../../data/amc.config';
import { AMC_LOOKUP } from '../../data/amc.lookups';
import { AMC_FIELD_HELP } from '../../data/field-help';
import {
  AMC_TYPE_GROUPS,
  BILLING_FREQUENCIES,
  BILLING_METHODS,
  COMMUNICATION_METHODS,
  ESCALATION_POLICIES,
  PRIORITIES,
  SERVICE_FREQUENCIES,
  SERVICE_HOURS,
  SERVICE_WINDOWS,
  WEEK_DAYS,
  type AmcDocument,
  type AmcListItem,
  type AmcUpsert,
  type BillingFrequency,
  type Priority,
  type ServiceFrequency,
} from '../../models/amc.model';
import { AMC_STATUS_TONE } from '../../models/display';

type Section = 'identification' | 'customer' | 'period' | 'scope' | 'maintenance' | 'labor' | 'parts' | 'sla' | 'commercial' | 'operational' | 'documents';

const SECTIONS: readonly { id: Section; label: string; icon: IconName }[] = [
  { id: 'identification', label: 'Identification', icon: 'shield-check' },
  { id: 'customer', label: 'Customer', icon: 'building' },
  { id: 'period', label: 'Contract period', icon: 'calendar' },
  { id: 'scope', label: 'Coverage scope', icon: 'layers' },
  { id: 'maintenance', label: 'Maintenance terms', icon: 'calendar-check' },
  { id: 'labor', label: 'Labor coverage', icon: 'users' },
  { id: 'parts', label: 'Parts & consumables', icon: 'wrench' },
  { id: 'sla', label: 'SLA', icon: 'clock' },
  { id: 'commercial', label: 'Commercial', icon: 'wallet' },
  { id: 'operational', label: 'Operational', icon: 'map-pin' },
  { id: 'documents', label: 'Documents & notes', icon: 'paperclip' },
];

function periodRange(group: AbstractControl): ValidationErrors | null {
  const start = group.get('startDate')?.value as string;
  const end = group.get('endDate')?.value as string;
  return start && end && end < start ? { range: true } : null;
}

const strings = (values: readonly (string | number)[]) => values.map(String);

@Component({
  selector: 'amc-amc-form-page',
  imports: [DatePicker, ErrorState, FormField, Icon, LookupSelect, MultiSelect, PageHeader, Panel, ReactiveFormsModule, RouterLink, Select, Skeleton, Spinner, StatusBadge, Switch],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './amc-form.page.html',
})
export class AmcFormPage implements HasUnsavedChanges, OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(AmcApi);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationPort);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly refs = inject(AmcReferenceStore);

  readonly amcId = input<string>();
  readonly customerId = input<string>();
  readonly siteId = input<string>();
  readonly contractId = input<string>();
  protected readonly isEdit = computed(() => !!this.amcId());

  protected readonly form = this.fb.group({
    identification: this.fb.group({
      number: this.fb.control('', Validators.required),
      title: this.fb.control('', [Validators.required, Validators.maxLength(150)]),
      type: this.fb.control('Annual Maintenance Contract (AMC)', Validators.required),
      parentContractId: this.fb.control(''),
      externalReference: this.fb.control(''),
    }),
    customer: this.fb.group({
      customerId: this.fb.control('', Validators.required),
      legalEntity: this.fb.control(''),
      primaryContact: this.fb.control(''),
      contractManagerId: this.fb.control('', Validators.required),
      accountManagerId: this.fb.control(''),
    }),
    period: this.fb.group(
      {
        startDate: this.fb.control('', Validators.required),
        endDate: this.fb.control('', Validators.required),
        renewalDate: this.fb.control(''),
        noticePeriodDays: this.fb.control(60, [Validators.required, Validators.min(0)]),
        autoRenewal: this.fb.control(false),
        renewalTermMonths: this.fb.control<number | null>(12, Validators.min(1)),
      },
      { validators: periodRange },
    ),
    scope: this.fb.group({
      siteIds: this.fb.control<(string | number)[]>([]),
      assetIds: this.fb.control<(string | number)[]>([]),
      assetCategories: this.fb.control<(string | number)[]>([]),
      serviceIds: this.fb.control<(string | number)[]>([]),
      serviceCategories: this.fb.control<(string | number)[]>([]),
      excludedSiteIds: this.fb.control<(string | number)[]>([]),
      excludedAssetIds: this.fb.control<(string | number)[]>([]),
      excludedServiceIds: this.fb.control<(string | number)[]>([]),
    }),
    maintenance: this.fb.group({
      maintenanceType: this.fb.control('Preventive + Corrective'),
      maintenanceFrequency: this.fb.control<ServiceFrequency>('Quarterly'),
      serviceFrequency: this.fb.control<ServiceFrequency>('Quarterly'),
      visitsIncluded: this.fb.control(4, [Validators.required, Validators.min(0)]),
      visitDurationHours: this.fb.control(3, [Validators.required, Validators.min(0)]),
      serviceWindow: this.fb.control<string>('Business Hours (08:00–17:00)'),
      preferredDays: this.fb.control<(string | number)[]>(['Sunday', 'Tuesday']),
      emergencyService: this.fb.control(false),
      afterHoursService: this.fb.control(false),
    }),
    labor: this.fb.group({
      included: this.fb.control(true),
      technicianVisitsIncluded: this.fb.control(true),
      overtime: this.fb.control(false),
      emergencyLabor: this.fb.control(false),
      travel: this.fb.control(true),
      callOut: this.fb.control(true),
    }),
    parts: this.fb.group({
      partsIncluded: this.fb.control(true),
      consumablesIncluded: this.fb.control(false),
      majorComponents: this.fb.control(false),
      minorParts: this.fb.control(true),
      partsCostLimit: this.fb.control<number | null>(null, Validators.min(0)),
      consumablesLimit: this.fb.control<number | null>(null, Validators.min(0)),
      replacementCoverage: this.fb.control(false),
      excludedParts: this.fb.control(''),
    }),
    limits: this.fb.group({
      maxHours: this.fb.control<number | null>(null, Validators.min(0)),
      maxCallOuts: this.fb.control<number | null>(null, Validators.min(0)),
    }),
    sla: this.fb.group({
      slaId: this.fb.control(''),
      responseHours: this.fb.control<number | null>(null, Validators.min(0)),
      resolutionHours: this.fb.control<number | null>(null, Validators.min(0)),
      priority: this.fb.control<Priority>('Medium'),
      escalationPolicy: this.fb.control('Standard'),
      serviceHours: this.fb.control<string>('Business Hours'),
    }),
    commercial: this.fb.group({
      value: this.fb.control<number | null>(null, [Validators.required, Validators.min(0)]),
      currency: this.fb.control('SAR', Validators.required),
      billingFrequency: this.fb.control<BillingFrequency>('Quarterly'),
      paymentTermsId: this.fb.control(''),
      billingMethod: this.fb.control('Fixed Fee'),
      taxProfileId: this.fb.control('TAX-STD'),
      discountPercent: this.fb.control(0, [Validators.min(0), Validators.max(100)]),
      priceEscalationPercent: this.fb.control<number | null>(null, [Validators.min(0), Validators.max(100)]),
      additionalCharges: this.fb.control(''),
    }),
    operational: this.fb.group({
      serviceRegion: this.fb.control('Central', Validators.required),
      territoryId: this.fb.control(''),
      serviceTeam: this.fb.control('HVAC Team'),
      technicianTeam: this.fb.control('HVAC Team'),
      communicationMethod: this.fb.control('Email'),
    }),
    notes: this.fb.group({ internal: this.fb.control(''), customer: this.fb.control('') }),
    changeSummary: this.fb.control(''),
  });

  protected readonly sections = SECTIONS;
  protected readonly help = AMC_FIELD_HELP;
  protected readonly lookup = AMC_LOOKUP;
  protected readonly typeOptions = AMC_TYPE_GROUPS.flatMap((g) => g.types.map((t) => ({ value: t, label: t, hint: g.group })));
  protected readonly frequencyOptions = toOptions(SERVICE_FREQUENCIES);
  protected readonly windowOptions = toOptions(SERVICE_WINDOWS);
  protected readonly dayOptions = toOptions(WEEK_DAYS);
  protected readonly priorityOptions = toOptions(PRIORITIES);
  protected readonly escalationOptions = toOptions(ESCALATION_POLICIES);
  protected readonly serviceHourOptions = toOptions(SERVICE_HOURS);
  protected readonly billingFrequencyOptions = toOptions(BILLING_FREQUENCIES);
  protected readonly billingMethodOptions = toOptions(BILLING_METHODS);
  protected readonly communicationOptions = toOptions(COMMUNICATION_METHODS);
  protected readonly docTypeOptions = toOptions(['AMC Document', 'Customer PO', 'Quotation', 'Supporting Document'] as const);
  protected readonly statusTone = AMC_STATUS_TONE;
  protected readonly formatFileSize = formatFileSize;
  protected readonly autoLimit = AMC_RULES.autoApprovalLimit.toLocaleString('en-US');

  protected readonly value = toSignal(this.form.valueChanges.pipe(startWith(null), map(() => this.form.getRawValue())), { initialValue: this.form.getRawValue() });
  private readonly formEvents = toSignal(this.form.events.pipe(map(() => Symbol())));
  protected readonly existing = rxResource({ params: () => this.amcId(), stream: ({ params }) => this.api.get(params) });
  protected readonly existingDocs = computed(() => (this.existing.hasValue() ? (this.existing.value()?.documents ?? []) : []));
  protected readonly readOnly = computed(() => {
    const a = this.existing.hasValue() ? this.existing.value() : undefined;
    return !!a && ['Expired', 'Terminated', 'Renewed', 'Cancelled', 'Archived'].includes(a.effectiveStatus);
  });
  private readonly customer = computed(() => this.value().customer.customerId || null);
  protected readonly contractOptions = computed(() => this.refs.contractOptions(this.customer() ?? '__none__'));
  protected readonly siteOptions = computed(() => this.refs.siteOptions(this.customer() ?? '__none__'));
  protected readonly assetOptions = computed(() => this.refs.assetOptions(this.customer() ?? '__none__', strings(this.value().scope.siteIds)));
  protected readonly excludedAssetOptions = computed(() => this.refs.assetOptions(this.customer() ?? '__none__', strings(this.value().scope.siteIds)).filter((o) => !this.value().scope.assetIds.includes(o.value as string)));
  protected readonly suggestedVisits = computed(() => {
    const v = this.value();
    if (!v.period.startDate || !v.period.endDate) return null;
    const years = Math.max(0.25, (new Date(v.period.endDate).getTime() - new Date(v.period.startDate).getTime()) / (365 * 86_400_000));
    const perYear = FREQUENCY_PER_YEAR[v.maintenance.serviceFrequency];
    return perYear ? Math.round(Math.max(1, v.scope.siteIds.length) * perYear * years) : null;
  });
  protected readonly pendingDocs = signal<readonly { name: string; size: number; type: AmcDocument['type'] }[]>([]);
  protected readonly docType = signal<string | number | null>('AMC Document');
  protected readonly saving = signal(false);
  private saved = false;
  private patching = false;
  private prefilled = false;

  constructor() {
    effect(() => {
      const current = this.existing.hasValue() ? this.existing.value() : undefined;
      if (current) untracked(() => this.patch(current));
    });
    effect(() => {
      if (this.readOnly()) untracked(() => this.form.disable({ emitEvent: false }));
    });
    effect(() => {
      const customerId = this.customerId();
      if (this.prefilled || this.amcId() || !customerId || !this.refs.data().customers.length) return;
      this.prefilled = true;
      untracked(() => {
        this.form.controls.customer.controls.customerId.setValue(customerId);
        if (this.siteId()) this.form.controls.scope.controls.siteIds.setValue([this.siteId()!]);
        if (this.contractId()) this.form.controls.identification.controls.parentContractId.setValue(this.contractId()!);
      });
    });
    this.form.controls.customer.controls.customerId.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      const c = this.refs.customer(id);
      if (!c || this.patching) return;
      const sla = this.refs.data().slas.find((s) => s.id === c.defaultSlaId);
      this.form.patchValue({
        customer: { legalEntity: c.legalName, primaryContact: c.primaryContact, accountManagerId: c.accountManagerId ?? '' },
        commercial: { currency: c.currency, paymentTermsId: c.paymentTermsId ?? '', taxProfileId: c.taxProfileId ?? '' },
        operational: { serviceRegion: c.serviceRegion, territoryId: c.territoryId ?? '' },
        sla: { slaId: sla?.id ?? '', responseHours: sla?.responseHours ?? null, resolutionHours: sla?.resolutionHours ?? null },
        identification: { parentContractId: this.contractId() ?? '' },
        scope: { siteIds: this.siteId() ? [this.siteId()!] : [], assetIds: [] },
      });
    });
    this.form.controls.sla.controls.slaId.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      const s = this.refs.data().slas.find((x) => x.id === id);
      if (s && !this.patching) this.form.patchValue({ sla: { responseHours: s.responseHours, resolutionHours: s.resolutionHours } });
    });
    this.form.controls.identification.controls.parentContractId.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      const c = this.refs.data().contracts.find((x) => x.id === id);
      if (c && !this.patching && !this.form.controls.identification.controls.title.dirty) this.form.controls.identification.controls.title.setValue(c.title);
    });
  }

  ngOnInit(): void {
    if (this.amcId()) return;
    void firstValueFrom(this.api.nextNumber()).then((n) => this.form.controls.identification.controls.number.setValue(n));
    const start = new Date().toISOString().slice(0, 10);
    const end = new Date(Date.now() + 364 * 86_400_000).toISOString().slice(0, 10);
    this.form.patchValue({ customer: { contractManagerId: this.refs.data().currentUser.id || 'USR-10' }, period: { startDate: start, endDate: end, renewalDate: new Date(Date.now() + 304 * 86_400_000).toISOString().slice(0, 10) } });
  }

  hasUnsavedChanges(): boolean {
    return !this.saved && this.form.dirty;
  }

  protected sectionInvalid(id: Section): boolean {
    this.formEvents();
    const key = id === 'documents' ? 'notes' : id;
    const control = this.form.controls[key];
    return control.invalid && control.touched;
  }

  protected scrollTo(id: string): void {
    this.host.nativeElement.querySelector(`#section-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected useSuggestedVisits(): void {
    if (this.suggestedVisits() !== null) this.form.controls.maintenance.controls.visitsIncluded.setValue(this.suggestedVisits()!);
  }

  protected onFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    const type = (this.docType() ?? 'Supporting Document') as AmcDocument['type'];
    this.pendingDocs.update((list) => [...list, ...Array.from(input.files ?? []).map((f) => ({ name: f.name, size: f.size, type }))]);
    input.value = '';
    this.form.markAsDirty();
  }

  private patch(a: AmcListItem): void {
    this.patching = true;
    this.form.patchValue({
      identification: { number: a.number, title: a.title, type: a.type, parentContractId: a.parentContractId ?? '', externalReference: a.externalReference },
      customer: { ...a.customer, accountManagerId: a.customer.accountManagerId ?? '' },
      period: { ...a.period, renewalDate: a.period.renewalDate ?? '' },
      scope: {
        siteIds: [...a.scope.siteIds], assetIds: [...a.scope.assetIds], assetCategories: [...a.scope.assetCategories], serviceIds: [...a.scope.serviceIds], serviceCategories: [...a.scope.serviceCategories],
        excludedSiteIds: [...a.scope.excludedSiteIds], excludedAssetIds: [...a.scope.excludedAssetIds], excludedServiceIds: [...a.scope.excludedServiceIds],
      },
      maintenance: { ...a.maintenance, preferredDays: [...a.maintenance.preferredDays] },
      labor: a.labor,
      parts: a.parts,
      limits: { maxHours: a.limits.maxHours, maxCallOuts: a.limits.maxCallOuts },
      sla: { ...a.sla, slaId: a.sla.slaId ?? '' },
      commercial: { ...a.commercial, paymentTermsId: a.commercial.paymentTermsId ?? '', taxProfileId: a.commercial.taxProfileId ?? '' },
      operational: { ...a.operational, territoryId: a.operational.territoryId ?? '' },
      notes: a.notes,
    });
    this.form.controls.identification.controls.number.disable({ emitEvent: false });
    this.form.controls.customer.controls.customerId.disable({ emitEvent: false });
    this.form.markAsPristine();
    this.patching = false;
  }

  protected async save(intent: 'draft' | 'activate' | 'approval'): Promise<void> {
    if (this.saving() || this.readOnly()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.notify.error('Please review the highlighted fields before saving.', 'Some fields need attention');
      return;
    }
    this.saving.set(true);
    try {
      const id = this.amcId();
      const payload = this.toUpsert();
      const amc = await firstValueFrom(id ? this.api.update(id, payload, this.form.controls.changeSummary.value.trim()) : this.api.create(payload));
      for (const d of this.pendingDocs()) await firstValueFrom(this.api.uploadDocument(amc.id, d.type, d));
      this.saved = true;
      if (intent === 'approval') await firstValueFrom(this.api.submitForApproval(amc.id));
      let message = `${amc.number} ${id ? 'saved' : 'created'}.`;
      if (intent === 'activate') {
        const active = await firstValueFrom(this.api.activate(amc.id));
        message = active.status === 'Active' ? `${amc.number} saved and activated — maintenance schedule generated.` : `${amc.number} approved — activates on ${active.period.startDate}.`;
      }
      this.notify.success(intent === 'approval' ? `${amc.number} submitted for approval.` : message);
      void this.router.navigate(['/app/amc-agreements', amc.id]);
    } catch (error) {
      this.notify.error((error as Error).message, 'Could not complete the action');
      if (this.saved) void this.router.navigate(['/app/amc-agreements', this.form.controls.identification.controls.number.value]);
    } finally {
      this.saving.set(false);
    }
  }

  private toUpsert(): AmcUpsert {
    const v = this.form.getRawValue();
    const nul = (x: string) => x || null;
    return {
      number: v.identification.number,
      title: v.identification.title.trim(),
      type: v.identification.type,
      parentContractId: nul(v.identification.parentContractId),
      externalReference: v.identification.externalReference,
      customer: { ...v.customer, accountManagerId: nul(v.customer.accountManagerId) },
      period: { ...v.period, renewalDate: nul(v.period.renewalDate) },
      scope: {
        siteIds: strings(v.scope.siteIds), assetIds: strings(v.scope.assetIds), assetCategories: strings(v.scope.assetCategories), serviceIds: strings(v.scope.serviceIds), serviceCategories: strings(v.scope.serviceCategories),
        excludedSiteIds: strings(v.scope.excludedSiteIds), excludedAssetIds: strings(v.scope.excludedAssetIds), excludedServiceIds: strings(v.scope.excludedServiceIds),
      },
      maintenance: { ...v.maintenance, visitsIncluded: Number(v.maintenance.visitsIncluded), visitDurationHours: Number(v.maintenance.visitDurationHours), preferredDays: strings(v.maintenance.preferredDays) },
      labor: v.labor,
      parts: v.parts,
      sla: { ...v.sla, slaId: nul(v.sla.slaId) },
      commercial: { ...v.commercial, value: Number(v.commercial.value ?? 0), paymentTermsId: nul(v.commercial.paymentTermsId), taxProfileId: nul(v.commercial.taxProfileId), discountPercent: Number(v.commercial.discountPercent ?? 0) },
      operational: { ...v.operational, territoryId: nul(v.operational.territoryId) },
      limits: { maxHours: v.limits.maxHours, maxPartsValue: v.parts.partsIncluded ? v.parts.partsCostLimit : null, maxCallOuts: v.limits.maxCallOuts },
      notes: v.notes,
      documents: this.existingDocs(),
    };
  }
}
