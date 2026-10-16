import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { toOptions } from '@shared/models/select-option';
import { EmptyState } from '@shared/ui/empty-state';
import { FilterBar } from '@shared/ui/filter-bar';
import { Icon } from '@shared/ui/icon';
import { PageHeader } from '@shared/ui/page-header';
import { Skeleton } from '@shared/ui/skeleton';
import { StatusBadge } from '@shared/ui/status-badge';
import { type FilterField, type FilterValues, matchesAny } from '@shared/utils/filters';
import { formatDate } from '@shared/utils/format';
import { ComponentManager } from '../../components/component-manager';
import { AssetApi, ComponentApi } from '../../data/asset.api';
import { ASSET_STATUSES, type AssetListItem } from '../../models/asset.model';
import type { ComponentListItem } from '../../models/component.model';
import { ASSET_STATUS_TONE, COMPONENT_STATUS_TONE } from '../../models/display';

interface TreeNode {
  readonly asset: AssetListItem;
  readonly active: readonly ComponentListItem[];
  readonly historical: readonly ComponentListItem[];
}

const PAGE = 30;

/** SRS 3.7 — parent–child structure of complex equipment across the installed base. */
@Component({
  selector: 'amc-asset-hierarchy-page',
  imports: [ComponentManager, EmptyState, NgTemplateOutlet, FilterBar, Icon, PageHeader, RouterLink, Skeleton, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header
        title="Asset Hierarchy / Components"
        subtitle="Complex equipment represented as parent assets with child components. Replaced components keep their historical relationship."
        [breadcrumbs]="[{ label: 'Assets & Installed Base', path: '/app/assets/dashboard' }, { label: 'Hierarchy' }]"
      >
        <div class="flex items-center rounded-lg border border-line p-0.5" role="group" aria-label="View">
          <button type="button" [class]="view() === 'tree' ? 'amc-btn-sm rounded-md bg-surface px-3 shadow-xs text-ink' : 'amc-btn-sm rounded-md px-3 text-ink-muted hover:text-ink'" (click)="view.set('tree')"><amc-icon name="layers" [size]="14" /> Tree</button>
          <button type="button" [class]="view() === 'register' ? 'amc-btn-sm rounded-md bg-surface px-3 shadow-xs text-ink' : 'amc-btn-sm rounded-md px-3 text-ink-muted hover:text-ink'" (click)="view.set('register')"><amc-icon name="list" [size]="14" /> Component register</button>
        </div>
      </amc-page-header>

      @if (view() === 'register') {
        <amc-component-manager (changed)="components.reload()" />
      } @else {
        <section class="amc-card overflow-hidden">
          <div class="border-b border-line p-3 sm:p-4">
            <amc-filter-bar searchPlaceholder="Search asset, component or serial number…" [(search)]="search" [fields]="filterFields()" [(filters)]="filters">
              <ng-container actions>
                <button type="button" class="amc-btn-ghost amc-btn-sm" (click)="expandAll()">Expand all</button>
                <button type="button" class="amc-btn-ghost amc-btn-sm" (click)="collapseAll()">Collapse all</button>
              </ng-container>
            </amc-filter-bar>
          </div>
          @if (!assets.hasValue() || !components.hasValue()) {
            <div class="space-y-3 p-5">@for (i of [1, 2, 3, 4, 5]; track i) { <amc-skeleton class="h-10 w-full" /> }</div>
          } @else if (!tree().length) {
            <amc-empty-state icon="layers" title="No matching assets" message="Try a different search or clear the filters." />
          } @else {
            <ul class="divide-y divide-line" aria-label="Asset hierarchy">
              @for (node of visible(); track node.asset.id) {
                @let open = expanded().has(node.asset.id);
                <li>
                  <div class="flex items-center gap-3 px-3 py-2.5 sm:px-4">
                    <button type="button" class="amc-btn-icon h-7 w-7 shrink-0" [attr.aria-label]="(open ? 'Collapse ' : 'Expand ') + node.asset.name" (click)="toggle(node.asset.id)" [disabled]="!node.active.length && !node.historical.length">
                      <amc-icon [name]="open ? 'chevron-down' : 'chevron-right'" [size]="14" />
                    </button>
                    <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-subtle text-brand"><amc-icon name="box" [size]="15" /></span>
                    <div class="min-w-0 flex-1">
                      <a [routerLink]="['/app/assets', node.asset.id]" [queryParams]="{ tab: 'components' }" class="block truncate text-sm font-semibold text-ink hover:text-brand">{{ node.asset.name }}</a>
                      <p class="truncate text-xs text-ink-muted"><span class="font-mono">{{ node.asset.code }}</span> · {{ node.asset.model }} · {{ node.asset.customerName ?? 'No customer' }}{{ node.asset.siteName ? ' · ' + node.asset.siteName : '' }}</p>
                    </div>
                    <span class="hidden text-xs text-ink-muted sm:block">{{ node.active.length }} component{{ node.active.length === 1 ? '' : 's' }}{{ node.historical.length ? ' · ' + node.historical.length + ' historical' : '' }}</span>
                    <amc-status-badge [label]="node.asset.status" [tone]="assetTone[node.asset.status]" />
                  </div>
                  @if (open) {
                    <ul class="ml-10 border-l border-line pb-2 sm:ml-12">
                      @for (c of node.active; track c.id) {
                        <ng-container *ngTemplateOutlet="componentRow; context: { $implicit: c }" />
                      }
                      @for (c of node.historical; track c.id) {
                        <ng-container *ngTemplateOutlet="componentRow; context: { $implicit: c }" />
                      }
                    </ul>
                  }
                </li>
              }
            </ul>
            <div class="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-ink-muted">
              <span>Showing {{ visible().length }} of {{ tree().length }} parent assets</span>
              @if (visible().length < tree().length) {
                <button type="button" class="amc-btn-secondary amc-btn-sm" (click)="limit.set(limit() + page)">Load more</button>
              }
            </div>
          }
        </section>
      }
    </div>

    <ng-template #componentRow let-c>
      <li class="relative flex items-center gap-3 py-2 pr-4 pl-5" [class]="c.status === 'Replaced' || c.status === 'Removed' ? 'opacity-70' : ''">
        <span class="absolute top-1/2 left-0 h-px w-3 bg-line"></span>
        <amc-icon [name]="c.status === 'Replaced' ? 'refresh' : 'layers'" [size]="14" class="shrink-0 text-ink-subtle" />
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm text-ink">{{ c.name }} <span class="text-xs text-ink-muted">· {{ c.componentType }}</span></p>
          <p class="truncate text-xs text-ink-muted">
            <span class="font-mono">{{ c.serialNumber || 'No serial' }}</span>
            · installed {{ formatDate(c.installationDate) || '—' }}
            @if (c.replacementDate) { · replaced {{ formatDate(c.replacementDate) }} }
            @if (c.replacedByName) { · replaced by {{ c.replacedByName }} }
            @if (c.replacesName && !c.replacedByName) { · replaces previous unit }
            @if (c.warrantyEnd) { · warranty {{ c.warrantyActive ? 'until' : 'ended' }} {{ formatDate(c.warrantyEnd) }} }
          </p>
        </div>
        <span class="hidden text-xs text-ink-muted md:block">{{ c.serviceCount }} services</span>
        <amc-status-badge [label]="c.status" [tone]="componentTone(c)" />
      </li>
    </ng-template>
  `,
})
export class AssetHierarchyPage {
  private readonly assetsApi = inject(AssetApi);
  private readonly componentsApi = inject(ComponentApi);

  protected readonly view = signal<'tree' | 'register'>('tree');
  protected readonly assets = rxResource({ stream: () => this.assetsApi.list() });
  protected readonly components = rxResource({ stream: () => this.componentsApi.list() });
  protected readonly assetTone = ASSET_STATUS_TONE;
  protected componentTone(c: ComponentListItem) {
    return COMPONENT_STATUS_TONE[c.status];
  }
  protected readonly formatDate = formatDate;
  protected readonly page = PAGE;

  protected readonly search = signal('');
  protected readonly filters = signal<FilterValues>({});
  protected readonly filterFields = computed<FilterField[]>(() => {
    const assets = this.assets.hasValue() ? this.assets.value() : [];
    return [
      { key: 'category', label: 'Asset Category', type: 'multiselect', options: toOptions([...new Set(assets.map((a) => a.category))].sort()) },
      { key: 'status', label: 'Asset Status', type: 'multiselect', options: toOptions(ASSET_STATUSES) },
      { key: 'customer', label: 'Customer', type: 'multiselect', options: toOptions([...new Set(assets.map((a) => a.customerName ?? ''))].filter(Boolean).sort()) },
      { key: 'replaced', label: 'Component History', type: 'select', options: [{ value: 'with', label: 'Has replaced components' }] },
    ];
  });

  protected readonly tree = computed<TreeNode[]>(() => {
    const assets = this.assets.hasValue() ? this.assets.value() : [];
    const byAsset = new Map<string, ComponentListItem[]>();
    for (const c of this.components.hasValue() ? this.components.value() : []) byAsset.set(c.assetId, [...(byAsset.get(c.assetId) ?? []), c]);
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    return assets
      .map((asset) => {
        const all = byAsset.get(asset.id) ?? [];
        return { asset, active: all.filter((c) => c.status !== 'Replaced' && c.status !== 'Removed'), historical: all.filter((c) => c.status === 'Replaced' || c.status === 'Removed') };
      })
      .filter((n) => n.active.length || n.historical.length)
      .filter(
        (n) =>
          (!term || `${n.asset.code} ${n.asset.name} ${n.asset.tag} ${n.asset.serialNumber} ${[...n.active, ...n.historical].map((c) => `${c.name} ${c.serialNumber}`).join(' ')}`.toLowerCase().includes(term)) &&
          matchesAny(f, 'category', n.asset.category) &&
          matchesAny(f, 'status', n.asset.status) &&
          matchesAny(f, 'customer', n.asset.customerName) &&
          (f['replaced'] !== 'with' || n.historical.some((c) => c.status === 'Replaced')),
      );
  });

  protected readonly limit = linkedSignal({ source: this.tree, computation: () => PAGE });
  protected readonly visible = computed(() => this.tree().slice(0, this.limit()));
  protected readonly expanded = signal<Set<string>>(new Set());

  protected toggle(id: string): void {
    this.expanded.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  protected expandAll(): void {
    this.expanded.set(new Set(this.visible().map((n) => n.asset.id)));
  }

  protected collapseAll(): void {
    this.expanded.set(new Set());
  }
}
