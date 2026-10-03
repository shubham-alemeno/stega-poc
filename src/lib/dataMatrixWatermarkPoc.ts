// Data Matrix + DCT watermark POC — mirrors qrWatermarkPoc.ts's
// architecture exactly (resize-then-delta, mulberry32 seed bits, multi-
// layer coefficient-pair embedding, grayscale PNG output) but uses
// bwip-js to generate the Data Matrix symbol instead of the qrcode
// library. Data Matrix is an ISO/IEC 16022 2D barcode, commonly used
// as an alternative to QR in packaging and industrial contexts.
//
// Data Matrix parameters exposed:
//   - Text (data to encode)
//   - Symbol size: "square" auto-sizing or a fixed NxN option
//   - Scale: px per module (affects native render size)
//
// Everything else (seed, strength, grid size, coefficient pairs, mm
// sizing) works identically to the QR path.

import type { LayerSpec } from './multiEncode';
import {
  dct8x8,
  idct8x8,
  embedBitInCoeffs,
  makeBlock,
  type Block8,
} from './dct';
import { mulberry32 } from './prng';
import { resizeBilinear } from './resize';
import {
  lumaToPhysicalPng,
  computeGridGeometry,
  generateSeedBits,
  type WatermarkResult,
  DEFAULT_SEED_STRING,
  DEFAULT_STRENGTH,
  DEFAULT_GRID_SIZE,
  DEFAULT_MM_SIZE,
  MIN_GRID_SIZE,
  MAX_GRID_SIZE,
  MIN_STRENGTH,
  MAX_STRENGTH,
  MAX_TEXT_LENGTH,
} from './qrWatermarkPoc';

// Re-export shared constants so the page only needs one import
export {
  lumaToPhysicalPng,
  computeGridGeometry,
  generateSeedBits,
  DEFAULT_SEED_STRING,
  DEFAULT_STRENGTH,
  DEFAULT_GRID_SIZE,
  DEFAULT_MM_SIZE,
  MIN_GRID_SIZE,
  MAX_GRID_SIZE,
  MIN_STRENGTH,
  MAX_STRENGTH,
  MAX_TEXT_LENGTH,
  type WatermarkResult,
};

export const DEFAULT_DM_SCALE = 4; // px per module in the native bwip render
export const DEFAULT_DM_SIZE = 'auto'; // 'auto' = smallest that fits; or e.g. '16x16'

// Subset of valid square Data Matrix symbol sizes per ISO/IEC 16022.
// 'auto' lets bwip-js choose the smallest symbol that fits the data.
export const DM_SIZES = [
  'auto',
  '10x10', '12x12', '14x14', '16x16', '18x18', '20x20',
  '22x22', '24x24', '26x26', '32x32', '36x36', '40x40',
  '44x44', '48x48', '52x52', '64x64',
] as const;
export type DmSize = typeof DM_SIZES[number];

export interface DataMatrixCanonical {
  size: number;       // native pixel size (square)
  Y: Float64Array;    // native-resolution luma, row-major, size*size
}

/**
 * Generates a Data Matrix symbol via bwip-js's browser build and
 * extracts its luma channel as a Float64Array at native resolution.
 *
 * bwip-js's `toCanvas` renders onto a provided HTMLCanvasElement — we
 * create one in-memory (no DOM attachment needed), read back the RGBA
 * pixels, and convert to luma using the standard BT.601 coefficients,
 * matching how PIL and the Python backend handle YCbCr conversion.
 */
export async function generateDataMatrixNative(
  text: string,
  dmSize: DmSize,
  scale: number
): Promise<DataMatrixCanonical> {
  if (!text) throw new Error('Text cannot be empty');
  if (text.length > MAX_TEXT_LENGTH) throw new Error(`Text exceeds ${MAX_TEXT_LENGTH}-character limit`);

  // bwip-js browser build is a UMD module — import dynamically so Next.js
  // doesn't try to bundle the Node build (which requires native deps).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bwip = (await import('bwip-js/browser')) as any;

  const canvas = document.createElement('canvas');
  const opts: Record<string, unknown> = {
    bcid: 'datamatrix',
    text,
    scale,
    paddingwidth: 0,
    paddingheight: 0,
    backgroundcolor: 'ffffff',
    barcolor: '000000',
  };
  if (dmSize !== 'auto') {
    // bwip-js accepts Data Matrix symbol size as "version" in RowsxCols form
    opts.version = dmSize;
  }

  bwip.toCanvas(canvas, opts);

  const w = canvas.width;
  const h = canvas.height;
  // Use the smaller dimension as the canonical square size — bwip
  // produces a square canvas for square Data Matrix symbols; if padding
  // accidentally makes one dimension slightly larger, crop to the smaller.
  const size = Math.min(w, h);

  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.getImageData(0, 0, size, size);
  const Y = new Float64Array(size * size);
  for (let i = 0; i < size * size; i++) {
    const r = imgData.data[i * 4];
    const g = imgData.data[i * 4 + 1];
    const b = imgData.data[i * 4 + 2];
    // BT.601 luma — same weights Python PIL uses for YCbCr conversion
    Y[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  return { size, Y };
}

/**
 * Embeds seed-derived random bits into the Data Matrix, using the same
 * resize-then-delta architecture as the QR path in qrWatermarkPoc.ts.
 * Identical logic — the only difference is the carrier (Data Matrix vs QR).
 */
export function embedWatermarkGridDM(
  dm: DataMatrixCanonical,
  gridSize: number,
  layers: LayerSpec[],
  strength: number,
  seedString: string
): WatermarkResult {
  if (layers.length === 0) throw new Error('At least one coefficient pair (layer) is required');

  const geometry = computeGridGeometry(gridSize);
  const { canonicalSize, bitCapacity } = geometry;
  const seedBits = generateSeedBits(seedString, bitCapacity);

  const canonicalY = resizeBilinear(dm.Y, dm.size, dm.size, canonicalSize, canonicalSize);
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
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++)
          block[y][x] = current[(by + y) * canonicalSize + (bx + x)];

      const F = dct8x8(block);
      const bit = seedBits[blockIdx] as 0 | 1;
      const F2 = embedBitInCoeffs(F, bit, layer.coeff1, layer.coeff2, strength);
      const newBlock = idct8x8(F2);

      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++)
          next[(by + y) * canonicalSize + (bx + x)] = newBlock[y][x];
    }
    current = next;
  }

  const delta = new Float64Array(canonicalSize * canonicalSize);
  for (let i = 0; i < delta.length; i++) delta[i] = current[i] - canonicalY[i];

  const deltaNative = resizeBilinear(delta, canonicalSize, canonicalSize, dm.size, dm.size);
  const watermarkedY = new Float64Array(dm.size * dm.size);
  for (let i = 0; i < watermarkedY.length; i++)
    watermarkedY[i] = Math.min(255, Math.max(0, dm.Y[i] + deltaNative[i]));

  return {
    nativeSize: dm.size,
    watermarkedY,
    geometry,
    seedBits,
    seedBitsString: seedBits.join(''),
    layersApplied: layers.length,
  };
}
