import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  type OnInit,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import {
  type AbstractControl,
  type AsyncValidatorFn,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { HasUnsavedChanges } from '@core/guards/unsaved-changes.guard';
import { NotificationPort } from '@core/notification/notification.port';
import { toOptions } from '@shared/models/select-option';
import { ActionMenu } from '@shared/ui/action-menu';
import { ErrorState } from '@shared/ui/error-state';
import { ChipSelect, Switch } from '@shared/ui/form-controls';
import { FormField } from '@shared/ui/form-field';
import { Icon } from '@shared/ui/icon';
import { PageHeader } from '@shared/ui/page-header';
import { Panel } from '@shared/ui/panel';
import { Skeleton } from '@shared/ui/skeleton';
import { Spinner } from '@shared/ui/spinner';
import { StatusBadge } from '@shared/ui/status-badge';
import { filter, firstValueFrom, map, of, startWith, switchMap, timer } from 'rxjs';
import { AddressFields, addressValue, createAddressGroup } from '../../components/address-fields';
import { ContactApi, CustomerApi, SiteApi } from '../../data/customer-site.api';
import { TRANSACTION_BLOCKED_CUSTOMER_STATUSES } from '../../data/customer-site.config';
import { LOOKUP } from '../../data/customer-site.lookups';
import { SITE_FIELD_HELP } from '../../data/field-help';
import { CustomerLookupsStore } from '../../data/lookups.store';
import { ModuleHandoff } from '../../data/module-handoff.service';
import { SERVICE_PRIORITIES, type ServicePriority } from '../../models/customer.model';
import { SITE_STATUS_TONE } from '../../models/display';
import {
  SITE_STATUSES,
  type SiteListItem,
  type SiteStatus,
  type SiteType,
  type SiteUpsert,
  VISIT_TIMES,
  type VisitTime,
  WEEKDAYS,
  type Weekday,
} from '../../models/site.model';
import { PATTERNS, PATTERN_MESSAGES } from '../../utils/form-patterns';
import { LookupSelect } from '@shared/ui/lookup-select';
import { Select } from '@shared/ui/select';

type SaveIntent = 'save' | 'contact' | 'asset';

@Component({
  selector: 'amc-site-form-page',
  imports: [
    ActionMenu,
    AddressFields,
    ChipSelect,
    ErrorState,
    FormField,
    Icon,
    PageHeader,
    Panel,
    ReactiveFormsModule,
    RouterLink,
    Skeleton,
    Spinner,
    StatusBadge,
    Switch,
    Select,
    LookupSelect,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './site-form.page.html',
})
export class SiteFormPage implements HasUnsavedChanges, OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(SiteApi);
  private readonly customersApi = inject(CustomerApi);
  private readonly contactsApi = inject(ContactApi);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationPort);
  private readonly handoff = inject(ModuleHandoff);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly lookups = inject(CustomerLookupsStore);

  /** Route parameter (edit mode). */
  readonly siteId = input<string>();
  /** Query parameter used to pre-select the customer in create mode. */
  readonly customerId = input<string>();
  protected readonly isEdit = computed(() => !!this.siteId());

  private readonly codeAvailable: AsyncValidatorFn = (control: AbstractControl) =>
    !control.value || control.disabled
      ? of(null)
      : timer(350).pipe(
          switchMap(() => this.api.isCodeAvailable(String(control.value), this.siteId())),
          map((available) => (available ? null : { codeTaken: true })),
        );

  protected readonly form = this.fb.group({
    info: this.fb.group({
      code: this.fb.control('', {
        validators: [Validators.required, Validators.pattern(PATTERNS.code)],
        asyncValidators: [this.codeAvailable],
      }),
      name: this.fb.control('', [Validators.required, Validators.maxLength(150)]),
      customerId: this.fb.control('', Validators.required),
      type: this.fb.control<SiteType>('Branch', Validators.required),
      status: this.fb.control<SiteStatus>('Active', Validators.required),
    }),
    location: createAddressGroup(this.fb),
    operations: this.fb.group({
      siteContactId: this.fb.control(''),
      siteManagerId: this.fb.control(''),
      emergencyContactId: this.fb.control(''),
      operatingHours: this.fb.control('', Validators.maxLength(120)),
      serviceHours: this.fb.control('', Validators.maxLength(120)),
      accessRequirements: this.fb.control('', Validators.maxLength(1000)),
      securityRequirements: this.fb.control('', Validators.maxLength(1000)),
    }),
    service: this.fb.group({
      defaultSlaId: this.fb.control(''),
      serviceTerritoryId: this.fb.control(''),
      servicePriority: this.fb.control<ServicePriority>('Medium', Validators.required),
      preferredVisitDays: this.fb.control<Weekday[]>(['Sun', 'Mon', 'Tue', 'Wed', 'Thu']),
      preferredVisitTime: this.fb.control<VisitTime | ''>(''),
      accessNoticeRequired: this.fb.control(false),
    }),
    notes: this.fb.group({
      siteInstructions: this.fb.control('', Validators.maxLength(2000)),
      technicianInstructions: this.fb.control('', Validators.maxLength(2000)),
      internalNotes: this.fb.control('', Validators.maxLength(2000)),
    }),
  });

  protected readonly lookupTypes = LOOKUP;
  protected readonly help = SITE_FIELD_HELP;
  protected readonly statusOptions = toOptions(SITE_STATUSES);
  protected readonly priorityOptions = toOptions(SERVICE_PRIORITIES);
  protected readonly visitTimeOptions = toOptions(VISIT_TIMES);
  protected readonly weekdayOptions = toOptions(WEEKDAYS);
  protected readonly codeMessages = PATTERN_MESSAGES.code;
  protected readonly statusTone = SITE_STATUS_TONE;

  private readonly selectedCustomerId = toSignal(
    this.form.controls.info.controls.customerId.valueChanges.pipe(
      startWith(this.form.controls.info.controls.customerId.value),
    ),
    { initialValue: '' },
  );

  protected readonly existing = rxResource({
    params: () => this.siteId(),
    stream: ({ params }) => this.api.get(params),
  });
  private readonly customers = rxResource({ stream: () => this.customersApi.list() });
  private readonly contacts = rxResource({
    params: () => this.selectedCustomerId() || undefined,
    stream: ({ params }) => this.contactsApi.list({ customerId: params }),
  });

  protected readonly customerList = computed(() => (this.customers.hasValue() ? this.customers.value() : []));
  protected readonly selectedCustomer = computed(() =>
    this.customerList().find((c) => c.id === this.selectedCustomerId()) ?? null,
  );
  protected readonly customerOptions = computed(() => {
    const current = this.existing.hasValue() ? this.existing.value()?.customerId : undefined;
    return this.customerList()
      .filter((c) => c.id === current || !TRANSACTION_BLOCKED_CUSTOMER_STATUSES.includes(c.status))
      .map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }));
  });
  protected readonly contactOptions = computed(() =>
    (this.contacts.hasValue() ? this.contacts.value() : [])
      .filter((c) => c.status === 'Active' && (!c.siteId || c.siteId === this.siteId()))
      .map((c) => ({ value: c.id, label: `${c.fullName}${c.designation ? ' · ' + c.designation : ''}` })),
  );
  protected readonly territoryOptions = computed(() => this.lookups.territoryOptions(null));

  protected readonly saving = signal(false);
  private saved = false;

  constructor() {
    effect(() => {
      if (this.existing.hasValue() && this.existing.value()) {
        const site = this.existing.value()!;
        untracked(() => this.patch(site));
      }
    });
  }

  ngOnInit(): void {
    if (this.siteId()) return;
    void firstValueFrom(this.api.nextCode()).then((code) => {
      if (!this.form.controls.info.controls.code.dirty) this.form.controls.info.controls.code.setValue(code);
    });
    const preset = this.customerId();
    if (preset) {
      this.form.controls.info.controls.customerId.setValue(preset);
      void firstValueFrom(this.customersApi.list()).then(() => this.applyCustomerDefaults());
    }
  }

  hasUnsavedChanges(): boolean {
    return !this.saved && this.form.dirty;
  }

  /** Pre-fills service defaults from the selected customer (create mode only). */
  protected applyCustomerDefaults(): void {
    if (this.isEdit()) return;
    const customer = this.customerList().find((c) => c.id === this.form.controls.info.controls.customerId.value);
    if (!customer) return;
    const service = this.form.controls.service;
    if (!service.dirty) {
      service.patchValue({
        defaultSlaId: customer.operational.defaultSlaId ?? '',
        serviceTerritoryId: customer.operational.serviceTerritoryId ?? '',
        servicePriority: customer.operational.servicePriority,
      });
    }
    this.form.controls.operations.patchValue({ siteContactId: '', siteManagerId: '', emergencyContactId: '' });
  }

  protected copyCustomerAddress(): void {
    const customer = this.selectedCustomer();
    if (!customer) return;
    this.form.controls.location.patchValue({ ...customer.address });
    this.form.controls.location.markAsDirty();
    this.notify.info('Customer address copied. Site address remains independent and can be edited.');
  }

  protected async save(intent: SaveIntent): Promise<void> {
    if (this.saving()) return;
    this.form.markAllAsTouched();
    if (this.form.pending) {
      await firstValueFrom(this.form.statusChanges.pipe(startWith(this.form.status), filter((s) => s !== 'PENDING')));
    }
    if (this.form.invalid) {
      this.notify.error('Please review the highlighted fields before saving.', 'Some fields need attention');
      queueMicrotask(() =>
        this.host.nativeElement.querySelector<HTMLElement>('input.ng-invalid, select.ng-invalid, textarea.ng-invalid')?.focus(),
      );
      return;
    }
    this.saving.set(true);
    try {
      const payload = this.toUpsert();
      const id = this.siteId();
      const site = await firstValueFrom(id ? this.api.update(id, payload) : this.api.create(payload));
      this.saved = true;
      this.notify.success(`${site.name} was ${id ? 'updated' : 'created'} successfully.`, id ? 'Site updated' : 'Site created');
      if (intent === 'contact') {
        void this.router.navigate(['/app/customers/sites', site.id], { queryParams: { tab: 'contacts', action: 'add-contact' } });
      } else if (intent === 'asset') {
        this.handoff.open('Add Asset', { customerName: this.selectedCustomer()?.name ?? '', siteName: site.name });
        void this.router.navigate(['/app/customers/sites', site.id], { queryParams: { tab: 'assets' } });
      } else {
        void this.router.navigate(['/app/customers/sites', site.id]);
      }
    } catch (error) {
      this.notify.error((error as Error).message, 'Could not save site');
    } finally {
      this.saving.set(false);
    }
  }

  protected onMoreAction(id: string): void {
    void this.save(id as SaveIntent);
  }

  private toUpsert(): SiteUpsert {
    const v = this.form.getRawValue();
    return {
      code: v.info.code.trim().toUpperCase(),
      name: v.info.name.trim(),
      customerId: v.info.customerId,
      type: v.info.type,
      status: v.info.status,
      location: addressValue(this.form.controls.location),
      siteContactId: v.operations.siteContactId || null,
      siteManagerId: v.operations.siteManagerId || null,
      emergencyContactId: v.operations.emergencyContactId || null,
      operatingHours: v.operations.operatingHours.trim(),
      serviceHours: v.operations.serviceHours.trim(),
      accessRequirements: v.operations.accessRequirements.trim(),
      securityRequirements: v.operations.securityRequirements.trim(),
      defaultSlaId: v.service.defaultSlaId || null,
      serviceTerritoryId: v.service.serviceTerritoryId || null,
      servicePriority: v.service.servicePriority,
      preferredVisitDays: v.service.preferredVisitDays,
      preferredVisitTime: v.service.preferredVisitTime || null,
      accessNoticeRequired: v.service.accessNoticeRequired,
      siteInstructions: v.notes.siteInstructions,
      technicianInstructions: v.notes.technicianInstructions,
      internalNotes: v.notes.internalNotes,
    };
  }

  private patch(site: SiteListItem): void {
    this.form.patchValue({
      info: { code: site.code, name: site.name, customerId: site.customerId, type: site.type, status: site.status },
      location: { ...site.location },
      operations: {
        siteContactId: site.siteContactId ?? '',
        siteManagerId: site.siteManagerId ?? '',
        emergencyContactId: site.emergencyContactId ?? '',
        operatingHours: site.operatingHours,
        serviceHours: site.serviceHours,
        accessRequirements: site.accessRequirements,
        securityRequirements: site.securityRequirements,
      },
      service: {
        defaultSlaId: site.defaultSlaId ?? '',
        serviceTerritoryId: site.serviceTerritoryId ?? '',
        servicePriority: site.servicePriority,
        preferredVisitDays: [...site.preferredVisitDays],
        preferredVisitTime: site.preferredVisitTime ?? '',
        accessNoticeRequired: site.accessNoticeRequired,
      },
      notes: {
        siteInstructions: site.siteInstructions,
        technicianInstructions: site.technicianInstructions,
        internalNotes: site.internalNotes,
      },
    });
    this.form.controls.info.controls.code.disable();
    this.form.controls.info.controls.customerId.disable();
    this.form.markAsPristine();
    this.form.markAsUntouched();
  }
}
