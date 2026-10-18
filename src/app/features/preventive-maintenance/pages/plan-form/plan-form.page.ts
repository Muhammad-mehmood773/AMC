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
import { formatDate, formatFileSize } from '@shared/utils/format';
import { firstValueFrom, map, startWith } from 'rxjs';
import { PM_FIELD_HELP } from '../../data/field-help';
import { PmReferenceStore } from '../../data/pm-reference.store';
import { PlanApi, type PreviewDate } from '../../data/pm.api';
import { PM_RULES } from '../../data/pm.config';
import { PM_LOOKUP } from '../../data/pm.lookups';
import { today } from '../../data/pm-recurrence';
import { PLAN_STATUS_TONE } from '../../models/display';
import {
  CALENDAR_RULES,
  type CalendarRule,
  FREQUENCY_TYPES,
  FREQUENCY_UNITS,
  type FrequencyType,
  type FrequencyUnit,
  HOLIDAY_HANDLING,
  MAINTENANCE_WINDOWS,
  PM_TYPE_GROUPS,
  PRIORITIES,
  type PartRequirement,
  type PlanDocument,
  type PlanListItem,
  type PlanUpsert,
  type Priority,
  STRATEGIES,
  type Strategy,
  WEEK_DAYS,
  WORK_ORDER_TYPES,
} from '../../models/plan.model';

type Section = 'identification' | 'location' | 'asset' | 'service' | 'strategy' | 'frequency' | 'scheduling' | 'resources' | 'parts' | 'procedure' | 'automation' | 'notifications' | 'documents';

const SECTIONS: readonly { id: Section; label: string; icon: IconName }[] = [
  { id: 'identification', label: 'Identification', icon: 'calendar-check' },
  { id: 'location', label: 'Customer & site', icon: 'building' },
  { id: 'asset', label: 'Asset', icon: 'box' },
  { id: 'service', label: 'Service', icon: 'list' },
  { id: 'strategy', label: 'Strategy', icon: 'layers' },
  { id: 'frequency', label: 'Frequency', icon: 'refresh' },
  { id: 'scheduling', label: 'Scheduling', icon: 'calendar' },
  { id: 'resources', label: 'Resources', icon: 'users' },
  { id: 'parts', label: 'Parts', icon: 'box' },
  { id: 'procedure', label: 'Procedure', icon: 'clipboard-list' },
  { id: 'automation', label: 'Work orders', icon: 'wrench' },
  { id: 'notifications', label: 'Notifications', icon: 'bell' },
  { id: 'documents', label: 'Documents & notes', icon: 'paperclip' },
];

const TYPE_FREQUENCY: Record<string, FrequencyType> = {
  'Daily Maintenance': 'Daily', 'Weekly Maintenance': 'Weekly', 'Bi-Weekly Maintenance': 'Bi-Weekly', 'Monthly Maintenance': 'Monthly', 'Bi-Monthly Maintenance': 'Bi-Monthly', 'Quarterly Maintenance': 'Quarterly', 'Semi-Annual Maintenance': 'Semi-Annual', 'Annual Maintenance': 'Annual', 'Custom Interval Maintenance': 'Custom',
  'Fixed Date Maintenance': 'Annual', 'Financial-Year Maintenance': 'Annual', 'Specific Day of Week': 'Weekly',
};
const TYPE_RULE: Record<string, CalendarRule> = { 'Fixed Date Maintenance': 'Fixed Date', 'Specific Day of Month': 'Specific Day of Month', 'Specific Week of Month': 'Specific Week of Month', 'Specific Day of Week': 'Specific Day of Week', 'End-of-Month Maintenance': 'End of Month', 'Start-of-Month Maintenance': 'Start of Month', 'Financial-Year Maintenance': 'Financial Year' };
const strings = (v: readonly (string | number)[]) => v.map(String);

