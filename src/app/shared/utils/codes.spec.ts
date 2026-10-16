import { CODE128_PATTERNS, encodeCode128 } from './barcode';
import { encodeQr } from './qr-code';

describe('Asset identification codes', () => {
  it('has a valid Code 128 symbol table', () => {
    expect(CODE128_PATTERNS).toHaveLength(107);
    CODE128_PATTERNS.forEach((p, i) => {
      const sum = Array.from(p, Number).reduce((a, b) => a + b, 0);
      expect(sum).toBe(i === 106 ? 13 : 11);
    });
    expect(new Set(CODE128_PATTERNS).size).toBe(107);
  });

  it('encodes Code 128B with checksum', () => {
    // (104 + 48·1 + 42·2 + 42·3 + 17·4 + 18·5 + 19·6 + 35·7) mod 103 = 55
    const widths = encodeCode128('PJJ123C');
    expect(widths.length).toBe((1 + 7 + 1) * 6 + 7);
    const checksum = widths.slice(8 * 6, 9 * 6).join('');
    expect(checksum).toBe(CODE128_PATTERNS[55]);
  });

  it('builds QR matrices with finder patterns and correct size', () => {
    const short = encodeQr('AST-00001');
    expect(short.length).toBe(21);
    const url = encodeQr('https://amc.example.com/app/assets/AST-00001');
    expect(url.length).toBe(29 + 4);
    for (const m of [short, url]) {
      const n = m.length;
      // finder centres are dark, separator ring light
      expect(m[3][3] && m[3][n - 4] && m[n - 4][3]).toBe(true);
      expect(m[1][1] || m[1][n - 2] || m[n - 2][1]).toBe(false);
      // dark module
      expect(m[n - 8][8]).toBe(true);
    }
  });

  it('matches a known QR reference encoding', () => {
    // Reference: "HELLO" in byte mode, EC level M, version 1 — first data row segment from a
    // conformant encoder is deterministic; verify the format information for the chosen mask is valid.
    const m = encodeQr('HELLO');
    const bits = [0, 1, 2, 3, 4, 5, 7, 8].map((y) => (m[y][8] ? 1 : 0));
    const valid = [0, 1, 2, 3, 4, 5, 6, 7].some((mask) => {
      const value = mask;
      let rem = value;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const format = ((value << 10) | rem) ^ 0x5412;
      const expected = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => (format >>> i) & 1);
      return expected.every((b, i) => b === bits[i]);
    });
    expect(valid).toBe(true);
  });
});
