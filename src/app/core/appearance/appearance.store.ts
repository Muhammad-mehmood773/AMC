import { Injectable, computed, signal } from '@angular/core';

export type ThemePreference = 'light' | 'dark' | 'system';
export type FontPreference = 'inter' | 'plex' | 'system';
export type FontSizePreference = 'compact' | 'small' | 'default' | 'large';
export type DensityPreference = 'comfortable' | 'compact';
export type RadiusPreference = 'none' | 'small' | 'medium' | 'large' | 'full';
export type SidebarStyle = 'light' | 'tinted' | 'dark';
export type ScrollbarStyle = 'themed' | 'minimal' | 'neutral' | 'system';
export type ScrollbarColor = 'primary' | 'secondary' | 'accent' | 'gradient';
export type ScrollbarSize = 'thin' | 'regular';

export interface AppearanceState {
  readonly theme: ThemePreference;
  readonly font: FontPreference;
  readonly fontSize: FontSizePreference;
  readonly density: DensityPreference;
  readonly primary: string;
  readonly secondary: string;
  readonly accent: string;
  readonly radius: RadiusPreference;
  readonly sidebarCollapsed: boolean;
  readonly sidebarStyle: SidebarStyle;
  readonly scrollbarStyle: ScrollbarStyle;
  readonly scrollbarColor: ScrollbarColor;
  readonly scrollbarSize: ScrollbarSize;
  readonly highContrast: boolean;
  readonly reduceMotion: boolean;
}

export interface ThemePreset {
  readonly name: string;
  readonly primary: string;
  readonly secondary: string;
  readonly accent: string;
}

export const THEME_PRESETS: readonly ThemePreset[] = [
  { name: 'Teal', primary: '#0f766e', secondary: '#2563eb', accent: '#7c3aed' },
  { name: 'Ocean', primary: '#1d4ed8', secondary: '#0891b2', accent: '#db2777' },
  { name: 'Indigo', primary: '#4f46e5', secondary: '#0284c7', accent: '#e11d48' },
  { name: 'Emerald', primary: '#047857', secondary: '#0369a1', accent: '#ca8a04' },
  { name: 'Graphite', primary: '#334155', secondary: '#0f766e', accent: '#c2410c' },
  { name: 'Plum', primary: '#7e22ce', secondary: '#2563eb', accent: '#db2777' },
  { name: 'Crimson', primary: '#be123c', secondary: '#0369a1', accent: '#7c3aed' },
  { name: 'Amber', primary: '#b45309', secondary: '#0f766e', accent: '#4338ca' },
];

export const DEFAULT_APPEARANCE: AppearanceState = {
  theme: 'system',
  font: 'inter',
  fontSize: 'default',
  density: 'comfortable',
  primary: THEME_PRESETS[0].primary,
  secondary: THEME_PRESETS[0].secondary,
  accent: THEME_PRESETS[0].accent,
  radius: 'medium',
  sidebarCollapsed: false,
  sidebarStyle: 'light',
  scrollbarStyle: 'themed',
  scrollbarColor: 'primary',
  scrollbarSize: 'thin',
  highContrast: false,
  reduceMotion: false,
};

const STORAGE_KEY = 'amc.appearance';

const FONT_SIZE_PX: Record<FontSizePreference, number> = { compact: 14, small: 15, default: 16, large: 17 };
const RADIUS_SCALE: Record<RadiusPreference, number> = { none: 0, small: 0.6, medium: 1, large: 1.4, full: 1.9 };
const RADIUS_BASE_REM = { sm: 0.25, md: 0.375, lg: 0.5, xl: 0.75, '2xl': 1 } as const;
const HEX = /^#[0-9a-f]{6}$/i;

/** Readable foreground (white or near-black) for a background colour. */
export function contrastText(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.42 ? '#0a0e15' : '#ffffff';
}

@Injectable({ providedIn: 'root' })
export class AppearanceStore {
  private readonly state = signal<AppearanceState>(this.read());
  private readonly systemDark = signal(false);

