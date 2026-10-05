import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  input,
  model,
  viewChild,
} from '@angular/core';
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
      class="overflow-hidden border border-line bg-surface p-0 text-ink shadow-pop backdrop:bg-slate-950/45 backdrop:backdrop-blur-[2px] open:flex"
      [class]="panelClass()"
      [attr.aria-label]="title()"
      (close)="open.set(false)"
    >
      <div class="flex max-h-full min-h-0 w-full flex-col">
        <header class="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
          <div class="min-w-0">
            <h2 class="text-base font-semibold tracking-tight">{{ title() }}</h2>
            @if (description()) {
              <p class="mt-0.5 text-sm text-ink-muted">{{ description() }}</p>
            }
          </div>
          <button
            type="button"
            class="amc-btn-icon -mt-1 -mr-2 shrink-0"
            aria-label="Close dialog"
            (click)="open.set(false)"
          >
            <amc-icon name="x" [size]="18" />
          </button>
        </header>
        <div class="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          @if (open()) {
            <ng-content />
          }
        </div>
        <footer
          class="flex flex-col-reverse gap-2 border-t border-line bg-surface-muted px-5 py-3.5 empty:hidden sm:flex-row sm:justify-end sm:px-6"
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
      ? `my-0 mr-0 ml-auto h-dvh max-h-dvh w-full ${this.drawerWidth() === 'lg' ? 'max-w-xl' : 'max-w-md'} rounded-none border-y-0 border-r-0 open:animate-slide-in-right`
      : `mx-auto mt-auto mb-0 max-h-[92dvh] w-full max-w-full rounded-t-2xl open:animate-slide-up sm:my-auto sm:max-h-[calc(100dvh-4rem)] sm:w-[calc(100%-2rem)] sm:rounded-2xl ${SIZES[this.size()]}`,
  );

  constructor() {
    // Backdrop clicks land on the <dialog> element itself; content clicks land on children.
    afterNextRender(() =>
      this.dialog().nativeElement.addEventListener('click', (event) => this.onBackdrop(event)),
    );
    effect(() => {
      const element = this.dialog().nativeElement;
      if (this.open() && !element.open) {
        element.showModal();
      } else if (!this.open() && element.open) {
        element.close();
      }
    });
  }

  private onBackdrop(event: MouseEvent): void {
    if (this.dismissible() && event.target === this.dialog().nativeElement) {
      this.open.set(false);
    }
  }
}
