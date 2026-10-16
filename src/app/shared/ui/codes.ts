import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { encodeCode128 } from '@shared/utils/barcode';
import { encodeQr, qrPath } from '@shared/utils/qr-code';

/** Offline QR code rendered as SVG. */
@Component({
  selector: 'amc-qr-code',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-block' },
  template: `
    @if (qr(); as code) {
      <svg [attr.viewBox]="'0 0 ' + code.size + ' ' + code.size" [attr.width]="size()" [attr.height]="size()" role="img" [attr.aria-label]="ariaLabel() || 'QR code: ' + value()" shape-rendering="crispEdges">
        <rect [attr.width]="code.size" [attr.height]="code.size" fill="#fff" />
        <path [attr.d]="code.path" fill="#0f172a" />
      </svg>
    }
  `,
})
export class QrCode {
  readonly value = input.required<string>();
  readonly size = input(144);
  readonly ariaLabel = input('');

  protected readonly qr = computed(() => {
    try {
      const modules = encodeQr(this.value());
      return { size: modules.length + 8, path: qrPath(modules) };
    } catch {
      return null;
    }
  });
}

/** Code 128 barcode rendered as SVG with optional human-readable text. */
@Component({
  selector: 'amc-barcode',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-block' },
  template: `
    @if (bars(); as code) {
      <svg [attr.viewBox]="'0 0 ' + code.width + ' ' + (showText() ? 62 : 50)" [attr.height]="height()" [attr.width]="'100%'" preserveAspectRatio="xMidYMid meet" role="img" [attr.aria-label]="'Barcode: ' + value()" shape-rendering="crispEdges">
        <rect [attr.width]="code.width" [attr.height]="showText() ? 62 : 50" fill="#fff" />
        <path [attr.d]="code.path" fill="#0f172a" />
        @if (showText()) {
          <text [attr.x]="code.width / 2" y="60" text-anchor="middle" font-family="ui-monospace, monospace" font-size="9" fill="#0f172a">{{ value() }}</text>
        }
      </svg>
    }
  `,
})
export class Barcode {
  readonly value = input.required<string>();
  readonly height = input(64);
  readonly showText = input(true);

  protected readonly bars = computed(() => {
    try {
      const widths = encodeCode128(this.value());
      const quiet = 10;
      let x = quiet;
      const parts: string[] = [];
      widths.forEach((w, i) => {
        if (i % 2 === 0) parts.push(`M${x} 2h${w}v46h${-w}z`);
        x += w;
      });
      return { width: x + quiet, path: parts.join('') };
    } catch {
      return null;
    }
  });
}
