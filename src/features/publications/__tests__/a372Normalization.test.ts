import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  crc32,
  isNormalized,
  normalizeImage,
  orientationTiff,
  pngChunk,
  readTiffOrientation,
  NORMALIZATION_VERSION,
} from '../../../../supabase/functions/publication-media/normalize.ts';

const ROOT = join(__dirname, '../../../..');
const fixture = (name: string) => new Uint8Array(readFileSync(join(__dirname, 'fixtures', name)));
const latin1 = (b: Uint8Array) => Buffer.from(b).toString('latin1');

const SECRETS = ['SecretCam', 'Model X1 Pro', 'Jane Secret', '600 000 000', 'SecretCity', 'xmpmeta', 'GPSLatitude',
  'Photoshop 3.0', 'TRAILER', 'private secret', 'tEXt', 'iTXt', 'tIME', 'prVt'];

function jpegSegments(b: Uint8Array): { marker: number; data: Uint8Array }[] {
  const out: { marker: number; data: Uint8Array }[] = [];
  let i = 2;
  while (i < b.length) {
    const marker = b[i + 1];
    if (marker === 0xda) break;
    const len = (b[i + 2] << 8) | b[i + 3];
    out.push({ marker, data: b.subarray(i + 4, i + 2 + len) });
    i += 2 + len;
  }
  return out;
}

function pngChunkTypes(b: Uint8Array): string[] {
  const types: string[] = [];
  let i = 8;
  while (i < b.length) {
    const len = new DataView(b.buffer, b.byteOffset + i).getUint32(0);
    types.push(latin1(b.subarray(i + 4, i + 8)));
    i += 12 + len;
  }
  return types;
}

const CASES = [
  { file: 'photo-exif-gps.jpg', mime: 'image/jpeg', w: 800, h: 600, orientation: 6 },
  { file: 'photo-exif-gps-upright.jpg', mime: 'image/jpeg', w: 800, h: 600, orientation: 1 },
  { file: 'photo-progressive-gps.jpg', mime: 'image/jpeg', w: 800, h: 600, orientation: 8 },
  { file: 'photo-text-exif.png', mime: 'image/png', w: 640, h: 480, orientation: 1 },
] as const;

