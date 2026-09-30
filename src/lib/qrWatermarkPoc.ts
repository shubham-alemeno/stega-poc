// QR + DCT watermark POC — generalizes marker.ts's fixed-parameter approach
// (version 5 only, single hardcoded coeff pair, fixed hex seed) into the
// fully configurable version described in the POC requirements doc:
// version/EC-level dropdowns, string seed, strength slider, an
// independent "watermark grid size" (not tied to QR module count) with
// live canonical-size/bit-capacity display, multi-coefficient-pair
// layering (reusing MultiCoeffSelector's LayerSpec), and physical-mm-
// aware PNG output at 1x/2x.
//
// The grid-size/canonical-resize/delta pattern is the same one already
// proven in imageStego.ts (fixed at 256px there) — this file is that same
// architecture, parameterized so gridSize controls the canonical size
// directly, instead of a fixed constant.

import QRCode from 'qrcode';
import { resizeBilinear } from './resize';
import {
  dct8x8,
  idct8x8,
  embedBitInCoeffs,
  makeBlock,
  type CoeffPos,
  type Block8,
} from './dct';
import { mulberry32 } from './prng';
import type { LayerSpec } from './multiEncode';

export const PX_PER_MODULE = 8; // native QR rendering: 1 module = 8x8px, matches marker.ts's convention

export type QrVersion = 1 | 2 | 3 | 4 | 5;
export type EcLevel = 'L' | 'M' | 'Q' | 'H';

export const MAX_TEXT_LENGTH = 100;
export const MIN_GRID_SIZE = 1;
export const MAX_GRID_SIZE = 40;
export const MIN_STRENGTH = 0;
export const MAX_STRENGTH = 2000;
export const DEFAULT_SEED_STRING = 'witomark';
export const DEFAULT_STRENGTH = 60;
export const DEFAULT_GRID_SIZE = 16;
export const DEFAULT_MM_SIZE = 20;

/**
 * Deterministic string -> 32-bit integer hash (djb2 variant), since
 * mulberry32 (prng.ts) takes an integer seed but the requirements call
 * for an 8-character STRING seed. Any two encoders/decoders using the
 * same string will derive the same integer seed and therefore the same
 * bit stream — this hash itself has no cryptographic property, it only
 * needs to be deterministic.
 */
export function stringSeedToInt(seed: string): number {
  let hash = 5381;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) + hash + seed.charCodeAt(i)) | 0; // hash*33 + charCode
  }
  return hash >>> 0;
}

/** Seed-derived random bit string of the given length — this is the
 * actual embedded payload for this POC (not a user-typed secret run
 * through error correction, per requirement 2: "generate random binary
 * string of bit capacity based on grid size"). */
export function generateSeedBits(seedString: string, length: number): number[] {
  const seedInt = stringSeedToInt(seedString);
  const rand = mulberry32(seedInt);
  const bits = new Array<number>(length);
  for (let i = 0; i < length; i++) bits[i] = rand() < 0.5 ? 1 : 0;
  return bits;
}

export interface QrCanonical {
  size: number; // native pixel size (modules * PX_PER_MODULE)
  moduleCount: number;
  Y: Float64Array; // native-resolution luma grid, row-major, size*size
}

/** Generate a QR at its own native resolution (version/EC-level both configurable). */
export function generateQrNative(text: string, version: QrVersion, ecLevel: EcLevel): QrCanonical {
  if (text.length === 0) throw new Error('Text cannot be empty');
  if (text.length > MAX_TEXT_LENGTH) throw new Error(`Text exceeds ${MAX_TEXT_LENGTH}-character limit`);

  const qr = QRCode.create(text, { errorCorrectionLevel: ecLevel, version });
  const moduleCount = qr.modules.size;
  const data = new Uint8Array(qr.modules.data);
  const size = moduleCount * PX_PER_MODULE;

  const Y = new Float64Array(size * size);
  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      const dark = data[row * moduleCount + col];
      const val = dark ? 0 : 255;
      for (let py = 0; py < PX_PER_MODULE; py++) {
        for (let px = 0; px < PX_PER_MODULE; px++) {
          Y[(row * PX_PER_MODULE + py) * size + (col * PX_PER_MODULE + px)] = val;
        }
      }
    }
  }

  return { size, moduleCount, Y };
}

