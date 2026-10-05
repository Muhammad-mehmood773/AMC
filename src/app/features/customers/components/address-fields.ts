import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  type FormControl,
  type FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { FormField } from '@shared/ui/form-field';
import { map, startWith, switchMap } from 'rxjs';
import { CustomerLookupsStore } from '../data/lookups.store';
import type { Address } from '../models/customer.model';
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
    country: fb.control('Saudi Arabia', Validators.required),
    region: fb.control('', Validators.required),
    city: fb.control('', Validators.required),
    district: fb.control(''),
    street: fb.control(''),
    buildingNumber: fb.control('', Validators.pattern(PATTERNS.buildingNumber)),
    postalCode: fb.control('', Validators.pattern(PATTERNS.postalCode)),
    additionalNumber: fb.control('', Validators.pattern(PATTERNS.additionalNumber)),
    addressLine: fb.control('', Validators.maxLength(250)),
    latitude: fb.control<number | null>(null, [Validators.min(-90), Validators.max(90)]),
    longitude: fb.control<number | null>(null, [Validators.min(-180), Validators.max(180)]),
  });
}

export function addressValue(group: AddressFormGroup): Address {
  return { ...group.getRawValue() };
}

/** KSA National Address field set with cascading country → region → city selects. */
@Component({
  selector: 'amc-address-fields',
  imports: [FormField, ReactiveFormsModule, Select],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let g = group();
    <div [formGroup]="g" class="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
      <amc-form-field label="Country" [for]="id('country')" [control]="g.controls.country">
        <amc-select [inputId]="id('country')" formControlName="country" [options]="lookups.countryOptions()" (selectionChange)="onCountry()" />
      </amc-form-field>
      <amc-form-field label="Region" [for]="id('region')" [control]="g.controls.region">
        <amc-select [inputId]="id('region')" formControlName="region" [options]="regionOptions()" placeholder="Select region…" (selectionChange)="onRegion()" />
      </amc-form-field>
      <amc-form-field label="City" [for]="id('city')" [control]="g.controls.city" [hint]="value().region ? '' : 'Select a region first.'">
        <amc-select [inputId]="id('city')" formControlName="city" [options]="cityOptions()" placeholder="Select city…" />
      </amc-form-field>
      <amc-form-field label="District" [for]="id('district')" [control]="g.controls.district">
        <input [id]="id('district')" class="amc-input" formControlName="district" placeholder="e.g. Al Olaya" />
      </amc-form-field>
      <amc-form-field label="Street" [for]="id('street')" [control]="g.controls.street">
        <input [id]="id('street')" class="amc-input" formControlName="street" placeholder="e.g. King Fahd Road" />
      </amc-form-field>
      <amc-form-field label="Building Number" [for]="id('building')" [control]="g.controls.buildingNumber" [messages]="messages.buildingNumber">
        <input [id]="id('building')" class="amc-input" formControlName="buildingNumber" inputmode="numeric" maxlength="4" placeholder="4 digits" />
      </amc-form-field>
      <amc-form-field label="Postal Code" [for]="id('postal')" [control]="g.controls.postalCode" [messages]="messages.postalCode">
        <input [id]="id('postal')" class="amc-input" formControlName="postalCode" inputmode="numeric" maxlength="5" placeholder="5 digits" />
      </amc-form-field>
      <amc-form-field label="Additional Number" [for]="id('additional')" [control]="g.controls.additionalNumber" [messages]="messages.additionalNumber">
        <input [id]="id('additional')" class="amc-input" formControlName="additionalNumber" inputmode="numeric" maxlength="4" placeholder="4 digits" />
      </amc-form-field>
      <div class="grid grid-cols-2 gap-3">
        <amc-form-field label="Latitude" [for]="id('lat')" [control]="g.controls.latitude">
          <input [id]="id('lat')" type="number" step="0.000001" class="amc-input" formControlName="latitude" placeholder="24.7136" />
        </amc-form-field>
        <amc-form-field label="Longitude" [for]="id('lng')" [control]="g.controls.longitude">
          <input [id]="id('lng')" type="number" step="0.000001" class="amc-input" formControlName="longitude" placeholder="46.6753" />
        </amc-form-field>
      </div>
      <amc-form-field [label]="addressLabel()" [for]="id('line')" [control]="g.controls.addressLine" class="sm:col-span-2 xl:col-span-3" corner="Max 250 characters">
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

  protected id(name: string): string {
    return `${this.idPrefix()}-${name}`;
  }

  protected onCountry(): void {
    this.group().patchValue({ region: '', city: '' });
  }

  protected onRegion(): void {
    this.group().controls.city.setValue('');
  }
}
