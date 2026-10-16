import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { toOptions } from '@shared/models/select-option';
import { Dialog } from '@shared/ui/dialog';
import { FormField } from '@shared/ui/form-field';
import { Icon } from '@shared/ui/icon';
import { Select } from '@shared/ui/select';
import { Skeleton } from '@shared/ui/skeleton';
import { of } from 'rxjs';
import { AssetHandoff } from '../data/asset-handoff.service';
import { EntitlementApi } from '../data/asset.api';
import type { ServiceKind } from '../models/coverage.model';
import { EntitlementResult, SERVICE_KINDS } from './entitlement-view';

/**
 * Hosts the entitlement check shown before a service request, work order or maintenance visit is
 * handed off to its downstream module (SRS 3.11 — the active entitlement must be evaluated).
 */
@Component({
  selector: 'amc-service-action-host',
  imports: [Dialog, EntitlementResult, FormField, Icon, Select, Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <amc-dialog size="md" [title]="request()?.action ?? 'Service action'" [description]="description()" [open]="!!request()" (openChange)="onOpenChange($event)">
      @if (request()) {
        <div class="space-y-4">
          <amc-form-field label="Service Type" for="sa-kind">
            <amc-select inputId="sa-kind" [options]="kindOptions" [(value)]="kind" />
          </amc-form-field>
          @if (check.hasValue() && check.value(); as result) {
            <amc-entitlement-result [check]="result" />
          } @else {
            <amc-skeleton class="h-32 rounded-xl" />
          }
        </div>
      }
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="onOpenChange(false)">Cancel</button>
        <button type="button" class="amc-btn-primary" [disabled]="!check.hasValue() || blocked()" (click)="proceed()">
          <amc-icon name="arrow-right" /> Continue
        </button>
      </ng-container>
    </amc-dialog>
  `,
})
export class ServiceActionHost {
  private readonly handoff = inject(AssetHandoff);
  private readonly api = inject(EntitlementApi);

  protected readonly request = this.handoff.request;
  protected readonly kindOptions = toOptions(SERVICE_KINDS);
  protected readonly kind = linkedSignal<string | number | null>(() => (this.request()?.action === 'Schedule Maintenance' ? 'Preventive' : 'Breakdown'));

  protected readonly description = computed(() => {
    const r = this.request();
    return r ? [r.asset.code, r.asset.name, r.asset.siteName].filter(Boolean).join(' · ') : '';
  });

  protected readonly check = rxResource({
    params: () => {
      const r = this.request();
      return r ? { assetId: r.asset.id, kind: String(this.kind()) as ServiceKind } : undefined;
    },
    stream: ({ params }) => (params ? this.api.evaluate(params.assetId, params.kind) : of(null)),
  });

  protected readonly blocked = computed(() => {
    const result = this.check.hasValue() ? this.check.value() : null;
    return !!result?.reasons.some((r) => r.includes('blocked'));
  });

  protected onOpenChange(open: boolean): void {
    if (!open) this.handoff.request.set(null);
  }

  protected proceed(): void {
    const r = this.request();
    if (!r) return;
    this.handoff.complete(r, this.check.hasValue() ? this.check.value() : null);
  }
}
