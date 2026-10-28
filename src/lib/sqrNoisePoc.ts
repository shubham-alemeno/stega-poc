// SQR + Noise hybrid POC.
//
// The same generation logic as the SQR POC (src/lib/sqrPoc.ts, which mirrors the backend's
// sqr_generator.py), with two changes in the middle of the QR:
//
//   1. The 7x7 modules at the centre (modules 11..17 in both directions, pixels 88..143: the
//      place where the emblem goes) are replaced by a 56x56 pixel noise grid. The noise comes from
//      the SAME seed as the watermark (CRC-32 of the fingerprint ID -> mulberry32): 56 x 56 = 3136
//      bits, row-major, from draw 0. Bit 1 is a black pixel, drawn in the chosen gray level; bit 0
//      is a white pixel (255). The gray level only affects these noise pixels, not the QR.
//
//   2. The watermark is embedded exactly as before (one bit per 8x8 block), except that the 49
//      centre blocks are skipped: the noise grid is never touched. 841 - 49 = 792 modules are
//      watermarked, so the reference binary string has 792 characters instead of 841.
//
// Everything else is unchanged: Version 3-M QR, 8 px per module (232x232), dark = 0, light = 255,
// strength and coefficient pairs of your choice, truncation to 8 bit, 2x nearest-neighbour
// upscale, 8-bit grayscale PNG with DPI metadata.

import { QrDataTooLongError } from './qrV3M';
import {
  BLOCK_SIZE,
  CANONICAL_SIZE,
  DEFAULT_COEFF_PAIRS,
  MAX_QR_BYTES,
  MAX_STRENGTH,
  MIN_STRENGTH,
  QR_MODULES,
  TOTAL_BLOCKS,
  buildQrModules,
  crc32,
  embedBlock,
  generateMaskBits,
  renderCanonical,
  validateCoeffPairs,
  type CoeffPair,
  type WatermarkColour,
} from './sqrPoc';

/** The noise grid covers 7 x 7 modules. */
export const NOISE_MODULES = 7;
/** 8 pixels per module, so 56 pixels. */
export const NOISE_SIZE = NOISE_MODULES * BLOCK_SIZE;
/** One binary value per noise pixel: 56 x 56 = 3136. */
export const NOISE_BITS = NOISE_SIZE * NOISE_SIZE;
/** First module (row and column) of the centred 7x7 block: (29 - 7) / 2 = 11. */
export const NOISE_START_MODULE = (QR_MODULES - NOISE_MODULES) / 2;
/** First pixel (row and column) of the noise grid: 88. */
export const NOISE_START_PX = NOISE_START_MODULE * BLOCK_SIZE;
export const NOISE_MODULE_COUNT = NOISE_MODULES * NOISE_MODULES; // 49
/** Modules that can be watermarked: the red area. 841 - 49 = 792. */
export const WATERMARKED_MODULES = TOTAL_BLOCKS - NOISE_MODULE_COUNT;

export const DEFAULT_NOISE_GRAY = 64;
export const MIN_NOISE_GRAY = 0;
export const MAX_NOISE_GRAY = 255;

/** True when the module at (row, col) is inside the centre 7x7 block (the noise grid). */
export function isNoiseModule(row: number, col: number): boolean {
  return (
    row >= NOISE_START_MODULE &&
    row < NOISE_START_MODULE + NOISE_MODULES &&
    col >= NOISE_START_MODULE &&
    col < NOISE_START_MODULE + NOISE_MODULES
  );
}

/** The 3136 noise bits for a seed: the same stream as the watermark, from draw 0. */
export function generateNoiseBits(seed: number): Uint8Array {
  return generateMaskBits(seed, NOISE_BITS);
}

/** 56x56 pixels, row-major: bit 1 becomes a black pixel drawn in `gray`, bit 0 a white pixel. */
export function buildNoiseGrid(bits: Uint8Array, gray: number): Uint8Array {
  const grid = new Uint8Array(NOISE_BITS);
  for (let i = 0; i < NOISE_BITS; i++) grid[i] = bits[i] === 1 ? gray : 255;
  return grid;
}

export interface WatermarkAreaCounts {
  /** Modules outside the noise grid (792). */
  total: number;
  black: number;
  white: number;
  /** Modules replaced by the noise grid (49). */
  noiseModules: number;
}

/** Black and white modules of the QR outside the centre 7x7 block. */
export function countWatermarkArea(modules: boolean[][]): WatermarkAreaCounts {
  let black = 0;
  let white = 0;
  for (let row = 0; row < modules.length; row++)
    for (let col = 0; col < modules[row].length; col++) {
      if (isNoiseModule(row, col)) continue;
      if (modules[row][col]) black++;
      else white++;
    }
  return { total: black + white, black, white, noiseModules: NOISE_MODULE_COUNT };
}

