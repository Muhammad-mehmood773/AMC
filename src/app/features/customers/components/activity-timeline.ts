import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { toOptions } from '@shared/models/select-option';
import { EmptyState } from '@shared/ui/empty-state';
import { ErrorState } from '@shared/ui/error-state';
import { FilterBar } from '@shared/ui/filter-bar';
import { Icon } from '@shared/ui/icon';
import { Skeleton } from '@shared/ui/skeleton';
import type { BadgeTone } from '@shared/ui/status-badge';
import { downloadCsv, timestampedName } from '@shared/utils/file';
import { type FilterField, type FilterValues, matchesAny, withinRange } from '@shared/utils/filters';
import { daysBetween, formatDate, formatDateTime, formatTime } from '@shared/utils/format';
import { ActivityApi } from '../data/customer-site.api';
import { ACTIVITY_ACTIONS, ACTIVITY_ENTITIES, type ActivityListItem } from '../models/activity.model';
import { ACTIVITY_ICON, ACTIVITY_TONE } from '../models/display';

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-sunken text-ink-muted',
  brand: 'bg-brand-subtle text-brand',
  ok: 'bg-ok-subtle text-ok',
  warn: 'bg-warn-subtle text-warn',
  danger: 'bg-danger-subtle text-danger',
  info: 'bg-info-subtle text-info',
  accent: 'bg-accent-subtle text-accent',
};

const PAGE = 40;

interface DayGroup {
  readonly key: string;
  readonly label: string;
  readonly entries: readonly ActivityListItem[];
}

