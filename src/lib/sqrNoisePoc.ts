// SQR + Noise hybrid POC.
//
// The same generation logic as the SQR POC (src/lib/sqrPoc.ts, which mirrors the backend's
// sqr_generator.py), with two changes:
//
//   1. A 7x7 block of modules is replaced by a 56x56 pixel noise grid. The block's top-left module
//      is (noiseRow, noiseCol); the default is row 9, column 11 (modules 9..15 down, 11..17 across,
//      pixels y 72..127, x 88..143). The noise comes from the SAME seed as the watermark (CRC-32 of
//      the fingerprint ID -> mulberry32), row-major, from draw 0. Bit 1 is a black pixel, drawn in the
//      chosen gray level; bit 0 is a white pixel (255). The gray level only affects these noise pixels,
//      not the QR. The grid is 56 x 56 (3136 binary values, one per pixel) or 28 x 28 (784 binary
//      values, each filling a 2 x 2 pixel cell); either way it fills the same 56 x 56 pixel block.
//
//   2. The watermark is embedded exactly as before (one bit per 8x8 block), except that the 49 blocks
//      under the noise grid are skipped: the noise is never touched. 841 - 49 = 792 modules are
//      watermarked, so the reference binary string has 792 characters instead of 841. Moving the noise
//      moves the skipped blocks with it.
//
// Everything else is unchanged: Version 3-M QR, 8 px per module (232x232), dark = 0, light = 255,
// strength and coefficient pairs of your choice, truncation to 8 bit, 2x nearest-neighbour upscale,
// 8-bit grayscale PNG with DPI metadata.

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
export const NOISE_MODULE_COUNT = NOISE_MODULES * NOISE_MODULES; // 49
/** Modules that can be watermarked: the red area. 841 - 49 = 792. */
export const WATERMARKED_MODULES = TOTAL_BLOCKS - NOISE_MODULE_COUNT;

/** The top-left module of the noise block can be 0..22 in each direction (22 + 7 = 29). */
export const MAX_NOISE_POSITION = QR_MODULES - NOISE_MODULES;
/** Default position: modules 9..15 down, 11..17 across. */
export const DEFAULT_NOISE_ROW = 9;
export const DEFAULT_NOISE_COL = 11;

/** The noise grid resolution: 56 x 56 values (1 px each) or 28 x 28 values (2 x 2 px each). */
export const NOISE_GRID_SIZES = [56, 28] as const;
export type NoiseGridSize = (typeof NOISE_GRID_SIZES)[number];
export const DEFAULT_NOISE_GRID_SIZE: NoiseGridSize = 56;

/** Binary values in a noise grid of the given size: 3136 for 56, 784 for 28. */
export function noiseBitCount(gridSize: number): number {
  return gridSize * gridSize;
}

/** Throws unless the noise grid size is 56 or 28. */
export function validateNoiseGridSize(gridSize: number): void {
  if (!(NOISE_GRID_SIZES as readonly number[]).includes(gridSize))
    throw new Error(`Noise grid must be ${NOISE_GRID_SIZES.join(' or ')} (values per side)`);
}

export const DEFAULT_NOISE_GRAY = 64;
export const MIN_NOISE_GRAY = 0;
export const MAX_NOISE_GRAY = 255;

/** Throws unless (row, col) is a whole-number module position that keeps the 7x7 block inside the QR. */
export function validateNoisePosition(row: number, col: number): void {
  for (const [name, v] of [['row', row], ['column', col]] as const) {
    if (!Number.isInteger(v) || v < 0 || v > MAX_NOISE_POSITION)
      throw new Error(`Noise ${name} must be a whole number from 0 to ${MAX_NOISE_POSITION} (the 7x7 block has to fit inside the 29x29 QR)`);
  }
}

/** True when the module at (row, col) is under the 7x7 noise block whose top-left module is (noiseRow, noiseCol). */
export function isNoiseModule(
  row: number,
  col: number,
  noiseRow: number = DEFAULT_NOISE_ROW,
  noiseCol: number = DEFAULT_NOISE_COL
): boolean {
  return row >= noiseRow && row < noiseRow + NOISE_MODULES && col >= noiseCol && col < noiseCol + NOISE_MODULES;
}

// ---------------------------------------------------------------------------
// How much scan margin a position leaves
//
// A Version 3-M QR holds 70 codewords (44 data + 26 error correction) and corrects up to 13 wrong ones.
// Every module under the noise can be wrong, so the number of codewords the block touches is the
// worst-case damage. The layout below is the standard one (finder + separator, timing, the alignment
// pattern at 22,22, format information), and the codeword order is the standard zig-zag.
// ---------------------------------------------------------------------------

export const QR_TOTAL_CODEWORDS = 70;
export const QR_CORRECTABLE_CODEWORDS = 13;

let LAYOUT: { isFunction: boolean[][]; codewordOf: number[][] } | null = null;

