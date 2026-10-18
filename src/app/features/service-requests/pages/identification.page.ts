import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EmptyState } from '@shared/ui/empty-state';
import { Icon } from '@shared/ui/icon';
import { PageHeader } from '@shared/ui/page-header';
import { Panel } from '@shared/ui/panel';
import { StatusBadge } from '@shared/ui/status-badge';
import { firstValueFrom } from 'rxjs';
import { SrReferenceStore } from '../data/sr-reference.store';
import { RequestApi } from '../data/sr.api';
import { PRIORITY_TONE, STATUS_TONE } from '../models/display';
import type { IdentificationResult } from '../models/operations.model';

/** SRS 9.9 — Customer / Site / Asset Identification: find records by name, code, phone, serial, contract or request number. */
@Component({
  selector: 'amc-identification-page',
  imports: [EmptyState, Icon, PageHeader, Panel, RouterLink, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="Customer / Site / Asset Identification" subtitle="Identify the caller, site or equipment by any identifier — used when capturing a new request." [breadcrumbs]="[{ label: 'Service Requests', path: '/app/service-requests/dashboard' }, { label: 'Identification' }]">
        <a routerLink="/app/service-requests/new" class="amc-btn-primary"><amc-icon name="plus" /> New Request</a>
      </amc-page-header>
      <section class="amc-card p-4 sm:p-5">
        <div class="relative">
          <amc-icon name="search" class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input type="search" class="amc-input pl-9" placeholder="Customer name or code, site, asset name, serial number, contract / AMC / request number, phone or contact…" [value]="query()" (input)="query.set($any($event.target).value)" />
        </div>
        <p class="mt-2 text-xs text-ink-muted">Searches customers, sites, assets and open service requests. Inactive records are flagged so they cannot be selected for new requests.</p>
      </section>

      @if (searched() && !result()) {
        <amc-empty-state icon="search" title="No matches" message="Try a customer code, site name, asset serial number or request number." />
      }
      @if (result(); as res) {
        <div class="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <amc-panel [title]="'Customers (' + res.customers.length + ')'" icon="building" [padded]="false">
            @if (!res.customers.length) { <amc-empty-state [compact]="true" icon="building" title="No customers" message="" /> } @else {
              <ul class="divide-y divide-line">
                @for (c of res.customers; track c.id) {
                  <li class="flex items-center gap-3 px-4 py-3 sm:px-5">
                    <div class="min-w-0 flex-1">
                      <a [routerLink]="['/app/customers', c.id]" class="block truncate text-sm font-medium text-ink hover:text-brand">{{ c.name }}</a>
                      <p class="text-xs text-ink-muted">{{ c.code }} · matched on {{ c.matchedOn }}</p>
                    </div>
                    <amc-status-badge [label]="c.status" [tone]="c.status === 'Active' ? 'ok' : 'danger'" />
                    <a [routerLink]="['/app/service-requests/new']" [queryParams]="{ customer: c.id }" class="amc-btn-ghost amc-btn-sm">New request</a>
                  </li>
                }
              </ul>
            }
          </amc-panel>
          <amc-panel [title]="'Sites (' + res.sites.length + ')'" icon="map-pin" [padded]="false">
            @if (!res.sites.length) { <amc-empty-state [compact]="true" icon="map-pin" title="No sites" message="" /> } @else {
              <ul class="divide-y divide-line">
                @for (s of res.sites; track s.id) {
                  <li class="px-4 py-3 sm:px-5">
                    <a [routerLink]="['/app/customers/sites', s.id]" class="text-sm font-medium text-ink hover:text-brand">{{ s.name }}</a>
                    <p class="text-xs text-ink-muted">{{ s.city }} · {{ customerName(s.customerId) }} · matched on {{ s.matchedOn }}</p>
                  </li>
                }
              </ul>
            }
          </amc-panel>
          <amc-panel [title]="'Assets (' + res.assets.length + ')'" icon="box" [padded]="false">
            @if (!res.assets.length) { <amc-empty-state [compact]="true" icon="box" title="No assets" message="" /> } @else {
              <ul class="divide-y divide-line">
                @for (a of res.assets; track a.id) {
                  <li class="px-4 py-3 sm:px-5">
                    <div class="flex items-center justify-between gap-2">
                      <a [routerLink]="['/app/assets', a.id]" class="truncate text-sm font-medium text-ink hover:text-brand">{{ a.name }}</a>
                      <amc-status-badge [label]="a.warranty" [tone]="a.warranty === 'In Warranty' ? 'ok' : 'neutral'" />
                    </div>
                    <p class="text-xs text-ink-muted">{{ a.serialNumber }} · {{ a.status }} · matched on {{ a.matchedOn }}</p>
                  </li>
                }
              </ul>
            }
          </amc-panel>
        </div>
        @if (res.openRequests.length) {
          <amc-panel [title]="'Open Requests (' + res.openRequests.length + ')'" description="Check before creating a new request — the issue may already be logged." icon="ticket" [padded]="false">
            <ul class="divide-y divide-line">
              @for (r of res.openRequests; track r.id) {
                <li class="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <div class="min-w-0 flex-1">
                    <a [routerLink]="['/app/service-requests', r.id]" class="block truncate text-sm font-medium text-ink hover:text-brand">{{ r.number }} · {{ r.subject }}</a>
                    <p class="text-xs text-ink-muted">{{ r.customerName }} · {{ r.siteName }}</p>
                  </div>
                  <amc-status-badge [label]="r.priority" [tone]="priorityTone[r.priority]" />
                  <amc-status-badge [label]="r.status" [tone]="statusTone[r.status]" />
                </li>
              }
            </ul>
          </amc-panel>
        }
      } @else if (!searched()) {
        <amc-empty-state icon="search" title="Identify a caller or asset" message="Enter any identifier above — results include open requests so duplicates can be avoided." />
      }
    </div>
  `,
})
export class IdentificationPage {
  private readonly api = inject(RequestApi);
  private readonly refs = inject(SrReferenceStore);
  protected readonly query = signal('');
  protected readonly result = signal<IdentificationResult | null>(null);
  protected readonly searched = computed(() => this.query().trim().length >= 2);
  protected readonly priorityTone = PRIORITY_TONE;
  protected readonly statusTone = STATUS_TONE;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const q = this.query();
      untracked(() => {
        if (this.timer) clearTimeout(this.timer);
        if (q.trim().length < 2) {
          this.result.set(null);
          return;
        }
        this.timer = setTimeout(() => void this.search(q.trim()), 300);
      });
    });
  }

  protected customerName(customerId: string): string {
    return this.refs.customer(customerId)?.name ?? customerId;
  }

  private async search(q: string): Promise<void> {
    const res = await firstValueFrom(this.api.identify(q));
    if (this.query().trim() === q) this.result.set(res.customers.length || res.sites.length || res.assets.length || res.openRequests.length ? res : null);
  }
}
