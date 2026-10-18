import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { toOptions } from '@shared/models/select-option';
import { EmptyState } from '@shared/ui/empty-state';
import { ErrorState } from '@shared/ui/error-state';
import { FilterBar } from '@shared/ui/filter-bar';
import { Icon } from '@shared/ui/icon';
import { Skeleton } from '@shared/ui/skeleton';
import { downloadCsv, timestampedName } from '@shared/utils/file';
import { type FilterField, type FilterValues, matchesAny, withinRange } from '@shared/utils/filters';
import { daysBetween, formatDate, formatDateTime, formatTime } from '@shared/utils/format';
import { SrHistoryApi } from '../data/sr.api';
import { HISTORY_ICON, HISTORY_TONE, TONE_CLASSES } from '../models/display';
import { SR_HISTORY_ACTIONS, type SrHistoryEvent } from '../models/operations.model';

const PAGE = 40;

/** SRS 9.26 — complete chronological request history and audit trail. */
@Component({
  selector: 'amc-sr-history-timeline',
  imports: [EmptyState, ErrorState, FilterBar, Icon, RouterLink, Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="amc-card overflow-hidden">
      <div class="border-b border-line p-3 sm:p-4">
        <amc-filter-bar searchPlaceholder="Search action, request, value or user…" [(search)]="search" [fields]="filterFields()" [(filters)]="filters">
          <ng-container actions><button type="button" class="amc-btn-ghost" [disabled]="!filtered().length" (click)="export()"><amc-icon name="download" /> <span class="hidden sm:inline">Export</span></button></ng-container>
        </amc-filter-bar>
      </div>
      @if (events.error()) {
        <amc-error-state message="History could not be loaded." (retry)="events.reload()" />
      } @else if (!events.hasValue()) {
        <div class="space-y-4 p-5">@for (i of [1, 2, 3, 4]; track i) { <amc-skeleton class="h-10 w-full" /> }</div>
      } @else if (!filtered().length) {
        <amc-empty-state icon="history" [title]="rows().length ? 'No events match your filters' : 'No history yet'" message="Request activities are recorded automatically." />
      } @else {
        <div class="px-4 py-2 sm:px-6">
          @for (group of groups(); track group.key) {
            <div class="pt-3 pb-2"><h3 class="amc-overline">{{ group.label }}</h3></div>
            <ol class="relative mb-2 ml-4 border-l border-line">
              @for (e of group.entries; track e.id) {
                <li class="relative pb-5 pl-7 last:pb-3">
                  <span class="absolute top-0 -left-4 flex h-8 w-8 items-center justify-center rounded-full ring-4 ring-surface" [class]="tone(e)"><amc-icon [name]="icon(e)" [size]="14" /></span>
                  <div class="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div class="min-w-0">
                      <p class="text-sm text-ink"><span class="font-semibold">{{ e.action }}</span> <span class="text-ink-muted">· {{ e.user }}</span></p>
                      @if (e.previousValue || e.newValue) {
                        <p class="mt-1 flex flex-wrap items-center gap-1.5 text-[13px]">
                          @if (e.previousValue) { <span class="rounded bg-surface-sunken px-1.5 py-0.5 text-ink-muted line-through decoration-ink-subtle">{{ e.previousValue }}</span><amc-icon name="arrow-right" [size]="12" class="text-ink-subtle" /> }
                          @if (e.newValue) { <span class="rounded bg-brand-subtle px-1.5 py-0.5 font-medium text-brand">{{ e.newValue }}</span> }
                        </p>
                      }
                      @if (e.reason) { <p class="mt-0.5 text-sm text-ink-muted">{{ e.reason }}</p> }
                      <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-subtle">
                        @if (!requestId()) { <a [routerLink]="['/app/service-requests', e.requestId]" class="font-mono hover:text-brand">{{ e.requestNumber }}</a> }
                        <span>{{ e.source }}</span>
                        @if (e.relatedRecord) { <span class="font-mono">Ref: {{ e.relatedRecord }}</span> }
                      </div>
                    </div>
                    <time class="shrink-0 text-xs text-ink-muted tabular-nums" [attr.datetime]="e.timestamp" [attr.title]="formatDateTime(e.timestamp)">{{ formatTime(e.timestamp) }}</time>
                  </div>
                </li>
              }
            </ol>
          }
        </div>
        <div class="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-ink-muted sm:px-6">
          <span>Showing {{ visible().length }} of {{ filtered().length }} events</span>
          @if (visible().length < filtered().length) { <button type="button" class="amc-btn-secondary amc-btn-sm" (click)="limit.set(limit() + page)">Load more</button> }
        </div>
      }
    </section>
  `,
})
export class SrHistoryTimeline {
  private readonly api = inject(SrHistoryApi);

  readonly requestId = input<string | null>(null);
  readonly refreshKey = input(0);

  protected readonly events = rxResource({ params: () => ({ id: this.requestId() ?? undefined, k: this.refreshKey() }), stream: ({ params }) => this.api.list(params.id) });
  protected readonly rows = computed(() => (this.events.hasValue() ? this.events.value() : []));
  protected readonly search = signal('');
  protected readonly filters = signal<FilterValues>({});
  protected readonly filterFields = computed<FilterField[]>(() => [
    { key: 'action', label: 'Action', type: 'multiselect', options: toOptions(SR_HISTORY_ACTIONS) },
    { key: 'user', label: 'User', type: 'multiselect', options: toOptions([...new Set(this.rows().map((r) => r.user))].sort()) },
    { key: 'source', label: 'Source', type: 'multiselect', options: toOptions([...new Set(this.rows().map((r) => r.source))].sort()) },
    { key: 'period', label: 'Date', type: 'date-range' },
  ]);
  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    return this.rows().filter((r) => (!term || `${r.action} ${r.requestNumber} ${r.reason} ${r.user} ${r.source} ${r.previousValue ?? ''} ${r.newValue ?? ''}`.toLowerCase().includes(term)) && matchesAny(f, 'action', r.action) && matchesAny(f, 'user', r.user) && matchesAny(f, 'source', r.source) && withinRange(f, 'period', r.timestamp));
  });
  protected readonly page = PAGE;
  protected readonly limit = linkedSignal({ source: this.filtered, computation: () => PAGE });
  protected readonly visible = computed(() => this.filtered().slice(0, this.limit()));
  protected readonly groups = computed(() => {
    const now = new Date();
    const groups: { key: string; label: string; entries: SrHistoryEvent[] }[] = [];
    for (const e of this.visible()) {
      const key = e.timestamp.slice(0, 10);
      let g = groups.at(-1);
      if (g?.key !== key) {
        const diff = daysBetween(e.timestamp, now);
        g = { key, label: diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : formatDate(e.timestamp), entries: [] };
        groups.push(g);
      }
      g.entries.push(e);
    }
    return groups;
  });
  protected readonly formatTime = formatTime;
  protected readonly formatDateTime = formatDateTime;

  protected tone(e: SrHistoryEvent): string {
    return TONE_CLASSES[HISTORY_TONE[e.action] ?? 'neutral'];
  }

  protected icon(e: SrHistoryEvent) {
    return HISTORY_ICON[e.action] ?? 'history';
  }

  protected export(): void {
    downloadCsv(timestampedName('request-history', 'csv'), ['Date & Time', 'User', 'Action', 'Request', 'Previous Value', 'New Value', 'Source', 'Related Record', 'Reason'], this.filtered().map((r) => [formatDateTime(r.timestamp), r.user, r.action, r.requestNumber, r.previousValue, r.newValue, r.source, r.relatedRecord, r.reason]));
  }
}