function qrLayout(): { isFunction: boolean[][]; codewordOf: number[][] } {
  if (LAYOUT) return LAYOUT;
  const n = QR_MODULES;
  const fn: boolean[][] = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  const mark = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) fn[y][x] = true;
  };
  mark(0, 0, 7, 7); // finder + separator, top left
  mark(n - 8, 0, n - 1, 7); // top right
  mark(0, n - 8, 7, n - 1); // bottom left
  for (let i = 0; i < n; i++) {
    fn[6][i] = true; // timing patterns
    fn[i][6] = true;
  }
  mark(20, 20, 24, 24); // alignment pattern (Version 3: centre at 22,22)
  for (let i = 0; i <= 8; i++) {
    fn[8][i] = true; // format information, first copy
    fn[i][8] = true;
  }
  for (let i = 0; i < 8; i++) {
    fn[8][n - 1 - i] = true; // format information, second copy (includes the dark module at 8,21)
    fn[n - 1 - i][8] = true;
  }

  const codewordOf: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(-1));
  let i = 0;
  for (let right = n - 1; right >= 1; right -= 2) {
    const r = right <= 6 ? right - 1 : right; // skip the vertical timing column
    for (let vert = 0; vert < n; vert++)
      for (let j = 0; j < 2; j++) {
        const x = r - j;
        const upward = ((r + 1) & 2) === 0;
        const y = upward ? n - 1 - vert : vert;
        if (!fn[y][x] && i < QR_TOTAL_CODEWORDS * 8) {
          codewordOf[y][x] = Math.floor(i / 8);
          i++;
        }
      }
  }
  LAYOUT = { isFunction: fn, codewordOf };
  return LAYOUT;
}

export interface NoiseBlockInfo {
  /** Codewords (of 70) that have at least one module under the noise block. */
  codewordsTouched: number;
  /** Finder, separator, timing, alignment or format-information modules under the block. Any means the QR will not scan. */
  functionModules: number;
  /** How many wrong codewords a Version 3-M code corrects: 13. */
  correctable: number;
  /** correctable - codewordsTouched: damage the code can still absorb elsewhere (negative = cannot decode). */
  spare: number;
}

/** Scan margin for a noise block whose top-left module is (row, col). */
export function noiseBlockInfo(row: number, col: number): NoiseBlockInfo {
  validateNoisePosition(row, col);
  const { isFunction, codewordOf } = qrLayout();
  const touched = new Set<number>();
  let functionModules = 0;
  for (let y = row; y < row + NOISE_MODULES; y++)
    for (let x = col; x < col + NOISE_MODULES; x++) {
      if (isFunction[y][x]) functionModules++;
      else if (codewordOf[y][x] >= 0) touched.add(codewordOf[y][x]);
    }
  return {
    codewordsTouched: touched.size,
    functionModules,
    correctable: QR_CORRECTABLE_CODEWORDS,
    spare: QR_CORRECTABLE_CODEWORDS - touched.size,
  };
}

/** For tests: whether a module is a function pattern, and which codeword (or -1) it belongs to. */
export function qrModuleInfo(row: number, col: number): { isFunction: boolean; codeword: number } {
  const { isFunction, codewordOf } = qrLayout();
  return { isFunction: isFunction[row][col], codeword: codewordOf[row][col] };
}

// ---------------------------------------------------------------------------
// Noise grid
// ---------------------------------------------------------------------------

/** The noise bits for a seed (gridSize x gridSize of them): the same stream as the watermark, from draw 0. */
export function generateNoiseBits(seed: number, gridSize: number = NOISE_SIZE): Uint8Array {
  return generateMaskBits(seed, noiseBitCount(gridSize));
}

/**
 * The 56x56 pixel block, row-major. `bits` holds gridSize x gridSize values, row-major; each value fills a
 * (56 / gridSize) square of pixels: bit 1 becomes black pixels drawn in `gray`, bit 0 white pixels (255).
 */
