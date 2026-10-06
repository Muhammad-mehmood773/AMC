import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { Icon } from './icon';
import { Popover } from './popover';

/**
 * Contextual help content for a field. Plain strings may contain line breaks; structured content
 * supports an optional title and multiple paragraphs. Shape is API-friendly (field metadata).
 */
export type FieldHelp = string | { readonly title?: string; readonly lines: readonly string[] };

const OPEN_DELAY = 120;
const CLOSE_DELAY = 160;

let nextId = 0;

/**
 * Information (i) trigger with an anchored help popover. Opens on mouse hover, keyboard focus or
 * tap/click (click pins it open); closes on mouse leave, blur, Escape or outside click.
 */
@Component({
  selector: 'amc-field-info',
  imports: [Icon, Popover],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex align-middle' },
  template: `
    <button
      #trigger
      type="button"
      class="inline-flex h-5 w-5 items-center justify-center rounded-full text-ink-subtle transition-colors hover:text-brand focus-visible:text-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
      [class.text-brand]="open()"
      [attr.aria-label]="'More information about ' + label()"
      [attr.aria-expanded]="open()"
      [attr.aria-describedby]="open() ? panelId : null"
      (pointerenter)="onPointerEnter($event)"
      (pointerleave)="onPointerLeave($event)"
      (focus)="onFocus(trigger)"
      (blur)="onBlur()"
      (click)="toggle()"
      (keydown.escape)="close()"
    >
      <amc-icon name="info" [size]="14" [strokeWidth]="2" />
    </button>
    <amc-popover
      [anchor]="trigger"
      [(open)]="open"
      role="tooltip"
      [minWidth]="220"
      panelClass="max-w-[min(20rem,calc(100vw-1rem))]"
    >
      <div
        [id]="panelId"
        class="px-3.5 py-3 text-xs leading-relaxed text-ink-muted"
        (pointerenter)="cancelClose()"
        (pointerleave)="onPointerLeave($event)"
      >
        @if (content().title) {
          <p class="mb-1 text-[13px] font-semibold text-ink">{{ content().title }}</p>
        }
        @for (line of content().lines; track $index) {
          <p [class.mt-1.5]="!$first">{{ line }}</p>
        }
      </div>
    </amc-popover>
  `,
})
export class FieldInfo {
  readonly help = input.required<FieldHelp>();
  /** Field label, used for the accessible name. */
  readonly label = input('this field');

  protected readonly panelId = `amc-field-info-${++nextId}`;
  protected readonly open = signal(false);
  protected readonly content = computed(() => {
    const help = this.help();
    return typeof help === 'string' ? { title: undefined, lines: help.split('\n').filter(Boolean) } : help;
  });

  private pinned = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected onPointerEnter(event: PointerEvent): void {
    if (event.pointerType !== 'mouse') return;
    this.schedule(true, OPEN_DELAY);
  }

  protected onPointerLeave(event: PointerEvent): void {
    if (event.pointerType !== 'mouse' || this.pinned) return;
    this.schedule(false, CLOSE_DELAY);
  }

  protected cancelClose(): void {
    clearTimeout(this.timer);
  }

  protected onFocus(trigger: HTMLElement): void {
    if (trigger.matches(':focus-visible')) this.open.set(true);
  }

  protected onBlur(): void {
    if (!this.pinned) this.schedule(false, CLOSE_DELAY);
  }

  protected toggle(): void {
    clearTimeout(this.timer);
    this.pinned = !this.pinned || !this.open();
    this.open.set(this.pinned);
  }

  protected close(): void {
    clearTimeout(this.timer);
    this.pinned = false;
    this.open.set(false);
  }

  private schedule(open: boolean, delay: number): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.open.set(open);
      if (!open) this.pinned = false;
    }, delay);
  }
}
