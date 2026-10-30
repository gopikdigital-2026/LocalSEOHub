// Instagram-only JPEG derivative. The private original is never modified; a new image is rendered from
// decoded pixels, so no source metadata (EXIF/GPS, XMP, IPTC, ICC, comments) can survive. Fails closed.

export const DERIVATIVE_VERSION = "ig-jpeg-centrecrop-v1";
export const IG_MIN_RATIO = 0.8;
export const IG_MAX_RATIO = 1.91;
export const IG_MIN_WIDTH = 320;
export const IG_MAX_WIDTH = 1440;
export const IG_MAX_BYTES = 8 * 1024 * 1024;
export const SOURCE_MIN_SIDE = 320;
export const SOURCE_MAX_SIDE = 8192;
export const SOURCE_MAX_PIXELS = 25_000_000;
const QUALITIES = [90, 85, 80, 70];

export type SourceMime = "image/jpeg" | "image/png";

export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8Array;
}

export interface Codecs {
  decodeJpeg(bytes: Uint8Array, maxMegapixels: number): RgbaImage;
  decodePng(bytes: Uint8Array): RgbaImage;
  encodeJpeg(image: RgbaImage, quality: number): Uint8Array;
}

export interface Probe {
  width: number;
  height: number;
  orientation: number;
}

export type CropMode = "none" | "tall_center_crop_4x5" | "wide_center_crop_191x100";

export interface Plan {
  mode: CropMode;
  crop: { x: number; y: number; width: number; height: number };
  width: number;
  height: number;
}

export type DerivativeResult =
  | { ok: true; bytes: Uint8Array; width: number; height: number; mode: CropMode; quality: number; source: Probe }
  | { ok: false; reason: string };

const u16 = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u32 = (b: Uint8Array, i: number) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
const EXIF_ID = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

export function readTiffOrientation(t: Uint8Array): number {
  if (t.length < 8) return 1;
  const le = t[0] === 0x49 && t[1] === 0x49;
  if (!le && !(t[0] === 0x4d && t[1] === 0x4d)) return 1;
  const r16 = (i: number) => (le ? t[i] | (t[i + 1] << 8) : (t[i] << 8) | t[i + 1]);
  const r32 = (i: number) => (le ? (t[i] | (t[i + 1] << 8) | (t[i + 2] << 16)) + t[i + 3] * 0x1000000 : u32(t, i));
  if (r16(2) !== 42) return 1;
  const ifd = r32(4);
  if (ifd + 2 > t.length) return 1;
  const count = r16(ifd);
  for (let k = 0; k < count; k++) {
    const e = ifd + 2 + k * 12;
    if (e + 12 > t.length) return 1;
    if (r16(e) === 0x0112 && r16(e + 2) === 3 && r32(e + 4) === 1) {
      const v = r16(e + 8);
      return v >= 1 && v <= 8 ? v : 1;
    }
  }
  return 1;
}

function probeJpeg(b: Uint8Array): Probe | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let orientation = 1;
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null;
    while (i < b.length && b[i] === 0xff) i++;
    const m = b[i++];
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) continue;
    if (m === 0xd9 || m === 0xda || i + 2 > b.length) return null;
    const len = u16(b, i);
    if (len < 2 || i + len > b.length) return null;
    const payload = b.subarray(i + 2, i + len);
    if (m === 0xe1 && payload.length > 6 && EXIF_ID.every((v, k) => payload[k] === v)) orientation = readTiffOrientation(payload.subarray(6));
    if (SOF.has(m)) {
      if (payload.length < 5) return null;
      return { height: u16(payload, 1), width: u16(payload, 3), orientation };
    }
    i += len;
  }
  return null;
}

function probePng(b: Uint8Array): Probe | null {
  if (b.length < 33 || !PNG_SIG.every((v, k) => b[k] === v)) return null;
  if (String.fromCharCode(...b.subarray(12, 16)) !== "IHDR") return null;
  const width = u32(b, 16);
  const height = u32(b, 20);
  let orientation = 1;
  let i = 8;
  while (i + 12 <= b.length) {
    const len = u32(b, i);
    const type = String.fromCharCode(...b.subarray(i + 4, i + 8));
    if (type === "IDAT" || type === "IEND" || i + 12 + len > b.length) break;
    if (type === "eXIf") orientation = readTiffOrientation(b.subarray(i + 8, i + 8 + len));
    i += 12 + len;
  }
  return { width, height, orientation };
}

export function probe(bytes: Uint8Array, mime: SourceMime): Probe | null {
  return mime === "image/jpeg" ? probeJpeg(bytes) : mime === "image/png" ? probePng(bytes) : null;
}

export function orientedSize(width: number, height: number, orientation: number) {
  return orientation >= 5 ? { width: height, height: width } : { width, height };
}

export function sourceIssue(p: Probe): string | null {
  if (p.width < SOURCE_MIN_SIDE || p.height < SOURCE_MIN_SIDE) return "source_too_small";
  if (p.width > SOURCE_MAX_SIDE || p.height > SOURCE_MAX_SIDE) return "source_too_large";
  if (p.width * p.height > SOURCE_MAX_PIXELS) return "source_too_many_pixels";
  return null;
}