export function buildNoiseGrid(bits: Uint8Array, gray: number, gridSize: number = NOISE_SIZE): Uint8Array {
  const cell = NOISE_SIZE / gridSize;
  const grid = new Uint8Array(NOISE_BITS);
  for (let y = 0; y < NOISE_SIZE; y++)
    for (let x = 0; x < NOISE_SIZE; x++)
      grid[y * NOISE_SIZE + x] = bits[Math.floor(y / cell) * gridSize + Math.floor(x / cell)] === 1 ? gray : 255;
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

/** Black and white modules of the QR outside the noise block. */
export function countWatermarkArea(
  modules: boolean[][],
  noiseRow: number = DEFAULT_NOISE_ROW,
  noiseCol: number = DEFAULT_NOISE_COL
): WatermarkAreaCounts {
  let black = 0;
  let white = 0;
  for (let row = 0; row < modules.length; row++)
    for (let col = 0; col < modules[row].length; col++) {
      if (isNoiseModule(row, col, noiseRow, noiseCol)) continue;
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
  /** Top-left module of the 7x7 noise block, 0..22 each. Defaults: row 9, column 11. */
  noiseRow?: number;
  noiseCol?: number;
  /** Noise grid resolution: 56 (default, 3136 values, 1 px each) or 28 (784 values, 2 x 2 px each). */
  noiseGridSize?: NoiseGridSize;
}

export interface SqrNoiseResult {
  fingerprintUrl: string;
  /** zlib.crc32(fingerprintId): the seed for both the watermark and the noise grid. */
  seed: number;
  colour: WatermarkColour;
  strength: number;
  coeffPairs: CoeffPair[];
  noiseGray: number;
  /** Top-left module of the noise block. */
  noiseRow: number;
  noiseCol: number;
  /** Noise grid resolution: values per side (56 or 28). */
  noiseGridSize: NoiseGridSize;
  /** Pixels per noise value, per side: 1 for the 56 grid, 2 for the 28 grid. */
  noiseCellPx: number;
  /** Codewords the block touches and what that leaves for scanning. */
  noiseInfo: NoiseBlockInfo;
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
  /** The noise grid's binary values, row-major (1 = black): 3136 chars for the 56 grid, 784 for the 28 grid. */
  noiseBitsString: string;
  /** Noise values that are 1 (black). */
  noiseBlackCells: number;
  /** Black pixels in the 56x56 block: noiseBlackCells x noiseCellPx squared. */
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
  const noiseRow = opts.noiseRow ?? DEFAULT_NOISE_ROW;
  const noiseCol = opts.noiseCol ?? DEFAULT_NOISE_COL;
  const noiseGridSize: NoiseGridSize = opts.noiseGridSize ?? DEFAULT_NOISE_GRID_SIZE;

  if (!fingerprintId) throw new Error('Fingerprint ID is empty');
  if (!(mmSize > 0)) throw new Error('Size in mm must be greater than 0');
  if (!Number.isInteger(strength) || strength < MIN_STRENGTH || strength > MAX_STRENGTH)
    throw new Error(`Strength must be a whole number from ${MIN_STRENGTH} to ${MAX_STRENGTH}`);
  if (!Number.isInteger(noiseGray) || noiseGray < MIN_NOISE_GRAY || noiseGray > MAX_NOISE_GRAY)
    throw new Error(`Noise gray level must be a whole number from ${MIN_NOISE_GRAY} to ${MAX_NOISE_GRAY}`);
  validateNoisePosition(noiseRow, noiseCol);
  validateNoiseGridSize(noiseGridSize);
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
  const counts = countWatermarkArea(modules, noiseRow, noiseCol);

  const seed = crc32(fingerprintId);
  const bits = generateMaskBits(seed, TOTAL_BLOCKS);
  const noiseBits = generateNoiseBits(seed, noiseGridSize);
  const noiseGrid = buildNoiseGrid(noiseBits, noiseGray, noiseGridSize);
  const noiseCellPx = NOISE_SIZE / noiseGridSize;
  const noiseBlackCells = noiseBits.reduce((n, b) => n + b, 0);

  // 1. The plain QR, with the 7x7 modules at the noise position replaced by the noise grid.
  const canonical = renderCanonical(modules);
  const startY = noiseRow * BLOCK_SIZE;
  const startX = noiseCol * BLOCK_SIZE;
  for (let y = 0; y < NOISE_SIZE; y++)
    for (let x = 0; x < NOISE_SIZE; x++)
      canonical[(startY + y) * CANONICAL_SIZE + (startX + x)] = noiseGrid[y * NOISE_SIZE + x];

  // 2. Watermark the red area only. The 49 blocks under the noise are skipped, so the noise stays as it is.
  const out = Float64Array.from(canonical);
  const maskChars: string[] = [];
  const refChars: string[] = [];
  let selectedCount = 0;

  for (let idx = 0; idx < TOTAL_BLOCKS; idx++) {
    const row = Math.floor(idx / QR_MODULES);
    const col = idx % QR_MODULES;
    const dark = modules[row][col];
    const selected = !isNoiseModule(row, col, noiseRow, noiseCol) && (colour === 'all' || (colour === 'black' ? dark : !dark));
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
    noiseRow,
    noiseCol,
    noiseGridSize,
    noiseCellPx,
    noiseInfo: noiseBlockInfo(noiseRow, noiseCol),
    counts,
    selectedCount,
    refBinaryString: refChars.join(''),
    fullBinaryString: Array.from(bits).join(''),
    maskString: maskChars.join(''),
    noiseBitsString: Array.from(noiseBits).join(''),
    noiseBlackCells,
    noiseBlackPixels: noiseBlackCells * noiseCellPx * noiseCellPx,
    pixels1x,
    pixels2x,
    size1x: CANONICAL_SIZE,
    size2x,
    dpi2x: baseDpi * 2,
  };
}