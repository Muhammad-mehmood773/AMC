import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Icon, type IconName } from './icon';

export type StatusTone = 'brand' | 'warn' | 'danger' | 'info' | 'neutral';

const TONES: Record<StatusTone, string> = {
  brand: 'bg-brand-subtle text-brand',
  warn: 'bg-warn-subtle text-warn',
  danger: 'bg-danger-subtle text-danger',
  info: 'bg-info-subtle text-info',
  neutral: 'bg-surface-sunken text-ink-muted',
};

/** Full-page status screen (errors, maintenance, session/lock notices). Project actions as content. */
@Component({
  selector: 'amc-status-page',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-screen items-center justify-center bg-canvas px-4 py-12' },
  template: `
    <main class="w-full max-w-md text-center" role="main">
      <span class="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl" [class]="toneClass()">
        <amc-icon [name]="icon()" [size]="30" [strokeWidth]="1.5" />
      </span>
      @if (code()) {
        <p class="mt-6 font-mono text-sm font-semibold tracking-widest text-ink-subtle">{{ code() }}</p>
      }
      <h1 class="mt-2 text-2xl font-semibold tracking-tight text-ink">{{ title() }}</h1>
      <p class="mt-2 text-sm leading-relaxed text-ink-muted">{{ message() }}</p>
      <div class="mt-8 flex flex-col-reverse justify-center gap-2 sm:flex-row">
        <ng-content />
      </div>
      @if (reference()) {
        <p class="mt-8 text-xs text-ink-subtle">
          Reference <span class="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-ink-muted select-all">{{ reference() }}</span>
          — quote this to support.
        </p>
      }
    </main>
  `,
})
export class StatusPage {
  readonly icon = input<IconName>('alert-circle');
  readonly tone = input<StatusTone>('neutral');
  readonly code = input('');
  readonly title = input.required<string>();
  readonly message = input.required<string>();
  readonly reference = input('');

  protected readonly toneClass = computed(() => TONES[this.tone()]);
}