export interface GridGeometry {
  gridSize: number; // blocks per side
  canonicalSize: number; // gridSize * 8, px
  bitCapacity: number; // gridSize * gridSize
}

/** Pure geometry helper — used both by the actual embed function and by
 * the UI to show live canonical-size/bit-capacity feedback as the grid
 * size slider moves, without re-running any embedding. */
export function computeGridGeometry(gridSize: number): GridGeometry {
  const canonicalSize = gridSize * 8;
  return { gridSize, canonicalSize, bitCapacity: gridSize * gridSize };
}

export interface WatermarkResult {
  nativeSize: number;
  watermarkedY: Float64Array; // native resolution, size*size
  geometry: GridGeometry;
  seedBits: number[];
  seedBitsString: string;
  layersApplied: number;
}

/**
 * Embeds seed-derived random bits into the QR, using the same resize-
 * then-delta architecture as imageStego.ts: downsample the native QR to
 * a gridSize*8 canonical grid, embed via DCT into every block (cascading
 * through each coefficient-pair layer in turn, matching
 * multiEncode.runMultiLayerEncode's cascade convention — each layer's
 * input is the previous layer's output), compute the residual delta,
 * upscale that delta back to native resolution, and superimpose it onto
 * the ORIGINAL native QR — so output resolution always equals the QR's
 * own native resolution regardless of gridSize.
 */
export function embedWatermarkGrid(
  qr: QrCanonical,
  gridSize: number,
  layers: LayerSpec[],
  strength: number,
  seedString: string
): WatermarkResult {
  if (layers.length === 0) throw new Error('At least one coefficient pair (layer) is required');
  const geometry = computeGridGeometry(gridSize);
  const { canonicalSize, bitCapacity } = geometry;

  const seedBits = generateSeedBits(seedString, bitCapacity);

  // 1. Downsample native QR Y to the canonical grid.
  const canonicalY = resizeBilinear(qr.Y, qr.size, qr.size, canonicalSize, canonicalSize);

  // 2. Embed into every block, cascading through each layer in turn.
  let current = Float64Array.from(canonicalY);
  const blocksPerSide = canonicalSize / 8;

  for (const layer of layers) {
    const next = Float64Array.from(current);
    for (let blockIdx = 0; blockIdx < bitCapacity; blockIdx++) {
      const blockRow = Math.floor(blockIdx / blocksPerSide);
      const blockCol = blockIdx % blocksPerSide;
      const by = blockRow * 8;
      const bx = blockCol * 8;

      const block: Block8 = makeBlock();
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          block[y][x] = current[(by + y) * canonicalSize + (bx + x)];
        }
      }

      const F = dct8x8(block);
      const bit = seedBits[blockIdx] as 0 | 1;
      const F2 = embedBitInCoeffs(F, bit, layer.coeff1, layer.coeff2, strength);
      const newBlock = idct8x8(F2);

      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          next[(by + y) * canonicalSize + (bx + x)] = newBlock[y][x];
        }
      }
    }
    current = next;
  }

  // 3. Residual delta at canonical resolution.
  const delta = new Float64Array(canonicalSize * canonicalSize);
  for (let i = 0; i < delta.length; i++) delta[i] = current[i] - canonicalY[i];

  // 4. Upscale delta back to the QR's own native resolution.
  const deltaNative = resizeBilinear(delta, canonicalSize, canonicalSize, qr.size, qr.size);

  // 5. Superimpose onto the ORIGINAL native QR (not a resized copy).
  const watermarkedY = new Float64Array(qr.size * qr.size);
  for (let i = 0; i < watermarkedY.length; i++) {
    watermarkedY[i] = Math.min(255, Math.max(0, qr.Y[i] + deltaNative[i]));
  }

  return {
    nativeSize: qr.size,
    watermarkedY,
    geometry,
    seedBits,
    seedBitsString: seedBits.join(''),
    layersApplied: layers.length,
  };
}

