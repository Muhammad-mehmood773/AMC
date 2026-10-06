import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { LOOKUP_TYPES, type LookupValue, LookupValuesApi } from '@shared/lookups/lookup';
import { LookupValuesStore } from '@shared/lookups/lookup-values.store';
import { of } from 'rxjs';
import { FormField } from './form-field';
import { LookupSelect } from './lookup-select';

const values: LookupValue[] = [
  { id: '1', type: 'customer-type', name: 'Corporate', status: 'Active', isSystem: false, sortOrder: 10 },
  { id: '2', type: 'contact-type', name: 'Primary', status: 'Active', isSystem: true, sortOrder: 10 },
];

class FakeLookupApi extends LookupValuesApi {
  list() {
    return of(values);
  }
  create(type: string, name: string) {
    return of({ id: '9', type, name, status: 'Active' as const, isSystem: false, sortOrder: 99 });
  }
  update(id: string, changes: { name?: string }) {
    return of({ ...values.find((v) => v.id === id)!, name: changes.name ?? '' });
  }
}

@Component({
  imports: [FormField, LookupSelect, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <amc-form-field label="Customer Type" for="t1" help="Classifies the customer.">
      <amc-lookup-select inputId="t1" type="customer-type" [formControl]="editable" />
    </amc-form-field>
    <amc-lookup-select class="system" type="contact-type" [formControl]="system" />
    <amc-lookup-select class="fixed" type="customer-status" [formControl]="fixed" />
  `,
})
class Host {
  readonly editable = new FormControl('');
  readonly system = new FormControl('Primary');
  readonly fixed = new FormControl('Active');
}

describe('LookupSelect', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        LookupValuesStore,
        { provide: LookupValuesApi, useClass: FakeLookupApi },
        {
          provide: LOOKUP_TYPES,
          useValue: [
            { key: 'customer-type', label: 'Customer Type', editable: true },
            { key: 'contact-type', label: 'Contact Type', editable: true },
            { key: 'customer-status', label: 'Customer Status', editable: false },
          ],
        },
      ],
    });
  });

  async function render() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('shows Add and a disabled Edit for editable lookups without a value', async () => {
    const el: HTMLElement = (await render()).nativeElement;
    const add = el.querySelector<HTMLButtonElement>('[aria-label="Add customer type"]');
    const edit = el.querySelector<HTMLButtonElement>('[aria-label="Edit selected customer type"]');
    expect(add?.disabled).toBe(false);
    expect(edit?.disabled).toBe(true);
  });

  it('enables Edit once a value is selected', async () => {
    const fixture = await render();
    fixture.componentInstance.editable.setValue('Corporate');
    fixture.detectChanges();
    const edit = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[aria-label="Edit selected customer type"]');
    expect(edit?.disabled).toBe(false);
  });

  it('keeps system values non-editable', async () => {
    const el: HTMLElement = (await render()).nativeElement;
    const edit = el.querySelector<HTMLButtonElement>('.system [aria-label="Edit selected contact type"]');
    expect(edit?.disabled).toBe(true);
    expect(edit?.title).toContain('System value');
  });

  it('renders fixed lookups as a plain select without actions', async () => {
    const el: HTMLElement = (await render()).nativeElement;
    expect(el.querySelector('.fixed [role="group"]')).toBeNull();
  });

  it('renders the field information trigger beside the label', async () => {
    const el: HTMLElement = (await render()).nativeElement;
    expect(el.querySelector('[aria-label="More information about Customer Type"]')).not.toBeNull();
  });
});
