import { ChangeDetectionStrategy, Component, ElementRef, type OnInit, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { rxResource, takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { type AbstractControl, type AsyncValidatorFn, FormControl, FormRecord, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { HasUnsavedChanges } from '@core/guards/unsaved-changes.guard';
import { NotificationPort } from '@core/notification/notification.port';
import { toOptions } from '@shared/models/select-option';
import { ActionMenu } from '@shared/ui/action-menu';
import { DatePicker } from '@shared/ui/date-picker';
import { ErrorState } from '@shared/ui/error-state';
import { FormField } from '@shared/ui/form-field';
import { Icon, type IconName } from '@shared/ui/icon';
import { LookupSelect } from '@shared/ui/lookup-select';
import { PageHeader } from '@shared/ui/page-header';
import { Panel } from '@shared/ui/panel';
import { Select } from '@shared/ui/select';
import { Skeleton } from '@shared/ui/skeleton';
import { Spinner } from '@shared/ui/spinner';
import { StatusBadge } from '@shared/ui/status-badge';
import { daysBetween, formatFileSize } from '@shared/utils/format';
import { filter, firstValueFrom, map, of, startWith, switchMap, timer } from 'rxjs';
import { AssetReferenceStore } from '../../data/asset-reference.store';
import { AssetApi, AssetDocumentApi, WarrantyApi } from '../../data/asset.api';
import { ASSET_RULES, CRITICALITY_PROFILE, SITE_REQUIRED_STATUSES, STATUS_TRANSITIONS, TECHNICAL_FIELDS, categoryProfile } from '../../data/asset.config';
import { ASSET_LOOKUP } from '../../data/asset.lookups';
import { ASSET_FIELD_HELP } from '../../data/field-help';
import {
  ASSET_STATUSES,
  CRITICALITIES,
  NON_CUSTOMER_OWNERSHIP,
  OWNERSHIP_TYPES,
  SERVICE_FREQUENCIES,
  SERVICE_PRIORITIES,
  type AssetDetail,
  type AssetStatus,
  type AssetUpsert,
  type Criticality,
  type OwnershipType,
  type ServiceFrequency,
  type ServicePriority,
} from '../../models/asset.model';
import { ASSET_STATUS_TONE, CRITICALITY_TONE, WARRANTY_STATUS_TONE } from '../../models/display';
import type { WarrantyStatus } from '../../models/warranty.model';

type SaveIntent = 'save' | 'component' | 'install' | 'warranty';
type SectionGroup = 'identification' | 'classification' | 'manufacturer' | 'installation' | 'technical' | 'warranty' | 'service' | 'ownership' | 'operational' | 'notes';

interface FormSection {
  readonly id: SectionGroup;
  readonly label: string;
  readonly icon: IconName;
}

const SECTIONS: readonly FormSection[] = [
  { id: 'identification', label: 'Asset identification', icon: 'hash' },
  { id: 'classification', label: 'Asset classification', icon: 'tag' },
  { id: 'manufacturer', label: 'Manufacturer information', icon: 'building' },
  { id: 'installation', label: 'Installation information', icon: 'wrench' },
  { id: 'technical', label: 'Technical information', icon: 'sliders' },
  { id: 'warranty', label: 'Warranty information', icon: 'shield-check' },
  { id: 'service', label: 'Contract / service', icon: 'file-check' },
  { id: 'ownership', label: 'Ownership & financial', icon: 'wallet' },
  { id: 'operational', label: 'Operational information', icon: 'activity' },
  { id: 'notes', label: 'Notes & attachments', icon: 'sticky-note' },
];

const today = () => new Date().toISOString().slice(0, 10);

@Component({
  selector: 'amc-asset-form-page',
  imports: [ActionMenu, DatePicker, ErrorState, FormField, Icon, LookupSelect, PageHeader, Panel, ReactiveFormsModule, RouterLink, Select, Skeleton, Spinner, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './asset-form.page.html',
})
export class AssetFormPage implements HasUnsavedChanges, OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(AssetApi);
  private readonly warrantiesApi = inject(WarrantyApi);
  private readonly documents = inject(AssetDocumentApi);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationPort);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly refs = inject(AssetReferenceStore);

  /** Route parameter; absent in create mode. */
  readonly assetId = input<string>();
  /** Query parameters used to prefill a new asset. */
  readonly customerId = input<string>();
  readonly siteId = input<string>();
  protected readonly isEdit = computed(() => !!this.assetId());

  private readonly codeAvailable: AsyncValidatorFn = (control: AbstractControl) =>
    !control.value || control.disabled
      ? of(null)
      : timer(350).pipe(switchMap(() => this.api.isCodeAvailable(String(control.value), this.assetId())), map((ok) => (ok ? null : { codeTaken: 'This Asset ID is already in use.' })));
  private readonly tagAvailable: AsyncValidatorFn = (control: AbstractControl) =>
    !control.value
      ? of(null)
      : timer(350).pipe(switchMap(() => this.api.isTagAvailable(String(control.value), this.assetId())), map((ok) => (ok ? null : { tagTaken: 'This asset tag is already in use.' })));
  private readonly serialAvailable: AsyncValidatorFn = (control: AbstractControl) => {
    const group = control.parent;
    const classification = this.form?.controls.classification;
    if (!control.value || !group || !classification) return of(null);
    return timer(400).pipe(
      switchMap(() => this.api.isSerialAvailable({ serialNumber: String(control.value), manufacturer: group.get('manufacturer')?.value ?? '', type: classification.controls.type.value }, this.assetId())),
      map((ok) => (ok ? null : { serialTaken: 'This serial number already exists for the same manufacturer and asset type.' })),
    );
  };

  protected readonly form = this.fb.group({
    identification: this.fb.group({
      code: this.fb.control('', { validators: [Validators.required, Validators.pattern(/^[A-Za-z0-9-]{3,20}$/)], asyncValidators: [this.codeAvailable] }),
      tag: this.fb.control('', { validators: [Validators.required, Validators.maxLength(40)], asyncValidators: ASSET_RULES.uniqueTag ? [this.tagAvailable] : [] }),
      name: this.fb.control('', [Validators.required, Validators.maxLength(150)]),
      customerId: this.fb.control(''),
      siteId: this.fb.control(''),
      status: this.fb.control<AssetStatus>('Planned', Validators.required),
      barcode: this.fb.control(''),
      rfid: this.fb.control(''),
    }),
    classification: this.fb.group({
      category: this.fb.control('', Validators.required),
      type: this.fb.control('', Validators.required),
      subType: this.fb.control(''),
      criticality: this.fb.control<Criticality>('Medium', Validators.required),
      serviceClass: this.fb.control(''),
      maintenanceClass: this.fb.control(''),
    }),
    manufacturer: this.fb.group({
      manufacturer: this.fb.control('', Validators.required),
      brand: this.fb.control(''),
      model: this.fb.control('', Validators.required),
      modelNumber: this.fb.control(''),
      serialNumber: this.fb.control('', { validators: [Validators.maxLength(60)], asyncValidators: [this.serialAvailable] }),
      partNumber: this.fb.control(''),
      productFamily: this.fb.control(''),
      manufacturingDate: this.fb.control(''),
    }),
    installation: this.fb.group({
      date: this.fb.control(''),
      commissioningDate: this.fb.control(''),
      installedBy: this.fb.control(''),
      location: this.fb.control(''),
      floor: this.fb.control(''),
      room: this.fb.control(''),
      area: this.fb.control(''),
      initialMeterReading: this.fb.control<number | null>(null, Validators.min(0)),
      notes: this.fb.control('', Validators.maxLength(1000)),
    }),
    technical: this.fb.group({
      capacity: this.fb.control(''),
      powerRating: this.fb.control(''),
      voltage: this.fb.control(''),
      frequency: this.fb.control(''),
      dimensions: this.fb.control(''),
      weight: this.fb.control(''),
      operatingRange: this.fb.control(''),
      fuelType: this.fb.control(''),
      refrigerantType: this.fb.control(''),
      specifications: this.fb.control('', Validators.maxLength(2000)),
    }),
    customAttributes: new FormRecord<FormControl<string>>({}),
    warranty: this.fb.group({
      provider: this.fb.control(''),
      reference: this.fb.control(''),
      startDate: this.fb.control(''),
      endDate: this.fb.control(''),
      terms: this.fb.control(''),
      notes: this.fb.control(''),
    }),
    service: this.fb.group({
      contractId: this.fb.control(''),
      amcId: this.fb.control(''),
      slaId: this.fb.control(''),
      servicePlan: this.fb.control(''),
      maintenancePlan: this.fb.control(''),
      serviceFrequency: this.fb.control<ServiceFrequency | ''>(''),
      servicePriority: this.fb.control<ServicePriority>('Medium', Validators.required),
      serviceTerritoryId: this.fb.control(''),
    }),
    ownership: this.fb.group({
      type: this.fb.control<OwnershipType>('Customer Owned', Validators.required),
      owner: this.fb.control(''),
      purchaseDate: this.fb.control(''),
      purchaseCost: this.fb.control<number | null>(null, Validators.min(0)),
      currency: this.fb.control('SAR'),
      supplier: this.fb.control(''),
      purchaseReference: this.fb.control(''),
      depreciationReference: this.fb.control(''),
      financialAssetReference: this.fb.control(''),
    }),
    operational: this.fb.group({
      responsibleTeam: this.fb.control(''),
      assignedTechnician: this.fb.control(''),
      serviceRegion: this.fb.control(''),
      operatingHours: this.fb.control<number | null>(null, Validators.min(0)),
      meterType: this.fb.control(''),
      currentMeterReading: this.fb.control<number | null>(null, Validators.min(0)),
      lastMaintenanceDate: this.fb.control(''),
      nextMaintenanceDate: this.fb.control(''),
    }),
    notes: this.fb.group({
      internalNotes: this.fb.control('', Validators.maxLength(2000)),
      customerNotes: this.fb.control('', Validators.maxLength(2000)),
      technicianInstructions: this.fb.control('', Validators.maxLength(2000)),
    }),
  });

  protected readonly sections = SECTIONS;
  protected readonly lookup = ASSET_LOOKUP;
  protected readonly help = ASSET_FIELD_HELP;
  protected readonly technicalFields = TECHNICAL_FIELDS;
  protected readonly criticalityOptions = toOptions(CRITICALITIES);
  protected readonly ownershipOptions = toOptions(OWNERSHIP_TYPES);
  protected readonly frequencyOptions = toOptions(SERVICE_FREQUENCIES);
  protected readonly priorityOptions = toOptions(SERVICE_PRIORITIES);
  protected readonly statusTone = ASSET_STATUS_TONE;
  protected readonly criticalityTone = CRITICALITY_TONE;
  protected readonly warrantyTone = WARRANTY_STATUS_TONE;
  protected readonly criticalityProfile = CRITICALITY_PROFILE;
  protected readonly formatFileSize = formatFileSize;

  protected readonly value = toSignal(this.form.valueChanges.pipe(startWith(null), map(() => this.form.getRawValue())), { initialValue: this.form.getRawValue() });
  private readonly formEvents = toSignal(this.form.events.pipe(map(() => Symbol())));

  protected readonly existing = rxResource({ params: () => this.assetId(), stream: ({ params }) => this.api.get(params) });
  protected readonly saving = signal(false);
  protected readonly attachments = signal<readonly File[]>([]);
  private saved = false;

  protected readonly siteOptions = computed(() => this.refs.siteOptions(this.value().identification.customerId));
  protected readonly contractOptions = computed(() => this.refs.agreementOptions('Contract', this.value().identification.customerId, this.value().identification.siteId));
  protected readonly amcOptions = computed(() => this.refs.agreementOptions('AMC', this.value().identification.customerId, this.value().identification.siteId));
  protected readonly territoryOptions = computed(() => this.refs.territoryOptions(this.value().operational.serviceRegion));
  protected readonly profile = computed(() => categoryProfile(this.value().classification.category));
  protected readonly visibleTechnical = computed(() => this.technicalFields.filter((f) => this.profile().technical.includes(f.key)));

  /** Statuses selectable on the form: on create all pre-operational values, on edit the allowed transitions. */
  protected readonly statusOptions = computed(() => {
    const existing = this.existing.hasValue() ? this.existing.value() : null;
    if (!existing) return toOptions(ASSET_STATUSES.filter((s) => s !== 'Transferred'));
    return toOptions([existing.status, ...STATUS_TRANSITIONS[existing.status]]);
  });

  /** Customer/site of installed assets change through the transfer workflow. */
  protected readonly locationLocked = computed(() => {
    const existing = this.existing.hasValue() ? this.existing.value() : null;
    return !!existing?.installation.date && !!existing.siteId;
  });

  protected readonly warrantyStatus = computed<WarrantyStatus>(() => {
    const { startDate, endDate } = this.value().warranty;
    if (!startDate || !endDate) return 'No Warranty';
    const now = today();
    if (now < startDate) return 'Not Started';
    if (now > endDate) return 'Expired';
    return daysBetween(now, endDate) <= ASSET_RULES.warrantyExpiringDays ? 'Expiring Soon' : 'Active';
  });

  protected readonly sectionProgress = computed(() => {
    this.formEvents();
    return this.sections.map((s) => {
      const group = this.form.controls[s.id];
      if (s.id === 'notes' || s.id === 'technical' || s.id === 'warranty') return group.valid ? 100 : 80;
      const controls = Object.values(group.controls) as AbstractControl[];
      const required = controls.filter((c) => c.hasValidator(Validators.required));
      if (!required.length) return group.valid ? 100 : 80;
      return Math.round((required.filter((c) => c.value !== '' && c.value !== null).length / required.length) * 100);
    });
  });
  protected readonly overallProgress = computed(() => Math.round(this.sectionProgress().reduce((s, v) => s + v, 0) / this.sections.length));

  constructor() {
    effect(() => {
      if (this.existing.hasValue() && this.existing.value()) this.patch(this.existing.value());
    });

    const id = this.form.controls.identification.controls;
    id.customerId.valueChanges.pipe(takeUntilDestroyed()).subscribe((customerId) => {
      if (this.patching) return;
      id.siteId.setValue('');
      const customer = this.refs.customer(customerId);
      if (!customer) return;
      const op = this.form.controls.operational.controls;
      const own = this.form.controls.ownership.controls;
      if (!op.serviceRegion.dirty) op.serviceRegion.setValue(customer.serviceRegion);
      if (!own.currency.dirty) own.currency.setValue(customer.currency);
      if (own.type.value === 'Customer Owned' && !own.owner.dirty) own.owner.setValue(customer.name);
      this.form.controls.service.patchValue({ contractId: '', amcId: '' });
    });
    id.siteId.valueChanges.pipe(takeUntilDestroyed()).subscribe((siteId) => {
      if (this.patching) return;
      const site = this.refs.site(siteId);
      if (!site) return;
      const svc = this.form.controls.service.controls;
      if (!svc.serviceTerritoryId.dirty && site.serviceTerritoryId) svc.serviceTerritoryId.setValue(site.serviceTerritoryId);
      if (!svc.slaId.dirty && site.defaultSlaId) svc.slaId.setValue(site.defaultSlaId);
    });
    this.form.controls.classification.controls.criticality.valueChanges.pipe(takeUntilDestroyed()).subscribe((criticality) => {
      const priority = this.form.controls.service.controls.servicePriority;
      if (!priority.dirty) priority.setValue(criticality);
    });
    this.form.controls.manufacturer.controls.manufacturer.valueChanges.pipe(takeUntilDestroyed()).subscribe((manufacturer) => {
      const brand = this.form.controls.manufacturer.controls.brand;
      if (!brand.dirty && !this.patching) brand.setValue(manufacturer);
      this.form.controls.manufacturer.controls.serialNumber.updateValueAndValidity();
    });
    this.form.controls.classification.controls.type.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.form.controls.manufacturer.controls.serialNumber.updateValueAndValidity());
    id.tag.valueChanges.pipe(takeUntilDestroyed()).subscribe((tag) => {
      if (!id.barcode.dirty && !this.patching) id.barcode.setValue(tag, { emitEvent: false });
    });

    // Business rules (SRS 3.16) as dynamic validators.
    effect(() => {
      const v = this.value();
      untracked(() => {
        const customerRequired = !NON_CUSTOMER_OWNERSHIP.includes(v.ownership.type);
        const siteRequired = !!v.identification.customerId && SITE_REQUIRED_STATUSES.includes(v.identification.status);
        const ownerRequired = !v.identification.customerId;
        this.toggleRequired(id.customerId, customerRequired);
        this.toggleRequired(id.siteId, siteRequired);
        this.toggleRequired(this.form.controls.ownership.controls.owner, ownerRequired);
        this.toggleRequired(this.form.controls.installation.controls.date, v.identification.status !== 'Planned' && v.identification.status !== 'Ordered' && v.identification.status !== 'Received');
      });
    });

    // Custom attributes configured by category.
    effect(() => {
      const attributes = this.profile().attributes;
      untracked(() => {
        const record = this.form.controls.customAttributes;
        for (const attr of attributes) if (!record.contains(attr.key)) record.addControl(attr.key, new FormControl('', { nonNullable: true }), { emitEvent: false });
      });
    });
  }

  ngOnInit(): void {
    if (this.assetId()) return;
    void firstValueFrom(this.api.nextCode()).then((code) => {
      const c = this.form.controls.identification.controls;
      if (!c.code.dirty) c.code.setValue(code);
      if (!c.tag.dirty) c.tag.setValue(code.replace('AST', 'TAG'));
    });
  }

  private prefilled = false;
  /** Applies `?customerId=&siteId=` once reference data is available. */
  protected readonly prefill = effect(() => {
    const customerId = this.customerId();
    if (this.prefilled || this.assetId() || !customerId || !this.refs.data().customers.length) return;
    this.prefilled = true;
    untracked(() => {
      const c = this.form.controls.identification.controls;
      c.customerId.setValue(customerId);
      if (this.siteId()) c.siteId.setValue(this.siteId()!);
    });
  });

  hasUnsavedChanges(): boolean {
    return !this.saved && this.form.dirty;
  }

  private toggleRequired(control: AbstractControl, required: boolean): void {
    if (control.hasValidator(Validators.required) === required) return;
    if (required) control.addValidators(Validators.required);
    else control.removeValidators(Validators.required);
    control.updateValueAndValidity({ emitEvent: false });
  }

  protected sectionInvalid(group: SectionGroup): boolean {
    this.formEvents();
    const control = this.form.controls[group];
    return control.invalid && control.touched;
  }

  protected scrollTo(id: string): void {
    this.host.nativeElement.querySelector(`#section-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected onFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.attachments.update((list) => [...list, ...Array.from(input.files ?? [])]);
    input.value = '';
    this.form.markAsDirty();
  }

  protected removeFile(file: File): void {
    this.attachments.update((list) => list.filter((f) => f !== file));
  }

  private patching = false;

  private patch(a: AssetDetail): void {
    this.patching = true;
    const record = this.form.controls.customAttributes;
    for (const key of Object.keys(a.customAttributes)) if (!record.contains(key)) record.addControl(key, new FormControl('', { nonNullable: true }), { emitEvent: false });
    this.form.patchValue({
      identification: { code: a.code, tag: a.tag, name: a.name, customerId: a.customerId ?? '', siteId: a.siteId ?? '', status: a.status, barcode: a.barcode, rfid: a.rfid },
      classification: { category: a.category, type: a.type, subType: a.subType, criticality: a.criticality, serviceClass: a.serviceClass, maintenanceClass: a.maintenanceClass },
      manufacturer: { manufacturer: a.manufacturer, brand: a.brand, model: a.model, modelNumber: a.modelNumber, serialNumber: a.serialNumber, partNumber: a.partNumber, productFamily: a.productFamily, manufacturingDate: a.manufacturingDate ?? '' },
      installation: { ...a.installation, date: a.installation.date ?? '', commissioningDate: a.installation.commissioningDate ?? '' },
      technical: a.technical,
      customAttributes: a.customAttributes,
      service: { ...a.service, contractId: a.service.contractId ?? '', amcId: a.service.amcId ?? '', slaId: a.service.slaId ?? '', serviceFrequency: a.service.serviceFrequency ?? '', serviceTerritoryId: a.service.serviceTerritoryId ?? '' },
      ownership: { ...a.ownership, purchaseDate: a.ownership.purchaseDate ?? '' },
      operational: { ...a.operational, lastMaintenanceDate: a.operational.lastMaintenanceDate ?? '', nextMaintenanceDate: a.operational.nextMaintenanceDate ?? '' },
      notes: a.notes,
    });
    this.form.controls.identification.controls.code.disable({ emitEvent: false });
    if (this.locationLocked()) {
      this.form.controls.identification.controls.customerId.disable({ emitEvent: false });
      this.form.controls.identification.controls.siteId.disable({ emitEvent: false });
    }
    void firstValueFrom(this.warrantiesApi.list({ assetId: a.id })).then((warranties) => {
      const primary = warranties.find((w) => w.isPrimary) ?? warranties.find((w) => !w.componentId);
      if (primary) {
        this.form.controls.warranty.patchValue({ provider: primary.provider, reference: primary.reference, startDate: primary.startDate, endDate: primary.endDate, terms: primary.coverageDetails, notes: primary.notes }, { emitEvent: false });
        this.form.controls.warranty.updateValueAndValidity();
      }
      this.form.markAsPristine();
    });
    this.form.markAsPristine();
    this.patching = false;
  }

  protected async save(intent: SaveIntent): Promise<void> {
    if (this.saving()) return;
    this.form.markAllAsTouched();
    if (this.form.pending) await firstValueFrom(this.form.statusChanges.pipe(startWith(this.form.status), filter((s) => s !== 'PENDING')));
    const w = this.form.controls.warranty.getRawValue();
    if (w.startDate && w.endDate && w.endDate < w.startDate) {
      this.notify.error('The warranty end date must be on or after the start date.', 'Warranty dates');
      return;
    }
    if (this.form.invalid) {
      this.notify.error('Please review the highlighted fields before saving.', 'Some fields need attention');
      queueMicrotask(() => this.host.nativeElement.querySelector<HTMLElement>('input.ng-invalid, textarea.ng-invalid, button.ng-invalid')?.focus());
      return;
    }
    this.saving.set(true);
    try {
      const payload = this.toUpsert();
      const id = this.assetId();
      const asset = await firstValueFrom(id ? this.api.update(id, payload) : this.api.create(payload));
      for (const file of this.attachments()) {
        await firstValueFrom(
          this.documents.upload({
            assetId: asset.id, componentId: null, name: file.name.replace(/\.[^.]+$/, ''), type: 'Other', documentNumber: '', issueDate: today(), expiryDate: null,
            reminderDays: 30, access: 'Internal', notes: 'Uploaded from asset form', file: { name: file.name, size: file.size, type: file.type },
          }),
        );
      }
      this.saved = true;
      this.notify.success(`${asset.name} (${asset.code}) was ${id ? 'updated' : 'created'} successfully.`, id ? 'Asset updated' : 'Asset created');
      if (intent === 'component') void this.router.navigate(['/app/assets', asset.id], { queryParams: { tab: 'components', action: 'add-component' } });
      else if (intent === 'warranty') void this.router.navigate(['/app/assets', asset.id], { queryParams: { tab: 'warranty', action: 'add-warranty' } });
      else if (intent === 'install') void this.router.navigate(['/app/assets/installations'], { queryParams: { assetId: asset.id } });
      else void this.router.navigate(['/app/assets', asset.id]);
    } catch (error) {
      this.notify.error((error as Error).message, 'Could not save asset');
    } finally {
      this.saving.set(false);
    }
  }

  protected onMoreAction(id: string): void {
    void this.save(id as SaveIntent);
  }

  private toUpsert(): AssetUpsert {
    const v = this.form.getRawValue();
    const nul = (value: string) => value || null;
    const attributes = Object.fromEntries(Object.entries(v.customAttributes).filter(([key, value]) => value && this.profile().attributes.some((a) => a.key === key)));
    return {
      code: v.identification.code.trim().toUpperCase(),
      tag: v.identification.tag.trim(),
      name: v.identification.name.trim(),
      customerId: nul(v.identification.customerId),
      siteId: nul(v.identification.siteId),
      status: v.identification.status,
      barcode: v.identification.barcode.trim() || v.identification.tag.trim(),
      rfid: v.identification.rfid.trim(),
      ...v.classification,
      ...v.manufacturer,
      manufacturingDate: nul(v.manufacturer.manufacturingDate),
      installation: { ...v.installation, date: nul(v.installation.date), commissioningDate: nul(v.installation.commissioningDate) },
      technical: v.technical,
      customAttributes: attributes,
      service: { ...v.service, contractId: nul(v.service.contractId), amcId: nul(v.service.amcId), slaId: nul(v.service.slaId), serviceFrequency: v.service.serviceFrequency || null, serviceTerritoryId: nul(v.service.serviceTerritoryId) },
      ownership: { ...v.ownership, purchaseDate: nul(v.ownership.purchaseDate) },
      operational: { ...v.operational, lastMaintenanceDate: nul(v.operational.lastMaintenanceDate), nextMaintenanceDate: nul(v.operational.nextMaintenanceDate) },
      notes: v.notes,
      warranty: v.warranty.startDate && v.warranty.endDate ? { ...v.warranty, startDate: v.warranty.startDate, endDate: v.warranty.endDate } : null,
    };
  }
}
