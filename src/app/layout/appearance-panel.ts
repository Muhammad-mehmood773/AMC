import { ChangeDetectionStrategy, Component, computed, inject, model, signal } from '@angular/core';
import {
  AppearanceStore,
  type AppearanceState,
  type DensityPreference,
  type FontPreference,
  type FontSizePreference,
  type RadiusPreference,
  type ScrollbarColor,
  type ScrollbarSize,
  type ScrollbarStyle,
  type SidebarStyle,
  THEME_PRESETS,
  type ThemePreference,
} from '@core/appearance/appearance.store';
import { Dialog } from '@shared/ui/dialog';
import { Switch } from '@shared/ui/form-controls';
import { Icon, type IconName } from '@shared/ui/icon';
import { type TabItem, Tabs } from '@shared/ui/tabs';

interface Choice<T> {
  readonly value: T;
  readonly label: string;
  readonly description?: string;
  readonly icon?: IconName;
}

type ColorKey = 'primary' | 'secondary' | 'accent';

const THEMES: readonly Choice<ThemePreference>[] = [
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
  { value: 'system', label: 'System', icon: 'monitor' },
];

const FONTS: readonly (Choice<FontPreference> & { readonly family: string })[] = [
  { value: 'inter', label: 'Inter', description: 'Neutral and highly legible', family: "'Inter', sans-serif" },
  { value: 'plex', label: 'IBM Plex Sans', description: 'Technical, slightly condensed', family: "'IBM Plex Sans', sans-serif" },
  { value: 'system', label: 'System default', description: 'Native operating system font', family: 'ui-sans-serif, system-ui, sans-serif' },
];

const FONT_SIZES: readonly (Choice<FontSizePreference> & { readonly px: number })[] = [
  { value: 'compact', label: 'XS', px: 14 },
  { value: 'small', label: 'S', px: 15 },
  { value: 'default', label: 'M', px: 16 },
  { value: 'large', label: 'L', px: 17 },
];

const DENSITIES: readonly Choice<DensityPreference>[] = [
  { value: 'comfortable', label: 'Comfortable', description: 'More breathing room' },
  { value: 'compact', label: 'Compact', description: 'More rows on screen' },
];

const RADII: readonly (Choice<RadiusPreference> & { readonly preview: string })[] = [
  { value: 'none', label: 'Sharp', preview: '0px' },
  { value: 'small', label: 'Subtle', preview: '4px' },
  { value: 'medium', label: 'Rounded', preview: '8px' },
  { value: 'large', label: 'Soft', preview: '12px' },
  { value: 'full', label: 'Pill', preview: '16px' },
];

const SIDEBAR_STYLES: readonly (Choice<SidebarStyle> & { readonly swatch: string })[] = [
  { value: 'light', label: 'Light', swatch: 'bg-white' },
  { value: 'tinted', label: 'Tinted', swatch: 'bg-[color-mix(in_oklab,var(--amc-primary)_14%,white)]' },
  { value: 'dark', label: 'Dark', swatch: 'bg-slate-900' },
];

const SCROLLBAR_STYLES: readonly (Choice<ScrollbarStyle> & { readonly thumb: string })[] = [
  { value: 'themed', label: 'Themed', description: 'Theme color with soft track', thumb: 'bg-brand/60' },
  { value: 'minimal', label: 'Minimal', description: 'Appears on hover', thumb: 'bg-brand/25' },
  { value: 'neutral', label: 'Neutral', description: 'Subtle gray', thumb: 'bg-ink-subtle/50' },
  { value: 'system', label: 'System', description: 'Browser default', thumb: 'bg-ink-muted' },
];

const SCROLLBAR_COLORS: readonly (Choice<ScrollbarColor> & { readonly swatch: string })[] = [
  { value: 'primary', label: 'Primary', swatch: 'bg-brand' },
  { value: 'secondary', label: 'Secondary', swatch: 'bg-info' },
  { value: 'accent', label: 'Accent', swatch: 'bg-accent' },
  { value: 'gradient', label: 'Gradient', swatch: 'bg-linear-to-b from-brand to-accent' },
];

