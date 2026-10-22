// SQR (Secure-QR) POC: the same generation logic as the backend
// (fingerprints/fingerprint_generators/sqr_generator.py), minus the emblem,
// plus: module counting and watermarking only the black or only the white
// modules.
//
// Backend logic mirrored here:
//   - QR: Version 3, MEDIUM ECC, auto mask, no boost, 29x29 modules, no quiet
//     zone, dark module = 0, light module = 255, 8px per module (232x232).
//     The encoder is src/lib/qrV3M.ts (a port of the qrcodegen algorithm the
//     backend uses), so there are no extra dependencies.
//   - Seed: zlib.crc32(fingerprint_id) -> mulberry32 -> one bit per module,
//     bit = 1 when draw < 0.5 (841 draws, row-major).
//   - Prefix and ID: the backend download view uses the prefix
//     https://witomark.com/sqr/ and 8-character IDs (A-Z, a-z, 0-9).
//   - Embedding: one 8x8 DCT block per module. For each coefficient pair
//     (c1, c2): avg = (F[c1] + F[c2]) / 2, then F[c1] = avg +/- strength/2 and
//     F[c2] = avg -/+ strength/2 (bit 1: +/-, bit 0: -/+). Orthonormal DCT-II,
//     F[u][v] with u = vertical frequency, v = horizontal frequency.
//   - Output: clip to 0..255, truncate to 8-bit, 2x nearest-neighbour upscale,
//     8-bit grayscale PNG with DPI metadata.

import { encodeQrV3M, QrDataTooLongError } from './qrV3M';

export const BLOCK_SIZE = 8;
export const QR_MODULES = 29;
export const TOTAL_BLOCKS = QR_MODULES * QR_MODULES; // 841
export const CANONICAL_SIZE = QR_MODULES * BLOCK_SIZE; // 232
export const DEFAULT_STRENGTH = 120;
export const MIN_STRENGTH = 1;
export const MAX_STRENGTH = 1000;
export const DEFAULT_MM_SIZE = 10;
/** The backend builds SQR fingerprint IDs from 8 random A-Z, a-z, 0-9 characters. */
export const DEFAULT_ID_LENGTH = 8;
/** Prefix the backend download view puts in front of the fingerprint ID. */
export const DEFAULT_PREFIX = 'https://witomark.com/sqr/';
/** Version 3-M holds at most 42 bytes in byte mode. */
export const MAX_QR_BYTES = 42;

export type Coeff = [number, number];
export type CoeffPair = [Coeff, Coeff];

/** The pair the backend download view passes to the generator: bit 1 when F[3][1] > F[1][3]. */
export const DEFAULT_COEFF_PAIRS: CoeffPair[] = [[[3, 1], [1, 3]]];

/** Starting point for an optional second pair in the UI (the generator module's own second default). */
export const DEFAULT_SECOND_PAIR: CoeffPair = [[1, 0], [0, 1]];

/**
 * Pairs are applied one after another to the same block, so every coefficient must be a valid
 * 8x8 index, the two coefficients of a pair must differ, and no coefficient may appear in two
 * pairs (a shared coefficient would be overwritten by the later pair and break the earlier bit).
 */
export function validateCoeffPairs(pairs: CoeffPair[]): void {
  if (!pairs.length) throw new Error('Select at least one coefficient pair');
  const seen = new Set<string>();
  pairs.forEach((pair, i) => {
    for (const [u, v] of pair) {
      if (!Number.isInteger(u) || !Number.isInteger(v) || u < 0 || u > 7 || v < 0 || v > 7)
        throw new Error(`Pair ${i + 1}: coefficient indices must be whole numbers from 0 to 7`);
    }
    const [a, b] = pair;
    if (a[0] === b[0] && a[1] === b[1])
      throw new Error(`Pair ${i + 1}: the two coefficients must be different`);
    for (const [u, v] of pair) {
      const key = `${u},${v}`;
      if (seen.has(key)) throw new Error(`Coefficient (${u},${v}) is used more than once; every coefficient must be different`);
      seen.add(key);
    }
  });
}

/** 'black' / 'white' watermark only that colour's modules; 'all' is the standard SQR. */
export type WatermarkColour = 'black' | 'white' | 'all';

// ---------------------------------------------------------------------------
// CRC-32 (identical to Python's zlib.crc32 on the UTF-8 bytes, unsigned)
// ---------------------------------------------------------------------------

