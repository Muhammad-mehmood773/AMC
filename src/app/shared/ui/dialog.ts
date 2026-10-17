import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  model,
  viewChild,
} from '@angular/core';
import { lockPageScroll } from '../utils/scroll-lock';
import { Icon } from './icon';

const SIZES = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-xl',
  lg: 'sm:max-w-3xl',
  xl: 'sm:max-w-5xl',
} as const;

/**
 * Accessible modal built on the native `<dialog>` element (focus trap, top layer, Escape).
 * Renders as a centered modal on desktop, a bottom sheet on mobile, or a right-hand drawer.
 * Project footer buttons with the `dialogFooter` attribute.
 */
@Component({
  selector: 'amc-dialog',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog
      #dialog
      class="overflow-hidden border border-line bg-surface p-0 text-ink backdrop:bg-slate-950/50 backdrop:backdrop-blur-[3px] open:flex"
      [class]="panelClass()"
      [attr.aria-label]="title()"
      (close)="open.set(false)"
    >
      <div class="flex max-h-full min-h-0 w-full flex-col">
        <!-- Header: subtle downward shadow separating it from the body -->
        <header
          class="relative flex shrink-0 items-start justify-between gap-4 border-b border-line bg-surface px-5 py-4 sm:px-6"
          style="box-shadow: 0 2px 8px -2px rgb(15 23 42 / 0.08), 0 1px 3px -1px rgb(15 23 42 / 0.06);"
        >
          <div class="min-w-0">
            <h2 class="text-base font-semibold tracking-tight text-ink">{{ title() }}</h2>
            @if (description()) {
              <p class="mt-0.5 text-sm text-ink-muted">{{ description() }}</p>
            }
          </div>
          <button
            type="button"
            class="amc-btn-icon -mt-1 -mr-2 shrink-0 text-ink-muted hover:bg-surface-sunken hover:text-ink"
            aria-label="Close dialog"
            (click)="open.set(false)"
          >
            <amc-icon name="x" [size]="18" />
          </button>
        </header>

        <!-- Scrollable body -->
        <div class="min-h-0 flex-1 overflow-y-auto bg-surface-muted/30 px-5 py-5 sm:px-6">
          @if (open()) {
            <ng-content />
          }
        </div>

        <!-- Footer: upward shadow lifting it above the body -->
        <footer
          class="relative flex shrink-0 flex-col-reverse gap-2 border-t border-line bg-surface px-5 py-3.5 empty:hidden sm:flex-row sm:justify-end sm:px-6"
          style="box-shadow: 0 -2px 8px -2px rgb(15 23 42 / 0.08), 0 -1px 3px -1px rgb(15 23 42 / 0.06);"
        >
          <ng-content select="[dialogFooter]" />
        </footer>
      </div>
    </dialog>
  `,
})
export class Dialog {
  readonly open = model(false);
  readonly title = input.required<string>();
  readonly description = input('');
  readonly size = input<keyof typeof SIZES>('md');
  readonly variant = input<'modal' | 'drawer'>('modal');
  readonly dismissible = input(true);
  readonly drawerWidth = input<'md' | 'lg'>('md');

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly panelClass = computed(() =>
    this.variant() === 'drawer'
      ? `my-0 mr-0 ml-auto h-dvh max-h-dvh w-full ${this.drawerWidth() === 'lg' ? 'max-w-xl' : 'max-w-md'} rounded-none border-y-0 border-r-0 shadow-[var(--shadow-drawer)] open:animate-slide-in-right`
      : `mx-auto mt-auto mb-0 max-h-[92dvh] w-full max-w-full rounded-t-2xl shadow-[var(--shadow-modal)] open:animate-slide-up sm:my-auto sm:max-h-[calc(100dvh-4rem)] sm:w-[calc(100%-2rem)] sm:rounded-2xl ${SIZES[this.size()]}`,
  );

  private releaseScroll: (() => void) | null = null;

  constructor() {
    // Backdrop clicks land on the <dialog> element itself; content clicks land on children.
    afterNextRender(() =>
      this.dialog().nativeElement.addEventListener('click', (event) => this.onBackdrop(event)),
    );
    effect(() => {
      const element = this.dialog().nativeElement;
      if (this.open() && !element.open) {
        element.showModal();
        this.releaseScroll ??= lockPageScroll();
      } else if (!this.open() && element.open) {
        element.close();
      }
      if (!this.open()) this.unlock();
    });
    inject(DestroyRef).onDestroy(() => this.unlock());
  }

  private unlock(): void {
    this.releaseScroll?.();
    this.releaseScroll = null;
  }

  private onBackdrop(event: MouseEvent): void {
    if (this.dismissible() && event.target === this.dialog().nativeElement) {
      this.open.set(false);
    }
  }
}
