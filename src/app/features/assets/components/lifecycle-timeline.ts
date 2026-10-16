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
import { LifecycleApi } from '../data/asset.api';
import { LIFECYCLE_EVENTS, type LifecycleEventListItem } from '../models/history.model';
import { LIFECYCLE_ICON, LIFECYCLE_TONE, TONE_CLASSES } from '../models/display';

const PAGE = 40;

interface DayGroup {
  readonly key: string;
  readonly label: string;
  readonly entries: readonly LifecycleEventListItem[];
}

/** SRS 3.14 — date-grouped lifecycle history (global or for one asset). */
@Component({
  selector: 'amc-lifecycle-timeline',
  imports: [EmptyState, ErrorState, FilterBar, Icon, RouterLink, Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="amc-card overflow-hidden">
      <div class="border-b border-line p-3 sm:p-4">
        <amc-filter-bar searchPlaceholder="Search event, reference, value or user…" [(search)]="search" [fields]="filterFields()" [(filters)]="filters">
          <ng-container actions>
            <button type="button" class="amc-btn-ghost" [disabled]="!filtered().length" (click)="export()">
              <amc-icon name="download" />
              <span class="hidden sm:inline">Export</span>
            </button>
          </ng-container>
        </amc-filter-bar>
      </div>

      @if (events.error()) {
        <amc-error-state message="Lifecycle history could not be loaded." (retry)="events.reload()" />
      } @else if (!events.hasValue()) {
        <div class="space-y-5 p-5" aria-busy="true">
          @for (i of [1, 2, 3, 4, 5]; track i) {
            <div class="flex gap-3">
              <amc-skeleton class="h-8 w-8 rounded-full" />
              <div class="flex-1 space-y-2"><amc-skeleton class="h-3.5 w-2/3" /><amc-skeleton class="h-3 w-1/4" /></div>
            </div>
          }
        </div>
      } @else if (filtered().length === 0) {
        <amc-empty-state icon="history" [title]="rows().length ? 'No events match your filters' : 'No lifecycle events yet'" [message]="rows().length ? 'Try widening the period or clearing filters.' : 'Lifecycle events are recorded automatically.'" />
      } @else {
        <div class="px-4 py-2 sm:px-6">
          @for (group of groups(); track group.key) {
            <div class="pt-3 pb-2"><h3 class="amc-overline">{{ group.label }}</h3></div>
            <ol class="relative mb-2 ml-4 border-l border-line">
              @for (entry of group.entries; track entry.id) {
                <li class="relative pb-5 pl-7 last:pb-3">
                  <span class="absolute top-0 -left-4 flex h-8 w-8 items-center justify-center rounded-full ring-4 ring-surface" [class]="tone(entry)">
                    <amc-icon [name]="icon[entry.eventType]" [size]="14" />
                  </span>
                  <div class="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div class="min-w-0">
                      <p class="text-sm text-ink">
                        <span class="font-semibold">{{ entry.eventType }}</span>
                        <span class="text-ink-muted"> · {{ entry.user }}</span>
                      </p>
                      @if (entry.previousValue || entry.newValue) {
                        <p class="mt-1 flex flex-wrap items-center gap-1.5 text-[13px]">
                          @if (entry.previousValue) {
                            <span class="rounded bg-surface-sunken px-1.5 py-0.5 text-ink-muted line-through decoration-ink-subtle">{{ entry.previousValue }}</span>
                            <amc-icon name="arrow-right" [size]="12" class="text-ink-subtle" />
                          }
                          @if (entry.newValue) {
                            <span class="rounded bg-brand-subtle px-1.5 py-0.5 font-medium text-brand">{{ entry.newValue }}</span>
                          }
                        </p>
                      }
                      @if (entry.comments) {
                        <p class="mt-0.5 text-sm text-ink-muted">{{ entry.comments }}</p>
                      }
                      <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-subtle">
                        @if (entry.reference) {
                          <span class="font-mono">Ref: {{ entry.reference }}</span>
                        }
                        @if (!assetId()) {
                          <a [routerLink]="['/app/assets', entry.assetId]" class="hover:text-brand">{{ entry.assetCode }} · {{ entry.assetName }}</a>
                          @if (entry.customerName) {
                            <span>{{ entry.customerName }}</span>
                          }
                        }
                      </div>
                    </div>
                    <time class="shrink-0 text-xs text-ink-muted tabular-nums" [attr.datetime]="entry.timestamp" [attr.title]="formatDateTime(entry.timestamp)">{{ formatTime(entry.timestamp) }}</time>
                  </div>
                </li>
              }
            </ol>
          }
        </div>
        <div class="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-ink-muted sm:px-6">
          <span>Showing {{ visible().length }} of {{ filtered().length }} events</span>
          @if (visible().length < filtered().length) {
            <button type="button" class="amc-btn-secondary amc-btn-sm" (click)="limit.set(limit() + pageSize)">Load more</button>
          }
        </div>
      }
    </section>
  `,
})
export class LifecycleTimeline {
  private readonly api = inject(LifecycleApi);

  readonly assetId = input<string | null>(null);
  /** Bumped by the parent to force a reload after changes. */
  readonly refreshKey = input(0);

  protected readonly events = rxResource({
    params: () => ({ assetId: this.assetId() ?? undefined, key: this.refreshKey() }),
    stream: ({ params }) => this.api.list({ assetId: params.assetId }),
  });
  protected readonly rows = computed(() => (this.events.hasValue() ? this.events.value() : []));

  protected readonly search = signal('');
  protected readonly filters = signal<FilterValues>({});

  protected readonly filterFields = computed<FilterField[]>(() => {
    const rows = this.rows();
    return [
      { key: 'event', label: 'Event Type', type: 'multiselect', options: toOptions(LIFECYCLE_EVENTS) },
      { key: 'user', label: 'User', type: 'multiselect', options: toOptions([...new Set(rows.map((r) => r.user))].sort()) },
      ...(this.assetId() ? [] : [{ key: 'customer', label: 'Customer', type: 'multiselect' as const, options: toOptions([...new Set(rows.map((r) => r.customerName ?? ''))].filter(Boolean).sort()) }]),
      { key: 'period', label: 'Date', type: 'date-range' },
    ];
  });

  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    return this.rows().filter(
      (r) =>
        (!term || `${r.eventType} ${r.comments} ${r.reference ?? ''} ${r.user} ${r.previousValue ?? ''} ${r.newValue ?? ''} ${r.assetCode} ${r.assetName}`.toLowerCase().includes(term)) &&
        matchesAny(f, 'event', r.eventType) &&
        matchesAny(f, 'user', r.user) &&
        matchesAny(f, 'customer', r.customerName) &&
        withinRange(f, 'period', r.timestamp),
    );
  });

  protected readonly pageSize = PAGE;
  protected readonly limit = linkedSignal({ source: this.filtered, computation: () => PAGE });
  protected readonly visible = computed(() => this.filtered().slice(0, this.limit()));

  protected readonly groups = computed<DayGroup[]>(() => {
    const now = new Date();
    const groups: DayGroup[] = [];
    for (const entry of this.visible()) {
      const key = entry.timestamp.slice(0, 10);
      let group = groups.at(-1);
      if (group?.key !== key) {
        const diff = daysBetween(entry.timestamp, now);
        group = { key, label: diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : formatDate(entry.timestamp), entries: [] };
        groups.push(group);
      }
      (group.entries as LifecycleEventListItem[]).push(entry);
    }
    return groups;
  });

  protected readonly icon = LIFECYCLE_ICON;
  protected readonly formatTime = formatTime;
  protected readonly formatDateTime = formatDateTime;

  protected tone(entry: LifecycleEventListItem): string {
    return TONE_CLASSES[LIFECYCLE_TONE[entry.eventType]];
  }

  protected export(): void {
    downloadCsv(
      timestampedName('asset-lifecycle-history', 'csv'),
      ['Date & Time', 'User', 'Event Type', 'Asset ID', 'Asset', 'Previous Value', 'New Value', 'Reference', 'Comments'],
      this.filtered().map((r) => [formatDateTime(r.timestamp), r.user, r.eventType, r.assetCode, r.assetName, r.previousValue, r.newValue, r.reference, r.comments]),
    );
  }
}