@Component({
  selector: 'amc-plan-form-page',
  imports: [DatePicker, ErrorState, FormField, Icon, LookupSelect, MultiSelect, PageHeader, Panel, ReactiveFormsModule, RouterLink, Select, Skeleton, Spinner, StatusBadge, Switch],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './plan-form.page.html',
})
export class PlanFormPage implements HasUnsavedChanges, OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(PlanApi);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationPort);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly refs = inject(PmReferenceStore);

  readonly planId = input<string>();
  readonly assetId = input<string>();
  readonly amcId = input<string>();
  protected readonly isEdit = computed(() => !!this.planId());

  protected readonly form = this.fb.group({
    identification: this.fb.group({ number: this.fb.control(''), name: this.fb.control('', [Validators.required, Validators.maxLength(140)]), maintenanceType: this.fb.control('Quarterly Maintenance', Validators.required), description: this.fb.control(''), externalReference: this.fb.control('') }),
    location: this.fb.group({ customerId: this.fb.control('', Validators.required), legalEntity: this.fb.control(''), siteId: this.fb.control('', Validators.required), building: this.fb.control(''), floor: this.fb.control(''), area: this.fb.control(''), region: this.fb.control('') }),
    asset: this.fb.group({ assetIds: this.fb.control<(string | number)[]>([], Validators.required) }),
    service: this.fb.group({ serviceId: this.fb.control(''), serviceCategory: this.fb.control(''), contractId: this.fb.control(''), amcId: this.fb.control(''), slaId: this.fb.control(''), coveredService: this.fb.control(false), entitlement: this.fb.control('') }),
    strategy: this.fb.group({ strategy: this.fb.control<Strategy>('Time-Based'), preventive: this.fb.control(true), recurring: this.fb.control(true) }),
    frequency: this.fb.group({
      type: this.fb.control<FrequencyType>('Quarterly'), value: this.fb.control(1, Validators.min(0)), unit: this.fb.control<FrequencyUnit>('Months'), calendarRule: this.fb.control<CalendarRule>('None'), dayOfMonth: this.fb.control<number | null>(null), weekOfMonth: this.fb.control<number | null>(null),
      dayOfWeek: this.fb.control<number | null>(null), month: this.fb.control<number | null>(null), startDate: this.fb.control(today(), Validators.required), endDate: this.fb.control(''), leadTimeDays: this.fb.control<number>(PM_RULES.defaultLeadDays, Validators.min(0)), graceDays: this.fb.control<number>(PM_RULES.defaultGraceDays, Validators.min(0)), effectiveDate: this.fb.control(today()),
    }),
    scheduling: this.fb.group({ preferredDays: this.fb.control<(string | number)[]>(['Sunday', 'Monday', 'Tuesday', 'Wednesday']), preferredTime: this.fb.control('09:00'), window: this.fb.control('Business Hours (08:00–17:00)'), serviceHours: this.fb.control('Business Hours'), businessCalendar: this.fb.control('KSA Business Hours'), holidayHandling: this.fb.control('Move to next working day'), weekendHandling: this.fb.control('Friday and Saturday are non-working'), autoReschedule: this.fb.control(true), maxRescheduleDays: this.fb.control(14, Validators.min(0)) }),
    resources: this.fb.group({ skill: this.fb.control(''), certification: this.fb.control('None'), technician: this.fb.control(''), team: this.fb.control('HVAC Team'), tools: this.fb.control(''), equipment: this.fb.control('') }),
    parts: this.fb.group({ replacementParts: this.fb.control(''), materialList: this.fb.control('') }),
    procedure: this.fb.group({ checklistId: this.fb.control(''), taskIds: this.fb.control<(string | number)[]>([]), standardProcedure: this.fb.control(''), safety: this.fb.control(''), inspectionPoints: this.fb.control(''), measurements: this.fb.control(''), acceptance: this.fb.control('') }),
    automation: this.fb.group({ autoGenerate: this.fb.control(true), leadDays: this.fb.control<number>(PM_RULES.defaultLeadDays, Validators.min(0)), woType: this.fb.control('Preventive'), priority: this.fb.control<Priority>('Medium'), team: this.fb.control('HVAC Team'), technician: this.fb.control(''), autoAssign: this.fb.control(false), autoDispatch: this.fb.control(false) }),
    notifications: this.fb.group({ reminder: this.fb.control(true), reminderDays: this.fb.control(3), technician: this.fb.control(true), supervisor: this.fb.control(true), customer: this.fb.control(false), overdue: this.fb.control(true), escalation: this.fb.control(true) }),
    notes: this.fb.group({ internal: this.fb.control(''), customer: this.fb.control('') }),
    changeSummary: this.fb.control(''),
  });

  protected readonly sections = SECTIONS;
  protected readonly help = PM_FIELD_HELP;
  protected readonly lookup = PM_LOOKUP;
  protected readonly typeOptions = PM_TYPE_GROUPS.flatMap((g) => g.types.map((t) => ({ value: t, label: t, hint: g.group })));
  protected readonly strategyOptions = toOptions(STRATEGIES);
  protected readonly frequencyOptions = toOptions(FREQUENCY_TYPES);
  protected readonly unitOptions = toOptions(FREQUENCY_UNITS);
  protected readonly ruleOptions = toOptions(CALENDAR_RULES);
  protected readonly dayOptions = WEEK_DAYS.map((d, i) => ({ value: i, label: d }));
  protected readonly preferredDayOptions = toOptions(WEEK_DAYS);
  protected readonly weekOptions = [1, 2, 3, 4, 5].map((w) => ({ value: w, label: ['1st', '2nd', '3rd', '4th', '5th'][w - 1] }));
  protected readonly monthOptions = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((m, i) => ({ value: i + 1, label: m }));
  protected readonly windowOptions = toOptions(MAINTENANCE_WINDOWS);
  protected readonly holidayOptions = toOptions(HOLIDAY_HANDLING);
  protected readonly priorityOptions = toOptions(PRIORITIES);
  protected readonly woTypeOptions = toOptions(WORK_ORDER_TYPES);
  protected readonly docTypeOptions = toOptions(['Maintenance Manual', 'Manufacturer Guidelines', 'Technical Document', 'Safety Document', 'Supporting Document'] as const);
  protected readonly statusTone = PLAN_STATUS_TONE;
  protected readonly formatFileSize = formatFileSize;
  protected readonly formatDate = formatDate;

  protected readonly value = toSignal(this.form.valueChanges.pipe(startWith(null), map(() => this.form.getRawValue())), { initialValue: this.form.getRawValue() });
  private readonly formEvents = toSignal(this.form.events.pipe(map(() => Symbol())));
  protected readonly existing = rxResource({ params: () => this.planId(), stream: ({ params }) => this.api.get(params) });
  protected readonly current = computed<PlanListItem | undefined>(() => (this.existing.hasValue() ? this.existing.value() : undefined));
  protected readonly readOnly = computed(() => !!this.current() && ['Cancelled', 'Archived'].includes(this.current()!.status));
  protected readonly customer = computed(() => this.value().location.customerId || null);
  protected readonly site = computed(() => this.value().location.siteId || null);
  protected readonly firstAsset = computed(() => this.refs.asset(String(this.value().asset.assetIds[0] ?? '')));
  protected readonly strategy = computed(() => this.value().strategy.strategy);
  protected readonly rule = computed(() => this.value().frequency.calendarRule);
  protected readonly parts = signal<PartRequirement[]>([]);
  protected readonly pendingDocs = signal<readonly { name: string; size: number; type: PlanDocument['type'] }[]>([]);
  protected readonly docType = signal<string | number | null>('Maintenance Manual');
  protected readonly preview = signal<PreviewDate[] | null>(null);
  protected readonly previewError = signal<string | null>(null);
  protected readonly saving = signal(false);
  private saved = false;
  private patching = false;
  private prefilled = false;

  constructor() {
    effect(() => {
      const c = this.current();
      if (c) untracked(() => this.patch(c));
    });
    effect(() => {
      if (this.readOnly()) untracked(() => this.form.disable({ emitEvent: false }));
    });
    effect(() => {
      if (this.prefilled || this.planId() || !this.refs.data().assets.length || (!this.assetId() && !this.amcId())) return;
      this.prefilled = true;
      untracked(() => {
        const amc = this.refs.data().amcs.find((a) => a.id === this.amcId());
        const asset = this.refs.asset(this.assetId() ?? amc?.assetIds[0]);
        if (!asset) return;
        this.form.controls.location.patchValue({ customerId: asset.customerId });
        this.form.controls.location.patchValue({ siteId: asset.siteId });
        this.form.controls.asset.controls.assetIds.setValue([asset.id]);
        if (amc) this.form.controls.service.patchValue({ amcId: amc.id });
      });
    });
    const c = this.form.controls;
    c.location.controls.customerId.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      if (this.patching) return;
      const cust = this.refs.customer(id);
      this.form.patchValue({ location: { legalEntity: cust?.legalName ?? '', region: cust?.region ?? '', siteId: '' }, asset: { assetIds: [] }, service: { amcId: '', contractId: '' } });
    });
    c.location.controls.siteId.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      if (this.patching) return;
      const site = this.refs.data().sites.find((s) => s.id === id);
      if (site) this.form.patchValue({ location: { region: site.region } });
      this.form.controls.asset.controls.assetIds.setValue([]);
    });
    c.asset.controls.assetIds.valueChanges.pipe(takeUntilDestroyed()).subscribe((ids) => {
      if (this.patching || !ids.length) return;
      const a = this.refs.asset(String(ids[0]));
      if (!a) return;
      this.form.patchValue({ location: { building: a.building, floor: a.floor, area: a.area } });
      const amc = this.refs.data().amcs.find((x) => x.assetIds.includes(a.id) && ['Active', 'Expiring Soon'].includes(x.status));
      if (amc && !this.form.controls.service.controls.amcId.value) this.form.patchValue({ service: { amcId: amc.id } });
    });
    c.service.controls.amcId.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      const amc = this.refs.data().amcs.find((a) => a.id === id);
      if (!amc || this.patching) return;
      this.form.patchValue({ service: { contractId: amc.contractId ?? '', slaId: amc.slaId ?? '', coveredService: true, entitlement: `AMC ${amc.number}` }, frequency: { startDate: [amc.startDate, today()].sort().at(-1)!, endDate: amc.endDate }, notifications: { customer: true } });
    });
    c.service.controls.serviceId.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      const s = this.refs.data().services.find((x) => x.id === id);
      if (s && !this.patching) this.form.patchValue({ service: { serviceCategory: s.category } });
    });
    c.identification.controls.maintenanceType.valueChanges.pipe(takeUntilDestroyed()).subscribe((t) => {
      if (this.patching) return;
      const group = PM_TYPE_GROUPS.find((g) => g.types.includes(t))?.group ?? 'Time-Based';
      const unit: FrequencyUnit = group === 'Meter-Based' ? (t === 'Mileage' ? 'Kilometres' : t === 'Machine Cycles' ? 'Cycles' : t === 'Energy Consumption' ? 'kWh' : 'Hours') : group === 'Event-Based' ? 'Days' : 'Months';
      const type: FrequencyType = TYPE_FREQUENCY[t] ?? (group === 'Calendar-Based' ? 'Monthly' : group === 'Meter-Based' ? 'Meter-Based' : group === 'Condition-Based' ? 'Condition-Based' : group === 'Event-Based' ? 'Event-Based' : 'Custom');
      this.form.patchValue({ strategy: { strategy: group, recurring: group !== 'Event-Based' }, frequency: { type, unit, calendarRule: TYPE_RULE[t] ?? 'None', value: group === 'Meter-Based' ? 250 : group === 'Event-Based' ? 30 : 1 } });
      this.preview.set(null);
    });
    c.automation.controls.technician.valueChanges.pipe(takeUntilDestroyed()).subscribe((t) => {
      if (!this.patching) this.form.patchValue({ automation: { autoAssign: !!t }, resources: { technician: t } });
    });
  }

  ngOnInit(): void {
    if (this.planId()) return;
    void firstValueFrom(this.api.nextNumber()).then((n) => this.form.controls.identification.controls.number.setValue(n));
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

  protected addPart(): void {
    this.parts.update((l) => [...l, { partNumber: '', quantity: 1 }]);
    this.form.markAsDirty();
  }

  protected setPart(i: number, key: 'partNumber' | 'quantity', v: string | number | null): void {
    this.parts.update((l) => l.map((p, idx) => (idx === i ? { ...p, [key]: key === 'quantity' ? Number(v) || 0 : String(v ?? '') } : p)));
    this.form.markAsDirty();
  }

  protected removePart(i: number): void {
    this.parts.update((l) => l.filter((_, idx) => idx !== i));
    this.form.markAsDirty();
  }

  protected onFiles(event: Event): void {
    const el = event.target as HTMLInputElement;
    const type = (this.docType() ?? 'Supporting Document') as PlanDocument['type'];
    this.pendingDocs.update((l) => [...l, ...Array.from(el.files ?? []).map((f) => ({ name: f.name, size: f.size, type }))]);
    el.value = '';
    this.form.markAsDirty();
  }

  protected async runPreview(): Promise<void> {
    this.previewError.set(null);
    try {
      this.preview.set(await firstValueFrom(this.api.preview(this.toUpsert(), 12)));
    } catch (e) {
      this.preview.set(null);
      this.previewError.set((e as Error).message);
    }
  }

  private patch(p: PlanListItem): void {
    this.patching = true;
    this.form.patchValue({
      identification: { number: p.number, name: p.name, maintenanceType: p.maintenanceType, description: p.description, externalReference: p.externalReference },
      location: p.location,
      asset: { assetIds: [...p.assetIds] },
      service: { ...p.service, serviceId: p.service.serviceId ?? '', contractId: p.service.contractId ?? '', amcId: p.service.amcId ?? '', slaId: p.service.slaId ?? '' },
      strategy: p.strategy,
      frequency: { ...p.frequency, endDate: p.frequency.endDate ?? '', effectiveDate: today() },
      scheduling: { ...p.scheduling, preferredDays: [...p.scheduling.preferredDays] },
      resources: { ...p.resources, technician: p.resources.technician ?? '' },
      parts: { replacementParts: p.parts.replacementParts, materialList: p.parts.materialList },
      procedure: { ...p.procedure, checklistId: p.procedure.checklistId ?? '', taskIds: [...p.procedure.taskIds] },
      automation: { ...p.automation, technician: p.automation.technician ?? '' },
      notifications: p.notifications,
      notes: p.notes,
    });
    this.parts.set(p.parts.required.map((r) => ({ ...r })));
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
      const id = this.planId();
      const plan = await firstValueFrom(id ? this.api.update(id, this.toUpsert(), this.form.controls.changeSummary.value.trim()) : this.api.create(this.toUpsert()));
      for (const d of this.pendingDocs()) await firstValueFrom(this.api.uploadDocument(plan.id, d.type, d));
      this.saved = true;
      this.refs.refresh();
      let message = `${plan.number} ${id ? 'saved' : 'created'}.`;
      if (intent === 'approval') {
        await firstValueFrom(this.api.submitForApproval(plan.id));
        message = `${plan.number} submitted for approval.`;
      }
      if (intent === 'activate' && plan.status !== 'Active') {
        await firstValueFrom(this.api.activate(plan.id));
        message = `${plan.number} saved and activated — schedule generated.`;
      }
      this.notify.success(message);
      void this.router.navigate(['/app/preventive-maintenance', plan.id]);
    } catch (error) {
      this.notify.error((error as Error).message, 'Could not complete the action');
      if (this.saved && !this.planId()) void this.router.navigate(['/app/preventive-maintenance/list']);
    } finally {
      this.saving.set(false);
    }
  }

  private toUpsert(): PlanUpsert {
    const v = this.form.getRawValue();
    const n = (x: string) => x || null;
    const num = (x: number | null) => (x === null || (x as unknown) === '' ? null : Number(x));
    return {
      name: v.identification.name.trim(), maintenanceType: v.identification.maintenanceType, description: v.identification.description, externalReference: v.identification.externalReference,
      location: v.location,
      assetIds: strings(v.asset.assetIds),
      assetCategory: this.refs.asset(String(v.asset.assetIds[0] ?? ''))?.category ?? '',
      service: { serviceId: n(v.service.serviceId), serviceCategory: v.service.serviceCategory, contractId: n(v.service.contractId), amcId: n(v.service.amcId), slaId: n(v.service.slaId), coveredService: v.service.coveredService, entitlement: v.service.entitlement },
      strategy: v.strategy,
      frequency: { ...v.frequency, value: Number(v.frequency.value) || 0, dayOfMonth: num(v.frequency.dayOfMonth), weekOfMonth: num(v.frequency.weekOfMonth), dayOfWeek: num(v.frequency.dayOfWeek), month: num(v.frequency.month), endDate: n(v.frequency.endDate), leadTimeDays: Number(v.frequency.leadTimeDays), graceDays: Number(v.frequency.graceDays), effectiveDate: v.frequency.effectiveDate || v.frequency.startDate },
      scheduling: { ...v.scheduling, preferredDays: strings(v.scheduling.preferredDays), maxRescheduleDays: Number(v.scheduling.maxRescheduleDays) },
      resources: { ...v.resources, technician: n(v.resources.technician) },
      parts: { required: this.parts().filter((p) => p.partNumber && p.quantity > 0), replacementParts: v.parts.replacementParts, materialList: v.parts.materialList },
      procedure: { ...v.procedure, checklistId: n(v.procedure.checklistId), taskIds: strings(v.procedure.taskIds) },
      automation: { ...v.automation, leadDays: Number(v.automation.leadDays), technician: n(v.automation.technician) },
      notifications: { ...v.notifications, reminderDays: Number(v.notifications.reminderDays) },
      notes: v.notes,
    };
  }
}
