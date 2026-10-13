import { ChangeDetectionStrategy, Component, computed, input, model, signal } from '@angular/core';
import { Icon, type IconName } from './icon';
import { Popover } from './popover';

export interface TabItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: IconName;
  readonly count?: number | null;
}

@Component({
  selector: 'amc-tabs',
  imports: [Icon, Popover],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div
      class="relative -mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
    >
      <div class="flex min-w-max gap-1 border-b border-line" role="tablist">
        @for (tab of visibleTabs(); track tab.id) {
          <button
            type="button"
            role="tab"
            class="relative -mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors"
            [class]="
              tab.id === active()
                ? 'border-brand text-ink'
                : 'border-transparent text-ink-muted hover:border-line-strong hover:text-ink'
            "
            [attr.aria-selected]="tab.id === active()"
            [attr.tabindex]="tab.id === active() ? 0 : -1"
            (click)="active.set(tab.id)"
            (keydown)="onKeydown($event)"
          >
            @if (tab.icon) {
              <amc-icon
                [name]="tab.icon"
                [class]="tab.id === active() ? 'text-brand' : 'text-ink-subtle'"
              />
            }
            {{ tab.label }}
            @if (tab.count !== undefined && tab.count !== null) {
              <span
                class="rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums"
                [class]="
                  tab.id === active()
                    ? 'bg-brand-subtle text-brand'
                    : 'bg-surface-sunken text-ink-muted'
                "
                >{{ tab.count }}</span
              >
            }
          </button>
        }

        <!-- "More" overflow dropdown -->
        @if (overflowTabs().length > 0) {
          <div class="relative -mb-px flex items-end">
            <button
              #moreBtn
              type="button"
              class="flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors"
              [class]="
                overflowActive()
                  ? 'border-brand text-ink'
                  : 'border-transparent text-ink-muted hover:border-line-strong hover:text-ink'
              "
              [attr.aria-expanded]="moreOpen()"
              aria-haspopup="true"
              (click)="moreOpen.set(!moreOpen())"
            >
              More
              @if (overflowActive()) {
                <span class="h-1.5 w-1.5 rounded-full bg-brand"></span>
              }
              <amc-icon name="chevron-down" [size]="12" />
            </button>
            <amc-popover [anchor]="moreBtn" [(open)]="moreOpen" align="end" [minWidth]="200">
              <ul class="p-1.5">
                @for (tab of overflowTabs(); track tab.id) {
                  <li>
                    <button
                      type="button"
                      class="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-surface-sunken"
                      [class]="tab.id === active() ? 'font-semibold text-brand' : 'text-ink'"
                      (click)="selectOverflow(tab.id)"
                    >
                      {{ tab.label }}
                      @if (tab.count !== undefined && tab.count !== null) {
                        <span class="ml-auto rounded-full bg-surface-sunken px-1.5 py-px text-[11px] font-semibold tabular-nums text-ink-muted">{{ tab.count }}</span>
                      }
                    </button>
                  </li>
                }
              </ul>
            </amc-popover>
          </div>
        }
      </div>
    </div>
  `,
})
export class Tabs {
  readonly items = input.required<readonly TabItem[]>();
  readonly active = model.required<string>();
  /** Max number of tabs to show before collapsing into "More". 0 = show all. */
  readonly maxVisible = input(0);

  protected readonly moreOpen = signal(false);

  protected readonly visibleTabs = computed(() => {
    const max = this.maxVisible();
    return max > 0 ? this.items().slice(0, max) : this.items();
  });

  protected readonly overflowTabs = computed(() => {
    const max = this.maxVisible();
    return max > 0 ? this.items().slice(max) : [];
  });

  protected readonly overflowActive = computed(() =>
    this.overflowTabs().some((t) => t.id === this.active()),
  );

  protected selectOverflow(id: string): void {
    this.active.set(id);
    this.moreOpen.set(false);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') {
      return;
    }
    const items = this.items();
    const index = items.findIndex((tab) => tab.id === this.active());
    const next = items[(index + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length];
    this.active.set(next.id);
    const list = (event.currentTarget as HTMLElement).parentElement;
    list?.querySelectorAll<HTMLButtonElement>('[role=tab]')[items.indexOf(next)]?.focus();
  }
}
