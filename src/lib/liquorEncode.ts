import { resizeBilinear } from './resize';
import { rgbToYCbCr, ycbcrToRgb } from './color';
import { dct8x8, idct8x8, embedBitInCoeffs, extractBitFromCoeffs, makeBlock, type CoeffPos, type Block8 } from './dct';
import { generateMaskBits } from './prng';
import { splitChannels, mergeChannels, type RgbaImage } from './imageStego';

export const MAX_STRENGTH_HINT = 2000;

// e = "multiple of 8" grid parameter, Liquor-POC-local only (does not touch
// the main app's fixed CANONICAL_SIZE/TOTAL_BLOCKS=256/1024 used elsewhere).
// canonical size = e*8 px per side, bit capacity = e*e (one bit per 8x8 block).
export const MIN_E = 1;
export const MAX_E = 256;
export const DEFAULT_E = 32; // matches the app's usual 256x256/1024-bit default

export function validateE(e: number): void {
  if (!Number.isInteger(e) || e < MIN_E || e > MAX_E) {
    throw new Error(`e must be an integer between ${MIN_E} and ${MAX_E}`);
  }
}

export function bitCapacity(e: number): number {
  return e * e;
}

export function canonicalSize(e: number): number {
  return e * 8;
}

/**
 * Deterministically generate the e*e-bit binary string from a seed. Plain
 * seeded PRNG output, used directly as the payload - NOT XOR-masked onto a
 * BCH codeword like the rest of the app's secret-message flow. There is no
 * codec layer here at all: these bits ARE what gets embedded, verbatim.
 */
export function generateLiquorBits(seed: number, e: number): number[] {
  validateE(e);
  return generateMaskBits(seed, bitCapacity(e));
}

export interface LiquorEncodeOptions {
  strength: number; // 0-2000
  seed: number;
  coeff1: CoeffPos;
  coeff2: CoeffPos;
  e: number; // multiple-of-8 grid parameter; canonical size = e*8, bits = e*e
}

export interface LiquorEncodeResult {
  image: RgbaImage; // same resolution as input
  bits: number[]; // the exact e*e bits embedded, in block order
  bitString: string; // same bits joined into a plain string
  e: number;
}

/**
 * Plain DCT coefficient-pair embedding of a raw e*e-bit string - no BCH, no
 * error correction, no PRNG-mask-XOR, no secret-message framing. Same
 * resolution-independent architecture as the rest of the app (downsample
 * to an e*8 canonical grid, embed via DCT, compute delta, upscale delta,
 * add onto the original), so output resolution always matches input
 * resolution regardless of e.
 */
export function encodeLiquorImage(input: RgbaImage, opts: LiquorEncodeOptions): LiquorEncodeResult {
  const { strength, seed, coeff1, coeff2, e } = opts;
  validateE(e);
  const size = canonicalSize(e);
  const totalBlocks = bitCapacity(e);
  const bits = generateLiquorBits(seed, e);

  const { R, G, B, A } = splitChannels(input);
  const Rc = resizeBilinear(R, input.width, input.height, size, size);
  const Gc = resizeBilinear(G, input.width, input.height, size, size);
  const Bc = resizeBilinear(B, input.width, input.height, size, size);
  const { Y, Cb, Cr } = rgbToYCbCr(Rc, Gc, Bc);
  const Yprime = Float64Array.from(Y);

  const blocksPerSide = e;
  for (let blockIdx = 0; blockIdx < totalBlocks; blockIdx++) {
    const blockRow = Math.floor(blockIdx / blocksPerSide);
    const blockCol = blockIdx % blocksPerSide;
    const by = blockRow * 8;
    const bx = blockCol * 8;

    const block: Block8 = makeBlock();
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        block[y][x] = Y[(by + y) * size + (bx + x)];
      }
    }

    const F = dct8x8(block);
    const bit = bits[blockIdx] as 0 | 1;
    const F2 = embedBitInCoeffs(F, bit, coeff1, coeff2, strength);
    const newBlock = idct8x8(F2);

    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        Yprime[(by + y) * size + (bx + x)] = newBlock[y][x];
      }
    }
  }

  const { R: Rcp, G: Gcp, B: Bcp } = ycbcrToRgb(Yprime, Cb, Cr);

  const deltaR = new Float64Array(size * size);
  const deltaG = new Float64Array(size * size);
  const deltaB = new Float64Array(size * size);
  for (let i = 0; i < deltaR.length; i++) {
    deltaR[i] = Rcp[i] - Rc[i];
    deltaG[i] = Gcp[i] - Gc[i];
    deltaB[i] = Bcp[i] - Bc[i];
  }

  const deltaRFull = resizeBilinear(deltaR, size, size, input.width, input.height);
  const deltaGFull = resizeBilinear(deltaG, size, size, input.width, input.height);
  const deltaBFull = resizeBilinear(deltaB, size, size, input.width, input.height);

  const n = input.width * input.height;
  const Rout = new Float64Array(n);
  const Gout = new Float64Array(n);
  const Bout = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    Rout[i] = Math.min(255, Math.max(0, R[i] + deltaRFull[i]));
    Gout[i] = Math.min(255, Math.max(0, G[i] + deltaGFull[i]));
    Bout[i] = Math.min(255, Math.max(0, B[i] + deltaBFull[i]));
  }

  const image = mergeChannels(Rout, Gout, Bout, A, input.width, input.height);
  const bitString = bits.join('');

  return { image, bits, bitString, e };
}

export interface LiquorExtractResult {
  bits: number[];
  bitString: string;
}

/**
 * Raw extraction counterpart: reads one bit per canonical block (e*e total)
 * via the given coefficient pair, no decoding/correction step (no codec to
 * decode against) - just the raw readout, for comparison against the
 * originally-exported bit string. `e` must match what was used at encode
 * time, same as seed/coefficient pair.
 */
export function extractLiquorBits(input: RgbaImage, coeff1: CoeffPos, coeff2: CoeffPos, e: number): LiquorExtractResult {
  validateE(e);
  const size = canonicalSize(e);
  const totalBlocks = bitCapacity(e);
  const blocksPerSide = e;

  const { R, G, B } = splitChannels(input);
  const Rc = resizeBilinear(R, input.width, input.height, size, size);
  const Gc = resizeBilinear(G, input.width, input.height, size, size);
  const Bc = resizeBilinear(B, input.width, input.height, size, size);
  const { Y } = rgbToYCbCr(Rc, Gc, Bc);

  const bits: number[] = [];
  for (let blockIdx = 0; blockIdx < totalBlocks; blockIdx++) {
    const blockRow = Math.floor(blockIdx / blocksPerSide);
    const blockCol = blockIdx % blocksPerSide;
    const by = blockRow * 8;
    const bx = blockCol * 8;

    const block: Block8 = makeBlock();
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        block[y][x] = Y[(by + y) * size + (bx + x)];
      }
    }
    const F = dct8x8(block);
    bits.push(extractBitFromCoeffs(F, coeff1, coeff2));
  }

  return { bits, bitString: bits.join('') };
}