describe('A3.7.2 normalization on real camera-style fixtures', () => {
  it('uses a versioned, documented normalization strategy', () => {
    expect(NORMALIZATION_VERSION).toBe('lossless-strip-v1');
  });

  for (const c of CASES) {
    describe(c.file, () => {
      const input = fixture(c.file);
      const result = normalizeImage(input, c.mime);

      it('the input really carries private metadata', () => {
        expect(SECRETS.some((s) => latin1(input).includes(s))).toBe(true);
        expect(latin1(input)).toContain('SecretCam');
      });

      it('normalizes with the real dimensions and orientation', () => {
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect([result.width, result.height]).toEqual([c.w, c.h]);
        expect(result.orientation).toBe(c.orientation);
        expect(result.bytes.length).toBeLessThan(input.length);
      });

      it('strips GPS, camera, comments, XMP, IPTC, text chunks and trailing data', () => {
        if (!result.ok) throw new Error('normalization failed');
        const text = latin1(result.bytes);
        for (const s of SECRETS) expect(text).not.toContain(s);
      });

      it('is idempotent and the output is a fixed point', () => {
        if (!result.ok) throw new Error('normalization failed');
        const again = normalizeImage(result.bytes, c.mime);
        expect(again.ok && Buffer.from(again.bytes).equals(Buffer.from(result.bytes))).toBe(true);
        expect(isNormalized(result.bytes, c.mime)).toBe(true);
        expect(isNormalized(input, c.mime)).toBe(false);
      });
    });
  }

  it('JPEG output keeps only an orientation-only EXIF block when rotation is needed', () => {
    const rotated = normalizeImage(fixture('photo-exif-gps.jpg'), 'image/jpeg');
    const upright = normalizeImage(fixture('photo-exif-gps-upright.jpg'), 'image/jpeg');
    if (!rotated.ok || !upright.ok) throw new Error('normalization failed');
    const app1 = jpegSegments(rotated.bytes).filter((s) => s.marker === 0xe1);
    expect(app1).toHaveLength(1);
    expect(latin1(app1[0].data.subarray(0, 6))).toBe('Exif\0\0');
    const tiff = app1[0].data.subarray(6);
    expect(tiff.length).toBeLessThanOrEqual(32);
    expect(readTiffOrientation(tiff)).toBe(6);
    expect(Buffer.from(tiff).equals(Buffer.from(orientationTiff(6)))).toBe(true);
    const markers = jpegSegments(upright.bytes).map((s) => s.marker);
    expect(markers).not.toContain(0xe1);
    expect(markers).not.toContain(0xfe);
    expect(markers).not.toContain(0xed);
  });

  it('JPEG entropy-coded image data is byte-identical (no pixel re-encode)', () => {
    for (const file of ['photo-exif-gps.jpg', 'photo-progressive-gps.jpg']) {
      const input = fixture(file);
      const out = normalizeImage(input, 'image/jpeg');
      if (!out.ok) throw new Error('normalization failed');
      const sos = (b: Uint8Array) => b.subarray(b.findIndex((v, i) => v === 0xff && b[i + 1] === 0xda));
      const inScan = sos(input);
      const eoi = latin1(inScan).lastIndexOf('\xff\xd9');
      expect(Buffer.from(sos(out.bytes)).equals(Buffer.from(inScan.subarray(0, eoi + 2)))).toBe(true);
    }
  });

  it('PNG output keeps only rendering chunks with valid CRCs', () => {
    const out = normalizeImage(fixture('photo-text-exif.png'), 'image/png');
    if (!out.ok) throw new Error('normalization failed');
    const types = pngChunkTypes(out.bytes);
    expect(types[0]).toBe('IHDR');
    expect(types[types.length - 1]).toBe('IEND');
    for (const t of types) expect(['IHDR', 'PLTE', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'iCCP', 'sBIT', 'bKGD', 'pHYs', 'IDAT', 'IEND']).toContain(t);
  });

  it('PNG eXIf with a rotation is re-emitted as orientation only', () => {
    const base = normalizeImage(fixture('photo-text-exif.png'), 'image/png');
    if (!base.ok) throw new Error('normalization failed');
    const exif = new Uint8Array([...orientationTiff(3), ...new TextEncoder().encode('GPS SecretCam')]);
    const idat = latin1(base.bytes).indexOf('IDAT') - 4;
    const withExif = new Uint8Array([...base.bytes.subarray(0, idat), ...pngChunk('eXIf', exif), ...base.bytes.subarray(idat)]);
    const out = normalizeImage(withExif, 'image/png');
    if (!out.ok) throw new Error('normalization failed');
    expect(out.orientation).toBe(3);
    expect(latin1(out.bytes)).not.toContain('SecretCam');
    expect(pngChunkTypes(out.bytes)).toContain('eXIf');
  });

  it('fails closed on malformed or tampered input', () => {
    const jpg = fixture('photo-exif-gps.jpg');
    const png = fixture('photo-text-exif.png');
    expect(normalizeImage(jpg.subarray(0, 200), 'image/jpeg').ok).toBe(false);
    expect(normalizeImage(png, 'image/jpeg').ok).toBe(false);
    expect(normalizeImage(jpg, 'image/png').ok).toBe(false);
    const badCrc = new Uint8Array(png);
    badCrc[29] ^= 0xff;
    expect(normalizeImage(badCrc, 'image/png').ok).toBe(false);
    expect(normalizeImage(new Uint8Array(0), 'image/jpeg').ok).toBe(false);
  });

  it('crc32 matches the PNG reference value', () => {
    expect(crc32(new TextEncoder().encode('IEND'))).toBe(0xae426082);
  });

  it('upload handler stores only normalized bytes, never the raw upload', () => {
    const handler = readFileSync(join(ROOT, 'supabase/functions/publication-media/handler.ts'), 'utf8');
    expect(handler).toMatch(/normalizeImage\(/);
    expect(handler).toMatch(/putObject\([^)]*normalized\.bytes/);
    expect(handler).not.toMatch(/putObject\([^)]*\bbytes\s*,\s*mime/);
  });

  it('the proposals engine ships an identical copy of the normalizer', () => {
    const a = readFileSync(join(ROOT, 'supabase/functions/publication-media/normalize.ts'), 'utf8');
    const b = readFileSync(join(ROOT, 'supabase/functions/publication-proposals/normalize.ts'), 'utf8');
    expect(b).toBe(a);
  });
});
