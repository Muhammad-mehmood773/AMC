import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { NotificationPort } from '@core/notification/notification.port';
import { DatePicker } from '@shared/ui/date-picker';
import { Dialog } from '@shared/ui/dialog';
import { FormField } from '@shared/ui/form-field';
import { Select } from '@shared/ui/select';
import { Spinner } from '@shared/ui/spinner';
import { formatDate } from '@shared/utils/format';
import { type Observable, firstValueFrom } from 'rxjs';
import { EntitlementApi } from '../data/catalog.api';
import type { EntitlementListItem } from '../models/entitlement.model';

export type EntitlementActionMode = 'extend' | 'renew' | 'suspend' | 'cancel';

const TITLES: Record<EntitlementActionMode, string> = {
  extend: 'Extend entitlement',
  renew: 'Renew entitlement',
  suspend: 'Suspend entitlement',
  cancel: 'Cancel entitlement',
};

/** Extend / renew / suspend / cancel with the required inputs; changes are recorded in history. */
@Component({
  selector: 'amc-entitlement-action-dialog',
  imports: [DatePicker, Dialog, FormField, Select, Spinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <amc-dialog size="sm" [title]="title()" [description]="entitlement() ? entitlement()!.number + ' · ' + entitlement()!.customerName : ''" [open]="!!mode()" (openChange)="!$event && mode.set(null)">
      @if (entitlement(); as e) {
        @switch (mode()) {
          @case ('extend') {
            <p class="mb-3 text-sm text-ink-muted">Current end date: <span class="font-medium text-ink">{{ formatDate(e.validity.endDate) }}</span></p>
            <amc-form-field label="New End Date" for="ea-end" [required]="true">
              <amc-date-picker inputId="ea-end" [min]="e.validity.endDate" [(value)]="endDate" />
            </amc-form-field>
          }
          @case ('renew') {
            <p class="mb-3 text-sm text-ink-muted">A new validity period starts after {{ formatDate(e.validity.endDate) }} (or today) and usage is reset.</p>
            <amc-form-field label="Renewal Period" for="ea-period" [required]="true">
              <amc-select inputId="ea-period" [options]="periodOptions" [(value)]="months" />
            </amc-form-field>
          }
          @default {
            <p class="mb-3 text-sm text-ink-muted">{{ mode() === 'suspend' ? 'Suspended entitlements do not provide active service coverage until reactivated.' : 'Cancelled entitlements no longer provide coverage. History is retained.' }}</p>
          }
        }
        <amc-form-field label="Comment / Reason" for="ea-comment" class="mt-4 block">
          <textarea id="ea-comment" class="amc-textarea min-h-16" [value]="comment()" (input)="comment.set($any($event.target).value)"></textarea>
        </amc-form-field>
      }
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="mode.set(null)">Close</button>
        <button type="button" [class]="mode() === 'cancel' || mode() === 'suspend' ? 'amc-btn-danger' : 'amc-btn-primary'" [disabled]="busy() || (mode() === 'extend' && !endDate())" (click)="confirm()">
          @if (busy()) { <amc-spinner [size]="14" /> }
          {{ title().split(' ')[0] }}
        </button>
      </ng-container>
    </amc-dialog>
  `,
})
export class EntitlementActionDialog {
  private readonly api = inject(EntitlementApi);
  private readonly notify = inject(NotificationPort);

  readonly entitlement = input<EntitlementListItem | null>(null);
  readonly mode = model<EntitlementActionMode | null>(null);
  readonly done = output<void>();

  protected readonly title = computed(() => (this.mode() ? TITLES[this.mode()!] : ''));
  protected readonly endDate = signal('');
  protected readonly months = signal<string | number | null>(12);
  protected readonly comment = signal('');
  protected readonly busy = signal(false);
  protected readonly formatDate = formatDate;
  protected readonly periodOptions = [3, 6, 12, 24, 36].map((m) => ({ value: m, label: `${m} months` }));

  constructor() {
    effect(() => {
      const e = this.entitlement();
      if (!this.mode() || !e) return;
      untracked(() => {
        this.comment.set('');
        this.months.set(e.validity.renewalPeriodMonths ?? 12);
        const d = new Date(`${e.validity.endDate}T00:00:00Z`);
        d.setUTCMonth(d.getUTCMonth() + 3);
        this.endDate.set(d.toISOString().slice(0, 10));
      });
    });
  }

  protected async confirm(): Promise<void> {
    const e = this.entitlement();
    const mode = this.mode();
    if (!e || !mode) return;
    const work: Record<EntitlementActionMode, () => Observable<unknown>> = {
      extend: () => this.api.extend(e.id, this.endDate(), this.comment()),
      renew: () => this.api.renew(e.id, Number(this.months())),
      suspend: () => this.api.suspend(e.id, this.comment()),
      cancel: () => this.api.cancel(e.id, this.comment()),
    };
    this.busy.set(true);
    try {
      await firstValueFrom(work[mode]());
      this.notify.success(`${e.number} ${({ extend: 'extended', renew: 'renewed', suspend: 'suspended', cancel: 'cancelled' } as const)[mode]}.`);
      this.mode.set(null);
      this.done.emit();
    } catch (error) {
      this.notify.error((error as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
