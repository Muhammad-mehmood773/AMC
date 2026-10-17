import { ChangeDetectionStrategy, Component, computed, effect, input, signal, untracked } from '@angular/core';
import { Select } from '@shared/ui/select';
import { StatusBadge } from '@shared/ui/status-badge';
import { formatDateTime } from '@shared/utils/format';
import type { ContractVersion } from '../models/workflow.model';

/** SRS 5.11 / 5.22 — version, clause and change comparison between two contract versions. */
@Component({
  selector: 'amc-version-compare',
  imports: [Select, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (versions().length < 2) {
      <p class="text-sm text-ink-muted">At least two versions are needed for a comparison.</p>
    } @else {
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><span class="amc-label">From version</span><amc-select inputId="vc-from" class="mt-1 block" [options]="options()" [(value)]="fromId" /></div>
        <div><span class="amc-label">To version</span><amc-select inputId="vc-to" class="mt-1 block" [options]="options()" [(value)]="toId" /></div>
      </div>
      <div class="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
        <span>{{ changedCount() }} of {{ rows().length }} terms changed</span>
        <label class="ml-auto inline-flex items-center gap-1.5"><input type="checkbox" class="amc-checkbox" [checked]="onlyChanged()" (change)="onlyChanged.set(!onlyChanged())" /> Only changes</label>
      </div>
      <div class="mt-2 overflow-x-auto rounded-xl border border-line">
        <table class="w-full min-w-[36rem] text-sm">
          <thead class="bg-surface-muted text-left text-xs text-ink-muted">
            <tr><th class="px-3 py-2 font-medium">Term</th><th class="px-3 py-2 font-medium">v{{ from()?.version }}</th><th class="px-3 py-2 font-medium">v{{ to()?.version }}</th></tr>
          </thead>
          <tbody class="divide-y divide-line">
            @for (r of shown(); track r.key) {
              <tr [class]="r.changed ? 'bg-warn-subtle/40' : ''">
                <td class="px-3 py-2 align-top font-medium text-ink">{{ r.key }} @if (r.changed) { <amc-status-badge label="Changed" tone="warn" [dot]="false" /> }</td>
                <td class="px-3 py-2 align-top" [class]="r.changed ? 'text-ink-muted line-through decoration-danger/60' : 'text-ink-muted'">{{ r.a }}</td>
                <td class="px-3 py-2 align-top" [class]="r.changed ? 'font-medium text-ok' : 'text-ink-muted'">{{ r.b }}</td>
              </tr>
            } @empty {
              <tr><td colspan="3" class="px-3 py-6 text-center text-ink-muted">No differences between these versions.</td></tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class VersionCompare {
  readonly versions = input.required<readonly ContractVersion[]>();

  protected readonly fromId = signal<string | number | null>(null);
  protected readonly toId = signal<string | number | null>(null);
  protected readonly onlyChanged = signal(true);
  protected readonly options = computed(() => this.versions().map((v) => ({ value: v.id, label: `v${v.version} — ${v.changeSummary}`, hint: `${formatDateTime(v.createdAt)} · ${v.executionStatus}` })));
  protected readonly from = computed(() => this.versions().find((v) => v.id === this.fromId()));
  protected readonly to = computed(() => this.versions().find((v) => v.id === this.toId()));
  protected readonly rows = computed(() => {
    const a = this.from()?.snapshot ?? {};
    const b = this.to()?.snapshot ?? {};
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].map((key) => ({ key, a: a[key] ?? '—', b: b[key] ?? '—', changed: (a[key] ?? '') !== (b[key] ?? '') }));
  });
  protected readonly shown = computed(() => (this.onlyChanged() ? this.rows().filter((r) => r.changed) : this.rows()));
  protected readonly changedCount = computed(() => this.rows().filter((r) => r.changed).length);

  constructor() {
    effect(() => {
      const list = [...this.versions()].sort((x, y) => x.createdAt.localeCompare(y.createdAt));
      untracked(() => {
        if (list.length < 2) return;
        if (!list.some((v) => v.id === this.toId())) this.toId.set(list[list.length - 1].id);
        if (!list.some((v) => v.id === this.fromId())) this.fromId.set(list[list.length - 2].id);
      });
    });
  }
}