// Display-oriented dimensions in; crop window and final size out. Never pads, never upscales.
export function planDerivative(width: number, height: number): Plan | null {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) return null;
  let mode: CropMode = "none";
  let cw = width;
  let ch = height;
  if (width / height < IG_MIN_RATIO) {
    mode = "tall_center_crop_4x5";
    ch = Math.floor(width / IG_MIN_RATIO);
  } else if (width / height > IG_MAX_RATIO) {
    mode = "wide_center_crop_191x100";
    cw = Math.floor(height * IG_MAX_RATIO);
  }
  const crop = { x: Math.floor((width - cw) / 2), y: Math.floor((height - ch) / 2), width: cw, height: ch };
  const outW = Math.min(cw, IG_MAX_WIDTH);
  let outH = Math.round((ch * outW) / cw);
  outH = Math.min(Math.max(outH, Math.ceil(outW / IG_MAX_RATIO)), Math.floor(outW / IG_MIN_RATIO), ch);
  if (outW < IG_MIN_WIDTH || outW > IG_MAX_WIDTH || outH < 1) return null;
  const ratio = outW / outH;
  if (ratio < IG_MIN_RATIO || ratio > IG_MAX_RATIO) return null;
  return { mode, crop, width: outW, height: outH };
}

function sourceIndexFn(w: number, h: number, orientation: number): (x: number, y: number) => number {
  switch (orientation) {
    case 2: return (x, y) => y * w + (w - 1 - x);
    case 3: return (x, y) => (h - 1 - y) * w + (w - 1 - x);
    case 4: return (x, y) => (h - 1 - y) * w + x;
    case 5: return (x, y) => x * w + y;
    case 6: return (x, y) => (h - 1 - x) * w + y;
    case 7: return (x, y) => (h - 1 - x) * w + (w - 1 - y);
    case 8: return (x, y) => x * w + (w - 1 - y);
    default: return (x, y) => y * w + x;
  }
}

function spans(start: number, length: number, out: number): Int32Array {
  const s = new Int32Array(out + 1);
  for (let k = 0; k <= out; k++) s[k] = start + Math.floor((k * length) / out);
  for (let k = 1; k <= out; k++) if (s[k] <= s[k - 1]) s[k] = s[k - 1] + 1;
  return s;
}

// Orientation, centre-crop and box-filter downscale in one pass over the decoded pixels.
// Transparent pixels are composited onto white; the result is fully opaque.
export function render(src: RgbaImage, orientation: number, plan: Plan): RgbaImage {
  const index = sourceIndexFn(src.width, src.height, orientation);
  const xs = spans(plan.crop.x, plan.crop.width, plan.width);
  const ys = spans(plan.crop.y, plan.crop.height, plan.height);
  const out = new Uint8Array(plan.width * plan.height * 4);
  const d = src.data;
  for (let oy = 0; oy < plan.height; oy++) {
    for (let ox = 0; ox < plan.width; ox++) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = ys[oy]; y < ys[oy + 1]; y++) {
        for (let x = xs[ox]; x < xs[ox + 1]; x++) {
          const p = index(x, y) * 4;
          const a = d[p + 3];
          const bg = 255 * (255 - a);
          r += d[p] * a + bg;
          g += d[p + 1] * a + bg;
          b += d[p + 2] * a + bg;
          n++;
        }
      }
      const q = (oy * plan.width + ox) * 4;
      const div = n * 255;
      out[q] = Math.round(r / div);
      out[q + 1] = Math.round(g / div);
      out[q + 2] = Math.round(b / div);
      out[q + 3] = 255;
    }
  }
  return { width: plan.width, height: plan.height, data: out };
}

// Markers that can carry metadata: APP1..APP15 and COM. APP0 (JFIF) carries none.
export function jpegMetadataMarkers(b: Uint8Array): number[] {
  const found: number[] = [];
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return [-1];
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return [...found, -1];
    while (i < b.length && b[i] === 0xff) i++;
    const m = b[i++];
    if (m === 0xda || m === 0xd9) return found;
    const len = u16(b, i);
    if ((m >= 0xe1 && m <= 0xef) || m === 0xfe) found.push(m);
    i += len;
  }
  return [...found, -1];
}

export function buildDerivative(bytes: Uint8Array, mime: SourceMime, codecs: Codecs): DerivativeResult {
  const source = probe(bytes, mime);
  if (!source) return { ok: false, reason: "unreadable_header" };
  const issue = sourceIssue(source);
  if (issue) return { ok: false, reason: issue };
  const display = orientedSize(source.width, source.height, source.orientation);
  const plan = planDerivative(display.width, display.height);
  if (!plan) return { ok: false, reason: "no_compliant_plan" };

  let decoded: RgbaImage;
  try {
    decoded = mime === "image/jpeg" ? codecs.decodeJpeg(bytes, SOURCE_MAX_PIXELS / 1_000_000) : codecs.decodePng(bytes);
  } catch {
    return { ok: false, reason: "decode_failed" };
  }
  if (decoded.width !== source.width || decoded.height !== source.height || decoded.data.length < source.width * source.height * 4) {
    return { ok: false, reason: "decode_mismatch" };
  }

  const pixels = render(decoded, source.orientation, plan);
  for (const quality of QUALITIES) {
    let out: Uint8Array;
    try {
      out = codecs.encodeJpeg(pixels, quality);
    } catch {
      return { ok: false, reason: "encode_failed" };
    }
    if (out.byteLength > IG_MAX_BYTES) continue;
    const check = probeJpeg(out);
    if (!check || check.width !== plan.width || check.height !== plan.height || jpegMetadataMarkers(out).length > 0) {
      return { ok: false, reason: "output_verification_failed" };
    }
    return { ok: true, bytes: out, width: plan.width, height: plan.height, mode: plan.mode, quality, source };
  }
  return { ok: false, reason: "output_too_large" };
}