/** Audit-style, date-grouped timeline of customer and site activity. */
@Component({
  selector: 'amc-activity-timeline',
  imports: [EmptyState, ErrorState, FilterBar, Icon, RouterLink, Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="amc-card overflow-hidden">
      <div class="border-b border-line p-3 sm:p-4">
        <amc-filter-bar
          searchPlaceholder="Search activity, reference or user…"
          [(search)]="search"
          [fields]="filterFields()"
          [(filters)]="filters"
        >
          <ng-container actions>
            <button type="button" class="amc-btn-ghost" [disabled]="!filtered().length" (click)="export()">
              <amc-icon name="download" />
              <span class="hidden sm:inline">Export</span>
            </button>
          </ng-container>
        </amc-filter-bar>
      </div>

      @if (activity.error()) {
        <amc-error-state message="Activity history could not be loaded." (retry)="activity.reload()" />
      } @else if (!activity.hasValue()) {
        <div class="space-y-5 p-5" aria-busy="true">
          @for (i of [1, 2, 3, 4, 5]; track i) {
            <div class="flex gap-3">
              <amc-skeleton class="h-8 w-8 rounded-full" />
              <div class="flex-1 space-y-2">
                <amc-skeleton class="h-3.5 w-2/3" />
                <amc-skeleton class="h-3 w-1/4" />
              </div>
            </div>
          }
        </div>
      } @else if (filtered().length === 0) {
        <amc-empty-state
          icon="history"
          [title]="rows().length ? 'No activity matches your filters' : 'No activity yet'"
          [message]="rows().length ? 'Try widening the period or clearing filters.' : 'Changes to this record will be recorded here.'"
        />
      } @else {
        <div class="px-4 py-2 sm:px-6">
          @for (group of groups(); track group.key) {
            <div class="pt-3 pb-2">
              <h3 class="amc-overline">{{ group.label }}</h3>
            </div>
            <ol class="relative mb-2 ml-4 border-l border-line">
              @for (entry of group.entries; track entry.id) {
                <li class="relative pb-5 pl-7 last:pb-3">
                  <span
                    class="absolute top-0 -left-4 flex h-8 w-8 items-center justify-center rounded-full ring-4 ring-surface"
                    [class]="toneClass(entry)"
                  >
                    <amc-icon [name]="icon[entry.action]" [size]="14" />
                  </span>
                  <div class="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div class="min-w-0">
                      <p class="text-sm text-ink">
                        <span class="font-semibold">{{ entry.userName }}</span>
                        @if (entry.field) {
                          changed <span class="font-medium">{{ entry.field }}</span> from
                          <span class="rounded bg-surface-sunken px-1.5 py-0.5 text-[13px] text-ink-muted line-through decoration-ink-subtle">{{ entry.previousValue }}</span>
                          to
                          <span class="rounded bg-brand-subtle px-1.5 py-0.5 text-[13px] font-medium text-brand">{{ entry.newValue }}</span>
                        } @else {
                          <span class="text-ink-muted"> · {{ entry.action }}</span>
                        }
                      </p>
                      @if (!entry.field || entry.description) {
                        <p class="mt-0.5 text-sm text-ink-muted">{{ entry.description }}</p>
                      }
                      <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-subtle">
                        <span class="inline-flex items-center gap-1"><amc-icon name="layers" [size]="12" />{{ entry.entity }}</span>
                        @if (entry.reference) {
                          <span class="font-mono">Ref: {{ entry.reference }}</span>
                        }
                        @if (!customerId()) {
                          <a [routerLink]="['/app/customers', entry.customerId]" class="hover:text-brand">{{ entry.customerName }}</a>
                        }
                        @if (entry.siteName && !siteId()) {
                          <a [routerLink]="['/app/customers/sites', entry.siteId]" class="hover:text-brand">{{ entry.siteName }}</a>
                        }
                      </div>
                    </div>
                    <time class="shrink-0 text-xs text-ink-muted tabular-nums" [attr.datetime]="entry.timestamp" [attr.title]="formatDateTime(entry.timestamp)">
                      {{ formatTime(entry.timestamp) }}
                    </time>
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
export class ActivityTimeline {
  private readonly api = inject(ActivityApi);

  readonly customerId = input<string | null>(null);
  readonly siteId = input<string | null>(null);

  protected readonly activity = rxResource({
    params: () => ({ customerId: this.customerId() ?? undefined, siteId: this.siteId() ?? undefined }),
    stream: ({ params }) => this.api.list(params),
  });
  protected readonly rows = computed(() => (this.activity.hasValue() ? this.activity.value() : []));

  protected readonly search = signal('');
  protected readonly filters = signal<FilterValues>({});

  protected readonly filterFields = computed<FilterField[]>(() => {
    const rows = this.rows();
    const customers = new Map(rows.map((r) => [r.customerId, r.customerName]));
    return [
      ...(this.customerId() || this.siteId()
        ? []
        : [{ key: 'customer', label: 'Customer', type: 'multiselect' as const, options: [...customers].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label)) }]),
      { key: 'entity', label: 'Entity', type: 'multiselect', options: toOptions(ACTIVITY_ENTITIES) },
      { key: 'action', label: 'Action', type: 'multiselect', options: toOptions(ACTIVITY_ACTIONS) },
      { key: 'user', label: 'User', type: 'multiselect', options: toOptions([...new Set(rows.map((r) => r.userName))].sort()) },
      { key: 'period', label: 'Date', type: 'date-range' },
    ];
  });

  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    return this.rows().filter(
      (r) =>
        (!term || `${r.description} ${r.reference ?? ''} ${r.userName} ${r.field ?? ''} ${r.customerName}`.toLowerCase().includes(term)) &&
        matchesAny(f, 'customer', r.customerId) &&
        matchesAny(f, 'entity', r.entity) &&
        matchesAny(f, 'action', r.action) &&
        matchesAny(f, 'user', r.userName) &&
        withinRange(f, 'period', r.timestamp),
    );
  });

  protected readonly pageSize = PAGE;
  protected readonly limit = linkedSignal({ source: this.filtered, computation: () => PAGE });
  protected readonly visible = computed(() => this.filtered().slice(0, this.limit()));

  protected readonly groups = computed<DayGroup[]>(() => {
    const today = new Date();
    const groups: DayGroup[] = [];
    for (const entry of this.visible()) {
      const key = entry.timestamp.slice(0, 10);
      let group = groups.at(-1);
      if (group?.key !== key) {
        const diff = daysBetween(entry.timestamp, today);
        group = { key, label: diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : formatDate(entry.timestamp), entries: [] };
        groups.push(group);
      }
      (group.entries as ActivityListItem[]).push(entry);
    }
    return groups;
  });

  protected readonly icon = ACTIVITY_ICON;
  protected readonly formatTime = formatTime;
  protected readonly formatDateTime = formatDateTime;

  protected toneClass(entry: ActivityListItem): string {
    return TONE_CLASSES[ACTIVITY_TONE[entry.action]];
  }

  protected export(): void {
    downloadCsv(
      timestampedName('activity-history', 'csv'),
      ['Date & Time', 'User', 'Action', 'Entity', 'Field', 'Previous Value', 'New Value', 'Reference', 'Customer', 'Site', 'Description'],
      this.filtered().map((r) => [formatDateTime(r.timestamp), r.userName, r.action, r.entity, r.field, r.previousValue, r.newValue, r.reference, r.customerName, r.siteName, r.description]),
    );
  }
}
