import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Icon, type IconName } from './icon';
import { Popover } from './popover';

export interface MenuItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: IconName;
  readonly danger?: boolean;
  readonly disabled?: boolean;
  readonly hint?: string;
  readonly dividerBefore?: boolean;
}

/** Dropdown action menu rendered in the top layer; keyboard navigable. */
@Component({
  selector: 'amc-action-menu',
  imports: [Icon, Popover],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative inline-flex' },
  template: `
    <button
      #trigger
      type="button"
      [class]="
        label()
          ? 'amc-btn-secondary'
          : 'amc-btn-icon h-8 w-8 data-[open=true]:bg-surface-sunken data-[open=true]:text-ink'
      "
      [attr.data-open]="open()"
      [attr.aria-label]="label() || ariaLabel()"
      aria-haspopup="menu"
      [attr.aria-expanded]="open()"
      (click)="open.set(!open())"
    >
      @if (label()) {
        {{ label() }}
        <amc-icon name="chevron-down" [class.rotate-180]="open()" class="transition-transform" />
      } @else {
        <amc-icon name="more-horizontal" [size]="18" />
      }
    </button>

    <amc-popover [anchor]="trigger" [(open)]="open" align="end" role="menu" [minWidth]="224">
      <div #panel class="p-1" tabindex="-1" (keydown)="onMenuKeydown($event)">
        @for (item of items(); track item.id) {
          @if (item.dividerBefore) {
            <div class="my-1 h-px bg-line" role="separator"></div>
          }
          <button
            type="button"
            role="menuitem"
            class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-45"
            [class]="
              item.danger
                ? 'text-danger hover:bg-danger-subtle focus:bg-danger-subtle'
                : 'text-ink hover:bg-surface-sunken focus:bg-surface-sunken'
            "
            [disabled]="item.disabled"
            [attr.title]="item.hint ?? null"
            (click)="choose(item)"
          >
            @if (item.icon) {
              <amc-icon [name]="item.icon" [class]="item.danger ? 'text-danger' : 'text-ink-subtle'" />
            }
            <span class="flex-1 truncate">{{ item.label }}</span>
          </button>
        }
      </div>
    </amc-popover>
  `,
})
export class ActionMenu {
  readonly items = input.required<readonly MenuItem[]>();
  readonly label = input('');
  readonly ariaLabel = input('Open actions');
  readonly action = output<string>();

  protected readonly open = signal(false);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  constructor() {
    afterRenderEffect(() => {
      if (this.open()) {
        this.panel()?.nativeElement.querySelector<HTMLButtonElement>('[role=menuitem]:not(:disabled)')?.focus();
      }
    });
  }

  protected choose(item: MenuItem): void {
    if (item.disabled) return;
    this.open.set(false);
    this.trigger().nativeElement.focus();
    this.action.emit(item.id);
  }

  protected onMenuKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const items = Array.from(
      this.panel()?.nativeElement.querySelectorAll<HTMLButtonElement>('[role=menuitem]:not(:disabled)') ?? [],
    );
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'ArrowDown' ? index + 1 : index - 1;
    items[(next + items.length) % items.length]?.focus();
  }
}
