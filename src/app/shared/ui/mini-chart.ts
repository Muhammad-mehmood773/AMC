/**
 * MiniChart — a lightweight Chart.js wrapper for simple bar and donut charts.
 * Usage:
 *   <amc-mini-chart type="donut" [labels]="['Active', 'On Hold', 'Inactive']" [values]="[20, 5, 3]" />
 *   <amc-mini-chart type="bar" [labels]="['Jan','Feb','Mar']" [values]="[10, 8, 14]" />
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { Chart, type ChartConfiguration, registerables } from 'chart.js';

Chart.register(...registerables);

const PALETTE = [
  'rgba(15, 118, 110, 0.85)',  // teal/brand
  'rgba(59, 130, 246, 0.85)',  // blue
  'rgba(168, 85, 247, 0.85)',  // purple
  'rgba(245, 158, 11, 0.85)',  // amber
  'rgba(239, 68, 68, 0.85)',   // red
  'rgba(16, 185, 129, 0.85)',  // emerald
  'rgba(99, 102, 241, 0.85)',  // indigo
  'rgba(156, 163, 175, 0.85)', // gray
];

@Component({
  selector: 'amc-mini-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `<canvas #canvas [style.max-height]="height() + 'px'" [attr.aria-label]="ariaLabel()"></canvas>`,
})
export class MiniChart {
  readonly type = input.required<'bar' | 'donut'>();
  readonly labels = input.required<readonly string[]>();
  readonly values = input.required<readonly number[]>();
  readonly height = input(180);
  readonly ariaLabel = input('Chart');

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly destroyRef = inject(DestroyRef);
  private chart: Chart | null = null;
  private ready = false;

  constructor() {
    // Wait for the view to be available, then build once.
    afterNextRender(() => {
      this.ready = true;
      this.buildChart();
      this.destroyRef.onDestroy(() => this.chart?.destroy());
    });

    // Re-build whenever inputs change (runs in injection context — safe here).
    effect(() => {
      const labels = this.labels();
      const values = this.values();
      const type = this.type();
      void labels; void values; void type;
      if (this.ready) this.buildChart();
    });
  }

  /** CSS custom-property values read at runtime for dark mode compatibility. */
  private cssVar(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
  }

  private buildChart(): void {
    if (!this.canvas) return;
    this.chart?.destroy();
    const ctx = this.canvas().nativeElement.getContext('2d');
    if (!ctx) return;

    const labels = this.labels() as string[];
    const values = this.values() as number[];
    const type = this.type();
    const gridColor = this.cssVar('--color-line') || 'rgba(0,0,0,0.08)';
    const textColor = this.cssVar('--color-ink-muted') || '#64748b';

    if (type === 'donut') {
      const donutCfg: ChartConfiguration<'doughnut'> = {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{
            data: values,
            backgroundColor: PALETTE.slice(0, values.length),
            borderWidth: 2,
            borderColor: 'transparent',
            hoverOffset: 6,
          }],
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        options: {
          responsive: true,
          maintainAspectRatio: true,
          cutout: '68%',
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: textColor, padding: 12, font: { size: 12 }, boxWidth: 12, boxHeight: 12 },
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            tooltip: { callbacks: { label: (c: any) => ` ${c.label}: ${c.parsed}` } },
          },
        } as any,
      };
      this.chart = new Chart(ctx, donutCfg);
    } else {
      const barCfg: ChartConfiguration<'bar'> = {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            data: values,
            backgroundColor: PALETTE[0],
            borderRadius: 6,
            borderSkipped: false,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.parsed.y}` } } },
          scales: {
            x: { grid: { display: false }, ticks: { color: textColor, font: { size: 11 } } },
            y: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 11 }, stepSize: 1 }, beginAtZero: true },
          },
        },
      };
      this.chart = new Chart(ctx, barCfg);
    }
  }
}
