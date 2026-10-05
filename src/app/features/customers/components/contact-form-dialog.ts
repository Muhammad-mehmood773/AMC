import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
} from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NotificationPort } from '@core/notification/notification.port';
import { toOptions } from '@shared/models/select-option';
import { Dialog } from '@shared/ui/dialog';
import { FormField } from '@shared/ui/form-field';
import { Switch } from '@shared/ui/form-controls';
import { Spinner } from '@shared/ui/spinner';
import { firstValueFrom, map, of, startWith } from 'rxjs';
import { ContactApi, CustomerApi, SiteApi } from '../data/customer-site.api';
import { TRANSACTION_BLOCKED_CUSTOMER_STATUSES } from '../data/customer-site.config';
import {
  CONTACT_STATUSES,
  CONTACT_TYPES,
  type ContactInput,
  type ContactListItem,
  type ContactStatus,
  type ContactType,
  PREFERRED_LANGUAGES,
  type PreferredLanguage,
} from '../models/contact.model';
import { COMMUNICATION_METHODS, type CommunicationMethod } from '../models/customer.model';
import { PATTERNS, PATTERN_MESSAGES } from '../utils/form-patterns';
import { Select } from '@shared/ui/select';

/** Create / edit dialog for customer and site contacts. */
@Component({
  selector: 'amc-contact-form-dialog',
  imports: [Dialog, FormField, ReactiveFormsModule, Spinner, Switch, Select],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <amc-dialog
      size="lg"
      [title]="contact() ? 'Edit contact' : 'Add contact'"
      [description]="contact() ? contact()!.fullName + ' · ' + contact()!.customerName : 'Add a customer or site-level contact.'"
      [(open)]="open"
    >
      <form [formGroup]="form" id="contact-form" novalidate (ngSubmit)="submit()">
        <div class="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
          <amc-form-field label="Customer" for="ct-customer" [control]="form.controls.customerId">
            <amc-select inputId="ct-customer" formControlName="customerId" [options]="customerOptions()" placeholder="Select customer…" />
          </amc-form-field>
          <amc-form-field
            label="Site"
            for="ct-site"
            [control]="form.controls.siteId"
            hint="Leave empty for a customer-level contact."
          >
            <amc-select inputId="ct-site" formControlName="siteId" [options]="siteOptions()" placeholder="Customer level (no site)" [clearable]="true" />
          </amc-form-field>
          <amc-form-field label="First Name" for="ct-first" [control]="form.controls.firstName">
            <input id="ct-first" class="amc-input" formControlName="firstName" autocomplete="given-name" />
          </amc-form-field>
          <amc-form-field label="Last Name" for="ct-last" [control]="form.controls.lastName">
            <input id="ct-last" class="amc-input" formControlName="lastName" autocomplete="family-name" />
          </amc-form-field>
          <amc-form-field label="Designation" for="ct-designation" [control]="form.controls.designation">
            <input id="ct-designation" class="amc-input" formControlName="designation" placeholder="e.g. Facility Manager" />
          </amc-form-field>
          <amc-form-field label="Department" for="ct-department" [control]="form.controls.department">
            <input id="ct-department" class="amc-input" formControlName="department" placeholder="e.g. Facilities" />
          </amc-form-field>
          <amc-form-field label="Email" for="ct-email" [control]="form.controls.email">
            <input id="ct-email" type="email" class="amc-input" formControlName="email" placeholder="name@company.com" />
          </amc-form-field>
          <amc-form-field label="Mobile" for="ct-mobile" [control]="form.controls.mobile" [messages]="phoneMessages">
            <input id="ct-mobile" type="tel" class="amc-input" formControlName="mobile" placeholder="+966 5X XXX XXXX" />
          </amc-form-field>
          <amc-form-field label="Phone" for="ct-phone" [control]="form.controls.phone" [messages]="phoneMessages">
            <input id="ct-phone" type="tel" class="amc-input" formControlName="phone" placeholder="+966 11 XXX XXXX" />
          </amc-form-field>
          <amc-form-field label="Contact Type" for="ct-type" [control]="form.controls.type">
            <amc-select inputId="ct-type" formControlName="type" [options]="typeOptions" />
          </amc-form-field>
          <amc-form-field label="Preferred Language" for="ct-lang" [control]="form.controls.preferredLanguage">
            <amc-select inputId="ct-lang" formControlName="preferredLanguage" [options]="languageOptions" />
          </amc-form-field>
          <amc-form-field label="Preferred Communication Method" for="ct-comm" [control]="form.controls.preferredCommunication">
            <amc-select inputId="ct-comm" formControlName="preferredCommunication" [options]="communicationOptions" />
          </amc-form-field>
          <amc-form-field label="Status" for="ct-status" [control]="form.controls.status">
            <amc-select inputId="ct-status" formControlName="status" [options]="statusOptions" />
          </amc-form-field>
          <div class="flex items-end pb-1">
            <amc-switch
              formControlName="isPrimary"
              inputId="ct-primary"
              label="Primary contact"
              [description]="'Primary ' + formValue().type.toLowerCase() + ' contact for this ' + (formValue().siteId ? 'site' : 'customer') + '.'"
            />
          </div>
          <amc-form-field label="Notes" for="ct-notes" [control]="form.controls.notes" class="sm:col-span-2">
            <textarea id="ct-notes" class="amc-textarea min-h-20" formControlName="notes" placeholder="Availability, escalation preferences…"></textarea>
          </amc-form-field>
        </div>
      </form>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="open.set(false)">Cancel</button>
        <button type="submit" form="contact-form" class="amc-btn-primary" [disabled]="saving()">
          @if (saving()) {
            <amc-spinner [size]="14" />
          }
          {{ contact() ? 'Save changes' : 'Add contact' }}
        </button>
      </ng-container>
    </amc-dialog>
  `,
})
export class ContactFormDialog {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly contacts = inject(ContactApi);
  private readonly customers = inject(CustomerApi);
  private readonly sites = inject(SiteApi);
  private readonly notify = inject(NotificationPort);

  readonly open = model(false);
  readonly contact = input<ContactListItem | null>(null);
  readonly customerId = input<string | null>(null);
  readonly siteId = input<string | null>(null);
  readonly saved = output<void>();

  protected readonly saving = signal(false);
  protected readonly typeOptions = toOptions(CONTACT_TYPES);
  protected readonly statusOptions = toOptions(CONTACT_STATUSES);
  protected readonly languageOptions = toOptions(PREFERRED_LANGUAGES);
  protected readonly communicationOptions = toOptions(COMMUNICATION_METHODS);
  protected readonly phoneMessages = PATTERN_MESSAGES.phone;

  protected readonly form = this.fb.group({
    customerId: this.fb.control('', Validators.required),
    siteId: this.fb.control(''),
    firstName: this.fb.control('', [Validators.required, Validators.maxLength(60)]),
    lastName: this.fb.control('', Validators.maxLength(60)),
    designation: this.fb.control(''),
    department: this.fb.control(''),
    email: this.fb.control('', [Validators.required, Validators.email]),
    mobile: this.fb.control('', Validators.pattern(PATTERNS.phone)),
    phone: this.fb.control('', Validators.pattern(PATTERNS.phone)),
    preferredLanguage: this.fb.control<PreferredLanguage>('English'),
    preferredCommunication: this.fb.control<CommunicationMethod>('Email'),
    type: this.fb.control<ContactType>('Technical', Validators.required),
    isPrimary: this.fb.control(false),
    status: this.fb.control<ContactStatus>('Active', Validators.required),
    notes: this.fb.control('', Validators.maxLength(1000)),
  });

  protected readonly formValue = toSignal(
    this.form.valueChanges.pipe(startWith(null), map(() => this.form.getRawValue())),
    { initialValue: this.form.getRawValue() },
  );

  private readonly customerList = rxResource({
    params: () => (this.open() ? true : undefined),
    stream: () => this.customers.list(),
  });
  private readonly siteList = rxResource({
    params: () => (this.open() ? this.formValue().customerId || undefined : undefined),
    stream: ({ params }) => (params ? this.sites.list({ customerId: params }) : of([])),
  });

  protected readonly customerOptions = computed(() => {
    const list = this.customerList.hasValue() ? (this.customerList.value() ?? []) : [];
    const editing = this.contact()?.customerId;
    return list
      .filter((c) => c.id === editing || !TRANSACTION_BLOCKED_CUSTOMER_STATUSES.includes(c.status))
      .map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }));
  });
  protected readonly siteOptions = computed(() =>
    (this.siteList.hasValue() ? (this.siteList.value() ?? []) : []).map((s) => ({
      value: s.id,
      label: `${s.name} (${s.code})`,
    })),
  );

  constructor() {
    effect(() => {
      if (!this.open()) return;
      untracked(() => this.reset());
    });
  }

  private reset(): void {
    const c = this.contact();
    this.form.reset({
      customerId: c?.customerId ?? this.customerId() ?? '',
      siteId: c?.siteId ?? this.siteId() ?? '',
      firstName: c?.firstName ?? '',
      lastName: c?.lastName ?? '',
      designation: c?.designation ?? '',
      department: c?.department ?? '',
      email: c?.email ?? '',
      mobile: c?.mobile ?? '',
      phone: c?.phone ?? '',
      preferredLanguage: c?.preferredLanguage ?? 'English',
      preferredCommunication: c?.preferredCommunication ?? 'Email',
      type: c?.type ?? (this.siteId() ? 'Site Contact' : 'Technical'),
      isPrimary: c?.isPrimary ?? false,
      status: c?.status ?? 'Active',
      notes: c?.notes ?? '',
    });
    const lockCustomer = !!c || !!this.customerId();
    if (lockCustomer) this.form.controls.customerId.disable();
    else this.form.controls.customerId.enable();
    if (this.siteId() && !c) this.form.controls.siteId.disable();
    else this.form.controls.siteId.enable();
  }

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    const v = this.form.getRawValue();
    const input: ContactInput = {
      ...v,
      siteId: v.siteId || null,
      isPrimary: v.status === 'Active' && v.isPrimary,
      firstName: v.firstName.trim(),
      lastName: v.lastName.trim(),
      email: v.email.trim(),
    };
    this.saving.set(true);
    try {
      const existing = this.contact();
      await firstValueFrom(existing ? this.contacts.update(existing.id, input) : this.contacts.create(input));
      this.notify.success(`${input.firstName} ${input.lastName} ${existing ? 'updated' : 'added'}.`, existing ? 'Contact updated' : 'Contact added');
      this.open.set(false);
      this.saved.emit();
    } catch (error) {
      this.notify.error((error as Error).message);
    } finally {
      this.saving.set(false);
    }
  }
}
