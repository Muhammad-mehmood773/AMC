import { Injectable, computed, signal } from '@angular/core';

export type ThemePreference = 'light' | 'dark' | 'system';
export type FontPreference = 'inter' | 'plex' | 'system';
export type DensityPreference = 'comfortable' | 'compact';

export interface AppearanceState {
  readonly theme: ThemePreference;
  readonly font: FontPreference;
  readonly density: DensityPreference;
  readonly sidebarCollapsed: boolean;
}

const STORAGE_KEY = 'amc.appearance';

const DEFAULT_STATE: AppearanceState = {
  theme: 'system',
  font: 'inter',
  density: 'comfortable',
  sidebarCollapsed: false,
};

@Injectable({ providedIn: 'root' })
export class AppearanceStore {
  private readonly state = signal<AppearanceState>(this.read());
  private media: MediaQueryList | null = null;

  readonly appearance = this.state.asReadonly();
  readonly theme = computed(() => this.state().theme);
  readonly font = computed(() => this.state().font);
  readonly density = computed(() => this.state().density);
  readonly sidebarCollapsed = computed(() => this.state().sidebarCollapsed);
  readonly resolvedDark = computed(() => {
    const theme = this.state().theme;
    if (theme === 'dark') {
      return true;
    }
    if (theme === 'light') {
      return false;
    }
    return this.systemDark();
  });

  private readonly systemDark = signal(false);

  initialize(): void {
    if (typeof window === 'undefined') {
      return;
    }

    this.media = window.matchMedia('(prefers-color-scheme: dark)');
    this.systemDark.set(this.media.matches);
    this.media.addEventListener('change', (event) => {
      this.systemDark.set(event.matches);
      this.apply();
    });
    this.apply();
  }

  setTheme(theme: ThemePreference): void {
    this.patch({ theme });
  }

  setFont(font: FontPreference): void {
    this.patch({ font });
  }

  setDensity(density: DensityPreference): void {
    this.patch({ density });
  }

  toggleSidebar(): void {
    this.patch({ sidebarCollapsed: !this.state().sidebarCollapsed });
  }

  setSidebarCollapsed(sidebarCollapsed: boolean): void {
    this.patch({ sidebarCollapsed });
  }

  private patch(partial: Partial<AppearanceState>): void {
    this.state.update((current) => ({ ...current, ...partial }));
    this.persist();
    this.apply();
  }

  private apply(): void {
    if (typeof document === 'undefined') {
      return;
    }

    const next = this.state();
    const root = document.documentElement;
    root.classList.toggle('dark', this.resolvedDark());
    root.dataset['font'] = next.font;
    root.dataset['density'] = next.density;
    root.dataset['sidebar'] = next.sidebarCollapsed ? 'collapsed' : 'expanded';
  }

  private persist(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state()));
  }

  private read(): AppearanceState {
    if (typeof localStorage === 'undefined') {
      return DEFAULT_STATE;
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return DEFAULT_STATE;
      }
      return { ...DEFAULT_STATE, ...(JSON.parse(raw) as Partial<AppearanceState>) };
    } catch {
      return DEFAULT_STATE;
    }
  }
}