let CRC_TABLE: Uint32Array | null = null;
function crcTable(): Uint32Array {
  if (CRC_TABLE) return CRC_TABLE;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  CRC_TABLE = t;
  return t;
}

export function crc32Bytes(bytes: Uint8Array, start = 0xffffffff): number {
  const t = crcTable();
  let c = start;
  for (let i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return c >>> 0;
}

export function crc32(str: string): number {
  return (crc32Bytes(new TextEncoder().encode(str)) ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------------------
// mulberry32 (standard JS algorithm, same as the backend's port)
// ---------------------------------------------------------------------------

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateMaskBits(seed: number, length: number): Uint8Array {
  const rand = mulberry32(seed);
  const bits = new Uint8Array(length);
  for (let i = 0; i < length; i++) bits[i] = rand() < 0.5 ? 1 : 0;
  return bits;
}

// ---------------------------------------------------------------------------
// Fingerprint ID
// ---------------------------------------------------------------------------

const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** Random alphanumeric ID (unbiased, uses the Web Crypto RNG). */
export function generateFingerprintId(length = DEFAULT_ID_LENGTH): string {
  const out: string[] = [];
  const limit = 256 - (256 % ID_ALPHABET.length);
  const buf = new Uint8Array(length * 2);
  while (out.length < length) {
    globalThis.crypto.getRandomValues(buf);
    for (let i = 0; i < buf.length && out.length < length; i++) {
      if (buf[i] < limit) out.push(ID_ALPHABET[buf[i] % ID_ALPHABET.length]);
    }
  }
  return out.join('');
}

// ---------------------------------------------------------------------------
// QR matrix and module counts
// ---------------------------------------------------------------------------

export interface ModuleCounts {
  total: number;
  black: number;
  white: number;
}

/** 29x29 grid, true = dark (black) module. Version 3, MEDIUM ECC, auto mask. */
export function buildQrModules(text: string): boolean[][] {
  const grid = encodeQrV3M(text);
  if (grid.length !== QR_MODULES) throw new Error(`Unexpected QR size ${grid.length}`);
  return grid;
}

export function countModules(modules: boolean[][]): ModuleCounts {
  let black = 0;
  for (const row of modules) for (const m of row) if (m) black++;
  const total = modules.length * (modules[0]?.length ?? 0);
  return { total, black, white: total - black };
}

/** 232x232, dark = 0, light = 255, 8px per module. */
export function renderCanonical(modules: boolean[][]): Float64Array {
  const n = modules.length * BLOCK_SIZE;
  const out = new Float64Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      out[y * n + x] = modules[Math.floor(y / BLOCK_SIZE)][Math.floor(x / BLOCK_SIZE)] ? 0 : 255;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// DCT (orthonormal DCT-II, F[u][v]: u = vertical, v = horizontal frequency)
// ---------------------------------------------------------------------------

const C: number[][] = (() => {
  const m: number[][] = [];
  for (let k = 0; k < 8; k++) {
    const row: number[] = [];
    const a = k === 0 ? Math.sqrt(1 / 8) : Math.sqrt(2 / 8);
    for (let n = 0; n < 8; n++) row.push(a * Math.cos(((2 * n + 1) * k * Math.PI) / 16));
    m.push(row);
  }
  return m;
})();

function dct2(b: Float64Array): Float64Array {
  const tmp = new Float64Array(64);
  const F = new Float64Array(64);
  for (let u = 0; u < 8; u++)
    for (let x = 0; x < 8; x++) {
      let s = 0;
      for (let y = 0; y < 8; y++) s += C[u][y] * b[y * 8 + x];
      tmp[u * 8 + x] = s;
    }
  for (let u = 0; u < 8; u++)
    for (let v = 0; v < 8; v++) {
      let s = 0;
      for (let x = 0; x < 8; x++) s += tmp[u * 8 + x] * C[v][x];
      F[u * 8 + v] = s;
    }
  return F;
}

function idct2(F: Float64Array): Float64Array {
  const tmp = new Float64Array(64);
  const b = new Float64Array(64);
  for (let y = 0; y < 8; y++)
    for (let v = 0; v < 8; v++) {
      let s = 0;
      for (let u = 0; u < 8; u++) s += C[u][y] * F[u * 8 + v];
      tmp[y * 8 + v] = s;
    }
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      let s = 0;
      for (let v = 0; v < 8; v++) s += tmp[y * 8 + v] * C[v][x];
      b[y * 8 + x] = s;
    }
  return b;
}

export function embedBlock(
  block: Float64Array,
  bit: number,
  pairs: CoeffPair[],
  strength: number
): Float64Array {
  const F = dct2(block);
  for (const [[u1, v1], [u2, v2]] of pairs) {
    const i1 = u1 * 8 + v1;
    const i2 = u2 * 8 + v2;
    const avg = (F[i1] + F[i2]) / 2;
    if (bit === 1) {
      F[i1] = avg + strength / 2;
      F[i2] = avg - strength / 2;
    } else {
      F[i1] = avg - strength / 2;
      F[i2] = avg + strength / 2;
    }
  }
  return idct2(F);
}

/** One decoded bit per block for one pair: 1 when F[c1] > F[c2]. */
export function decodeBlock(block: Float64Array, pair: CoeffPair): number {
  const F = dct2(block);
  const [[u1, v1], [u2, v2]] = pair;
  return F[u1 * 8 + v1] > F[u2 * 8 + v2] ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export interface SqrPocOptions {
  prefix: string;
  fingerprintId: string;
  strength: number;
  mmSize: number;
  colour: WatermarkColour;
  coeffPairs?: CoeffPair[];
}

export interface SqrPocResult {
  fingerprintUrl: string;
  /** zlib.crc32(fingerprintId): the seed passed to mulberry32. */
  seed: number;
  colour: WatermarkColour;
  strength: number;
  /** The coefficient pairs that were embedded (bit 1 when first > second, per pair). */
  coeffPairs: CoeffPair[];
  counts: ModuleCounts;
  /** Modules actually watermarked (black count, white count, or total). */
  selectedCount: number;
  /**
   * One bit per watermarked module, row-major. The bit for module i is draw i of
   * the 841-draw sequence, i.e. the standard SQR string filtered by the colour.
   */
  refBinaryString: string;
  /** The standard 841-bit SQR string for this ID (all modules). */
  fullBinaryString: string;
  /** 841 chars, '1' where the module was watermarked. */
  maskString: string;
  /** 232x232 8-bit grayscale pixels (1x). */
  pixels1x: Uint8Array;
  /** 464x464 8-bit grayscale pixels (2x, nearest neighbour). */
  pixels2x: Uint8Array;
  size1x: number;
  size2x: number;
  /** DPI written to the 2x PNG. */
  dpi2x: number;
}

export function generateSqrPoc(opts: SqrPocOptions): SqrPocResult {
  const { prefix, fingerprintId, strength, mmSize, colour } = opts;
  const pairs = opts.coeffPairs ?? DEFAULT_COEFF_PAIRS;

  if (!fingerprintId) throw new Error('Fingerprint ID is empty');
  if (!(mmSize > 0)) throw new Error('Size in mm must be greater than 0');
  if (!Number.isInteger(strength) || strength < MIN_STRENGTH || strength > MAX_STRENGTH)
    throw new Error(`Strength must be a whole number from ${MIN_STRENGTH} to ${MAX_STRENGTH}`);
  validateCoeffPairs(pairs);

  const fingerprintUrl = prefix ? `${prefix}${fingerprintId}` : fingerprintId;
  const byteLen = new TextEncoder().encode(fingerprintUrl).length;
  let modules: boolean[][];
  try {
    modules = buildQrModules(fingerprintUrl);
  } catch (e) {
    if (e instanceof QrDataTooLongError) {
      throw new Error(
        `QR content is too long for Version 3-M (${byteLen} bytes; about ${MAX_QR_BYTES} fit). Shorten the prefix or the ID.`
      );
    }
    throw e;
  }
  const counts = countModules(modules);

  const seed = crc32(fingerprintId);
  const bits = generateMaskBits(seed, TOTAL_BLOCKS);

  const canonical = renderCanonical(modules);
  const out = Float64Array.from(canonical);
  const maskChars: string[] = [];
  const refChars: string[] = [];
  let selectedCount = 0;

  for (let idx = 0; idx < TOTAL_BLOCKS; idx++) {
    const row = Math.floor(idx / QR_MODULES);
    const col = idx % QR_MODULES;
    const dark = modules[row][col];
    const selected = colour === 'all' || (colour === 'black' ? dark : !dark);
    maskChars.push(selected ? '1' : '0');
    if (!selected) continue;

    selectedCount++;
    refChars.push(String(bits[idx]));
    const y0 = row * BLOCK_SIZE;
    const x0 = col * BLOCK_SIZE;
    const block = new Float64Array(64);
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) block[y * 8 + x] = canonical[(y0 + y) * CANONICAL_SIZE + (x0 + x)];
    const nb = embedBlock(block, bits[idx], pairs, strength);
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) out[(y0 + y) * CANONICAL_SIZE + (x0 + x)] = nb[y * 8 + x];
  }

  // Clip, then truncate to 8-bit (numpy astype(uint8) truncates). Where the embedded
  // pattern cancels exactly (the block diagonal), a white pixel is 255 plus ~1e-14 of
  // floating-point noise; the tiny epsilon stops that noise truncating it down to 254.
  const pixels1x = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) pixels1x[i] = Math.floor(Math.min(255, Math.max(0, out[i])) + 1e-9);

  const size2x = CANONICAL_SIZE * 2;
  const pixels2x = new Uint8Array(size2x * size2x);
  for (let y = 0; y < size2x; y++) {
    const sy = y >> 1;
    for (let x = 0; x < size2x; x++) pixels2x[y * size2x + x] = pixels1x[sy * CANONICAL_SIZE + (x >> 1)];
  }

  const baseDpi = Math.round((CANONICAL_SIZE / mmSize) * 25.4);

  return {
    fingerprintUrl,
    seed,
    colour,
    strength,
    coeffPairs: pairs,
    counts,
    selectedCount,
    refBinaryString: refChars.join(''),
    fullBinaryString: Array.from(bits).join(''),
    maskString: maskChars.join(''),
    pixels1x,
    pixels2x,
    size1x: CANONICAL_SIZE,
    size2x,
    dpi2x: baseDpi * 2,
  };
}

// ---------------------------------------------------------------------------
// 8-bit grayscale PNG with a pHYs (DPI) chunk
// ---------------------------------------------------------------------------

function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** zlib stream using stored (uncompressed) blocks: the fallback without CompressionStream. */
function zlibStored(data: Uint8Array): Uint8Array {
  const blocks = Math.max(1, Math.ceil(data.length / 65535));
  const out = new Uint8Array(2 + data.length + blocks * 5 + 4);
  let p = 0;
  out[p++] = 0x78;
  out[p++] = 0x01;
  for (let i = 0; i < blocks; i++) {
    const start = i * 65535;
    const len = Math.min(65535, data.length - start);
    out[p++] = i === blocks - 1 ? 1 : 0;
    out[p++] = len & 0xff;
    out[p++] = (len >> 8) & 0xff;
    out[p++] = ~len & 0xff;
    out[p++] = (~len >> 8) & 0xff;
    out.set(data.subarray(start, start + len), p);
    p += len;
  }
  const ad = adler32(data);
  out[p++] = (ad >>> 24) & 0xff;
  out[p++] = (ad >>> 16) & 0xff;
  out[p++] = (ad >>> 8) & 0xff;
  out[p++] = ad & 0xff;
  return out;
}

async function zlibCompress(data: Uint8Array): Promise<Uint8Array> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CS = (globalThis as any).CompressionStream;
  if (!CS) return zlibStored(data);
  try {
    const stream = new Blob([new Uint8Array(data)]).stream().pipeThrough(new CS('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return zlibStored(data);
  }
}

function u32be(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes, 0);
  body.set(data, typeBytes.length);
  const crc = (crc32Bytes(body) ^ 0xffffffff) >>> 0;
  const out = new Uint8Array(8 + data.length + 4);
  out.set(u32be(data.length), 0);
  out.set(body, 4);
  out.set(u32be(crc), 8 + data.length);
  return out;
}

/** Encode square 8-bit grayscale pixels as a PNG that carries the given DPI. */
export async function encodeGrayPng(gray: Uint8Array, size: number, dpi: number): Promise<Uint8Array> {
  const raw = new Uint8Array(size * (size + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size + 1)] = 0; // filter: none
    raw.set(gray.subarray(y * size, (y + 1) * size), y * (size + 1) + 1);
  }
  const idat = await zlibCompress(raw);

  const ihdr = new Uint8Array(13);
  ihdr.set(u32be(size), 0);
  ihdr.set(u32be(size), 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // colour type: grayscale
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const ppm = Math.round(dpi / 0.0254);
  const phys = new Uint8Array(9);
  phys.set(u32be(ppm), 0);
  phys.set(u32be(ppm), 4);
  phys[8] = 1; // unit: metre

  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('pHYs', phys),
    pngChunk('IDAT', idat),
    pngChunk('IEND', new Uint8Array(0)),
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const png = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    png.set(p, off);
    off += p.length;
  }
  return png;
}