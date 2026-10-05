import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  inject,
  input,
  model,
  signal,
  viewChild,
} from '@angular/core';

interface Position {
  readonly top: number;
  readonly left: number;
  readonly width: number | null;
  readonly maxHeight: number;
}

const GAP = 6;
const MARGIN = 8;

/**
 * Anchored floating panel rendered in the browser top layer (HTML Popover API), so it is never
 * clipped by dialogs, scroll containers or elements that create containing blocks. Flips above
 * the anchor when there is not enough room below, follows scrolling, and closes on outside
 * pointer-down or Escape.
 */
@Component({
  selector: 'amc-popover',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <div
      #panel
      popover="manual"
      tabindex="-1"
      class="m-0 overflow-y-auto overscroll-contain rounded-xl border border-line bg-surface p-0 text-ink shadow-pop"
      [class]="panelClass()"
      [style.position]="'fixed'"
      [style.inset]="'auto'"
      [style.top.px]="position().top"
      [style.left.px]="position().left"
      [style.width.px]="position().width"
      [style.max-height.px]="position().maxHeight"
      [attr.role]="role()"
      [attr.aria-label]="ariaLabel() || null"
      (keydown.escape)="close(true)"
    >
      @if (open()) {
        <ng-content />
      }
    </div>
  `,
})
export class Popover {
  readonly anchor = input.required<HTMLElement>();
  readonly open = model(false);
  /** Match the anchor width (selects) or size to content (menus, calendars). */
  readonly matchWidth = input(false);
  readonly minWidth = input(0);
  readonly align = input<'start' | 'end'>('start');
  readonly role = input<string | null>(null);
  readonly ariaLabel = input('');
  readonly panelClass = input('');

  protected readonly position = signal<Position>({ top: 0, left: 0, width: null, maxHeight: 360 });
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private shown = false;

  constructor() {
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (this.open() && !this.anchor().contains(target) && !this.panel().nativeElement.contains(target)) {
        this.open.set(false);
      }
    };
    const onViewportChange = () => this.open() && this.reposition();
    document.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    });

    afterRenderEffect(() => {
      const panel = this.panel().nativeElement;
      const shouldShow = this.open();
      if (shouldShow && !this.shown) {
        this.shown = true;
        this.reposition();
        panel.showPopover?.();
        requestAnimationFrame(() => this.reposition());
      } else if (!shouldShow && this.shown) {
        this.shown = false;
        panel.hidePopover?.();
      }
    });
  }

  close(restoreFocus = false): void {
    if (!this.open()) return;
    this.open.set(false);
    if (restoreFocus) this.anchor().focus();
  }

  reposition(): void {
    const anchor = this.anchor().getBoundingClientRect();
    const panel = this.panel().nativeElement;
    const viewportH = window.innerHeight;
    const viewportW = window.innerWidth;
    const width = this.matchWidth() ? Math.max(anchor.width, this.minWidth()) : null;
    const panelWidth = width ?? Math.max(panel.offsetWidth, this.minWidth());
    const panelHeight = panel.scrollHeight;

    const spaceBelow = viewportH - anchor.bottom - GAP - MARGIN;
    const spaceAbove = anchor.top - GAP - MARGIN;
    const placeAbove = panelHeight > spaceBelow && spaceAbove > spaceBelow;
    const maxHeight = Math.max(160, Math.min(420, placeAbove ? spaceAbove : spaceBelow));
    const height = Math.min(panelHeight, maxHeight);
    const top = placeAbove ? anchor.top - GAP - height : anchor.bottom + GAP;

    let left = this.align() === 'end' ? anchor.right - panelWidth : anchor.left;
    left = Math.min(Math.max(MARGIN, left), viewportW - panelWidth - MARGIN);

    this.position.set({ top, left, width, maxHeight });
  }
}
