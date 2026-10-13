/**
 * SiteMap — an interactive Leaflet.js map that plots site locations.
 * Uses OpenStreetMap tiles (no API key required).
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
  output,
  viewChild,
} from '@angular/core';

export interface MapPin {
  readonly id: string;
  readonly lat: number;
  readonly lng: number;
  readonly label: string;
  readonly subtitle?: string;
  readonly status?: string;
}

@Component({
  selector: 'amc-site-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `<div #mapContainer class="h-full w-full rounded-xl" style="min-height:400px"></div>`,
})
export class SiteMap {
  readonly pins = input.required<readonly MapPin[]>();
  readonly height = input(480);
  readonly pinClick = output<string>();

  private readonly mapEl = viewChild.required<ElementRef<HTMLDivElement>>('mapContainer');
  private readonly destroyRef = inject(DestroyRef);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private map: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private L: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private markers: any[] = [];

  constructor() {
    // Initialise Leaflet after the view is ready (injection context — safe here).
    afterNextRender(() => {
      void this.initMap();
    });

    // Re-render markers whenever pins change (runs in injection context).
    effect(() => {
      const pins = this.pins();
      void pins;
      if (this.map && this.L) this.renderPins();
    });
  }

  private async initMap(): Promise<void> {
    const L = await import('leaflet');
    this.L = L;

    // Fix default icon paths (bundler issue with Leaflet)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    });

    const el = this.mapEl().nativeElement;
    el.style.height = this.height() + 'px';

    this.map = L.map(el, { zoomControl: true }).setView([24, 45], 4);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 18,
    }).addTo(this.map);

    this.renderPins();

    this.destroyRef.onDestroy(() => {
      this.map?.remove();
      this.map = null;
    });
  }

  private renderPins(): void {
    const L = this.L;
    if (!this.map || !L) return;
    this.markers.forEach((m) => m.remove());
    this.markers = [];

    const pins = this.pins();
    if (!pins.length) return;

    const bounds: [number, number][] = [];

    for (const pin of pins) {
      if (pin.lat === 0 && pin.lng === 0) continue;
      const marker = L.marker([pin.lat, pin.lng])
        .addTo(this.map)
        .bindPopup(
          `<div style="min-width:160px">
            <p style="font-weight:600;margin-bottom:2px">${pin.label}</p>
            ${pin.subtitle ? `<p style="color:#64748b;font-size:12px">${pin.subtitle}</p>` : ''}
            ${pin.status ? `<span style="display:inline-block;margin-top:4px;padding:2px 8px;background:#f1f5f9;border-radius:9999px;font-size:11px">${pin.status}</span>` : ''}
          </div>`,
        );
      marker.on('click', () => this.pinClick.emit(pin.id));
      this.markers.push(marker);
      bounds.push([pin.lat, pin.lng]);
    }

    if (bounds.length === 1) {
      this.map.setView(bounds[0], 12);
    } else if (bounds.length > 1) {
      this.map.fitBounds(bounds, { padding: [40, 40] });
    }
  }
}