const SCROLLBAR_SIZES: readonly Choice<ScrollbarSize>[] = [
  { value: 'thin', label: 'Thin' },
  { value: 'regular', label: 'Regular' },
];

const SWATCHES = ['#0f766e', '#047857', '#0369a1', '#1d4ed8', '#4f46e5', '#7c3aed', '#9333ea', '#db2777', '#be123c', '#c2410c', '#b45309', '#334155'];

const COLOR_ROLES: readonly { key: ColorKey; label: string; description: string }[] = [
  { key: 'primary', label: 'Primary', description: 'Buttons, links, active navigation and focus' },
  { key: 'secondary', label: 'Secondary', description: 'Informational badges, highlights and indicators' },
  { key: 'accent', label: 'Accent', description: 'Tags, special statuses and emphasis' },
];

/** Application-wide UI personalization: theme, colours, typography and layout. */
@Component({
  selector: 'amc-appearance-panel',
  imports: [Dialog, Icon, Switch, Tabs],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <amc-dialog
      variant="drawer"
      drawerWidth="lg"
      title="Appearance"
      description="Personalize how the application looks on this device."
      [(open)]="open"
    >
      <!-- Live preview -->
      <div class="mb-5 overflow-hidden rounded-xl border border-line bg-canvas" aria-hidden="true">
        <div class="flex">
          <div class="flex w-24 flex-col gap-1.5 border-r border-line p-2" [class]="previewSidebar()">
            <span class="h-2 w-12 rounded-full bg-brand"></span>
            <span class="mt-1 flex h-5 items-center gap-1 rounded-md bg-brand-subtle px-1.5"><span class="h-1.5 w-10 rounded-full bg-brand"></span></span>
            <span class="flex h-5 items-center px-1.5"><span class="h-1.5 w-12 rounded-full bg-line-strong"></span></span>
            <span class="flex h-5 items-center px-1.5"><span class="h-1.5 w-9 rounded-full bg-line-strong"></span></span>
          </div>
          <div class="flex-1 space-y-2.5 p-3">
            <div class="flex items-center justify-between">
              <span class="text-sm font-semibold text-ink">Preview</span>
              <span class="rounded-lg bg-brand px-2.5 py-1 text-xs font-medium text-brand-foreground">Primary action</span>
            </div>
            <div class="amc-card flex items-center justify-between p-2.5">
              <div>
                <p class="text-xs font-medium text-ink">King Faisal Medical Group</p>
                <p class="text-[11px] text-ink-muted">CUS-00101 · <span class="text-brand">View details</span></p>
              </div>
              <div class="flex gap-1">
                <span class="rounded-full bg-info-subtle px-2 py-0.5 text-[10px] font-medium text-info">Secondary</span>
                <span class="rounded-full bg-accent-subtle px-2 py-0.5 text-[10px] font-medium text-accent">Accent</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <amc-tabs [items]="tabs" [(active)]="tab" />

      <div class="mt-5 space-y-7">
        @switch (tab()) {
          @case ('theme') {
            <section aria-labelledby="pref-mode">
              <h3 id="pref-mode" class="text-sm font-semibold text-ink">Mode</h3>
              <div class="mt-3 grid grid-cols-3 gap-2" role="radiogroup" aria-labelledby="pref-mode">
                @for (option of themes; track option.value) {
                  <button type="button" role="radio" class="rounded-xl border p-2 text-left transition-colors" [class]="optionClass(s().theme === option.value)" [attr.aria-checked]="s().theme === option.value" (click)="set({ theme: option.value })">
                    <span class="mb-2 flex h-14 overflow-hidden rounded-lg border border-line" aria-hidden="true">
                      @switch (option.value) {
                        @case ('light') {
                          <span class="flex flex-1 gap-1 bg-slate-50 p-1.5"><span class="w-3 rounded-sm bg-slate-200"></span><span class="flex-1 rounded-sm bg-white shadow-xs"></span></span>
                        }
                        @case ('dark') {
                          <span class="flex flex-1 gap-1 bg-slate-900 p-1.5"><span class="w-3 rounded-sm bg-slate-700"></span><span class="flex-1 rounded-sm bg-slate-800"></span></span>
                        }
                        @default {
                          <span class="flex flex-1 gap-1 bg-slate-50 p-1.5"><span class="w-3 rounded-sm bg-slate-200"></span><span class="flex-1 rounded-sm bg-white"></span></span>
                          <span class="flex flex-1 gap-1 bg-slate-900 p-1.5"><span class="flex-1 rounded-sm bg-slate-800"></span></span>
                        }
                      }
                    </span>
                    <span class="flex items-center gap-1.5 text-sm font-medium text-ink"><amc-icon [name]="option.icon!" [size]="14" class="text-ink-muted" />{{ option.label }}</span>
                  </button>
                }
              </div>
            </section>

            <section aria-labelledby="pref-presets">
              <h3 id="pref-presets" class="text-sm font-semibold text-ink">Color presets</h3>
              <p class="mt-0.5 text-xs text-ink-muted">Curated primary, secondary and accent combinations.</p>
              <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-labelledby="pref-presets">
                @for (preset of presets; track preset.name) {
                  <button type="button" role="radio" class="rounded-xl border p-2.5 text-left transition-colors" [class]="optionClass(store.activePreset()?.name === preset.name)" [attr.aria-checked]="store.activePreset()?.name === preset.name" (click)="store.applyPreset(preset)">
                    <span class="flex -space-x-1.5" aria-hidden="true">
                      <span class="h-6 w-6 rounded-full ring-2 ring-surface" [style.background]="preset.primary"></span>
                      <span class="h-6 w-6 rounded-full ring-2 ring-surface" [style.background]="preset.secondary"></span>
                      <span class="h-6 w-6 rounded-full ring-2 ring-surface" [style.background]="preset.accent"></span>
                    </span>
                    <span class="mt-2 block text-sm font-medium text-ink">{{ preset.name }}</span>
                  </button>
                }
              </div>
            </section>

            <section class="space-y-3">
              <amc-switch label="High contrast" description="Stronger borders and text for improved legibility." [checked]="s().highContrast" (checkedChange)="set({ highContrast: $event })" />
              <amc-switch label="Reduce motion" description="Minimise animations and transitions." [checked]="s().reduceMotion" (checkedChange)="set({ reduceMotion: $event })" />
            </section>
          }

          @case ('colors') {
            @for (role of colorRoles; track role.key) {
              <section [attr.aria-labelledby]="'pref-color-' + role.key">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <h3 [id]="'pref-color-' + role.key" class="text-sm font-semibold text-ink">{{ role.label }} color</h3>
                    <p class="mt-0.5 text-xs text-ink-muted">{{ role.description }}</p>
                  </div>
                  <span class="rounded-md border border-line px-2 py-1 font-mono text-xs text-ink-muted uppercase">{{ s()[role.key] }}</span>
                </div>
                <div class="mt-3 flex flex-wrap items-center gap-2" role="radiogroup" [attr.aria-labelledby]="'pref-color-' + role.key">
                  @for (color of swatches; track color) {
                    <button
                      type="button"
                      role="radio"
                      class="relative flex h-8 w-8 items-center justify-center rounded-full ring-offset-2 ring-offset-surface transition-transform hover:scale-110"
                      [class.ring-2]="s()[role.key] === color"
                      [style.background]="color"
                      [style.--tw-ring-color]="color"
                      [attr.aria-checked]="s()[role.key] === color"
                      [attr.aria-label]="color"
                      (click)="setColor(role.key, color)"
                    >
                      @if (s()[role.key] === color) {
                        <amc-icon name="check" [size]="14" [strokeWidth]="3" class="text-white" />
                      }
                    </button>
                  }
                  <label class="relative flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-dashed border-line-strong px-3 text-xs font-medium text-ink-muted hover:border-brand hover:text-ink">
                    <amc-icon name="palette" [size]="14" />
                    Custom
                    <input type="color" class="absolute inset-0 cursor-pointer opacity-0" [value]="s()[role.key]" [attr.aria-label]="'Custom ' + role.label + ' color'" (input)="onCustomColor(role.key, $event)" />
                  </label>
                </div>
              </section>
            }
          }

          @case ('typography') {
            <section aria-labelledby="pref-font">
              <h3 id="pref-font" class="text-sm font-semibold text-ink">Font family</h3>
              <div class="mt-3 space-y-2" role="radiogroup" aria-labelledby="pref-font">
                @for (option of fonts; track option.value) {
                  <button type="button" role="radio" class="flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors" [class]="optionClass(s().font === option.value)" [attr.aria-checked]="s().font === option.value" (click)="set({ font: option.value })">
                    <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-base font-semibold text-ink" [style.font-family]="option.family">Aa</span>
                    <span class="min-w-0 flex-1">
                      <span class="block text-sm font-medium text-ink" [style.font-family]="option.family">{{ option.label }}</span>
                      <span class="block text-xs text-ink-muted">{{ option.description }}</span>
                    </span>
                    @if (s().font === option.value) {
                      <amc-icon name="check-circle" [size]="18" class="text-brand" />
                    }
                  </button>
                }
              </div>
            </section>
            <section aria-labelledby="pref-size">
              <div class="flex items-baseline justify-between">
                <h3 id="pref-size" class="text-sm font-semibold text-ink">Text size</h3>
                <span class="text-xs text-ink-muted">{{ currentSizePx() }}px base</span>
              </div>
              <div class="mt-3 grid grid-cols-4 gap-1 rounded-xl bg-surface-sunken p-1" role="radiogroup" aria-labelledby="pref-size">
                @for (option of fontSizes; track option.value) {
                  <button
                    type="button"
                    role="radio"
                    class="rounded-lg py-2 text-center font-medium transition-colors"
                    [class]="s().fontSize === option.value ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'"
                    [style.font-size.px]="option.px - 2"
                    [attr.aria-checked]="s().fontSize === option.value"
                    [attr.aria-label]="option.px + ' pixels'"
                    (click)="set({ fontSize: option.value })"
                  >
                    {{ option.label }}
                  </button>
                }
              </div>
            </section>
          }

          @case ('layout') {
            <section aria-labelledby="pref-density">
              <h3 id="pref-density" class="text-sm font-semibold text-ink">Density</h3>
              <p class="mt-0.5 text-xs text-ink-muted">Adjusts spacing in tables and form controls.</p>
              <div class="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby="pref-density">
                @for (option of densities; track option.value) {
                  <button type="button" role="radio" class="rounded-xl border px-3 py-2.5 text-left transition-colors" [class]="optionClass(s().density === option.value)" [attr.aria-checked]="s().density === option.value" (click)="set({ density: option.value })">
                    <span class="flex flex-col gap-[3px]" aria-hidden="true">
                      @for (line of [1, 2, 3]; track line) {
                        <span class="h-1 rounded-full bg-line-strong" [class.mb-1]="option.value === 'comfortable'"></span>
                      }
                    </span>
                    <span class="mt-2 block text-sm font-medium text-ink">{{ option.label }}</span>
                    <span class="block text-xs text-ink-muted">{{ option.description }}</span>
                  </button>
                }
              </div>
            </section>

            <section aria-labelledby="pref-radius">
              <h3 id="pref-radius" class="text-sm font-semibold text-ink">Corner radius</h3>
              <div class="mt-3 grid grid-cols-5 gap-2" role="radiogroup" aria-labelledby="pref-radius">
                @for (option of radii; track option.value) {
                  <button type="button" role="radio" class="flex flex-col items-center gap-2 rounded-xl border px-2 py-3 transition-colors" [class]="optionClass(s().radius === option.value)" [attr.aria-checked]="s().radius === option.value" (click)="set({ radius: option.value })">
                    <span class="h-7 w-10 border-2 border-b-0 border-l-0 border-brand" [style.border-top-right-radius]="option.preview" aria-hidden="true"></span>
                    <span class="text-xs font-medium text-ink">{{ option.label }}</span>
                  </button>
                }
              </div>
            </section>

            <section aria-labelledby="pref-sidebar-style">
              <h3 id="pref-sidebar-style" class="text-sm font-semibold text-ink">Sidebar style</h3>
              <div class="mt-3 grid grid-cols-3 gap-2" role="radiogroup" aria-labelledby="pref-sidebar-style">
                @for (option of sidebarStyles; track option.value) {
                  <button type="button" role="radio" class="flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors" [class]="optionClass(s().sidebarStyle === option.value)" [attr.aria-checked]="s().sidebarStyle === option.value" (click)="set({ sidebarStyle: option.value })">
                    <span class="h-8 w-5 rounded-md border border-line" [class]="option.swatch" aria-hidden="true"></span>
                    <span class="text-sm font-medium text-ink">{{ option.label }}</span>
                  </button>
                }
              </div>
            </section>

            <section aria-labelledby="pref-scrollbar">
              <h3 id="pref-scrollbar" class="text-sm font-semibold text-ink">Scrollbars</h3>
              <p class="mt-0.5 text-xs text-ink-muted">Style and color of scrollbars across the application.</p>
              <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-labelledby="pref-scrollbar">
                @for (option of scrollbarStyles; track option.value) {
                  <button type="button" role="radio" class="rounded-xl border p-2.5 text-left transition-colors" [class]="optionClass(s().scrollbarStyle === option.value)" [attr.aria-checked]="s().scrollbarStyle === option.value" (click)="set({ scrollbarStyle: option.value })">
                    <span class="flex h-10 gap-1.5 rounded-lg border border-line bg-surface-muted p-1.5" aria-hidden="true">
                      <span class="flex flex-1 flex-col gap-1"><span class="h-1 w-full rounded-full bg-line-strong"></span><span class="h-1 w-3/4 rounded-full bg-line-strong"></span><span class="h-1 w-5/6 rounded-full bg-line-strong"></span></span>
                      <span class="relative w-1.5 rounded-full" [class]="option.value === 'themed' ? 'bg-brand/10' : option.value === 'system' ? 'bg-line' : ''">
                        <span class="absolute inset-x-0 top-0.5 h-3.5 rounded-full" [class]="option.thumb"></span>
                      </span>
                    </span>
                    <span class="mt-2 block text-sm font-medium text-ink">{{ option.label }}</span>
                    <span class="block text-[11px] leading-tight text-ink-muted">{{ option.description }}</span>
                  </button>
                }
              </div>
              <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div class="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Scrollbar color">
                  @for (option of scrollbarColors; track option.value) {
                    <button
                      type="button"
                      role="radio"
                      class="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                      [class]="s().scrollbarColor === option.value ? 'border-brand bg-brand-subtle text-ink' : 'border-line text-ink-muted hover:border-line-strong hover:text-ink'"
                      [disabled]="s().scrollbarStyle === 'neutral' || s().scrollbarStyle === 'system'"
                      [attr.aria-checked]="s().scrollbarColor === option.value"
                      (click)="set({ scrollbarColor: option.value })"
                    >
                      <span class="h-3 w-3 rounded-full" [class]="option.swatch" aria-hidden="true"></span>
                      {{ option.label }}
                    </button>
                  }
                </div>
                <div class="grid grid-cols-2 gap-1 rounded-xl bg-surface-sunken p-1" role="radiogroup" aria-label="Scrollbar size">
                  @for (size of scrollbarSizes; track size.value) {
                    <button type="button" role="radio" class="rounded-lg px-3 py-1 text-xs font-medium transition-colors" [class]="s().scrollbarSize === size.value ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'" [disabled]="s().scrollbarStyle === 'system'" [attr.aria-checked]="s().scrollbarSize === size.value" (click)="set({ scrollbarSize: size.value })">{{ size.label }}</button>
                  }
                </div>
              </div>
              <div class="mt-3 h-24 overflow-y-auto rounded-xl border border-line bg-surface p-3" tabindex="0" aria-label="Scrollbar preview">
                <p class="text-xs font-medium text-ink">Live preview</p>
                @for (line of previewLines; track line) {
                  <p class="mt-1.5 text-xs text-ink-muted">Scroll here to preview the selected scrollbar — line {{ line }}.</p>
                }
              </div>
            </section>

            <section class="hidden lg:block">
              <amc-switch label="Collapsed sidebar" description="Show navigation as an icon rail on desktop." [checked]="s().sidebarCollapsed" (checkedChange)="set({ sidebarCollapsed: $event })" />
            </section>
          }
        }
      </div>

      <ng-container dialogFooter>
        <button type="button" class="amc-btn-ghost sm:mr-auto" [disabled]="store.isDefault()" (click)="store.reset()">
          <amc-icon name="rotate-ccw" />
          Reset to defaults
        </button>
        <button type="button" class="amc-btn-primary" (click)="open.set(false)">Done</button>
      </ng-container>
    </amc-dialog>
  `,
})
export class AppearancePanel {
  readonly open = model(false);

  protected readonly store = inject(AppearanceStore);
  protected readonly s = this.store.appearance;
  protected readonly tab = signal('theme');
  protected readonly tabs: TabItem[] = [
    { id: 'theme', label: 'Theme', icon: 'sun' },
    { id: 'colors', label: 'Colors', icon: 'palette' },
    { id: 'typography', label: 'Typography', icon: 'type' },
    { id: 'layout', label: 'Layout', icon: 'panel-left' },
  ];
  protected readonly themes = THEMES;
  protected readonly presets = THEME_PRESETS;
  protected readonly fonts = FONTS;
  protected readonly fontSizes = FONT_SIZES;
  protected readonly densities = DENSITIES;
  protected readonly radii = RADII;
  protected readonly sidebarStyles = SIDEBAR_STYLES;
  protected readonly scrollbarStyles = SCROLLBAR_STYLES;
  protected readonly scrollbarColors = SCROLLBAR_COLORS;
  protected readonly scrollbarSizes = SCROLLBAR_SIZES;
  protected readonly previewLines = [1, 2, 3, 4, 5, 6, 7, 8];
  protected readonly swatches = SWATCHES;
  protected readonly colorRoles = COLOR_ROLES;

  protected readonly currentSizePx = computed(() => FONT_SIZES.find((f) => f.value === this.s().fontSize)?.px ?? 16);
  protected readonly previewSidebar = computed(() => {
    switch (this.s().sidebarStyle) {
      case 'dark':
        return 'dark bg-surface';
      case 'tinted':
        return 'bg-[color-mix(in_oklab,var(--color-brand)_7%,var(--color-surface))]';
      default:
        return 'bg-surface';
    }
  });

  protected set(partial: Partial<AppearanceState>): void {
    this.store.update(partial);
  }

  protected setColor(key: ColorKey, color: string): void {
    this.store.update({ [key]: color });
  }

  protected onCustomColor(key: ColorKey, event: Event): void {
    this.setColor(key, (event.target as HTMLInputElement).value);
  }

  protected optionClass(selected: boolean): string {
    return selected
      ? 'border-brand bg-brand-subtle ring-1 ring-brand'
      : 'border-line bg-surface hover:border-line-strong hover:bg-surface-muted';
  }
}
