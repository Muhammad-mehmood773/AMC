import { ChangeDetectionStrategy, Component, ElementRef, type OnInit, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { rxResource, takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
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
import { SlaReferenceStore } from '../../data/sla-reference.store';
import { SlaApi } from '../../data/sla.api';
import { SLA_LOOKUP } from '../../data/sla.lookups';
import { SLA_FIELD_HELP } from '../../data/field-help';
import { SLA_STATUS_TONE } from '../../models/display';
import {
  BILLING_IMPACTS,
  CUSTOMER_SEGMENTS,
  ESCALATION_POLICIES,
  PRIORITIES,
  REQUEST_TYPES,
  SERVICE_HOUR_MODES,
  SLA_TYPE_GROUPS,
  TIME_UNITS,
  UNIT_MINUTES,
  WORK_ORDER_TYPES,
  type Priority,
  type SlaDocument,
  type SlaListItem,
  type SlaUpsert,
  type TimeUnit,
} from '../../models/sla.model';

type Section = 'identification' | 'customer' | 'contract' | 'validity' | 'scope' | 'response' | 'resolution' | 'priorities' | 'hours' | 'escalation' | 'commercial' | 'documents';

const SECTIONS: readonly { id: Section; label: string; icon: IconName }[] = [
  { id: 'identification', label: 'Identification', icon: 'clock' },
  { id: 'customer', label: 'Customer', icon: 'building' },
  { id: 'contract', label: 'Contract', icon: 'file-text' },
  { id: 'validity', label: 'Validity', icon: 'calendar' },
  { id: 'scope', label: 'Service scope', icon: 'list' },
  { id: 'response', label: 'Response targets', icon: 'send' },
  { id: 'resolution', label: 'Resolution targets', icon: 'check-circle' },
  { id: 'priorities', label: 'Priority targets', icon: 'layers' },
  { id: 'hours', label: 'Service hours', icon: 'calendar-check' },
  { id: 'escalation', label: 'Escalation', icon: 'alert-triangle' },
  { id: 'commercial', label: 'Commercial', icon: 'wallet' },
  { id: 'documents', label: 'Documents & notes', icon: 'paperclip' },
];

const strings = (v: readonly (string | number)[]) => v.map(String);
const toUnit = (minutes: number | null, unit: TimeUnit) => (minutes === null ? null : Math.round((minutes / UNIT_MINUTES[unit]) * 100) / 100);
const fromUnit = (value: number | null, unit: TimeUnit) => (value === null || value === undefined || (value as unknown) === '' ? null : Math.round(Number(value) * UNIT_MINUTES[unit]));

@Component({
  selector: 'amc-sla-form-page',
  imports: [DatePicker, ErrorState, FormField, Icon, LookupSelect, MultiSelect, PageHeader, Panel, ReactiveFormsModule, RouterLink, Select, Skeleton, Spinner, StatusBadge, Switch],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sla-form.page.html',
})
export class SlaFormPage implements HasUnsavedChanges, OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(SlaApi);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationPort);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly refs = inject(SlaReferenceStore);

  readonly slaId = input<string>();
  readonly customerId = input<string>();
  readonly amcId = input<string>();
  protected readonly isEdit = computed(() => !!this.slaId());

  private pair() {
    return this.fb.group({ response: this.fb.control<number | null>(null, [Validators.required, Validators.min(0.01)]), resolution: this.fb.control<number | null>(null, [Validators.required, Validators.min(0.01)]) });
  }

  protected readonly form = this.fb.group({
    identification: this.fb.group({
      number: this.fb.control('', Validators.required),
      name: this.fb.control('', [Validators.required, Validators.maxLength(120)]),
      type: this.fb.control('Customer SLA', Validators.required),
      description: this.fb.control(''),
      parentSlaId: this.fb.control(''),
      externalReference: this.fb.control(''),
    }),
    customer: this.fb.group({ customerId: this.fb.control(''), legalEntity: this.fb.control(''), segment: this.fb.control('Standard'), accountManagerId: this.fb.control(''), contractManagerId: this.fb.control(''), primaryContact: this.fb.control('') }),
    contract: this.fb.group({ contractId: this.fb.control(''), amcId: this.fb.control(''), contractLine: this.fb.control(''), contractStart: this.fb.control(''), contractEnd: this.fb.control('') }),
    validity: this.fb.group({ effectiveDate: this.fb.control('', Validators.required), expiryDate: this.fb.control(''), renewalDate: this.fb.control(''), noticePeriodDays: this.fb.control(30, Validators.min(0)), autoRenewal: this.fb.control(false), renewalTermMonths: this.fb.control<number | null>(12) }),
    scope: this.fb.group({
      serviceIds: this.fb.control<(string | number)[]>([]), serviceCategories: this.fb.control<(string | number)[]>([]), serviceTypes: this.fb.control<(string | number)[]>([]), servicePriority: this.fb.control(''),
      requestTypes: this.fb.control<(string | number)[]>(['Breakdown', 'Service Request']), workOrderTypes: this.fb.control<(string | number)[]>(['Corrective']),
    }),
    response: this.fb.group({ firstResponse: this.fb.control<number | null>(4), acknowledgement: this.fb.control<number | null>(0.25), assignment: this.fb.control<number | null>(2), onSiteArrival: this.fb.control<number | null>(6), unit: this.fb.control<TimeUnit>('Hours'), calendarId: this.fb.control('CAL-KSA-BH', Validators.required) }),
    resolution: this.fb.group({ resolution: this.fb.control<number | null>(24), restoration: this.fb.control<number | null>(12), closure: this.fb.control<number | null>(36), unit: this.fb.control<TimeUnit>('Hours'), calendarId: this.fb.control('CAL-KSA-BH', Validators.required) }),
    priorities: this.fb.group({ Critical: this.pair(), High: this.pair(), Medium: this.pair(), Low: this.pair() }),
    hours: this.fb.group({ calendarId: this.fb.control('CAL-KSA-BH', Validators.required), mode: this.fb.control('Business Hours'), afterHoursSupport: this.fb.control(false), holidayCalendar: this.fb.control('KSA Public Holidays'), weekendRules: this.fb.control('Friday and Saturday are non-working.') }),
    escalation: this.fb.group({ policy: this.fb.control('Standard'), first: this.fb.control('Service Supervisor'), second: this.fb.control('Service Manager'), management: this.fb.control('Operations Director'), percentage: this.fb.control(90, [Validators.min(1), Validators.max(300)]), timeMinutes: this.fb.control<number | null>(null), recipients: this.fb.control('') }),
    commercial: this.fb.group({ value: this.fb.control(0, Validators.min(0)), currency: this.fb.control('SAR'), billingImpact: this.fb.control('None'), penaltyApplicable: this.fb.control(false), serviceCreditApplicable: this.fb.control(false), penaltyRules: this.fb.control(''), serviceCreditRules: this.fb.control(''), penaltyPercent: this.fb.control(0, [Validators.min(0), Validators.max(100)]), penaltyCapPercent: this.fb.control(0, [Validators.min(0), Validators.max(100)]) }),
    notes: this.fb.group({ internal: this.fb.control(''), customer: this.fb.control('') }),
    changeSummary: this.fb.control(''),
  });

  protected readonly sections = SECTIONS;
  protected readonly help = SLA_FIELD_HELP;
  protected readonly lookup = SLA_LOOKUP;
  protected readonly priorities = PRIORITIES;
  protected readonly typeOptions = SLA_TYPE_GROUPS.flatMap((g) => g.types.map((t) => ({ value: t, label: t, hint: g.group })));
  protected readonly segmentOptions = toOptions(CUSTOMER_SEGMENTS);
  protected readonly unitOptions = toOptions(TIME_UNITS);
  protected readonly priorityOptions = toOptions(PRIORITIES);
  protected readonly requestTypeOptions = toOptions(REQUEST_TYPES);
  protected readonly woTypeOptions = toOptions(WORK_ORDER_TYPES);
  protected readonly modeOptions = toOptions(SERVICE_HOUR_MODES);
  protected readonly billingImpactOptions = toOptions(BILLING_IMPACTS);
  protected readonly escalationOptions = toOptions(ESCALATION_POLICIES);
  protected readonly docTypeOptions = toOptions(['SLA Document', 'Contract Attachment', 'Customer Approval', 'Supporting Document'] as const);
  protected readonly statusTone = SLA_STATUS_TONE;
  protected readonly formatFileSize = formatFileSize;

  protected readonly value = toSignal(this.form.valueChanges.pipe(startWith(null), map(() => this.form.getRawValue())), { initialValue: this.form.getRawValue() });
  private readonly formEvents = toSignal(this.form.events.pipe(map(() => Symbol())));
  protected readonly existing = rxResource({ params: () => this.slaId(), stream: ({ params }) => this.api.get(params) });
  protected readonly existingDocs = computed(() => (this.existing.hasValue() ? (this.existing.value()?.documents ?? []) : []));
  protected readonly readOnly = computed(() => {
    const s = this.existing.hasValue() ? this.existing.value() : undefined;
    return !!s && ['Expired', 'Renewed', 'Cancelled', 'Archived'].includes(s.effectiveStatus);
  });
  protected readonly customer = computed(() => this.value().customer.customerId || null);
  protected readonly parentOptions = computed(() => this.refs.slaOptions().filter((o) => o.value !== this.slaId()));
  protected readonly calendarPreview = computed(() => this.refs.calendars().find((c) => c.id === this.value().hours.calendarId));
  protected readonly pendingDocs = signal<readonly { name: string; size: number; type: SlaDocument['type'] }[]>([]);
  protected readonly docType = signal<string | number | null>('SLA Document');
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
      if (this.prefilled || this.slaId() || !this.refs.data().customers.length || (!this.customerId() && !this.amcId())) return;
      this.prefilled = true;
      untracked(() => {
        const amc = this.refs.data().amcs.find((a) => a.id === this.amcId());
        this.form.controls.customer.controls.customerId.setValue(amc?.customerId ?? this.customerId() ?? '');
        if (amc) this.form.patchValue({ identification: { type: 'AMC SLA', name: `${amc.name} SLA` }, contract: { amcId: amc.id, contractId: amc.contractId ?? '' } });
      });
    });
    const c = this.form.controls;
    c.customer.controls.customerId.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      const cust = this.refs.customer(id);
      if (!cust || this.patching) return;
      this.form.patchValue({ customer: { legalEntity: cust.legalName, segment: cust.segment, accountManagerId: cust.accountManagerId ?? '', primaryContact: cust.primaryContact }, commercial: { currency: cust.currency } });
    });
    c.contract.controls.amcId.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      const amc = this.refs.data().amcs.find((a) => a.id === id);
      if (!amc || this.patching) return;
      this.form.patchValue({ contract: { contractId: amc.contractId ?? '', contractStart: amc.startDate, contractEnd: amc.endDate }, validity: { effectiveDate: amc.startDate, expiryDate: amc.endDate } });
    });
    c.contract.controls.contractId.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      const k = this.refs.data().contracts.find((x) => x.id === id);
      if (k && !this.patching && k.startDate) this.form.patchValue({ contract: { contractStart: k.startDate, contractEnd: k.endDate } });
    });
    c.hours.controls.calendarId.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      const cal = this.refs.calendars().find((x) => x.id === id);
      if (!cal || this.patching) return;
      this.form.patchValue({ hours: { mode: cal.type === '24x7' ? '24x7' : cal.type === 'Extended Business Hours' ? 'Extended Business Hours' : 'Business Hours', holidayCalendar: cal.holidayCalendar, weekendRules: cal.weekendRules, afterHoursSupport: cal.type === '24x7' }, response: { calendarId: id }, resolution: { calendarId: id } });
    });
    c.priorities.controls.Medium.valueChanges.pipe(takeUntilDestroyed()).subscribe((m) => {
      if (this.patching) return;
      const r = this.form.controls.response;
      const s = this.form.controls.resolution;
      if (m.response && !r.controls.firstResponse.dirty) r.controls.firstResponse.setValue(toUnit(m.response * 60, r.controls.unit.value), { emitEvent: false });
      if (m.resolution && !s.controls.resolution.dirty) s.controls.resolution.setValue(toUnit(m.resolution * 60, s.controls.unit.value), { emitEvent: false });
    });
  }

  ngOnInit(): void {
    if (this.slaId()) return;
    void firstValueFrom(this.api.nextNumber()).then((n) => this.form.controls.identification.controls.number.setValue(n));
    this.form.patchValue({ validity: { effectiveDate: new Date().toISOString().slice(0, 10) }, customer: { contractManagerId: 'USR-10' }, priorities: { Critical: { response: 2, resolution: 8 }, High: { response: 3, resolution: 16 }, Medium: { response: 4, resolution: 24 }, Low: { response: 8, resolution: 48 } } });
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

  protected onFiles(event: Event): void {
    const el = event.target as HTMLInputElement;
    const type = (this.docType() ?? 'Supporting Document') as SlaDocument['type'];
    this.pendingDocs.update((list) => [...list, ...Array.from(el.files ?? []).map((f) => ({ name: f.name, size: f.size, type }))]);
    el.value = '';
    this.form.markAsDirty();
  }

  private patch(s: SlaListItem): void {
    this.patching = true;
    const ru = s.response.unit;
    const su = s.resolution.unit;
    this.form.patchValue({
      identification: { number: s.number, name: s.name, type: s.type, description: s.description, parentSlaId: s.parentSlaId ?? '', externalReference: s.externalReference },
      customer: { customerId: s.customer.customerId ?? '', legalEntity: s.customer.legalEntity, segment: s.customer.segment, accountManagerId: s.customer.accountManagerId ?? '', contractManagerId: s.customer.contractManagerId ?? '', primaryContact: s.customer.primaryContact },
      contract: { contractId: s.contract.contractId ?? '', amcId: s.contract.amcId ?? '', contractLine: s.contract.contractLine, contractStart: s.contract.contractStart ?? '', contractEnd: s.contract.contractEnd ?? '' },
      validity: { ...s.validity, expiryDate: s.validity.expiryDate ?? '', renewalDate: s.validity.renewalDate ?? '' },
      scope: { serviceIds: [...s.scope.serviceIds], serviceCategories: [...s.scope.serviceCategories], serviceTypes: [...s.scope.serviceTypes], servicePriority: s.scope.servicePriority ?? '', requestTypes: [...s.scope.requestTypes], workOrderTypes: [...s.scope.workOrderTypes] },
      response: { firstResponse: toUnit(s.response.firstResponse, ru), acknowledgement: toUnit(s.response.acknowledgement, ru), assignment: toUnit(s.response.assignment, ru), onSiteArrival: toUnit(s.response.onSiteArrival, ru), unit: ru, calendarId: s.response.calendarId },
      resolution: { resolution: toUnit(s.resolution.resolution, su), restoration: toUnit(s.resolution.restoration, su), closure: toUnit(s.resolution.closure, su), unit: su, calendarId: s.resolution.calendarId },
      priorities: Object.fromEntries(PRIORITIES.map((p) => [p, { response: toUnit(s.priorityTargets[p].response, 'Hours'), resolution: toUnit(s.priorityTargets[p].resolution, 'Hours') }])),
      hours: s.serviceHours,
      escalation: s.escalation,
      commercial: s.commercial,
      notes: s.notes,
    });
    this.form.controls.identification.controls.number.disable({ emitEvent: false });
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
      const id = this.slaId();
      const sla = await firstValueFrom(id ? this.api.update(id, this.toUpsert(), this.form.controls.changeSummary.value.trim()) : this.api.create(this.toUpsert()));
      for (const d of this.pendingDocs()) await firstValueFrom(this.api.uploadDocument(sla.id, d.type, d));
      this.saved = true;
      this.refs.refresh();
      if (intent === 'approval') await firstValueFrom(this.api.submitForApproval(sla.id));
      let message = `${sla.number} ${id ? 'saved' : 'created'}.`;
      if (intent === 'activate') {
        const a = await firstValueFrom(this.api.activate(sla.id));
        message = a.status === 'Active' ? `${sla.number} saved and activated.` : `${sla.number} activates on ${a.validity.effectiveDate}.`;
      }
      this.notify.success(intent === 'approval' ? `${sla.number} submitted for approval.` : message);
      void this.router.navigate(['/app/sla', sla.id]);
    } catch (error) {
      this.notify.error((error as Error).message, 'Could not complete the action');
      if (this.saved) void this.router.navigate(['/app/sla', this.form.controls.identification.controls.number.value]);
    } finally {
      this.saving.set(false);
    }
  }

  private toUpsert(): SlaUpsert {
    const v = this.form.getRawValue();
    const nul = (x: string) => x || null;
    const ru = v.response.unit;
    const su = v.resolution.unit;
    return {
      number: v.identification.number, name: v.identification.name.trim(), type: v.identification.type, description: v.identification.description, parentSlaId: nul(v.identification.parentSlaId), externalReference: v.identification.externalReference,
      customer: { customerId: nul(v.customer.customerId), legalEntity: v.customer.legalEntity, segment: v.customer.segment, accountManagerId: nul(v.customer.accountManagerId), contractManagerId: nul(v.customer.contractManagerId), primaryContact: v.customer.primaryContact },
      contract: { contractId: nul(v.contract.contractId), amcId: nul(v.contract.amcId), contractLine: v.contract.contractLine, contractStart: nul(v.contract.contractStart), contractEnd: nul(v.contract.contractEnd) },
      validity: { ...v.validity, expiryDate: nul(v.validity.expiryDate), renewalDate: nul(v.validity.renewalDate) },
      scope: { serviceIds: strings(v.scope.serviceIds), serviceCategories: strings(v.scope.serviceCategories), serviceTypes: strings(v.scope.serviceTypes), servicePriority: (v.scope.servicePriority || null) as Priority | null, requestTypes: strings(v.scope.requestTypes), workOrderTypes: strings(v.scope.workOrderTypes) },
      response: { firstResponse: fromUnit(v.response.firstResponse, ru), acknowledgement: fromUnit(v.response.acknowledgement, ru), assignment: fromUnit(v.response.assignment, ru), onSiteArrival: fromUnit(v.response.onSiteArrival, ru), unit: ru, calendarId: v.response.calendarId },
      resolution: { resolution: fromUnit(v.resolution.resolution, su), restoration: fromUnit(v.resolution.restoration, su), closure: fromUnit(v.resolution.closure, su), unit: su, calendarId: v.resolution.calendarId },
      priorityTargets: Object.fromEntries(PRIORITIES.map((p) => [p, { response: fromUnit(v.priorities[p].response, 'Hours') ?? 0, resolution: fromUnit(v.priorities[p].resolution, 'Hours') ?? 0 }])) as SlaUpsert['priorityTargets'],
      serviceHours: v.hours,
      escalation: { ...v.escalation, percentage: Number(v.escalation.percentage) },
      commercial: { ...v.commercial, value: Number(v.commercial.value) || 0, penaltyPercent: Number(v.commercial.penaltyPercent) || 0, penaltyCapPercent: Number(v.commercial.penaltyCapPercent) || 0 },
      notes: v.notes,
    };
  }
}
