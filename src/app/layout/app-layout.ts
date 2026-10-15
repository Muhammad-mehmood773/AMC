import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AppearanceStore } from '@core/appearance/appearance.store';
import { AppearancePanel } from './appearance-panel';
import { BottomNav } from './bottom-nav';
import { Header } from './header';
import { Sidebar } from './sidebar';

@Component({
  selector: 'amc-app-layout',
  imports: [AppearancePanel, BottomNav, Header, RouterOutlet, Sidebar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-h-screen', '(document:keydown.escape)': 'mobileNavOpen.set(false)' },
  template: `
    <a
      href="#main"
      class="sr-only z-[70] rounded-md bg-surface px-3 py-2 text-sm font-medium shadow-pop focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >Skip to content</a
    >
    <amc-sidebar
      [collapsed]="appearance.sidebarCollapsed()"
      [mobileOpen]="mobileNavOpen()"
      (closeMobile)="mobileNavOpen.set(false)"
      (toggleCollapse)="appearance.toggleSidebar()"
      (openAppearance)="openAppearance()"
    />
    <div
      class="flex min-h-screen flex-col transition-[padding] duration-200"
      [class]="appearance.sidebarCollapsed() ? 'lg:pl-[72px]' : 'lg:pl-64'"
    >
      <amc-header (openMenu)="mobileNavOpen.set(true)" (openAppearance)="openAppearance()" />
      <main
        id="main"
        class="mx-auto w-full max-w-[1600px] flex-1 px-4 py-5 pb-20 sm:px-6 sm:py-6 lg:px-8 lg:py-7 lg:pb-7"
      >
        <router-outlet />
      </main>
    </div>
    <!-- Mobile bottom tab bar -->
    <amc-bottom-nav />
    <amc-appearance-panel [(open)]="appearanceOpen" />
  `,
})
export class AppLayout {
  protected readonly appearance = inject(AppearanceStore);
  protected readonly mobileNavOpen = signal(false);
  protected readonly appearanceOpen = signal(false);

  constructor() {
    const document = inject(DOCUMENT);
    inject(Router)
      .events.pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.mobileNavOpen.set(false));

    effect(() => {
      document.body.style.overflow = this.mobileNavOpen() ? 'hidden' : '';
    });
  }

  protected openAppearance(): void {
    this.mobileNavOpen.set(false);
    this.appearanceOpen.set(true);
  }
}
