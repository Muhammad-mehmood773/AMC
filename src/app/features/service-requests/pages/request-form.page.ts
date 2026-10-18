import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, type OnInit, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { HasUnsavedChanges } from '@core/guards/unsaved-changes.guard';
import { NotificationPort } from '@core/notification/notification.port';
import { toOptions } from '@shared/models/select-option';
import { DatePicker } from '@shared/ui/date-picker';
import { ErrorState } from '@shared/ui/error-state';
import { FormField } from '@shared/ui/form-field';
import { Icon } from '@shared/ui/icon';
import { PageHeader } from '@shared/ui/page-header';
import { Panel } from '@shared/ui/panel';
import { Select } from '@shared/ui/select';
import { Skeleton } from '@shared/ui/skeleton';
import { Spinner } from '@shared/ui/spinner';
import { StatusBadge } from '@shared/ui/status-badge';
import { Switch } from '@shared/ui/form-controls';
import { firstValueFrom, of } from 'rxjs';
import { SR_FIELD_HELP } from '../data/field-help';
import { SrReferenceStore } from '../data/sr-reference.store';
import { RequestApi } from '../data/sr.api';
import { PRIORITY_TONE } from '../models/display';
import type { DuplicateMatch, Suggestion } from '../models/operations.model';
import { BUSINESS_IMPACT, PRIORITIES, REQUEST_SOURCES, REQUEST_TYPES, URGENCY, type RequestDraft, type RequestType } from '../models/request.model';

const EMPTY_CLASS = { problemCategory: '', problemCode: '', serviceCode: '', failureType: '', symptom: '', cause: '', requestedServiceId: null, urgency: 'Medium', businessImpact: 'Medium', affectedUsers: 1, requiredSkill: '', suggestedBy: null };

