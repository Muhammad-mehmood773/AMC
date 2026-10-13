import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  type FormControl,
  type FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import type { FieldHelp } from '@shared/ui/field-info';
import { FormField, type FieldErrorMessages } from '@shared/ui/form-field';
import { map, startWith, switchMap } from 'rxjs';
import { CustomerLookupsStore } from '../data/lookups.store';
import type { Address } from '../models/customer.model';
import { getCountryConfig } from '../models/country-config';
import { PATTERNS, PATTERN_MESSAGES } from '../utils/form-patterns';
import { Select } from '@shared/ui/select';

export type AddressFormGroup = FormGroup<{
  country: FormControl<string>;
  region: FormControl<string>;
  city: FormControl<string>;
  district: FormControl<string>;
  street: FormControl<string>;
  buildingNumber: FormControl<string>;
  postalCode: FormControl<string>;
  additionalNumber: FormControl<string>;
  addressLine: FormControl<string>;
  latitude: FormControl<number | null>;
  longitude: FormControl<number | null>;
}>;

export function createAddressGroup(fb: NonNullableFormBuilder): AddressFormGroup {
  return fb.group({
    country: fb.control('', Validators.required),
    region: fb.control('', Validators.required),
    city: fb.control('', Validators.required),
    district: fb.control(''),
    street: fb.control(''),
    buildingNumber: fb.control('', Validators.pattern(PATTERNS.buildingNumber)),
    postalCode: fb.control(''),
    additionalNumber: fb.control('', Validators.pattern(PATTERNS.additionalNumber)),
    addressLine: fb.control('', Validators.maxLength(250)),
    latitude: fb.control<number | null>(null, [Validators.min(-90), Validators.max(90)]),
    longitude: fb.control<number | null>(null, [Validators.min(-180), Validators.max(180)]),
  });
}

export function addressValue(group: AddressFormGroup): Address {
  return { ...group.getRawValue() };
}

/** Internationally adaptive address field set with cascading country → region → city selects.
 *  KSA-specific fields (building number, additional number) are shown only when Saudi Arabia
 *  is selected. Postal code validation and labels adapt to the selected country. */
