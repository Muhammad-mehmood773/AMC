import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  type OnInit,
  signal,
} from '@angular/core';
import { rxResource, takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
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
import { ConfirmDialogService } from '@core/ui/confirm-dialog.service';
import { toOptions } from '@shared/models/select-option';
import { ActionMenu } from '@shared/ui/action-menu';
import { ErrorState } from '@shared/ui/error-state';
import { FormField } from '@shared/ui/form-field';
import { Switch } from '@shared/ui/form-controls';
import { Icon, type IconName } from '@shared/ui/icon';
import { PageHeader } from '@shared/ui/page-header';
import { Panel } from '@shared/ui/panel';
import { Skeleton } from '@shared/ui/skeleton';
import { Spinner } from '@shared/ui/spinner';
import { StatusBadge } from '@shared/ui/status-badge';
import { formatFileSize } from '@shared/utils/format';
import {
  debounceTime,
  distinctUntilChanged,
  filter,
  firstValueFrom,
  map,
  of,
  startWith,
  switchMap,
  timer,
} from 'rxjs';
import { AddressFields, createAddressGroup } from '../../components/address-fields';
import { CustomerApi, DocumentApi } from '../../data/customer-site.api';
import { DUPLICATE_FIELD_LABELS } from '../../data/customer-site.config';
import { LOOKUP } from '../../data/customer-site.lookups';
import { CUSTOMER_FIELD_HELP } from '../../data/field-help';
import { CustomerLookupsStore } from '../../data/lookups.store';
import {
  BILLING_CYCLES,
  CUSTOMER_STATUSES,
  type BillingCycle,
  type CommunicationMethod,
  type CustomerCategory,
  type CustomerDetail,
  type CustomerStatus,
  type CustomerType,
  type CustomerUpsert,
  type DuplicateMatch,
  SERVICE_PRIORITIES,
  SERVICE_WINDOWS,
  type ServicePriority,
  type ServiceWindow,
} from '../../models/customer.model';
import { getCountryConfig } from '../../models/country-config';
import { CUSTOMER_STATUS_TONE } from '../../models/display';
import { PATTERNS, PATTERN_MESSAGES, splitName } from '../../utils/form-patterns';
import { LookupSelect } from '@shared/ui/lookup-select';
import { Select } from '@shared/ui/select';
import { DatePicker } from '@shared/ui/date-picker';

type SaveIntent = 'save' | 'site' | 'contact';

interface FormSection {
  readonly id: string;
  readonly label: string;
  readonly icon: IconName;
  readonly group: keyof CustomerFormPage['form']['controls'] | 'attachments';
}

@Component({
  selector: 'amc-customer-form-page',
  imports: [
    ActionMenu,
    AddressFields,
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
    DatePicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './customer-form.page.html',
})
export class CustomerFormPage implements HasUnsavedChanges, OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(CustomerApi);
  private readonly documents = inject(DocumentApi);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationPort);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly lookups = inject(CustomerLookupsStore);

  /** Route parameter; absent in create mode. */
  readonly customerId = input<string>();
  protected readonly isEdit = computed(() => !!this.customerId());

  private readonly codeAvailable: AsyncValidatorFn = (control: AbstractControl) =>
    !control.value || control.disabled
      ? of(null)
      : timer(350).pipe(
          switchMap(() => this.api.isCodeAvailable(String(control.value), this.customerId())),
          map((available) => (available ? null : { codeTaken: true })),
        );

  protected readonly form = this.fb.group({
    basic: this.fb.group({
      code: this.fb.control('', {
        validators: [Validators.required, Validators.pattern(PATTERNS.code)],
        asyncValidators: [this.codeAvailable],
      }),
      name: this.fb.control('', [Validators.required, Validators.maxLength(150)]),
      legalName: this.fb.control('', [Validators.maxLength(200)]),
      type: this.fb.control<CustomerType>('Corporate', Validators.required),
      category: this.fb.control<CustomerCategory>('Commercial', Validators.required),
      status: this.fb.control<CustomerStatus>('Active', Validators.required),
      companyId: this.fb.control('', Validators.required),
      branchId: this.fb.control('', Validators.required),
    }),
    legal: this.fb.group({
      crNumber: this.fb.control('', Validators.pattern(PATTERNS.crNumber)),
      vatNumber: this.fb.control('', Validators.pattern(PATTERNS.vatNumber)),
      nationalAddressRef: this.fb.control('', Validators.pattern(PATTERNS.nationalAddress)),
      industry: this.fb.control(''),
      registrationDate: this.fb.control(''),
    }),
    address: createAddressGroup(this.fb),
    contact: this.fb.group({
      name: this.fb.control('', [Validators.required, Validators.maxLength(120)]),
      designation: this.fb.control(''),
      department: this.fb.control(''),
      email: this.fb.control('', [Validators.required, Validators.email]),
      mobile: this.fb.control('', Validators.pattern(PATTERNS.phone)),
      phone: this.fb.control('', Validators.pattern(PATTERNS.phone)),
      preferredCommunication: this.fb.control<CommunicationMethod>('Email'),
    }),
    commercial: this.fb.group({
      accountManagerId: this.fb.control('', Validators.required),
      salesRepId: this.fb.control(''),
      paymentTermsId: this.fb.control('PT-30', Validators.required),
      currency: this.fb.control('', Validators.required),
      creditLimit: this.fb.control<number | null>(null, Validators.min(0)),
      taxProfileId: this.fb.control('TAX-STD'),
      priceListId: this.fb.control('PL-STD'),
      billingCycle: this.fb.control<BillingCycle | ''>('Monthly'),
    }),
    operational: this.fb.group({
      servicePriority: this.fb.control<ServicePriority>('Medium', Validators.required),
      defaultSlaId: this.fb.control(''),
      serviceRegion: this.fb.control(''),
      serviceTerritoryId: this.fb.control(''),
      preferredServiceWindow: this.fb.control<ServiceWindow | ''>(''),
      portalAccess: this.fb.control(false),
    }),
    notes: this.fb.group({
      internalNotes: this.fb.control('', Validators.maxLength(2000)),
      customerNotes: this.fb.control('', Validators.maxLength(2000)),
    }),
  });

  protected readonly sections: readonly FormSection[] = [
    { id: 'basic', label: 'Basic information', icon: 'building', group: 'basic' },
    { id: 'legal', label: 'Legal & registration', icon: 'file-check', group: 'legal' },
    { id: 'address', label: 'Primary address', icon: 'map-pin', group: 'address' },
    { id: 'contact', label: 'Primary contact', icon: 'user', group: 'contact' },
    { id: 'commercial', label: 'Commercial', icon: 'briefcase', group: 'commercial' },
    { id: 'operational', label: 'Operational', icon: 'sliders', group: 'operational' },
    { id: 'notes', label: 'Notes & documents', icon: 'sticky-note', group: 'notes' },
  ];

  protected readonly lookupTypes = LOOKUP;
  protected readonly help = CUSTOMER_FIELD_HELP;
  /** Customer logo as a data URL (base64). Stored separately from the reactive form. */
  protected readonly logoUrl = signal<string | null>(null);
  protected readonly statusOptions = toOptions(CUSTOMER_STATUSES);
  protected readonly billingOptions = toOptions(BILLING_CYCLES);
  protected readonly priorityOptions = toOptions(SERVICE_PRIORITIES);
  protected readonly windowOptions = toOptions(SERVICE_WINDOWS);
  protected readonly patternMessages = PATTERN_MESSAGES;
  protected readonly statusTone = CUSTOMER_STATUS_TONE;
  protected readonly duplicateLabels = DUPLICATE_FIELD_LABELS;
  protected readonly formatFileSize = formatFileSize;

  private readonly value = toSignal(this.form.valueChanges.pipe(startWith(null), map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });
  /** Re-evaluates section validity on any status/touch change. */
  private readonly formEvents = toSignal(this.form.events.pipe(map(() => Symbol())));

  protected readonly branchOptions = computed(() => this.lookups.branchOptions(this.value().basic.companyId));
  protected readonly territoryOptions = computed(() =>
    this.lookups.territoryOptions(this.value().operational.serviceRegion || null),
  );
  /** Country-specific config derived from the primary address country selection. */
  protected readonly countryCfg = computed(() => getCountryConfig(this.value().address.country));

  protected readonly existing = rxResource({
    params: () => this.customerId(),
    stream: ({ params }) => this.api.get(params),
  });

  protected readonly duplicates = signal<DuplicateMatch[]>([]);
  protected readonly saving = signal(false);
  protected readonly attachments = signal<readonly File[]>([]);
  private saved = false;

  // ── #11 Progress indicator ─────────────────────────────────────
  /** Returns 0-100 representing how many required fields in each section are filled. */
  protected readonly sectionProgress = computed(() => {
    this.formEvents(); // re-run on any form event
    return this.sections.map((s) => {
      if (s.group === 'attachments' || s.group === 'notes') return 100;
      const grp = this.form.controls[s.group];
      const controls = Object.values(grp.controls as Record<string, { value: unknown; valid: boolean; errors: Record<string, unknown> | null }>);
      const required = controls.filter((c) => c.errors != null && 'required' in c.errors);
      if (required.length === 0) return grp.valid ? 100 : 80;
      const filled = required.filter((c) => c.value !== '' && c.value !== null && c.value !== undefined).length;
      return Math.round((filled / required.length) * 100);
    });
  });

  protected readonly overallProgress = computed(() => {
    const values = this.sectionProgress();
    return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
  });

  // ── #12 Auto-save draft ────────────────────────────────────────
  private static readonly DRAFT_KEY = 'amc.customer.draft';

  private saveDraft(): void {
    if (this.customerId()) return; // only in create mode
    try {
      localStorage.setItem(
        CustomerFormPage.DRAFT_KEY,
        JSON.stringify({ form: this.form.getRawValue(), logoUrl: this.logoUrl(), ts: Date.now() }),
      );
    } catch { /* ignore quota errors */ }
  }

  protected clearDraft(): void {
    localStorage.removeItem(CustomerFormPage.DRAFT_KEY);
    this.draftAge.set(null);
  }

  protected readonly draftAge = signal<string | null>(null);

  private loadDraft(): boolean {
    if (this.customerId()) return false;
    try {
      const raw = localStorage.getItem(CustomerFormPage.DRAFT_KEY);
      if (!raw) return false;
      const { form, logoUrl, ts } = JSON.parse(raw) as { form: ReturnType<CustomerFormPage['form']['getRawValue']>; logoUrl: string | null; ts: number };
      const ageMin = Math.round((Date.now() - ts) / 60000);
      this.draftAge.set(ageMin < 1 ? 'just now' : ageMin < 60 ? `${ageMin}m ago` : `${Math.round(ageMin / 60)}h ago`);
      this.form.patchValue(form as never, { emitEvent: false });
      this.logoUrl.set(logoUrl);
      return true;
    } catch { return false; }
  }

  constructor() {
    effect(() => {
      if (this.existing.hasValue() && this.existing.value()) {
        this.patch(this.existing.value()!);
      }
    });

    const basic = this.form.controls.basic.controls;
    basic.companyId.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => basic.branchId.setValue(''));
    const op = this.form.controls.operational.controls;
    op.serviceRegion.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => op.serviceTerritoryId.setValue(''));

    // Auto-save draft every 3 seconds of inactivity (create mode only)
    this.form.valueChanges
      .pipe(debounceTime(3000), takeUntilDestroyed())
      .subscribe(() => this.saveDraft());

    // Apply country-specific validation to legal fields whenever the address country changes.
    effect(() => {
      const cfg = this.countryCfg();
      const legal = this.form.controls.legal.controls;
      legal.crNumber.setValidators(cfg.business.primaryId?.pattern ? [Validators.pattern(cfg.business.primaryId.pattern)] : []);
      legal.vatNumber.setValidators(cfg.business.taxId?.pattern ? [Validators.pattern(cfg.business.taxId.pattern)] : []);
      legal.nationalAddressRef.setValidators(cfg.business.showNationalAddress ? [Validators.pattern(PATTERNS.nationalAddress)] : []);
      legal.crNumber.updateValueAndValidity({ emitEvent: false });
      legal.vatNumber.updateValueAndValidity({ emitEvent: false });
      legal.nationalAddressRef.updateValueAndValidity({ emitEvent: false });
    });

    // Live duplicate detection on identifying fields.
    this.form.valueChanges
      .pipe(
        map(() => {
          const v = this.form.getRawValue();
          return {
            legalName: v.basic.legalName || v.basic.name,
            crNumber: v.legal.crNumber,
            vatNumber: v.legal.vatNumber,
            email: v.contact.email,
            phone: v.contact.mobile || v.contact.phone,
          };
        }),
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
        debounceTime(600),
        switchMap((candidate) => this.api.findDuplicates(candidate, this.customerId())),
        takeUntilDestroyed(),
      )
      .subscribe((matches) => this.duplicates.set(matches));
  }

  ngOnInit(): void {
    if (!this.customerId()) {
      this.loadDraft();
      void firstValueFrom(this.api.nextCode()).then((code) => {
        if (!this.form.controls.basic.controls.code.dirty) {
          this.form.controls.basic.controls.code.setValue(code);
        }
      });
    }
  }

  hasUnsavedChanges(): boolean {
    return !this.saved && this.form.dirty;
  }

  protected sectionInvalid(group: FormSection['group']): boolean {
    this.formEvents();
    if (group === 'attachments') return false;
    const control = this.form.controls[group];
    return control.invalid && control.touched;
  }

  protected scrollTo(id: string): void {
    this.host.nativeElement
      .querySelector(`#section-${id}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected copyLegalName(): void {
    const basic = this.form.controls.basic.controls;
    if (!basic.legalName.value && basic.name.value) {
      basic.legalName.setValue(basic.name.value);
      basic.legalName.markAsDirty();
    }
  }

  protected onLogoChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      this.logoUrl.set(reader.result as string);
      this.form.markAsDirty();
    };
    reader.readAsDataURL(file);
  }

  protected removeLogo(): void {
    this.logoUrl.set(null);
    this.form.markAsDirty();
  }

  protected onFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    this.attachments.update((list) => [...list, ...files]);
    input.value = '';
    this.form.markAsDirty();
  }

  protected removeFile(file: File): void {
    this.attachments.update((list) => list.filter((f) => f !== file));
  }

  protected async save(intent: SaveIntent): Promise<void> {
    if (this.saving()) return;
    this.form.markAllAsTouched();
    if (this.form.pending) {
      await firstValueFrom(
        this.form.statusChanges.pipe(startWith(this.form.status), filter((status) => status !== 'PENDING')),
      );
    }
    if (this.form.invalid) {
      this.notify.error('Please review the highlighted fields before saving.', 'Some fields need attention');
      queueMicrotask(() =>
        this.host.nativeElement
          .querySelector<HTMLElement>('input.ng-invalid, select.ng-invalid, textarea.ng-invalid')
          ?.focus(),
      );
      return;
    }

    if (this.duplicates().length) {
      const names = this.duplicates().map((d) => `${d.name} (${d.code})`).join(', ');
      const proceed = await this.confirm.open({
        title: 'Possible duplicate customer',
        message: `This customer matches existing records: ${names}. Save anyway?`,
        confirmLabel: 'Save anyway',
      });
      if (!proceed) return;
    }

    this.saving.set(true);
    try {
      const payload = this.toUpsert();
      const id = this.customerId();
      const customer = await firstValueFrom(id ? this.api.update(id, payload) : this.api.create(payload));
      for (const file of this.attachments()) {
        await firstValueFrom(
          this.documents.upload({
            name: file.name.replace(/\.[^.]+$/, ''),
            category: 'Other',
            customerId: customer.id,
            siteId: null,
            documentNumber: '',
            issueDate: null,
            expiryDate: null,
            reminderDays: 30,
            responsibleUserId: null,
            access: 'Internal',
            notes: 'Uploaded from customer form',
            file: { name: file.name, size: file.size, type: file.type },
          }),
        );
      }
      this.saved = true;
      this.clearDraft();
      this.notify.success(`${customer.name} was ${id ? 'updated' : 'created'} successfully.`, id ? 'Customer updated' : 'Customer created');
      if (intent === 'site') {
        void this.router.navigate(['/app/customers/sites/new'], { queryParams: { customerId: customer.id } });
      } else if (intent === 'contact') {
        void this.router.navigate(['/app/customers', customer.id], { queryParams: { tab: 'contacts', action: 'add-contact' } });
      } else {
        void this.router.navigate(['/app/customers', customer.id]);
      }
    } catch (error) {
      this.notify.error((error as Error).message, 'Could not save customer');
    } finally {
      this.saving.set(false);
    }
  }

  protected onMoreAction(id: string): void {
    void this.save(id as SaveIntent);
  }

  private toUpsert(): CustomerUpsert {
    const v = this.form.getRawValue();
    const { first, last } = splitName(v.contact.name);
    return {
      logoUrl: this.logoUrl(),
      code: v.basic.code.trim().toUpperCase(),
      name: v.basic.name.trim(),
      legalName: v.basic.legalName.trim() || v.basic.name.trim(),
      type: v.basic.type,
      category: v.basic.category,
      status: v.basic.status,
      companyId: v.basic.companyId,
      branchId: v.basic.branchId,
      crNumber: v.legal.crNumber.trim(),
      vatNumber: v.legal.vatNumber.trim(),
      nationalAddressRef: v.legal.nationalAddressRef.trim().toUpperCase(),
      industry: v.legal.industry,
      registrationDate: v.legal.registrationDate || null,
      address: { ...v.address },
      commercial: {
        accountManagerId: v.commercial.accountManagerId || null,
        salesRepId: v.commercial.salesRepId || null,
        paymentTermsId: v.commercial.paymentTermsId || null,
        currency: v.commercial.currency,
        creditLimit: v.commercial.creditLimit,
        taxProfileId: v.commercial.taxProfileId || null,
        priceListId: v.commercial.priceListId || null,
        billingCycle: v.commercial.billingCycle || null,
      },
      operational: {
        servicePriority: v.operational.servicePriority,
        defaultSlaId: v.operational.defaultSlaId || null,
        serviceRegion: v.operational.serviceRegion || null,
        serviceTerritoryId: v.operational.serviceTerritoryId || null,
        preferredServiceWindow: v.operational.preferredServiceWindow || null,
        portalAccess: v.operational.portalAccess,
      },
      internalNotes: v.notes.internalNotes,
      customerNotes: v.notes.customerNotes,
      primaryContact: {
        firstName: first,
        lastName: last,
        designation: v.contact.designation,
        department: v.contact.department,
        email: v.contact.email.trim(),
        mobile: v.contact.mobile.trim(),
        phone: v.contact.phone.trim(),
        preferredLanguage: 'English',
        preferredCommunication: v.contact.preferredCommunication,
        status: 'Active',
        notes: '',
      },
    };
  }

  private patch(c: CustomerDetail): void {
    const contact = c.primaryContact;
    this.logoUrl.set(c.logoUrl);
    // Patch dependent selects in order so cascading resets do not clear them.
    this.form.patchValue({ basic: { companyId: c.companyId }, operational: { serviceRegion: c.operational.serviceRegion ?? '' } });
    this.form.patchValue({
      basic: { code: c.code, name: c.name, legalName: c.legalName, type: c.type, category: c.category, status: c.status, branchId: c.branchId },
      legal: { crNumber: c.crNumber, vatNumber: c.vatNumber, nationalAddressRef: c.nationalAddressRef, industry: c.industry, registrationDate: c.registrationDate ?? '' },
      address: { ...c.address },
      contact: contact
        ? { name: `${contact.firstName} ${contact.lastName}`.trim(), designation: contact.designation, department: contact.department, email: contact.email, mobile: contact.mobile, phone: contact.phone, preferredCommunication: contact.preferredCommunication }
        : {},
      commercial: {
        accountManagerId: c.commercial.accountManagerId ?? '',
        salesRepId: c.commercial.salesRepId ?? '',
        paymentTermsId: c.commercial.paymentTermsId ?? '',
        currency: c.commercial.currency,
        creditLimit: c.commercial.creditLimit,
        taxProfileId: c.commercial.taxProfileId ?? '',
        priceListId: c.commercial.priceListId ?? '',
        billingCycle: c.commercial.billingCycle ?? '',
      },
      operational: {
        servicePriority: c.operational.servicePriority,
        defaultSlaId: c.operational.defaultSlaId ?? '',
        serviceTerritoryId: c.operational.serviceTerritoryId ?? '',
        preferredServiceWindow: c.operational.preferredServiceWindow ?? '',
        portalAccess: c.operational.portalAccess,
      },
      notes: { internalNotes: c.internalNotes, customerNotes: c.customerNotes },
    });
    this.form.controls.basic.controls.code.disable();
    this.form.markAsPristine();
    this.form.markAsUntouched();
  }
}
