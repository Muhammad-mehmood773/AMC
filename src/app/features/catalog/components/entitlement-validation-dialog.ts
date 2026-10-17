import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { NotificationPort } from '@core/notification/notification.port';
import { Switch } from '@shared/ui/form-controls';
import { DatePicker } from '@shared/ui/date-picker';
import { Dialog } from '@shared/ui/dialog';
import { FormField } from '@shared/ui/form-field';
import { Icon } from '@shared/ui/icon';
import { Select } from '@shared/ui/select';
import { Spinner } from '@shared/ui/spinner';
import { StatusBadge } from '@shared/ui/status-badge';
import { firstValueFrom, of } from 'rxjs';
import { CatalogReferenceStore } from '../data/catalog-reference.store';
import { EntitlementApi, ServiceCatalogApi } from '../data/catalog.api';
import type { ValidationResult } from '../models/entitlement.model';
import { CHECK_ICON, CHECK_TONE } from '../models/display';

/**
 * SRS 4.12 / 4.18 — validates the applicable entitlement for a requested service and determines
 * coverage, SLA and billable / non-billable before a service request or work order is created.
 * A covered result can be consumed immediately, which updates usage automatically.
 */
@Component({
  selector: 'amc-entitlement-validation-dialog',
  imports: [DatePicker, Dialog, FormField, Icon, RouterLink, Select, Spinner, StatusBadge, Switch],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <amc-dialog size="lg" title="Validate entitlement" description="Customer → site → asset → contract / AMC → entitlement → service → coverage → SLA → billable determination" [(open)]="open">
      <div class="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
        <amc-form-field label="Customer" for="val-customer" [required]="true">
          <amc-select inputId="val-customer" placeholder="Select customer…" [options]="refs.customerOptions()" [(value)]="customerId" />
        </amc-form-field>
        <amc-form-field label="Requested Service" for="val-service" [required]="true">
          <amc-select inputId="val-service" placeholder="Select service…" [options]="serviceOptions()" [(value)]="serviceId" />
        </amc-form-field>
        <amc-form-field label="Site" for="val-site">
          <amc-select inputId="val-site" placeholder="Any site" [options]="refs.siteOptions(cid())" [clearable]="true" [(value)]="siteId" />
        </amc-form-field>
        <amc-form-field label="Asset" for="val-asset">
          <amc-select inputId="val-asset" placeholder="No asset" [options]="refs.assetOptions(cid(), siteId() ? [str(siteId())] : [])" [clearable]="true" [(value)]="assetId" />
        </amc-form-field>
        <amc-form-field label="Service Date" for="val-date">
          <amc-date-picker inputId="val-date" [(value)]="date" />
        </amc-form-field>
        <div class="flex items-end pb-1">
          <amc-switch label="Emergency service" description="Requires emergency coverage." [(checked)]="emergency" />
        </div>
      </div>

      @if (result(); as r) {
        <div class="mt-5 rounded-xl border p-4" [class]="r.eligible ? 'border-ok/30 bg-ok-subtle' : 'border-warn/30 bg-warn-subtle'">
          <div class="flex items-start gap-3">
            <amc-icon [name]="r.eligible ? 'shield-check' : 'alert-triangle'" [size]="20" [class]="r.eligible ? 'text-ok' : 'text-warn'" />
            <div class="min-w-0 flex-1">
              <p class="text-sm font-semibold text-ink">{{ r.eligible ? 'Eligible — covered service' : 'Not covered' }}</p>
              <p class="mt-0.5 text-sm text-ink-muted">{{ r.summary }}</p>
            </div>
            <amc-status-badge [label]="r.billable ? 'Billable' : 'Non-Billable'" [tone]="r.billable ? 'warn' : 'ok'" />
          </div>
          <dl class="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3 text-sm sm:grid-cols-5">
            <div><dt class="text-xs text-ink-muted">Entitlement</dt><dd class="font-medium text-ink">
              @if (r.entitlement) { <a class="amc-link" [routerLink]="['/app/catalog/entitlements', r.entitlement.id]" (click)="open.set(false)">{{ r.entitlement.number }}</a> } @else { — }
            </dd></div>
            <div><dt class="text-xs text-ink-muted">Labor</dt><dd class="font-medium text-ink">{{ r.laborCovered ? 'Covered' : 'Chargeable' }}</dd></div>
            <div><dt class="text-xs text-ink-muted">Parts</dt><dd class="font-medium text-ink">{{ r.partsCovered ? 'Covered' : 'Chargeable' }}</dd></div>
            <div><dt class="text-xs text-ink-muted">SLA</dt><dd class="font-medium text-ink">{{ r.responseHours ? r.responseHours + 'h / ' + r.resolutionHours + 'h' : '—' }}</dd></div>
            <div><dt class="text-xs text-ink-muted">Remaining</dt><dd class="font-medium text-ink">{{ r.remaining ?? 'Unlimited' }}</dd></div>
          </dl>
        </div>
        <ul class="mt-4 divide-y divide-line rounded-xl border border-line">
          @for (c of r.checks; track c.question) {
            <li class="flex items-start gap-3 px-3.5 py-2.5">
              <amc-icon [name]="checkIcon[c.result]" [size]="16" class="mt-0.5 shrink-0" [class]="c.result === 'pass' ? 'text-ok' : c.result === 'fail' ? 'text-danger' : c.result === 'warn' ? 'text-warn' : 'text-ink-subtle'" />
              <div class="min-w-0 flex-1">
                <p class="text-sm text-ink">{{ c.question }}</p>
                <p class="text-xs text-ink-muted">{{ c.detail }}</p>
              </div>
              <amc-status-badge [label]="c.result === 'na' ? 'N/A' : c.result === 'pass' ? 'Yes' : c.result === 'warn' ? 'Partial' : 'No'" [tone]="checkTone[c.result]" [dot]="false" />
            </li>
          }
        </ul>
      }
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary sm:mr-auto" (click)="open.set(false)">Close</button>
        @if (result()?.eligible && result()?.entitlement) {
          <button type="button" class="amc-btn-secondary" [disabled]="busy()" (click)="consume()"><amc-icon name="activity" /> Record covered usage</button>
        }
        <button type="button" class="amc-btn-primary" [disabled]="!customerId() || !serviceId() || busy()" (click)="validate()">
          @if (busy()) { <amc-spinner [size]="14" /> } @else { <amc-icon name="shield-check" /> }
          Validate
        </button>
      </ng-container>
    </amc-dialog>
  `,
})
export class EntitlementValidationDialog {
  private readonly api = inject(EntitlementApi);
  private readonly servicesApi = inject(ServiceCatalogApi);
  private readonly notify = inject(NotificationPort);
  protected readonly refs = inject(CatalogReferenceStore);

  readonly open = model(false);
  /** Optional preset context (e.g. from Entitlement 360). */
  readonly presetCustomerId = input<string | null>(null);
  readonly presetEntitlementId = input<string | null>(null);
  readonly presetServiceId = input<string | null>(null);
  readonly consumed = output<void>();

  protected readonly customerId = signal<string | number | null>(null);
  protected readonly serviceId = signal<string | number | null>(null);
  protected readonly siteId = signal<string | number | null>(null);
  protected readonly assetId = signal<string | number | null>(null);
  protected readonly date = signal(new Date().toISOString().slice(0, 10));
  protected readonly emergency = signal(false);
  protected readonly result = signal<ValidationResult | null>(null);
  protected readonly busy = signal(false);
  protected readonly checkIcon = CHECK_ICON;
  protected readonly checkTone = CHECK_TONE;
  protected readonly cid = computed(() => (this.customerId() ? String(this.customerId()) : null));

  private readonly services = rxResource({ params: () => (this.open() ? true : undefined), stream: ({ params }) => (params ? this.servicesApi.list() : of([])) });
  protected readonly serviceOptions = computed(() =>
    (this.services.hasValue() ? this.services.value() : []).map((s) => ({ value: s.id, label: `${s.code} · ${s.name}`, hint: s.status === 'Active' ? s.type : `${s.type} · ${s.status}` })),
  );

  constructor() {
    effect(() => {
      if (!this.open()) return;
      untracked(() => {
        this.result.set(null);
        if (this.presetCustomerId()) this.customerId.set(this.presetCustomerId());
        if (this.presetServiceId()) this.serviceId.set(this.presetServiceId());
      });
    });
    effect(() => {
      this.customerId();
      untracked(() => {
        this.siteId.set(null);
        this.assetId.set(null);
      });
    });
  }

  protected str(value: string | number | null): string {
    return value === null ? '' : String(value);
  }

  protected async validate(): Promise<void> {
    if (!this.customerId() || !this.serviceId()) return;
    this.busy.set(true);
    try {
      this.result.set(
        await firstValueFrom(
          this.api.validate({
            customerId: String(this.customerId()),
            serviceId: String(this.serviceId()),
            siteId: this.siteId() ? String(this.siteId()) : null,
            assetId: this.assetId() ? String(this.assetId()) : null,
            date: this.date() || new Date().toISOString().slice(0, 10),
            emergency: this.emergency(),
            entitlementId: this.presetEntitlementId(),
          }),
        ),
      );
    } catch (error) {
      this.notify.error((error as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  protected async consume(): Promise<void> {
    const r = this.result();
    if (!r?.entitlement) return;
    this.busy.set(true);
    try {
      const service = this.services.hasValue() ? this.services.value().find((s) => s.id === r.request.serviceId) : undefined;
      await firstValueFrom(
        this.api.recordUsage(r.entitlement.id, {
          date: `${r.request.date}T${new Date().toISOString().slice(11)}`, serviceId: r.request.serviceId, siteId: r.request.siteId, assetId: r.request.assetId,
          visits: 1, hours: service?.operational.standardDuration ?? 1, quantity: 1, reference: `SR-${Date.now().toString().slice(-5)}`, technician: '', notes: 'Recorded from entitlement validation',
        }),
      );
      this.notify.success(`Usage recorded against ${r.entitlement.number}.`);
      this.consumed.emit();
      await this.validate();
    } catch (error) {
      this.notify.error((error as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
