// Lossless container normalization: pixels are copied untouched; every segment
// that can carry metadata (EXIF/GPS, XMP, IPTC, comments, text, thumbnails,
// trailers after the end marker) is dropped. Unknown structure fails closed.

export type NormalizedMime = "image/jpeg" | "image/png";

export type NormalizeResult =
  | { ok: true; bytes: Uint8Array; width: number; height: number; orientation: number }
  | { ok: false; reason: string };

export const NORMALIZATION_VERSION = "lossless-strip-v1";

const fail = (reason: string): NormalizeResult => ({ ok: false, reason });
const u16 = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u32 = (b: Uint8Array, i: number) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

// Reads only the Orientation tag (0x0112) from a TIFF block; everything else is discarded.
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

// A TIFF block containing exactly one tag: Orientation. No location, device or time data.
export function orientationTiff(orientation: number): Uint8Array {
  return new Uint8Array([
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08,
    0x00, 0x01,
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
  ]);
}

const EXIF_ID = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];
const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
const KEEP_JPEG = new Set([0xdb, 0xc4, 0xdd, 0xcc, 0xdc]);

function segment(marker: number, payload: Uint8Array): Uint8Array {
  const len = payload.length + 2;
  return concat([new Uint8Array([0xff, marker, len >> 8, len & 0xff]), payload]);
}

function normalizeJpeg(b: Uint8Array): NormalizeResult {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return fail("jpeg_signature");
  const out: Uint8Array[] = [new Uint8Array([0xff, 0xd8])];
  let jfif: Uint8Array | null = null;
  let adobe = false;
  let orientation = 1;
  let size: { width: number; height: number } | null = null;
  const body: Uint8Array[] = [];
  let i = 2;
  for (;;) {
    if (i >= b.length) return fail("jpeg_truncated");
    if (b[i] !== 0xff) return fail("jpeg_marker");
    while (i < b.length && b[i] === 0xff) i++;
    if (i >= b.length) return fail("jpeg_truncated");
    const m = b[i++];
    if (m === 0xd9) {
      if (!size) return fail("jpeg_no_frame");
      body.push(new Uint8Array([0xff, 0xd9]));
      break;
    }
    if (m === 0x01) continue;
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7)) return fail("jpeg_unexpected_marker");
    if (i + 2 > b.length) return fail("jpeg_truncated");
    const len = u16(b, i);
    if (len < 2 || i + len > b.length) return fail("jpeg_segment_bounds");
    const payload = b.subarray(i + 2, i + len);
    const whole = b.subarray(i - 2, i + len);
    i += len;
    if (m === 0xe0) {
      if (!jfif && payload.length >= 14 && ascii(payload, 0, 5) === "JFIF\0") {
        // Version 1.01, original density; thumbnail dropped.
        jfif = new Uint8Array([0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, payload[7], payload[8], payload[9], payload[10], payload[11], 0, 0]);
      }
      continue;
    }
    if (m === 0xe1) {
      if (payload.length > 6 && EXIF_ID.every((v, k) => payload[k] === v)) orientation = readTiffOrientation(payload.subarray(6));
      continue;
    }
    if (m === 0xe2) {
      if (payload.length > 14 && ascii(payload, 0, 12) === "ICC_PROFILE\0") body.push(whole);
      continue;
    }
    if (m === 0xee) {
      if (payload.length >= 5 && ascii(payload, 0, 5) === "Adobe") {
        adobe = true;
        body.push(whole);
      }
      continue;
    }
    if ((m >= 0xe3 && m <= 0xef) || m === 0xfe) continue;
    if (SOF.has(m)) {
      if (size || payload.length < 6) return fail("jpeg_frame");
      size = { height: u16(payload, 1), width: u16(payload, 3) };
      if (size.width === 0 || size.height === 0) return fail("jpeg_frame");
      body.push(whole);
      continue;
    }
    if (KEEP_JPEG.has(m)) {
      body.push(whole);
      continue;
    }
    if (m === 0xda) {
      if (!size) return fail("jpeg_scan_before_frame");
      const start = i;
      while (i + 1 < b.length) {
        if (b[i] === 0xff) {
          const n = b[i + 1];
          if (n === 0x00 || (n >= 0xd0 && n <= 0xd7)) {
            i += 2;
            continue;
          }
          if (n === 0xff) {
            i++;
            continue;
          }
          break;
        }
        i++;
      }
      if (i + 1 >= b.length) return fail("jpeg_truncated");
      body.push(whole, b.subarray(start, i));
      continue;
    }
    return fail("jpeg_unsupported_segment");
  }
  if (jfif && !adobe) out.push(segment(0xe0, jfif));
  if (orientation !== 1) out.push(segment(0xe1, concat([new Uint8Array(EXIF_ID), orientationTiff(orientation)])));
  return { ok: true, bytes: concat([...out, ...body]), width: size.width, height: size.height, orientation };
}

