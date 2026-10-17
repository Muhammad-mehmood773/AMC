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
import { formatCurrency, formatFileSize } from '@shared/utils/format';
import { filter, firstValueFrom, map, startWith } from 'rxjs';
import { ContractReferenceStore } from '../../data/contract-reference.store';
import { ContractApi, TemplateApi } from '../../data/contract.api';
import { APPROVAL_LEVELS, CONTRACT_RULES } from '../../data/contract.config';
import { CONTRACT_LOOKUP } from '../../data/contract.lookups';
import { CONTRACT_FIELD_HELP } from '../../data/field-help';
import {
  BILLING_FREQUENCIES,
  BILLING_METHODS,
  CONTRACT_TYPES,
  DISPUTE_METHODS,
  EDITABLE_STATUSES,
  RISK_LEVELS,
  SERVICE_WINDOWS,
  type BillingFrequency,
  type ContractListItem,
  type ContractType,
  type ContractUpsert,
  type RiskLevel,
  isCustomerContract,
} from '../../models/contract.model';
import { CONTRACT_STATUS_TONE } from '../../models/display';
import { DOCUMENT_TYPES, type DocumentType } from '../../models/workflow.model';

type Section = 'identification' | 'parties' | 'period' | 'scope' | 'commercial' | 'financial' | 'service' | 'legal' | 'documents' | 'notes';

const SECTIONS: readonly { id: Section; label: string; icon: IconName }[] = [
  { id: 'identification', label: 'Identification', icon: 'file-text' },
  { id: 'parties', label: 'Parties', icon: 'users' },
  { id: 'period', label: 'Contract period', icon: 'calendar' },
  { id: 'scope', label: 'Scope', icon: 'layers' },
  { id: 'commercial', label: 'Commercial', icon: 'wallet' },
  { id: 'financial', label: 'Financial', icon: 'trending-up' },
  { id: 'service', label: 'Service', icon: 'wrench' },
  { id: 'legal', label: 'Legal & compliance', icon: 'shield-check' },
  { id: 'documents', label: 'Documents', icon: 'paperclip' },
  { id: 'notes', label: 'Notes', icon: 'sticky-note' },
];

function periodRange(group: AbstractControl): ValidationErrors | null {
  const start = group.get('startDate')?.value as string;
  const end = group.get('endDate')?.value as string;
  return start && end && end < start ? { range: true } : null;
}

const strings = (values: readonly (string | number)[]) => values.map(String);

interface PendingDoc {
  readonly id: string;
  readonly name: string;
  readonly size: number;
  readonly mime: string;
  readonly type: DocumentType;
}

