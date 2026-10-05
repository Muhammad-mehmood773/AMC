import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { AppearanceStore } from '@core/appearance/appearance.store';
import { SessionStore } from '@core/auth/session.store';
import { Avatar } from '@shared/ui/avatar';
import { Icon } from '@shared/ui/icon';

@Component({
  selector: 'amc-header',
  imports: [Avatar, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'sticky top-0 z-20 block border-b border-line bg-surface/85 backdrop-blur-md supports-[backdrop-filter]:bg-surface/75',
    '(document:keydown)': 'onShortcut($event)',
  },
  template: `
    <div class="flex h-16 items-center gap-2 px-4 sm:gap-3 sm:px-6 lg:px-8">
      <button
        type="button"
        class="amc-btn-icon -ml-1.5 lg:hidden"
        aria-label="Open navigation"
        (click)="openMenu.emit()"
      >
        <amc-icon name="menu" [size]="20" />
      </button>

      <form
        role="search"
        class="relative max-w-md min-w-0 flex-1"
        [class]="searchOpen() ? 'block' : 'hidden sm:block'"
        (submit)="search($event)"
      >
        <amc-icon
          name="search"
          class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-subtle"
        />
        <input
          #searchInput
          type="search"
          name="q"
          class="amc-input bg-surface-muted pr-12 pl-9 [&::-webkit-search-cancel-button]:hidden"
          placeholder="Search customers by name, code, phone…"
          aria-label="Search customers"
          autocomplete="off"
        />
        <kbd
          class="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 rounded border border-line bg-surface px-1.5 font-mono text-[11px] text-ink-subtle md:block"
          >/</kbd
        >
      </form>

      <div class="ml-auto flex items-center gap-1">
        <button
          type="button"
          class="amc-btn-icon sm:hidden"
          aria-label="Search"
          (click)="openSearch()"
        >
          <amc-icon name="search" [size]="18" />
        </button>
        <button
          type="button"
          class="amc-btn-icon"
          [attr.aria-label]="isDark() ? 'Switch to light theme' : 'Switch to dark theme'"
          [attr.title]="isDark() ? 'Light theme' : 'Dark theme'"
          (click)="toggleTheme()"
        >
          <amc-icon [name]="isDark() ? 'sun' : 'moon'" [size]="18" />
        </button>
        <button
          type="button"
          class="amc-btn-icon"
          aria-label="Appearance settings"
          title="Appearance"
          (click)="openAppearance.emit()"
        >
          <amc-icon name="palette" [size]="18" />
        </button>
        <div class="mx-2 hidden h-6 w-px bg-line sm:block"></div>
        <div class="flex items-center gap-2.5 rounded-lg py-1 pl-1">
          <amc-avatar [name]="userName()" size="sm" />
          <div class="hidden leading-tight md:block">
            <p class="text-sm font-medium text-ink">{{ userName() }}</p>
            <p class="text-xs text-ink-muted">{{ userRole() }}</p>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class Header {
  readonly openMenu = output<void>();
  readonly openAppearance = output<void>();

  private readonly router = inject(Router);
  private readonly appearance = inject(AppearanceStore);
  private readonly session = inject(SessionStore);
  private readonly searchInput = viewChild.required<ElementRef<HTMLInputElement>>('searchInput');

  protected readonly searchOpen = signal(false);
  protected readonly isDark = this.appearance.resolvedDark;
  protected readonly userName = computed(() => this.session.session().user?.displayName ?? 'Demo User');
  protected readonly userRole = computed(() => this.session.tenant()?.name ?? 'Service Operations');

  protected toggleTheme(): void {
    this.appearance.setTheme(this.isDark() ? 'light' : 'dark');
  }

  protected openSearch(): void {
    this.searchOpen.set(!this.searchOpen());
    queueMicrotask(() => this.searchInput().nativeElement.focus());
  }

  protected search(event: Event): void {
    event.preventDefault();
    const input = this.searchInput().nativeElement;
    const q = input.value.trim();
    void this.router.navigate(['/app/customers/list'], { queryParams: q ? { q } : {} });
    input.value = '';
    input.blur();
    this.searchOpen.set(false);
  }

  protected onShortcut(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
    if (event.key === '/' && !typing) {
      event.preventDefault();
      this.searchInput().nativeElement.focus();
    }
  }
}
