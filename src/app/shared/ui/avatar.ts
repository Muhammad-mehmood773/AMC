import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

const PALETTE = [
  'bg-teal-100 text-teal-800 dark:bg-teal-500/15 dark:text-teal-300',
  'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',
  'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300',
  'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300',
  'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-300',
  'bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300',
];

const SIZES = {
  xs: 'h-6 w-6 text-[10px] rounded-md',
  sm: 'h-8 w-8 text-xs rounded-lg',
  md: 'h-10 w-10 text-sm rounded-lg',
  lg: 'h-14 w-14 text-lg rounded-xl',
} as const;

const IMG_SIZES = {
  xs: 'h-6 w-6 rounded-md',
  sm: 'h-8 w-8 rounded-lg',
  md: 'h-10 w-10 rounded-lg',
  lg: 'h-14 w-14 rounded-xl',
} as const;

@Component({
  selector: 'amc-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex shrink-0' },
  template: `
    @if (logoUrl() && !imgError()) {
      <img
        [src]="logoUrl()!"
        [alt]="name()"
        class="object-cover"
        [class]="imgClasses()"
        (error)="imgError.set(true)"
      />
    } @else {
      <span
        class="inline-flex items-center justify-center font-semibold tracking-tight select-none"
        [class]="classes()"
        [attr.aria-label]="name()"
        role="img"
        >{{ initials() }}</span
      >
    }
  `,
})
export class Avatar {
  readonly name = input.required<string>();
  readonly size = input<keyof typeof SIZES>('sm');
  readonly logoUrl = input<string | null>(null);

  protected readonly imgError = signal(false);

  protected readonly imgClasses = computed(() => IMG_SIZES[this.size()]);

  protected readonly initials = computed(() => {
    const words = this.name()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 0 && !['al', 'the', 'and', 'of'].includes(word.toLowerCase()));
    return (words[0]?.[0] ?? '?').concat(words[1]?.[0] ?? '').toUpperCase();
  });

  protected readonly classes = computed(() => {
    let hash = 0;
    for (const char of this.name()) {
      hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    }
    return `${PALETTE[hash % PALETTE.length]} ${SIZES[this.size()]}`;
  });
}