@Component({
  selector: 'amc-address-fields',
  imports: [FormField, ReactiveFormsModule, Select],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let g = group();
    @let cfg = countryCfg();
    <div [formGroup]="g" class="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
      <amc-form-field label="Country" [for]="id('country')" [control]="g.controls.country">
        <amc-select [inputId]="id('country')" formControlName="country" [options]="lookups.countryOptions()" (selectionChange)="onCountry()" />
      </amc-form-field>
      <amc-form-field [label]="cfg.address.regionLabel" [for]="id('region')" [control]="g.controls.region">
        <amc-select [inputId]="id('region')" formControlName="region" [options]="regionOptions()" placeholder="Select region…" (selectionChange)="onRegion()" />
      </amc-form-field>
      <amc-form-field label="City" [for]="id('city')" [control]="g.controls.city" [hint]="value().region ? '' : 'Select a region first.'">
        <amc-select [inputId]="id('city')" formControlName="city" [options]="cityOptions()" placeholder="Select city…" />
      </amc-form-field>
      <amc-form-field label="District / Neighbourhood" [for]="id('district')" [control]="g.controls.district">
        <input [id]="id('district')" class="amc-input" formControlName="district" placeholder="District or neighbourhood" />
      </amc-form-field>
      <amc-form-field label="Street" [for]="id('street')" [control]="g.controls.street">
        <input [id]="id('street')" class="amc-input" formControlName="street" placeholder="Street name or address line 1" />
      </amc-form-field>
      @if (cfg.address.showBuildingNumber) {
        <amc-form-field label="Building Number" [for]="id('building')" [control]="g.controls.buildingNumber" [messages]="messages.buildingNumber">
          <input [id]="id('building')" class="amc-input" formControlName="buildingNumber" inputmode="numeric" maxlength="4" placeholder="4 digits" />
        </amc-form-field>
      }
      <amc-form-field [label]="cfg.address.postalCodeLabel" [for]="id('postal')" [control]="g.controls.postalCode" [messages]="postalMessages()">
        <input [id]="id('postal')" class="amc-input" formControlName="postalCode" [attr.inputmode]="postalInputMode()" [placeholder]="cfg.address.postalCodePlaceholder" />
      </amc-form-field>
      @if (cfg.address.showAdditionalNumber) {
        <amc-form-field label="Additional Number" [for]="id('additional')" [control]="g.controls.additionalNumber" [messages]="messages.additionalNumber" [help]="additionalNumberHelp">
          <input [id]="id('additional')" class="amc-input" formControlName="additionalNumber" inputmode="numeric" maxlength="4" placeholder="4 digits" />
        </amc-form-field>
      }
      <div class="grid grid-cols-2 gap-3">
        <amc-form-field label="Latitude" [for]="id('lat')" [control]="g.controls.latitude">
          <input [id]="id('lat')" type="number" step="0.000001" class="amc-input" formControlName="latitude" placeholder="24.7136" />
        </amc-form-field>
        <amc-form-field label="Longitude" [for]="id('lng')" [control]="g.controls.longitude">
          <input [id]="id('lng')" type="number" step="0.000001" class="amc-input" formControlName="longitude" placeholder="46.6753" />
        </amc-form-field>
      </div>
      <amc-form-field [label]="addressLabel()" [help]="addressHelp()" [for]="id('line')" [control]="g.controls.addressLine" class="sm:col-span-2 xl:col-span-3" corner="Max 250 characters">
        <textarea [id]="id('line')" class="amc-textarea min-h-20" formControlName="addressLine" placeholder="Full address as it should appear on documents and work orders"></textarea>
      </amc-form-field>
    </div>
  `,
})
export class AddressFields {
  protected readonly lookups = inject(CustomerLookupsStore);

  readonly group = input.required<AddressFormGroup>();
  readonly idPrefix = input('addr');
  readonly addressLabel = input('Address');
  readonly addressHelp = input<FieldHelp | null>(null);

  protected readonly additionalNumberHelp: FieldHelp =
    'The 4-digit additional number from the Saudi National Address, used to pinpoint the building.';

  protected readonly messages = PATTERN_MESSAGES;
  protected readonly value = toSignal(
    toObservable(this.group).pipe(
      switchMap((g) =>
        g.valueChanges.pipe(
          startWith(null),
          map(() => ({ country: g.controls.country.value, region: g.controls.region.value })),
        ),
      ),
    ),
    { initialValue: { country: '', region: '' } },
  );
  protected readonly regionOptions = computed(() => this.lookups.regionOptions(this.value().country));
  protected readonly cityOptions = computed(() =>
    this.lookups.cityOptions(this.value().country, this.value().region),
  );

  /** Country-specific configuration computed from the selected country. */
  protected readonly countryCfg = computed(() => getCountryConfig(this.value().country));

  /** Postal code error messages adapt to the selected country. */
  protected readonly postalMessages = computed((): FieldErrorMessages => {
    const cfg = this.countryCfg();
    if (!cfg.address.postalCodePattern) return {};
    return { pattern: `Enter a valid ${cfg.address.postalCodeLabel.toLowerCase()}.` };
  });

  /** Use numeric inputmode for purely numeric postal codes, text otherwise. */
  protected readonly postalInputMode = computed(() => {
    const placeholder = this.countryCfg().address.postalCodePlaceholder;
    return /^\d/.test(placeholder) ? 'numeric' : 'text';
  });

  protected id(name: string): string {
    return `${this.idPrefix()}-${name}`;
  }

  protected onCountry(): void {
    const g = this.group();
    g.patchValue({ region: '', city: '' });
    // Re-apply country-specific postal code validation when country changes.
    this.applyPostalValidator();
  }

  protected onRegion(): void {
    this.group().controls.city.setValue('');
  }

  private applyPostalValidator(): void {
    const ctrl = this.group().controls.postalCode;
    const pattern = this.countryCfg().address.postalCodePattern;
    if (pattern) {
      ctrl.setValidators([Validators.pattern(pattern)]);
    } else {
      ctrl.clearValidators();
    }
    ctrl.updateValueAndValidity();
  }
}