  readonly appearance = this.state.asReadonly();
  readonly theme = computed(() => this.state().theme);
  readonly font = computed(() => this.state().font);
  readonly fontSize = computed(() => this.state().fontSize);
  readonly density = computed(() => this.state().density);
  readonly radius = computed(() => this.state().radius);
  readonly sidebarCollapsed = computed(() => this.state().sidebarCollapsed);
  readonly sidebarStyle = computed(() => this.state().sidebarStyle);
  readonly isDefault = computed(() => JSON.stringify(this.state()) === JSON.stringify(DEFAULT_APPEARANCE));
  readonly activePreset = computed(() => {
    const s = this.state();
    return THEME_PRESETS.find((p) => p.primary === s.primary && p.secondary === s.secondary && p.accent === s.accent) ?? null;
  });
  readonly resolvedDark = computed(() => {
    const theme = this.state().theme;
    return theme === 'dark' || (theme === 'system' && this.systemDark());
  });

  initialize(): void {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    this.systemDark.set(media.matches);
    media.addEventListener('change', (event) => {
      this.systemDark.set(event.matches);
      this.apply();
    });
    this.apply();
  }

  /** Applies a partial update (used by the appearance panel). */
  update(partial: Partial<AppearanceState>): void {
    this.state.update((current) => ({ ...current, ...partial }));
    this.persist();
    this.apply();
  }

  setTheme(theme: ThemePreference): void {
    this.update({ theme });
  }

  setFont(font: FontPreference): void {
    this.update({ font });
  }

  setDensity(density: DensityPreference): void {
    this.update({ density });
  }

  applyPreset(preset: ThemePreset): void {
    this.update({ primary: preset.primary, secondary: preset.secondary, accent: preset.accent });
  }

  toggleSidebar(): void {
    this.update({ sidebarCollapsed: !this.state().sidebarCollapsed });
  }

  setSidebarCollapsed(sidebarCollapsed: boolean): void {
    this.update({ sidebarCollapsed });
  }

  reset(): void {
    this.state.set(DEFAULT_APPEARANCE);
    this.persist();
    this.apply();
  }

  private apply(): void {
    if (typeof document === 'undefined') return;
    const s = this.state();
    const root = document.documentElement;
    root.classList.toggle('dark', this.resolvedDark());
    root.dataset['font'] = s.font;
    root.dataset['density'] = s.density;
    root.dataset['sidebar'] = s.sidebarCollapsed ? 'collapsed' : 'expanded';
    root.dataset['contrast'] = s.highContrast ? 'high' : 'standard';
    root.dataset['motion'] = s.reduceMotion ? 'reduced' : 'full';
    root.dataset['scrollbar'] = s.scrollbarStyle;
    root.dataset['scrollbarColor'] = s.scrollbarColor;
    root.dataset['scrollbarSize'] = s.scrollbarSize;
    root.style.fontSize = `${FONT_SIZE_PX[s.fontSize]}px`;
    root.style.setProperty('--amc-primary', s.primary);
    root.style.setProperty('--amc-primary-fg', contrastText(s.primary));
    root.style.setProperty('--amc-secondary', s.secondary);
    root.style.setProperty('--amc-accent', s.accent);
    const scale = RADIUS_SCALE[s.radius];
    for (const [name, rem] of Object.entries(RADIUS_BASE_REM)) {
      root.style.setProperty(`--radius-${name}`, `${(rem * scale).toFixed(3)}rem`);
    }
  }

  private persist(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state()));
  }

  private read(): AppearanceState {
    if (typeof localStorage === 'undefined') return DEFAULT_APPEARANCE;
    try {
      const stored = { ...DEFAULT_APPEARANCE, ...(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<AppearanceState>) };
      return {
        ...stored,
        primary: HEX.test(stored.primary) ? stored.primary : DEFAULT_APPEARANCE.primary,
        secondary: HEX.test(stored.secondary) ? stored.secondary : DEFAULT_APPEARANCE.secondary,
        accent: HEX.test(stored.accent) ? stored.accent : DEFAULT_APPEARANCE.accent,
      };
    } catch {
      return DEFAULT_APPEARANCE;
    }
  }
}