@Component({
  selector: 'amc-request-form-page',
  imports: [DatePicker, DatePipe, ErrorState, FormField, Icon, PageHeader, Panel, ReactiveFormsModule, RouterLink, Select, Skeleton, Spinner, StatusBadge, Switch],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header [title]="editId() ? 'Edit Service Request' : 'New Service Request'" [subtitle]="editId() ? 'Update request details — every change is audited.' : 'Capture service demand. Classification, priority, coverage, SLA and routing are suggested automatically.'" [breadcrumbs]="[{ label: 'Service Requests', path: '/app/service-requests/dashboard' }, { label: editId() ? 'Edit' : 'Create' }]">
        @if (editId()) { <a [routerLink]="['/app/service-requests', editId()]" class="amc-btn-secondary"><amc-icon name="eye" /> View 360</a> }
      </amc-page-header>

      @if (editId() && existing.isLoading()) {
        <amc-skeleton height="420px" />
      } @else if (editId() && existing.error()) {
        <div class="amc-card"><amc-error-state message="The request could not be loaded." (retry)="existing.reload()" /></div>
      } @else {
        <form [formGroup]="form" (ngSubmit)="save()" class="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <div class="space-y-5 xl:col-span-2">
            <amc-panel title="Request" description="What the customer needs." icon="ticket">
              <div class="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:p-5">
                <amc-form-field label="Request Type" for="rq-type" [required]="true"><amc-select inputId="rq-type" formControlName="type" [options]="typeOptions" /></amc-form-field>
                <amc-form-field label="Channel / Source" for="rq-source" [required]="true"><amc-select inputId="rq-source" formControlName="source" [options]="sourceOptions" /></amc-form-field>
                <amc-form-field label="Subject" for="rq-subject" [required]="true" class="sm:col-span-2"><input id="rq-subject" formControlName="subject" class="amc-input" placeholder="Short description of the issue" /></amc-form-field>
                <amc-form-field label="Description" for="rq-desc" [required]="true" class="sm:col-span-2" hint="Detailed symptom, error or work requested. Minimum 20 characters."><textarea id="rq-desc" formControlName="description" class="amc-textarea" placeholder="What happened, since when, error messages…"></textarea></amc-form-field>
                <amc-form-field label="Service Category" for="rq-cat" [required]="true"><amc-select inputId="rq-cat" formControlName="serviceCategory" [options]="refs.categoryOptions()" /></amc-form-field>
                <amc-form-field label="Subcategory" for="rq-sub"><amc-select inputId="rq-sub" formControlName="subcategory" [options]="subcategoryOptions()" [clearable]="true" /></amc-form-field>
                <amc-form-field label="Requested Date" for="rq-date"><amc-date-picker inputId="rq-date" formControlName="requestedDate" /></amc-form-field>
                <amc-form-field label="Requested Time" for="rq-time"><input id="rq-time" type="time" formControlName="requestedTime" class="amc-input" /></amc-form-field>
                <amc-form-field label="Customer Reference" for="rq-ref" hint="Customer's own ticket / PO number, if any."><input id="rq-ref" formControlName="customerReference" class="amc-input" /></amc-form-field>
                <amc-form-field label="Follow-up Of" for="rq-parent" hint="Link to an earlier request when this is a follow-up."><amc-select inputId="rq-parent" formControlName="parentRequestId" [options]="parentOptions()" [clearable]="true" [searchable]="true" /></amc-form-field>
              </div>
            </amc-panel>

            <amc-panel title="Customer, Site & Asset" description="Who reported it and where. Inactive customers, sites and assets cannot be selected." icon="building">
              <div class="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:p-5">
                <amc-form-field label="Customer" for="rq-cust" [required]="true"><amc-select inputId="rq-cust" formControlName="customerId" [options]="refs.customerOptions()" [searchable]="true" /></amc-form-field>
                <amc-form-field label="Site" for="rq-site" [required]="true"><amc-select inputId="rq-site" formControlName="siteId" [options]="refs.siteOptions(customerId())" [searchable]="true" /></amc-form-field>
                <amc-form-field label="Contact" for="rq-contact"><amc-select inputId="rq-contact" formControlName="contactId" [options]="refs.contactOptions(customerId())" [clearable]="true" /></amc-form-field>
                <amc-form-field label="Asset" for="rq-asset" [help]="help.asset"><amc-select inputId="rq-asset" formControlName="assetId" [options]="refs.assetOptions(customerId(), siteId())" [clearable]="true" [searchable]="true" /></amc-form-field>
                @if (assetInfo(); as a) {
                  <div class="rounded-xl border border-line bg-surface-sunken p-3 text-xs text-ink sm:col-span-2">
                    <p class="font-semibold">{{ a.name }} <span class="text-ink-muted">· {{ a.code }} · {{ a.category }} / {{ a.type }}</span></p>
                    <p class="mt-1 text-ink-muted">{{ a.manufacturer }} {{ a.model }} · Serial {{ a.serialNumber }} · {{ a.status }} · Warranty: {{ a.warrantyStatus }}{{ a.warrantyEnd ? ' until ' + a.warrantyEnd : '' }}</p>
                  </div>
                }
                <amc-form-field label="Building / Area" for="rq-loc"><input id="rq-loc" formControlName="area" class="amc-input" placeholder="Floor, room, zone…" /></amc-form-field>
                <amc-form-field label="Access Instructions" for="rq-access"><input id="rq-access" formControlName="access" class="amc-input" placeholder="Gate pass, keys, escort…" /></amc-form-field>
              </div>
            </amc-panel>

            <amc-panel title="Classification" description="Suggested automatically from the description; adjust when needed." icon="list">
              <div class="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:p-5">
                <amc-form-field label="Problem Category" for="rq-pc"><input id="rq-pc" formControlName="problemCategory" class="amc-input" /></amc-form-field>
                <amc-form-field label="Required Skill" for="rq-skill"><input id="rq-skill" formControlName="requiredSkill" class="amc-input" /></amc-form-field>
                <amc-form-field label="Urgency" for="rq-urg"><amc-select inputId="rq-urg" formControlName="urgency" [options]="urgencyOptions" /></amc-form-field>
                <amc-form-field label="Business Impact" for="rq-imp"><amc-select inputId="rq-imp" formControlName="businessImpact" [options]="impactOptions" /></amc-form-field>
                <amc-form-field label="Affected Users" for="rq-users"><input id="rq-users" type="number" min="0" formControlName="affectedUsers" class="amc-input tabular-nums" /></amc-form-field>
                <amc-form-field label="Catalogue Service" for="rq-svc" hint="Link a service-catalogue item for entitlement check."><amc-select inputId="rq-svc" formControlName="requestedServiceId" [options]="refs.serviceOptions()" [clearable]="true" [searchable]="true" /></amc-form-field>
              </div>
            </amc-panel>

            <amc-panel title="Priority" description="Set before assignment; recalculates SLA targets." icon="alert-triangle">
              <div class="flex flex-wrap items-end gap-4 p-4 sm:p-5">
                <amc-form-field label="Priority" for="rq-pri" [required]="true" [help]="help.priority" class="w-48"><amc-select inputId="rq-pri" formControlName="priority" [options]="priorityOptions" /></amc-form-field>
                @if (suggestion(); as s) {
                  <p class="pb-1 text-xs text-ink-muted">Suggested: <amc-status-badge [label]="s.priority" [tone]="priorityTone[s.priority]" /> — {{ s.priorityFactors.join(' · ') }}</p>
                }
              </div>
            </amc-panel>

            <amc-panel title="Notes" icon="sticky-note">
              <div class="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:p-5">
                <amc-form-field label="Customer Note" for="rq-cn"><textarea id="rq-cn" formControlName="customerNote" class="amc-textarea min-h-12"></textarea></amc-form-field>
                <amc-form-field label="Internal Note" for="rq-in"><textarea id="rq-in" formControlName="internalNote" class="amc-textarea min-h-12"></textarea></amc-form-field>
              </div>
            </amc-panel>
          </div>

          <div class="space-y-5">
            @if (suggestion(); as s) {
              <amc-panel title="Automatic Suggestions" [description]="'Rule: ' + (s.rule ?? 'defaults')" icon="activity">
                <div class="space-y-3 p-4 text-sm sm:p-5">
                  <div class="flex items-center justify-between gap-2"><span class="text-ink-muted">Type / category</span><span class="text-right font-medium text-ink">{{ s.type ?? '—' }}<br />{{ s.serviceCategory ?? '' }}{{ s.subcategory ? ' · ' + s.subcategory : '' }}</span></div>
                  <div class="flex items-center justify-between gap-2"><span class="text-ink-muted">Problem / skill</span><span class="text-right font-medium text-ink">{{ s.problemCategory ?? '—' }}<br />{{ s.requiredSkill ?? '' }}</span></div>
                  <div class="flex items-center justify-between gap-2"><span class="text-ink-muted">Routing</span><span class="text-right font-medium text-ink">{{ s.team ?? '—' }}<br />{{ s.technician ?? '' }}</span></div>
                  <div class="flex items-center justify-between gap-2"><span class="text-ink-muted">SLA</span><span class="text-right font-medium text-ink">{{ s.slaNumber ?? 'No SLA' }}<br />{{ s.responseMinutes !== null ? 'respond ' + fmt(s.responseMinutes) + ' · resolve ' + fmt(s.resolutionMinutes ?? 0) : '' }}</span></div>
                  <div class="flex items-center justify-between gap-2"><span class="text-ink-muted">Coverage</span><amc-status-badge [label]="s.coverage.result" [tone]="s.coverage.result === 'Covered' ? 'ok' : s.coverage.result === 'Not Covered' ? 'danger' : 'warn'" /></div>
                  <button type="button" class="amc-btn-secondary amc-btn-sm w-full" (click)="applySuggestion(s)"><amc-icon name="check" /> Apply classification &amp; priority</button>
                </div>
              </amc-panel>
            }
            @if (duplicates().length) {
              <amc-panel title="Possible Duplicates" description="Similar open or recent requests for this customer, site, asset or subject." icon="layers">
                <ul class="divide-y divide-line">
                  @for (d of duplicates(); track d.id) {
                    <li class="px-4 py-3 sm:px-5">
                      <div class="flex items-center justify-between gap-2">
                        <p class="truncate text-sm font-medium text-ink">{{ d.number }} · {{ d.subject }}</p>
                        <span class="text-xs font-semibold tabular-nums" [class]="d.score >= 70 ? 'text-danger' : 'text-warn'">{{ d.score }}%</span>
                      </div>
                      <p class="mt-0.5 text-xs text-ink-muted">{{ d.status }} · {{ d.createdAt | date: 'mediumDate' }} · {{ d.reasons.join(', ') }}</p>
                      <div class="mt-2 flex gap-2">
                        <button type="button" class="amc-btn-ghost amc-btn-sm" (click)="duplicateAction.set({ action: 'link', to: d.id })">{{ duplicateAction()?.to === d.id ? '✓ Will link' : 'Link as related' }}</button>
                      </div>
                    </li>
                  }
                </ul>
                <div class="border-t border-line p-4 sm:px-5">
                  <amc-switch [checked]="duplicateAction()?.action === 'continue'" (checkedChange)="duplicateAction.set($event ? { action: 'continue', to: null } : null)" label="Not a duplicate — continue creating" />
                </div>
              </amc-panel>
            }
            <amc-panel title="Summary" icon="clipboard-list">
              <dl class="space-y-2 p-4 text-sm sm:p-5">
                <div class="flex justify-between gap-2"><dt class="text-ink-muted">Request number</dt><dd class="font-medium text-ink">{{ number() ?? '—' }}</dd></div>
                <div class="flex justify-between gap-2"><dt class="text-ink-muted">Status on save</dt><dd class="font-medium text-ink">New → Under Validation</dd></div>
                <div class="flex justify-between gap-2"><dt class="text-ink-muted">Customer</dt><dd class="max-w-55 truncate text-right font-medium text-ink">{{ customerName() || '—' }}</dd></div>
                <div class="flex justify-between gap-2"><dt class="text-ink-muted">Site</dt><dd class="max-w-55 truncate text-right font-medium text-ink">{{ siteName() || '—' }}</dd></div>
              </dl>
              <div class="flex gap-2 border-t border-line p-4 sm:px-5">
                <button type="submit" class="amc-btn-primary flex-1" [disabled]="saving()">@if (saving()) { <amc-spinner [size]="14" /> } {{ editId() ? 'Save Changes' : 'Create Request' }}</button>
                <a routerLink="/app/service-requests/list" class="amc-btn-secondary">Cancel</a>
              </div>
            </amc-panel>
          </div>
        </form>
      }
    </div>
  `,
})
export class RequestFormPage implements HasUnsavedChanges, OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(RequestApi);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationPort);
  protected readonly refs = inject(SrReferenceStore);

  readonly requestId = input<string>();
  readonly customer = input<string>();
  readonly site = input<string>();
  readonly asset = input<string>();
  readonly parent = input<string>();
  protected readonly editId = computed(() => this.requestId() ?? null);
  protected readonly help = SR_FIELD_HELP;
  protected readonly saving = signal(false);
  protected readonly suggestion = signal<Suggestion | null>(null);
  protected readonly duplicates = signal<DuplicateMatch[]>([]);
  protected readonly duplicateAction = signal<{ action: 'continue' | 'link'; to: string | null } | null>(null);
  protected readonly number = signal<string | null>(null);
  private saved = false;
  private suggestTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly typeOptions = toOptions(REQUEST_TYPES);
  protected readonly sourceOptions = toOptions(REQUEST_SOURCES);
  protected readonly urgencyOptions = toOptions(URGENCY);
  protected readonly impactOptions = toOptions(BUSINESS_IMPACT);
  protected readonly priorityOptions = toOptions(PRIORITIES);
  protected readonly priorityTone = PRIORITY_TONE;
  protected readonly fmt = (m: number | null) => (m === null ? '—' : m >= 1440 ? `${Math.round(m / 1440)}d` : m >= 60 ? `${Math.round(m / 60)}h` : `${m}m`);

  protected readonly form = this.fb.group({
    type: this.fb.control<RequestType>('Service Request', { validators: Validators.required }),
    source: this.fb.control('Phone', { validators: Validators.required }),
    subject: this.fb.control('', { validators: [Validators.required, Validators.minLength(5)] }),
    description: this.fb.control('', { validators: [Validators.required, Validators.minLength(20)] }),
    serviceCategory: this.fb.control('', { validators: Validators.required }),
    subcategory: this.fb.control(''),
    requestedDate: this.fb.control(''),
    requestedTime: this.fb.control(''),
    customerReference: this.fb.control(''),
    parentRequestId: this.fb.control(''),
    customerId: this.fb.control('', { validators: Validators.required }),
    siteId: this.fb.control('', { validators: Validators.required }),
    contactId: this.fb.control(''),
    assetId: this.fb.control(''),
    area: this.fb.control(''),
    access: this.fb.control(''),
    problemCategory: this.fb.control(''),
    requiredSkill: this.fb.control(''),
    urgency: this.fb.control('Medium'),
    businessImpact: this.fb.control('Medium'),
    affectedUsers: this.fb.control(1),
    requestedServiceId: this.fb.control(''),
    priority: this.fb.control('', { validators: Validators.required }),
    customerNote: this.fb.control(''),
    internalNote: this.fb.control(''),
  });

  protected readonly existing = rxResource({ params: () => this.editId(), stream: ({ params }) => (params ? this.api.get(params) : of(null)) });
  private readonly numberRes = rxResource({ params: () => this.editId(), stream: ({ params }) => (params ? of('') : this.api.nextNumber()) });
  private readonly values = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  protected readonly customerId = computed(() => this.values()?.customerId || null);
  protected readonly siteId = computed(() => this.values()?.siteId || null);
  private readonly assetId = computed(() => this.values()?.assetId || null);
  protected readonly assetInfo = computed(() => this.refs.asset(this.assetId()));
  protected readonly customerName = computed(() => this.refs.customer(this.customerId())?.name ?? '');
  protected readonly siteName = computed(() => this.refs.site(this.siteId())?.name ?? '');
  protected readonly subcategoryOptions = computed(() => this.refs.subcategoryOptions(this.values()?.serviceCategory));
  protected readonly parentOptions = computed(() => (this.parents.hasValue() ? this.parents.value().filter((r) => r.id !== this.editId()).map((r) => ({ value: r.id, label: `${r.number} · ${r.subject}`, hint: r.status })) : []));
  private readonly parents = rxResource({ stream: () => this.api.list() });

  constructor() {
    this.form.controls.customerId.valueChanges.subscribe(() => {
      this.form.patchValue({ siteId: '', contactId: '', assetId: '' }, { emitEvent: false });
    });
    this.form.controls.siteId.valueChanges.subscribe(() => this.form.controls.assetId.setValue('', { emitEvent: false }));
    effect(() => {
      const r = this.existing.hasValue() ? this.existing.value() : null;
      const num = this.numberRes.hasValue() ? this.numberRes.value() : null;
      untracked(() => {
        this.number.set(r?.number ?? num ?? this.number());
        if (r) {
          this.form.patchValue({
            type: r.type, source: r.source, subject: r.subject, description: r.description, serviceCategory: r.serviceCategory, subcategory: r.subcategory,
            requestedDate: r.requestedDate ?? '', requestedTime: r.requestedTime, customerReference: r.customerReference, parentRequestId: r.origin.parentRequestId ?? '',
            customerId: r.customer.customerId, siteId: r.location.siteId, contactId: r.customer.contactId ?? '', assetId: r.assetId ?? '', area: r.location.area, access: r.location.accessInstructions,
            problemCategory: r.classification.problemCategory, requiredSkill: r.classification.requiredSkill, urgency: r.classification.urgency, businessImpact: r.classification.businessImpact,
            affectedUsers: r.classification.affectedUsers, requestedServiceId: r.classification.requestedServiceId ?? '', priority: r.priority, customerNote: r.notes.customer, internalNote: r.notes.internal,
          });
          this.form.markAsPristine();
        }
      });
    });
    effect(() => {
      // Deep-link prefill from Customer 360 / Asset 360 (create mode only).
      if (this.editId()) return;
      const customer = this.customer();
      const site = this.site();
      const asset = this.asset();
      const parent = this.parent();
      if (!customer && !site && !asset && !parent) return;
      untracked(() => {
        const siteRef = site ? this.refs.site(site) : null;
        const assetRef = asset ? this.refs.asset(asset) : null;
        this.form.patchValue(
          {
            customerId: customer ?? siteRef?.customerId ?? assetRef?.customerId ?? '',
            siteId: site ?? assetRef?.siteId ?? '',
            assetId: asset ?? '',
            parentRequestId: parent ?? '',
          },
          { emitEvent: true },
        );
      });
    });
    effect(() => {
      const v = this.values();
      const text = `${v?.subject ?? ''} ${v?.description ?? ''}`;
      const customerId = this.customerId();
      const assetId = this.assetId() ?? '';
      untracked(() => this.queueSuggestion(text, customerId, assetId));
    });
  }

  ngOnInit(): void {
    if (!this.editId()) this.refreshSuggestion();
  }

  private queueSuggestion(text: string, customerId: string | null, assetId: string): void {
    if (this.suggestTimer) clearTimeout(this.suggestTimer);
    void assetId;
    this.suggestTimer = setTimeout(() => void this.refreshSuggestion(text, customerId), 350);
  }

  private async refreshSuggestion(text = `${this.form.controls.subject.value} ${this.form.controls.description.value}`, customerId = this.customerId()): Promise<void> {
    if (text.trim().length < 10 && !customerId) return;
    const draft = this.draft();
    try {
      this.suggestion.set(await firstValueFrom(this.api.suggest(draft)));
      this.duplicates.set(customerId && text.trim().length >= 5 ? await firstValueFrom(this.api.duplicates(draft, this.editId() ?? undefined)) : []);
    } catch {
      this.suggestion.set(null);
    }
  }

  protected applySuggestion(s: Suggestion): void {
    this.form.patchValue({
      type: s.type ?? this.form.controls.type.value,
      serviceCategory: s.serviceCategory ?? this.form.controls.serviceCategory.value,
      subcategory: s.subcategory ?? this.form.controls.subcategory.value,
      problemCategory: s.problemCategory ?? this.form.controls.problemCategory.value,
      requiredSkill: s.requiredSkill ?? this.form.controls.requiredSkill.value,
      requestedServiceId: s.serviceId ?? this.form.controls.requestedServiceId.value,
      priority: s.priority,
    });
  }

  private draft(): RequestDraft {
    const v = this.form.getRawValue();
    const contact = this.refs.contact(v.contactId || null);
    const site = this.refs.site(v.siteId || null);
    return {
      type: v.type, serviceCategory: v.serviceCategory, subcategory: v.subcategory, subject: v.subject, description: v.description, source: v.source,
      requestedDate: v.requestedDate || null, requestedTime: v.requestedTime, priority: (v.priority || null) as RequestDraft['priority'], customerReference: v.customerReference,
      customer: { customerId: v.customerId, contactId: v.contactId || null, contactName: contact?.name ?? '', phone: contact?.phone ?? '', email: contact?.email ?? '' },
      location: { siteId: v.siteId, building: site?.name ?? '', area: v.area, accessInstructions: v.access },
      assetId: v.assetId || null,
      classification: { ...EMPTY_CLASS, problemCategory: v.problemCategory, requiredSkill: v.requiredSkill, urgency: v.urgency, businessImpact: v.businessImpact, affectedUsers: v.affectedUsers, requestedServiceId: v.requestedServiceId || null },
      notes: { customer: v.customerNote, internal: v.internalNote },
      parentRequestId: v.parentRequestId || null,
    };
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notify.error('Fill in the required fields (description needs at least 20 characters).');
      return;
    }
    this.saving.set(true);
    try {
      const draft = this.draft();
      if (this.editId()) {
        await firstValueFrom(this.api.update(this.editId()!, draft, 'Request updated'));
        this.saved = true;
        this.notify.success('Request updated.');
        void this.router.navigate(['/app/service-requests', this.editId()]);
      } else {
        const dup = this.duplicateAction();
        const created = await firstValueFrom(this.api.create(draft, dup?.action ?? 'none', dup?.to ?? null));
        this.saved = true;
        this.notify.success(`${created.number} created.`);
        void this.router.navigate(['/app/service-requests', created.id]);
      }
    } catch (e) {
      this.notify.error((e as Error).message);
    } finally {
      this.saving.set(false);
    }
  }

  hasUnsavedChanges(): boolean {
    return !this.saved && this.form.dirty;
  }
}