export interface SqrNoiseOptions {
  prefix: string;
  fingerprintId: string;
  strength: number;
  mmSize: number;
  /** Which modules of the red area to watermark: 'all' (792, the default for this experiment), 'black' or 'white'. */
  colour?: WatermarkColour;
  coeffPairs?: CoeffPair[];
  /** Gray level (0 to 255) of the black pixels of the noise grid. */
  noiseGray: number;
}

export interface SqrNoiseResult {
  fingerprintUrl: string;
  /** zlib.crc32(fingerprintId): the seed for both the watermark and the noise grid. */
  seed: number;
  colour: WatermarkColour;
  strength: number;
  coeffPairs: CoeffPair[];
  noiseGray: number;
  /** Black and white modules outside the noise grid. */
  counts: WatermarkAreaCounts;
  /** Modules actually watermarked (792 for 'all'). */
  selectedCount: number;
  /**
   * One bit per watermarked module, row-major. The bit for module i is draw i of the 841-draw
   * sequence, so this is the standard SQR string with the 49 noise positions (and, for 'black' or
   * 'white', the other colour's positions) left out.
   */
  refBinaryString: string;
  /** The standard 841-bit SQR string for this ID. */
  fullBinaryString: string;
  /** 841 chars, '1' where the module was watermarked. */
  maskString: string;
  /** 3136 chars: the noise grid's binary values, row-major (1 = black pixel). */
  noiseBitsString: string;
  /** Black pixels in the noise grid. */
  noiseBlackPixels: number;
  /** 232x232 8-bit grayscale pixels (1x). */
  pixels1x: Uint8Array;
  /** 464x464 8-bit grayscale pixels (2x, nearest neighbour). */
  pixels2x: Uint8Array;
  size1x: number;
  size2x: number;
  /** DPI written to the 2x PNG. */
  dpi2x: number;
}

export function generateSqrNoisePoc(opts: SqrNoiseOptions): SqrNoiseResult {
  const { prefix, fingerprintId, strength, mmSize, noiseGray } = opts;
  const colour: WatermarkColour = opts.colour ?? 'all';
  const pairs = opts.coeffPairs ?? DEFAULT_COEFF_PAIRS;

  if (!fingerprintId) throw new Error('Fingerprint ID is empty');
  if (!(mmSize > 0)) throw new Error('Size in mm must be greater than 0');
  if (!Number.isInteger(strength) || strength < MIN_STRENGTH || strength > MAX_STRENGTH)
    throw new Error(`Strength must be a whole number from ${MIN_STRENGTH} to ${MAX_STRENGTH}`);
  if (!Number.isInteger(noiseGray) || noiseGray < MIN_NOISE_GRAY || noiseGray > MAX_NOISE_GRAY)
    throw new Error(`Noise gray level must be a whole number from ${MIN_NOISE_GRAY} to ${MAX_NOISE_GRAY}`);
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
  const counts = countWatermarkArea(modules);

  const seed = crc32(fingerprintId);
  const bits = generateMaskBits(seed, TOTAL_BLOCKS);
  const noiseBits = generateNoiseBits(seed);
  const noiseGrid = buildNoiseGrid(noiseBits, noiseGray);

  // 1. The plain QR, with the centre 7x7 modules replaced by the noise grid.
  const canonical = renderCanonical(modules);
  for (let y = 0; y < NOISE_SIZE; y++)
    for (let x = 0; x < NOISE_SIZE; x++)
      canonical[(NOISE_START_PX + y) * CANONICAL_SIZE + (NOISE_START_PX + x)] = noiseGrid[y * NOISE_SIZE + x];

  // 2. Watermark the red area only. The 49 centre blocks are skipped, so the noise stays as it is.
  const out = Float64Array.from(canonical);
  const maskChars: string[] = [];
  const refChars: string[] = [];
  let selectedCount = 0;

  for (let idx = 0; idx < TOTAL_BLOCKS; idx++) {
    const row = Math.floor(idx / QR_MODULES);
    const col = idx % QR_MODULES;
    const dark = modules[row][col];
    const selected = !isNoiseModule(row, col) && (colour === 'all' || (colour === 'black' ? dark : !dark));
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

  // Clip, then truncate to 8-bit (numpy astype(uint8) truncates). The tiny epsilon stops
  // floating-point noise on an exactly cancelled white pixel (255 + ~1e-14) truncating it to 254.
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
    noiseGray,
    counts,
    selectedCount,
    refBinaryString: refChars.join(''),
    fullBinaryString: Array.from(bits).join(''),
    maskString: maskChars.join(''),
    noiseBitsString: Array.from(noiseBits).join(''),
    noiseBlackPixels: noiseBits.reduce((n, b) => n + b, 0),
    pixels1x,
    pixels2x,
    size1x: CANONICAL_SIZE,
    size2x,
    dpi2x: baseDpi * 2,
  };
}