const PNG_SIG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const KEEP_PNG = new Set(["PLTE", "tRNS", "gAMA", "cHRM", "sRGB", "iCCP", "sBIT", "bKGD", "pHYs"]);

let crcTable: Uint32Array | null = null;
export function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let k = 0; k < data.length; k++) c = crcTable[(c ^ data[k]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const head = new Uint8Array(8);
  const dv = new DataView(head.buffer);
  dv.setUint32(0, data.length);
  for (let k = 0; k < 4; k++) head[4 + k] = type.charCodeAt(k);
  const typed = concat([head.subarray(4), data]);
  const tail = new Uint8Array(4);
  new DataView(tail.buffer).setUint32(0, crc32(typed));
  return concat([head.subarray(0, 4), typed, tail]);
}

function normalizePng(b: Uint8Array): NormalizeResult {
  if (b.length < 8 || !PNG_SIG.every((v, k) => b[k] === v)) return fail("png_signature");
  const out: Uint8Array[] = [PNG_SIG];
  let i = 8;
  let size: { width: number; height: number } | null = null;
  let orientation = 1;
  let idatSeen = false;
  let idatClosed = false;
  let ended = false;
  while (!ended) {
    if (i + 12 > b.length) return fail("png_truncated");
    const len = u32(b, i);
    if (len > 0x7fffffff || i + 12 + len > b.length) return fail("png_chunk_bounds");
    const type = ascii(b, i + 4, 4);
    if (!/^[A-Za-z]{4}$/.test(type)) return fail("png_chunk_type");
    const data = b.subarray(i + 8, i + 8 + len);
    if (crc32(b.subarray(i + 4, i + 8 + len)) !== u32(b, i + 8 + len)) return fail("png_crc");
    const whole = b.subarray(i, i + 12 + len);
    i += 12 + len;
    if (!size && type !== "IHDR") return fail("png_ihdr_first");
    if (type !== "IDAT" && idatSeen) idatClosed = true;
    switch (type) {
      case "IHDR":
        if (size || len !== 13) return fail("png_ihdr");
        size = { width: u32(data, 0), height: u32(data, 4) };
        if (size.width === 0 || size.height === 0) return fail("png_ihdr");
        out.push(whole);
        break;
      case "IDAT":
        if (idatClosed) return fail("png_idat_split");
        if (!idatSeen && orientation !== 1) out.push(pngChunk("eXIf", orientationTiff(orientation)));
        idatSeen = true;
        out.push(whole);
        break;
      case "IEND":
        if (!idatSeen) return fail("png_no_idat");
        out.push(whole);
        ended = true;
        break;
      case "eXIf":
        if (!idatSeen) orientation = readTiffOrientation(data);
        break;
      default:
        if (KEEP_PNG.has(type)) {
          if (!idatSeen) out.push(whole);
        } else if (type.charCodeAt(0) < 0x61) {
          return fail("png_unknown_critical_chunk");
        }
    }
  }
  return { ok: true, bytes: concat(out), width: size!.width, height: size!.height, orientation };
}

export function normalizeImage(bytes: Uint8Array, mime: NormalizedMime): NormalizeResult {
  try {
    return mime === "image/png" ? normalizePng(bytes) : normalizeJpeg(bytes);
  } catch {
    return fail("unreadable");
  }
}

// Normalized output is a fixed point: re-normalizing yields identical bytes.
export function isNormalized(bytes: Uint8Array, mime: NormalizedMime): boolean {
  const again = normalizeImage(bytes, mime);
  return again.ok && again.bytes.length === bytes.length && again.bytes.every((v, k) => v === bytes[k]);
}
