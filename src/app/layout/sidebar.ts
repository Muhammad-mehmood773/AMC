import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs';
import { AppearanceStore } from '@core/appearance/appearance.store';
import { Icon } from '@shared/ui/icon';
import { APP_NAVIGATION, isNavItemActive, type NavItem, type NavSection } from './navigation';

@Component({
  selector: 'amc-sidebar',
  imports: [Icon, NgTemplateOutlet, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-template #content let-collapsed>
      <div class="flex h-16 shrink-0 items-center gap-3 px-4" [class.justify-center]="collapsed">
        <a
          routerLink="/app/customers/dashboard"
          class="flex min-w-0 items-center gap-3 rounded-lg"
          aria-label="Go to dashboard"
        >
          <span
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-foreground shadow-sm"
          >
            <amc-icon name="shield-check" [size]="18" [strokeWidth]="2" />
          </span>
          @if (!collapsed) {
            <span class="min-w-0 leading-tight">
              <span class="block truncate text-sm font-semibold tracking-tight text-ink"
                >AMC Platform</span
              >
              <span class="block truncate text-[11px] text-ink-muted"
                >Contract &amp; Field Service</span
              >
            </span>
          }
        </a>
      </div>

      <nav class="amc-scroll-hover flex-1 overflow-y-auto px-3 py-2" aria-label="Main navigation">
        @for (section of navigation; track section.label; let i = $index) {
          @let open = isOpen(section.label);
          @let current = sectionActive(section);
          <div class="py-0.5">
            <button
              type="button"
              class="group flex w-full items-center rounded-lg text-left transition-colors"
              [class]="sectionClass(collapsed, open, current)"
              [attr.aria-expanded]="open"
              [attr.aria-controls]="'nav-section-' + i"
              [attr.title]="collapsed ? section.label : null"
              (click)="toggle(section.label)"
            >
              <span
                class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors"
                [class]="current ? 'bg-brand text-brand-foreground shadow-sm' : 'bg-surface-sunken text-ink-subtle group-hover:text-ink'"
              >
                <amc-icon [name]="section.icon" [size]="15" />
              </span>
              @if (!collapsed) {
                <span class="ml-2.5 flex-1 truncate text-[12px] font-semibold tracking-wide uppercase" [class]="current ? 'text-ink' : 'text-ink-muted group-hover:text-ink'">{{ section.label }}</span>
                <amc-icon name="chevron-down" [size]="15" class="shrink-0 text-ink-subtle transition-transform duration-200" [class]="open ? 'rotate-180' : ''" />
              }
            </button>
            <div class="grid transition-[grid-template-rows] duration-200 ease-out" [class]="open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'" [id]="'nav-section-' + i">
              <ul class="min-h-0 overflow-hidden" [class]="collapsed ? 'space-y-0.5' : 'ml-[22px] space-y-0.5 border-l border-line pl-2'" [attr.inert]="open ? null : ''">
                @for (item of section.items; track item.path) {
                  <li [class]="collapsed ? '' : 'first:mt-1 last:mb-1'">
                    <a
                      [routerLink]="item.path"
                      class="group relative flex h-9 items-center gap-3 rounded-lg text-sm font-medium transition-colors"
                      [class]="itemClass(item, collapsed)"
                      [attr.aria-current]="isActive(item) ? 'page' : null"
                      [attr.title]="collapsed ? item.label : null"
                    >
                      <amc-icon
                        [name]="item.icon"
                        [size]="17"
                        [class]="isActive(item) ? 'text-brand' : 'text-ink-subtle group-hover:text-ink'"
                      />
                      @if (!collapsed) {
                        <span class="truncate">{{ item.label }}</span>
                      }
                    </a>
                  </li>
                }
              </ul>
            </div>
          </div>
        }
      </nav>

      <div class="shrink-0 space-y-0.5 border-t border-line p-3">
        <button
          type="button"
          class="flex h-9 w-full items-center gap-3 rounded-lg text-sm font-medium text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
          [class]="collapsed ? 'justify-center' : 'px-3'"
          [attr.title]="collapsed ? 'Appearance' : null"
          (click)="openAppearance.emit()"
        >
          <amc-icon name="palette" [size]="18" class="text-ink-subtle" />
          @if (!collapsed) {
            <span>Appearance</span>
          }
        </button>
      </div>
    </ng-template>

    <!-- Desktop rail -->
    <aside
      class="fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-line text-ink shadow-[var(--shadow-sidebar)] transition-[width] duration-200 lg:flex"
      [class]="(collapsed() ? 'w-[72px] ' : 'w-64 ') + surfaceClass()"
    >
      <ng-container [ngTemplateOutlet]="content" [ngTemplateOutletContext]="{ $implicit: collapsed() }" />
      <button
        type="button"
        class="absolute top-5 -right-3 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-surface text-ink-subtle shadow-sm transition-colors hover:text-ink"
        [attr.aria-label]="collapsed() ? 'Expand sidebar' : 'Collapse sidebar'"
        (click)="toggleCollapse.emit()"
      >
        <amc-icon [name]="collapsed() ? 'chevron-right' : 'chevron-left'" [size]="14" />
      </button>
    </aside>

    <!-- Mobile / tablet drawer -->
    @if (mobileOpen()) {
      <div class="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
        <button
          type="button"
          class="absolute inset-0 animate-fade-in bg-slate-950/45 backdrop-blur-[2px]"
          aria-label="Close navigation"
          (click)="closeMobile.emit()"
        ></button>
        <aside
          class="relative flex h-full w-72 max-w-[85vw] animate-slide-in-left flex-col border-r border-line text-ink shadow-pop"
          [class]="surfaceClass()"
        >
          <button
            type="button"
            class="amc-btn-icon absolute top-3.5 right-3"
            aria-label="Close navigation"
            (click)="closeMobile.emit()"
          >
            <amc-icon name="x" [size]="18" />
          </button>
          <ng-container [ngTemplateOutlet]="content" [ngTemplateOutletContext]="{ $implicit: false }" />
        </aside>
      </div>
    }
  `,
})
export class Sidebar {
  readonly collapsed = input(false);
  readonly mobileOpen = input(false);
  readonly closeMobile = output<void>();
  readonly toggleCollapse = output<void>();
  readonly openAppearance = output<void>();

  private readonly router = inject(Router);
  private readonly appearance = inject(AppearanceStore);

  /** Sidebar surface per appearance preference; "dark" scopes the dark palette to the rail. */
  protected readonly surfaceClass = computed(() => {
    switch (this.appearance.sidebarStyle()) {
      case 'dark':
        return 'dark bg-surface';
      case 'tinted':
        return 'bg-[color-mix(in_oklab,var(--color-brand)_7%,var(--color-surface))]';
      default:
        return 'bg-surface';
    }
  });
  protected readonly navigation = APP_NAVIGATION;
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /** Section owning the current route; it is always opened on navigation (accordion). */
  private readonly activeSection = computed(() => this.navigation.find((s) => s.items.some((i) => isNavItemActive(i, this.url())))?.label ?? null);
  private readonly openSection = linkedSignal<string | null>(() => this.activeSection() ?? this.navigation[0]?.label ?? null);

  protected isOpen(label: string): boolean {
    return this.openSection() === label;
  }

  protected toggle(label: string): void {
    this.openSection.update((current) => (current === label ? null : label));
  }

  protected sectionActive(section: NavSection): boolean {
    return this.activeSection() === section.label;
  }

  protected sectionClass(collapsed: boolean, open: boolean, current: boolean): string {
    const layout = collapsed ? 'justify-center h-10' : 'h-10 px-1.5';
    const tone = open || current ? 'bg-surface-sunken/60' : 'hover:bg-surface-sunken';
    return `${layout} ${tone}`;
  }

  protected isActive(item: NavItem): boolean {
    return isNavItemActive(item, this.url());
  }

  protected itemClass(item: NavItem, collapsed: boolean): string {
    const layout = collapsed ? 'justify-center' : 'px-2.5';
    const tone = this.isActive(item)
      ? 'bg-brand-subtle text-ink'
      : 'text-ink-muted hover:bg-surface-sunken hover:text-ink';
    return `${layout} ${tone}`;
  }
}
