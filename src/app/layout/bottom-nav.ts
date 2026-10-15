import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs';
import { Icon } from '@shared/ui/icon';
import { APP_NAVIGATION, isNavItemActive, type NavItem } from './navigation';

/**
 * Fixed bottom tab bar shown on mobile (< lg).
 * Displays the first 5 nav items from APP_NAVIGATION as large touch-friendly tabs.
 */
@Component({
  selector: 'amc-bottom-nav',
  imports: [Icon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'fixed inset-x-0 bottom-0 z-40 block lg:hidden',
  },
  template: `
    <nav
      class="flex h-16 items-stretch border-t border-line bg-surface/95 shadow-(--shadow-header) backdrop-blur-md supports-backdrop-filter:bg-surface/85"
      aria-label="Mobile navigation"
    >
      @for (item of navItems; track item.path) {
        <a
          [routerLink]="item.path"
          class="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 pt-2 pb-3 text-center transition-colors"
          [class]="isActive(item)
            ? 'text-brand'
            : 'text-ink-muted hover:text-ink'"
          [attr.aria-current]="isActive(item) ? 'page' : null"
        >
          <span class="relative flex h-7 w-7 items-center justify-center rounded-xl transition-colors"
            [class]="isActive(item) ? 'bg-brand-subtle' : ''">
            <amc-icon [name]="item.icon" [size]="20" />
          </span>
          <span class="truncate text-[10px] font-medium leading-none">{{ item.label }}</span>
        </a>
      }
    </nav>
    <!-- Safe-area spacer so content doesn't hide behind the bar -->
    <div class="h-16"></div>
  `,
})
export class BottomNav {
  private readonly router = inject(Router);

  /** Take only the first 5 items across all sections */
  protected readonly navItems: readonly NavItem[] = APP_NAVIGATION
    .flatMap((s) => s.items)
    .slice(0, 5);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  protected isActive(item: NavItem): boolean {
    return isNavItemActive(item, this.url());
  }
}