// ---------------------------------------------------------------------------
// PNG output with correct physical mm sizing (pHYs chunk injection).
// Canvas.toDataURL has no way to set physical DPI/mm metadata directly —
// this manually inserts a pHYs chunk (pixels-per-meter, both axes) into
// the PNG byte stream after encoding, so image-editing software reports
// the intended physical size instead of an arbitrary default.
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u32be(value: number): Uint8Array {
  return new Uint8Array([(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]);
}

/** Rebuilds a PNG byte array with a pHYs chunk inserted right after IHDR,
 * specifying `pixelsPerMeter` for both X and Y (unit = 1, meters). */
function injectPhysChunk(pngBytes: Uint8Array, pixelsPerMeter: number): Uint8Array {
  const PNG_SIGNATURE_LEN = 8;
  const ihdrLength = new DataView(pngBytes.buffer, pngBytes.byteOffset + PNG_SIGNATURE_LEN, 4).getUint32(0);
  const ihdrChunkTotalLen = 4 + 4 + ihdrLength + 4; // length + type + data + crc
  const insertAt = PNG_SIGNATURE_LEN + ihdrChunkTotalLen;

  const physData = new Uint8Array(9);
  physData.set(u32be(pixelsPerMeter), 0);
  physData.set(u32be(pixelsPerMeter), 4);
  physData[8] = 1; // unit specifier: 1 = meters

  const typeAndData = new Uint8Array(4 + 9);
  typeAndData.set([0x70, 0x48, 0x59, 0x73], 0); // "pHYs"
  typeAndData.set(physData, 4);
  const crc = crc32(typeAndData);

  const physChunk = new Uint8Array(4 + 4 + 9 + 4);
  physChunk.set(u32be(9), 0); // length
  physChunk.set(typeAndData, 4); // type + data
  physChunk.set(u32be(crc), 4 + 4 + 9); // crc

  const out = new Uint8Array(pngBytes.length + physChunk.length);
  out.set(pngBytes.subarray(0, insertAt), 0);
  out.set(physChunk, insertAt);
  out.set(pngBytes.subarray(insertAt), insertAt + physChunk.length);
  return out;
}

/** mm -> pixels-per-meter, given the image's own pixel count along that
 * physical dimension. `pixelsPerMeter = pixelCount / (mm / 1000)`. */
function mmToPixelsPerMeter(pixelCount: number, mmSize: number): number {
  return Math.round(pixelCount / (mmSize / 1000));
}

// ---------------------------------------------------------------------------
// Minimal PNG encoder producing a true 8-bit GRAYSCALE PNG (color type 0).
// Canvas.toBlob always produces an RGB/RGBA PNG regardless of content — even
// if all three channels are equal the file header says color type 2 or 6,
// and software like Photoshop correctly identifies it as a color image.
// Building the PNG directly (IHDR with color type 0, one IDAT, IEND) gives
// us a standard grayscale file that every tool recognizes correctly.
// ---------------------------------------------------------------------------

function adler32(data: Uint8Array): number {
  let s1 = 1, s2 = 0;
  for (let i = 0; i < data.length; i++) {
    s1 = (s1 + data[i]) % 65521;
    s2 = (s2 + s1) % 65521;
  }
  return ((s2 << 16) | s1) >>> 0;
}

/** Minimal DEFLATE store (no compression) — wraps raw bytes in a single
 * non-compressed deflate block, then wraps that in a zlib envelope.
 * Correct for any length ≤ 65535 bytes per block; we chunk larger images. */
function zlibStore(data: Uint8Array): Uint8Array {
  const MAX_BLOCK = 65535;
  const blocks = Math.ceil(data.length / MAX_BLOCK) || 1;
  // 2 (zlib header) + blocks*(5+MAX_BLOCK) + 4 (adler32) — generous upper bound
  const out: number[] = [];

  // zlib header: CMF=0x78 (deflate, window 32kb), FLG=0x01 (no dict, check bits)
  out.push(0x78, 0x01);

  for (let b = 0; b < blocks; b++) {
    const start = b * MAX_BLOCK;
    const end = Math.min(start + MAX_BLOCK, data.length);
    const chunk = data.subarray(start, end);
    const isLast = b === blocks - 1 ? 1 : 0;
    const len = chunk.length;
    const nlen = (~len) & 0xffff;
    out.push(isLast, len & 0xff, (len >> 8) & 0xff, nlen & 0xff, (nlen >> 8) & 0xff);
    for (let i = 0; i < chunk.length; i++) out.push(chunk[i]);
  }

  // adler32 checksum of the raw (uncompressed) input data
  const a = adler32(data);
  out.push((a >>> 24) & 0xff, (a >>> 16) & 0xff, (a >>> 8) & 0xff, a & 0xff);

  return new Uint8Array(out);
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new Uint8Array(type.split('').map((c) => c.charCodeAt(0)));
  const combined = new Uint8Array(4 + data.length);
  combined.set(typeBytes);
  combined.set(data, 4);
  const checksum = crc32(combined);
  const chunk = new Uint8Array(4 + 4 + data.length + 4);
  chunk.set(u32be(data.length), 0);
  chunk.set(combined, 4);
  chunk.set(u32be(checksum), 4 + 4 + data.length);
  return chunk;
}

function buildGrayscalePng(pixels: Uint8Array, width: number, height: number): Uint8Array {
  // PNG signature
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR: width, height, bit depth 8, color type 0 (grayscale), compression 0, filter 0, interlace 0
  const ihdrData = new Uint8Array(13);
  ihdrData.set(u32be(width), 0);
  ihdrData.set(u32be(height), 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 0;  // color type 0 = grayscale
  ihdrData[10] = 0; ihdrData[11] = 0; ihdrData[12] = 0;
  const ihdr = pngChunk('IHDR', ihdrData);

  // Filter byte 0x00 (None) prepended to each scanline — required by PNG spec
  const scanlineLen = width;
  const filtered = new Uint8Array(height * (1 + scanlineLen));
  for (let row = 0; row < height; row++) {
    filtered[row * (1 + scanlineLen)] = 0; // filter type: None
    filtered.set(pixels.subarray(row * scanlineLen, (row + 1) * scanlineLen), row * (1 + scanlineLen) + 1);
  }
  const idat = pngChunk('IDAT', zlibStore(filtered));

  const iend = pngChunk('IEND', new Uint8Array(0));

  const totalLen = sig.length + ihdr.length + idat.length + iend.length;
  const png = new Uint8Array(totalLen);
  let offset = 0;
  for (const part of [sig, ihdr, idat, iend]) {
    png.set(part, offset);
    offset += part.length;
  }
  return png;
}

/** Renders a luma grid to a true 8-bit grayscale PNG blob (color type 0 —
 * correctly identified as grayscale by Photoshop, GIMP, CorelDraw, etc.)
 * at the given pixel scale multiplier, with correct pHYs metadata for
 * `mmSize`. The 2x render keeps the same physical mm size at double the
 * pixel resolution and DPI. */
export function lumaToPhysicalPng(
  Y: Float64Array,
  nativeSize: number,
  scale: 1 | 2,
  mmSize: number
): Blob {
  const outSize = nativeSize * scale;

  // Build the scaled pixel array (8-bit, one byte per pixel)
  const pixels = new Uint8Array(outSize * outSize);
  for (let y = 0; y < outSize; y++) {
    for (let x = 0; x < outSize; x++) {
      const srcX = Math.min(nativeSize - 1, Math.floor(x / scale));
      const srcY = Math.min(nativeSize - 1, Math.floor(y / scale));
      pixels[y * outSize + x] = Math.min(255, Math.max(0, Math.round(Y[srcY * nativeSize + srcX])));
    }
  }

  const pngBytes = buildGrayscalePng(pixels, outSize, outSize);
  const pixelsPerMeter = mmToPixelsPerMeter(outSize, mmSize);
  const patched = injectPhysChunk(pngBytes, pixelsPerMeter);
  return new Blob([patched.buffer as ArrayBuffer], { type: 'image/png' });
}