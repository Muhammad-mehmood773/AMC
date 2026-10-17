import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Icon } from '@shared/ui/icon';
import { PageHeader } from '@shared/ui/page-header';
import { Panel } from '@shared/ui/panel';
import { formatDate } from '@shared/utils/format';
import { ContractHistoryTimeline } from '../components/contract-history-timeline';
import { ContractApi } from '../data/contract.api';
import { CONTRACT_RULES } from '../data/contract.config';

/** SRS 5.18 history & audit, with the SRS 5.20 notification feed. */
@Component({
  selector: 'amc-contract-history-page',
  imports: [ContractHistoryTimeline, Icon, PageHeader, Panel, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="Contract History & Audit" subtitle="Complete audit trail of contract activities, with active contract notifications." [breadcrumbs]="[{ label: 'Contracts', path: '/app/contracts/dashboard' }, { label: 'History & Audit' }]" />
      <div class="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <amc-contract-history-timeline class="xl:col-span-2" />
        <amc-panel title="Notifications & alerts" [description]="'Expiry alerts at ' + intervals + ' days before expiry'" icon="bell" [padded]="false">
          <ul class="max-h-[48rem] divide-y divide-line overflow-y-auto">
            @for (a of alerts(); track a.id) {
              <li class="flex items-start gap-3 px-4 py-3">
                <amc-icon [name]="a.severity === 'info' ? 'bell' : 'alert-triangle'" [size]="15" class="mt-0.5" [class]="a.severity === 'danger' ? 'text-danger' : a.severity === 'warn' ? 'text-warn' : 'text-info'" />
                <div class="min-w-0 flex-1">
                  <p class="text-sm text-ink"><span class="font-medium">{{ a.type }}</span> · <a [routerLink]="['/app/contracts', a.contractId]" class="font-mono text-xs hover:text-brand">{{ a.contractNumber }}</a></p>
                  <p class="text-xs text-ink-muted">{{ a.message }}{{ a.dueDate ? ' · ' + formatDate(a.dueDate) : '' }}</p>
                </div>
              </li>
            } @empty { <li class="p-6 text-center text-sm text-ink-muted">No active alerts.</li> }
          </ul>
        </amc-panel>
      </div>
    </div>
  `,
})
export class ContractHistoryPage {
  private readonly api = inject(ContractApi);
  private readonly alertsRes = rxResource({ stream: () => this.api.alerts() });
  protected readonly alerts = computed(() => (this.alertsRes.hasValue() ? this.alertsRes.value() : []));
  protected readonly intervals = CONTRACT_RULES.expiryAlertDays.join(' / ');
  protected readonly formatDate = formatDate;
}
