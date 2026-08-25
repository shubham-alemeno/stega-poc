import { resizeBilinear } from './resize';
import { rgbToYCbCr, ycbcrToRgb } from './color';
import { dct8x8, idct8x8, embedBitInCoeffs, extractBitFromCoeffs, makeBlock, type CoeffPos, type Block8 } from './dct';
import { generateMaskBits } from './prng';
import {
  CANONICAL_SIZE,
  BLOCK_COUNT_PER_SIDE,
  TOTAL_BLOCKS,
  splitChannels,
  mergeChannels,
  type RgbaImage,
} from './imageStego';

export const LIQUOR_BIT_COUNT = TOTAL_BLOCKS; // 1024, exactly 1 bit per canonical block - no padding, no truncation
export const MAX_STRENGTH_HINT = 2000;

/**
 * Deterministically generate the 1024-bit binary string from a seed. Plain
 * seeded PRNG output, used directly as the payload - NOT XOR-masked onto a
 * BCH codeword like the rest of the app's secret-message flow. There is no
 * codec layer here at all: these bits ARE what gets embedded, verbatim.
 */
export function generateLiquorBits(seed: number): number[] {
  return generateMaskBits(seed, LIQUOR_BIT_COUNT);
}

export interface LiquorEncodeOptions {
  strength: number; // 0-2000
  seed: number;
  coeff1: CoeffPos;
  coeff2: CoeffPos;
}

export interface LiquorEncodeResult {
  image: RgbaImage; // same resolution as input
  bits: number[]; // the exact 1024 bits embedded, in block order
  bitString: string; // same bits joined into a plain string, e.g. "0110010..."
}

/**
 * Plain DCT coefficient-pair embedding of a raw 1024-bit string - no BCH,
 * no error correction, no PRNG-mask-XOR, no secret-message framing. Uses
 * the same resolution-independent canonical-256 + residual-delta-masking
 * architecture as the rest of the app (downsample to 256x256, embed via
 * DCT, compute delta, upscale delta, add onto the original), so output
 * resolution always matches input resolution.
 */
export function encodeLiquorImage(input: RgbaImage, opts: LiquorEncodeOptions): LiquorEncodeResult {
  const { strength, seed, coeff1, coeff2 } = opts;
  const bits = generateLiquorBits(seed);

  const { R, G, B, A } = splitChannels(input);
  const R256 = resizeBilinear(R, input.width, input.height, CANONICAL_SIZE, CANONICAL_SIZE);
  const G256 = resizeBilinear(G, input.width, input.height, CANONICAL_SIZE, CANONICAL_SIZE);
  const B256 = resizeBilinear(B, input.width, input.height, CANONICAL_SIZE, CANONICAL_SIZE);
  const { Y, Cb, Cr } = rgbToYCbCr(R256, G256, B256);
  const Yprime = Float64Array.from(Y);

  for (let blockIdx = 0; blockIdx < TOTAL_BLOCKS; blockIdx++) {
    const blockRow = Math.floor(blockIdx / BLOCK_COUNT_PER_SIDE);
    const blockCol = blockIdx % BLOCK_COUNT_PER_SIDE;
    const by = blockRow * 8;
    const bx = blockCol * 8;

    const block: Block8 = makeBlock();
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        block[y][x] = Y[(by + y) * CANONICAL_SIZE + (bx + x)];
      }
    }

    const F = dct8x8(block);
    const bit = bits[blockIdx] as 0 | 1;
    const F2 = embedBitInCoeffs(F, bit, coeff1, coeff2, strength);
    const newBlock = idct8x8(F2);

    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        Yprime[(by + y) * CANONICAL_SIZE + (bx + x)] = newBlock[y][x];
      }
    }
  }

  const { R: R256p, G: G256p, B: B256p } = ycbcrToRgb(Yprime, Cb, Cr);

  const deltaR256 = new Float64Array(CANONICAL_SIZE * CANONICAL_SIZE);
  const deltaG256 = new Float64Array(CANONICAL_SIZE * CANONICAL_SIZE);
  const deltaB256 = new Float64Array(CANONICAL_SIZE * CANONICAL_SIZE);
  for (let i = 0; i < deltaR256.length; i++) {
    deltaR256[i] = R256p[i] - R256[i];
    deltaG256[i] = G256p[i] - G256[i];
    deltaB256[i] = B256p[i] - B256[i];
  }

  const deltaRFull = resizeBilinear(deltaR256, CANONICAL_SIZE, CANONICAL_SIZE, input.width, input.height);
  const deltaGFull = resizeBilinear(deltaG256, CANONICAL_SIZE, CANONICAL_SIZE, input.width, input.height);
  const deltaBFull = resizeBilinear(deltaB256, CANONICAL_SIZE, CANONICAL_SIZE, input.width, input.height);

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

  return { image, bits, bitString };
}

export interface LiquorExtractResult {
  bits: number[];
  bitString: string;
}

/**
 * Raw extraction counterpart: reads one bit per canonical block via the
 * given coefficient pair, no decoding/correction step at all (there is no
 * codec here to decode against) - just the raw 1024-bit readout, for
 * comparison against the originally-exported bit string.
 */
export function extractLiquorBits(input: RgbaImage, coeff1: CoeffPos, coeff2: CoeffPos): LiquorExtractResult {
  const { R, G, B } = splitChannels(input);
  const R256 = resizeBilinear(R, input.width, input.height, CANONICAL_SIZE, CANONICAL_SIZE);
  const G256 = resizeBilinear(G, input.width, input.height, CANONICAL_SIZE, CANONICAL_SIZE);
  const B256 = resizeBilinear(B, input.width, input.height, CANONICAL_SIZE, CANONICAL_SIZE);
  const { Y } = rgbToYCbCr(R256, G256, B256);

  const bits: number[] = [];
  for (let blockIdx = 0; blockIdx < TOTAL_BLOCKS; blockIdx++) {
    const blockRow = Math.floor(blockIdx / BLOCK_COUNT_PER_SIDE);
    const blockCol = blockIdx % BLOCK_COUNT_PER_SIDE;
    const by = blockRow * 8;
    const bx = blockCol * 8;

    const block: Block8 = makeBlock();
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        block[y][x] = Y[(by + y) * CANONICAL_SIZE + (bx + x)];
      }
    }
    const F = dct8x8(block);
    bits.push(extractBitFromCoeffs(F, coeff1, coeff2));
  }

  return { bits, bitString: bits.join('') };
}