@Component({
  selector: 'amc-contract-form-page',
  imports: [DatePicker, ErrorState, FormField, Icon, LookupSelect, MultiSelect, PageHeader, Panel, ReactiveFormsModule, RouterLink, Select, Skeleton, Spinner, StatusBadge, Switch],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './contract-form.page.html',
})
export class ContractFormPage implements HasUnsavedChanges, OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(ContractApi);
  private readonly templatesApi = inject(TemplateApi);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationPort);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly refs = inject(ContractReferenceStore);

  readonly contractId = input<string>();
  readonly customerId = input<string>();
  readonly siteId = input<string>();
  protected readonly isEdit = computed(() => !!this.contractId());

  protected readonly form = this.fb.group({
    identification: this.fb.group({
      number: this.fb.control('', Validators.required),
      title: this.fb.control('', [Validators.required, Validators.maxLength(150)]),
      type: this.fb.control<ContractType>('AMC Contract', Validators.required),
      category: this.fb.control(''),
      parentContractId: this.fb.control(''),
      externalReference: this.fb.control(''),
      templateId: this.fb.control(''),
      clauseIds: this.fb.control<(string | number)[]>([]),
      riskLevel: this.fb.control<RiskLevel>('Low'),
      signatureRequired: this.fb.control<boolean>(CONTRACT_RULES.signatureRequiredByDefault),
    }),
    parties: this.fb.group({
      customerId: this.fb.control(''),
      legalEntity: this.fb.control(''),
      contractingOrganizationId: this.fb.control('CMP-01', Validators.required),
      branchId: this.fb.control(''),
      vendorPartner: this.fb.control(''),
      primaryContact: this.fb.control(''),
      ownerId: this.fb.control('', Validators.required),
      managerId: this.fb.control('', Validators.required),
      accountManagerId: this.fb.control(''),
    }),
    period: this.fb.group(
      {
        timeBound: this.fb.control(true),
        effectiveDate: this.fb.control(''),
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
      scope: this.fb.control(''),
      serviceIds: this.fb.control<(string | number)[]>([]),
      siteIds: this.fb.control<(string | number)[]>([]),
      assetIds: this.fb.control<(string | number)[]>([]),
      serviceCategories: this.fb.control<(string | number)[]>([]),
      slaId: this.fb.control(''),
      maintenanceRequirements: this.fb.control(''),
      exclusions: this.fb.control(''),
    }),
    commercial: this.fb.group({
      value: this.fb.control<number | null>(null, [Validators.required, Validators.min(0)]),
      currency: this.fb.control('SAR', Validators.required),
      billingFrequency: this.fb.control<BillingFrequency>('Quarterly', Validators.required),
      paymentTermsId: this.fb.control(''),
      billingMethod: this.fb.control('Fixed Fee'),
      taxProfileId: this.fb.control('TAX-STD'),
      discountPercent: this.fb.control(0, [Validators.min(0), Validators.max(100)]),
      deposit: this.fb.control<number | null>(null, Validators.min(0)),
      advancePayment: this.fb.control<number | null>(null, Validators.min(0)),
      priceEscalationPercent: this.fb.control<number | null>(null, [Validators.min(0), Validators.max(100)]),
      priceRevisionDate: this.fb.control(''),
    }),
    financial: this.fb.group({
      estimatedRevenue: this.fb.control<number | null>(null, Validators.min(0)),
      estimatedCost: this.fb.control<number | null>(null, Validators.min(0)),
      billingAccount: this.fb.control(''),
      revenueAccount: this.fb.control('4100-Service Revenue'),
      costCenter: this.fb.control(''),
      profitCenter: this.fb.control(''),
    }),
    service: this.fb.group({
      serviceFrequency: this.fb.control('Quarterly'),
      includedVisits: this.fb.control<number | null>(null, Validators.min(0)),
      laborCoverage: this.fb.control(true),
      partsCoverage: this.fb.control(false),
      travelCoverage: this.fb.control(true),
      emergencyCoverage: this.fb.control(false),
      serviceWindow: this.fb.control<string>('Business Hours (08:00–17:00)'),
    }),
    legal: this.fb.group({
      governingLaw: this.fb.control('Kingdom of Saudi Arabia'),
      jurisdiction: this.fb.control(''),
      confidentiality: this.fb.control(true),
      insuranceRequirement: this.fb.control(''),
      complianceRequirements: this.fb.control(''),
      penaltyTerms: this.fb.control(''),
      liabilityLimit: this.fb.control<number | null>(null, Validators.min(0)),
      terminationConditions: this.fb.control(''),
      disputeResolution: this.fb.control('Negotiation'),
    }),
    notes: this.fb.group({
      internal: this.fb.control(''),
      customer: this.fb.control(''),
      legal: this.fb.control(''),
      manager: this.fb.control(''),
    }),
    changeSummary: this.fb.control(''),
  });

  protected readonly sections = SECTIONS;
  protected readonly help = CONTRACT_FIELD_HELP;
  protected readonly lookup = CONTRACT_LOOKUP;
  protected readonly typeOptions = toOptions(CONTRACT_TYPES);
  protected readonly riskOptions = toOptions(RISK_LEVELS);
  protected readonly billingFrequencyOptions = toOptions(BILLING_FREQUENCIES);
  protected readonly billingMethodOptions = toOptions(BILLING_METHODS);
  protected readonly windowOptions = toOptions(SERVICE_WINDOWS);
  protected readonly disputeOptions = toOptions(DISPUTE_METHODS);
  protected readonly frequencyOptions = toOptions(['Weekly', 'Monthly', 'Quarterly', 'Semi-Annual', 'Annual', 'On demand'] as const);
  protected readonly documentTypeOptions = toOptions(DOCUMENT_TYPES.filter((t) => !['Signed Contract', 'Amendment', 'Termination Notice', 'Evidence'].includes(t)));
  protected readonly statusTone = CONTRACT_STATUS_TONE;
  protected readonly formatCurrency = formatCurrency;
  protected readonly formatFileSize = formatFileSize;

  protected readonly value = toSignal(this.form.valueChanges.pipe(startWith(null), map(() => this.form.getRawValue())), { initialValue: this.form.getRawValue() });
  private readonly formEvents = toSignal(this.form.events.pipe(map(() => Symbol())));
  protected readonly existing = rxResource({ params: () => this.contractId(), stream: ({ params }) => this.api.get(params) });
  private readonly templates = rxResource({ stream: () => this.templatesApi.templates() });
  private readonly clauses = rxResource({ stream: () => this.templatesApi.clauses() });
  private readonly contracts = rxResource({ stream: () => this.api.list() });
  protected readonly existingDocs = rxResource({ params: () => this.contractId(), stream: ({ params }) => this.api.documents(params) });

  protected readonly readOnly = computed(() => {
    const c = this.existing.hasValue() ? this.existing.value() : undefined;
    return !!c && !EDITABLE_STATUSES.includes(c.status);
  });
  protected readonly customerContract = computed(() => isCustomerContract(this.value().identification.type));
  private readonly customer = computed(() => this.value().parties.customerId || null);
  protected readonly siteOptions = computed(() => this.refs.siteOptions(this.customer() ?? '__none__'));
  protected readonly assetOptions = computed(() => this.refs.assetOptions(this.customer() ?? '__none__', strings(this.value().scope.siteIds)));
  protected readonly templateOptions = computed(() =>
    (this.templates.hasValue() ? this.templates.value() : []).filter((t) => t.status === 'Active').map((t) => ({ value: t.id, label: `${t.name} · v${t.version}`, hint: `${t.contractType} · ${t.language}` })),
  );
  protected readonly clauseOptions = computed(() => (this.clauses.hasValue() ? this.clauses.value() : []).filter((c) => c.status === 'Active').map((c) => ({ value: c.id, label: `${c.code} · ${c.name}`, hint: `${c.type}${c.mandatory ? ' · Mandatory' : ''}` })));
  protected readonly parentOptions = computed(() => (this.contracts.hasValue() ? this.contracts.value() : []).filter((c) => c.id !== this.contractId() && /Framework|Master/.test(c.type)).map((c) => ({ value: c.id, label: `${c.number} · ${c.title}` })));
  protected readonly duration = computed(() => {
    const { startDate, endDate } = this.value().period;
    if (!startDate || !endDate || endDate < startDate) return null;
    const months = Math.max(1, Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / (30.44 * 86_400_000)));
    return `${months} months`;
  });
  protected readonly margin = computed(() => {
    const { estimatedRevenue, estimatedCost } = this.value().financial;
    if (!estimatedRevenue) return null;
    const m = estimatedRevenue - (estimatedCost ?? 0);
    return { amount: m, percent: Math.round((m / estimatedRevenue) * 100) };
  });
  /** Preview of the approval route this contract will need (SRS 5.12). */
  protected readonly approvalPreview = computed(() => {
    const v = this.value();
    const revenue = v.financial.estimatedRevenue ?? v.commercial.value ?? 0;
    const ctx = {
      value: v.commercial.value ?? 0, type: v.identification.type, customerType: this.refs.customer(v.parties.customerId)?.type ?? null, discountPercent: v.commercial.discountPercent ?? 0,
      marginPercent: revenue ? Math.round(((revenue - (v.financial.estimatedCost ?? 0)) / revenue) * 100) : 0,
      durationMonths: v.period.startDate && v.period.endDate ? Math.round((new Date(v.period.endDate).getTime() - new Date(v.period.startDate).getTime()) / (30.44 * 86_400_000)) : 12,
      riskLevel: v.identification.riskLevel, legalFlags: v.legal.liabilityLimit === null || v.legal.governingLaw !== 'Kingdom of Saudi Arabia',
    };
    return APPROVAL_LEVELS.map((l) => ({ name: l.name, role: l.role, reasons: l.when(ctx) })).filter((l) => l.reasons.length);
  });

  protected readonly pendingDocs = signal<readonly PendingDoc[]>([]);
  protected readonly docType = signal<string | number | null>('Contract Document');
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
      if (this.prefilled || this.contractId() || !customerId || !this.refs.data().customers.length) return;
      this.prefilled = true;
      untracked(() => {
        this.form.controls.parties.controls.customerId.setValue(customerId);
        if (this.siteId()) this.form.controls.scope.controls.siteIds.setValue([this.siteId()!]);
      });
    });
    const p = this.form.controls.parties.controls;
    p.customerId.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      if (this.patching) return;
      const c = this.refs.customer(id);
      if (!c) return;
      this.form.patchValue({
        parties: { legalEntity: c.legalName, contractingOrganizationId: c.companyId, branchId: c.branchId ?? '', primaryContact: c.primaryContact, accountManagerId: c.accountManagerId ?? '', ownerId: p.ownerId.value || (c.accountManagerId ?? '') },
        commercial: { currency: c.currency, paymentTermsId: c.paymentTermsId ?? '', taxProfileId: c.taxProfileId ?? '' },
        financial: { billingAccount: `BA-${c.code}` },
        scope: { siteIds: this.siteId() ? [this.siteId()!] : [], assetIds: [] },
      });
    });
    const id = this.form.controls.identification.controls;
    id.templateId.valueChanges.pipe(takeUntilDestroyed()).subscribe((templateId) => {
      const t = (this.templates.hasValue() ? this.templates.value() : []).find((x) => x.id === templateId);
      if (!t || this.patching) return;
      id.clauseIds.setValue([...t.defaultClauseIds]);
      if (!id.type.dirty) id.type.setValue(t.contractType as ContractType);
      this.notify.info(`Default clauses from “${t.name}” applied. Required fields: ${t.requiredFields.join(', ') || 'none'}.`);
    });
    const per = this.form.controls.period.controls;
    per.endDate.valueChanges.pipe(takeUntilDestroyed()).subscribe((end) => {
      if (end && !this.patching && !per.renewalDate.dirty) per.renewalDate.setValue(new Date(new Date(end).getTime() - 60 * 86_400_000).toISOString().slice(0, 10));
    });
    per.timeBound.valueChanges.pipe(takeUntilDestroyed()).subscribe((timeBound) => {
      for (const c of [per.startDate, per.endDate]) {
        if (timeBound) c.addValidators(Validators.required);
        else c.removeValidators(Validators.required);
        c.updateValueAndValidity({ emitEvent: false });
      }
    });
    const cm = this.form.controls.commercial.controls;
    cm.value.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      const f = this.form.controls.financial.controls;
      const l = this.form.controls.legal.controls;
      if (this.patching || value === null) return;
      if (!f.estimatedRevenue.dirty) f.estimatedRevenue.setValue(value);
      if (!l.liabilityLimit.dirty) l.liabilityLimit.setValue(value);
    });
  }

  ngOnInit(): void {
    if (this.contractId()) return;
    void firstValueFrom(this.api.nextNumber()).then((n) => this.form.controls.identification.controls.number.setValue(n));
    const user = this.refs.data().currentUser.id || 'USR-10';
    this.form.patchValue({ parties: { managerId: user, ownerId: user }, period: { startDate: new Date().toISOString().slice(0, 10), effectiveDate: new Date().toISOString().slice(0, 10) } });
  }

  hasUnsavedChanges(): boolean {
    return !this.saved && this.form.dirty;
  }

  protected sectionInvalid(id: Section): boolean {
    this.formEvents();
    if (id === 'documents') return false;
    const control = this.form.controls[id === 'scope' ? 'scope' : id];
    return control.invalid && control.touched;
  }

  protected scrollTo(id: string): void {
    this.host.nativeElement.querySelector(`#section-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected onFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    const type = (this.docType() ?? 'Supporting Document') as DocumentType;
    this.pendingDocs.update((list) => [...list, ...Array.from(input.files ?? []).map((f) => ({ id: `${Date.now()}-${f.name}`, name: f.name, size: f.size, mime: f.type || 'application/octet-stream', type }))]);
    input.value = '';
    this.form.markAsDirty();
  }

  protected removeDoc(id: string): void {
    this.pendingDocs.update((list) => list.filter((d) => d.id !== id));
  }

  private patch(c: ContractListItem): void {
    this.patching = true;
    this.form.patchValue({
      identification: { number: c.number, title: c.title, type: c.type, category: c.category, parentContractId: c.parentContractId ?? '', externalReference: c.externalReference, templateId: c.templateId ?? '', clauseIds: [...c.clauseIds], riskLevel: c.riskLevel, signatureRequired: c.signatureRequired },
      parties: { ...c.parties, customerId: c.parties.customerId ?? '', branchId: c.parties.branchId ?? '', accountManagerId: c.parties.accountManagerId ?? '' },
      period: { ...c.period, renewalDate: c.period.renewalDate ?? '' },
      scope: { ...c.scopeInfo, serviceIds: [...c.scopeInfo.serviceIds], siteIds: [...c.scopeInfo.siteIds], assetIds: [...c.scopeInfo.assetIds], serviceCategories: [...c.scopeInfo.serviceCategories], slaId: c.scopeInfo.slaId ?? '' },
      commercial: { ...c.commercial, paymentTermsId: c.commercial.paymentTermsId ?? '', taxProfileId: c.commercial.taxProfileId ?? '', priceRevisionDate: c.commercial.priceRevisionDate ?? '' },
      financial: c.financial,
      service: c.service,
      legal: c.legal,
      notes: c.notes,
    });
    this.form.controls.identification.controls.number.disable({ emitEvent: false });
    this.form.markAsPristine();
    this.patching = false;
  }

  protected async save(intent: 'draft' | 'review' | 'approval'): Promise<void> {
    if (this.saving() || this.readOnly()) return;
    this.form.markAllAsTouched();
    if (this.form.pending) await firstValueFrom(this.form.statusChanges.pipe(startWith(this.form.status), filter((s) => s !== 'PENDING')));
    if (this.form.invalid) {
      this.notify.error('Please review the highlighted fields before saving.', 'Some fields need attention');
      return;
    }
    this.saving.set(true);
    try {
      const id = this.contractId();
      const payload = this.toUpsert();
      const summary = this.form.controls.changeSummary.value.trim();
      const contract = await firstValueFrom(id ? this.api.update(id, payload, summary) : this.api.create(payload));
      for (const d of this.pendingDocs()) await firstValueFrom(this.api.uploadDocument(contract.id, d.type, { name: d.name, size: d.size, mime: d.mime }));
      this.saved = true;
      if (intent === 'review') await firstValueFrom(this.api.submitForReview(contract.id));
      if (intent === 'approval') await firstValueFrom(this.api.submitForApproval(contract.id));
      this.notify.success(`${contract.number} ${id ? `saved as version ${contract.version}` : 'created'}${intent === 'review' ? ' and submitted for review' : intent === 'approval' ? ' and submitted for approval' : ''}.`);
      void this.router.navigate(['/app/contracts', contract.id]);
    } catch (error) {
      this.notify.error((error as Error).message, 'Could not save contract');
      if (this.contractId() || this.saved) this.existing.reload();
    } finally {
      this.saving.set(false);
    }
  }

  private toUpsert(): ContractUpsert {
    const v = this.form.getRawValue();
    const nul = (x: string) => x || null;
    return {
      number: v.identification.number,
      title: v.identification.title.trim(),
      type: v.identification.type,
      category: v.identification.category,
      parentContractId: nul(v.identification.parentContractId),
      externalReference: v.identification.externalReference,
      requestId: this.existing.hasValue() ? (this.existing.value()?.requestId ?? null) : null,
      templateId: nul(v.identification.templateId),
      clauseIds: strings(v.identification.clauseIds),
      riskLevel: v.identification.riskLevel,
      signatureRequired: v.identification.signatureRequired,
      parties: { ...v.parties, customerId: nul(v.parties.customerId), branchId: nul(v.parties.branchId), accountManagerId: nul(v.parties.accountManagerId) },
      period: { ...v.period, effectiveDate: v.period.effectiveDate || v.period.startDate, renewalDate: nul(v.period.renewalDate) },
      scopeInfo: { ...v.scope, serviceIds: strings(v.scope.serviceIds), siteIds: strings(v.scope.siteIds), assetIds: strings(v.scope.assetIds), serviceCategories: strings(v.scope.serviceCategories), slaId: nul(v.scope.slaId) },
      commercial: { ...v.commercial, value: Number(v.commercial.value ?? 0), paymentTermsId: nul(v.commercial.paymentTermsId), taxProfileId: nul(v.commercial.taxProfileId), discountPercent: Number(v.commercial.discountPercent ?? 0), priceRevisionDate: nul(v.commercial.priceRevisionDate) },
      financial: { ...v.financial, estimatedRevenue: Number(v.financial.estimatedRevenue ?? v.commercial.value ?? 0), estimatedCost: Number(v.financial.estimatedCost ?? 0) },
      service: v.service,
      legal: v.legal,
      notes: v.notes,
    };
  }
}
