import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { Icon, type IconName } from './icon';

export interface TabItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: IconName;
  readonly count?: number | null;
}

@Component({
  selector: 'amc-tabs',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div
      class="relative -mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
    >
      <div class="flex min-w-max gap-1 border-b border-line" role="tablist">
        @for (tab of items(); track tab.id) {
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
      </div>
    </div>
  `,
})
export class Tabs {
  readonly items = input.required<readonly TabItem[]>();
  readonly active = model.required<string>();

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
