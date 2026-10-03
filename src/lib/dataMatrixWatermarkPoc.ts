// Data Matrix + DCT watermark POC — mirrors qrWatermarkPoc.ts's
// architecture exactly (resize-then-delta, mulberry32 seed bits, multi-
// layer coefficient-pair embedding, grayscale PNG output) but uses
// bwip-js to generate the Data Matrix symbol instead of the qrcode
// library.

import type { LayerSpec } from './multiEncode';
import { dct8x8, idct8x8, embedBitInCoeffs, makeBlock, type Block8 } from './dct';
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

export {
  lumaToPhysicalPng, computeGridGeometry, generateSeedBits,
  DEFAULT_SEED_STRING, DEFAULT_STRENGTH, DEFAULT_GRID_SIZE, DEFAULT_MM_SIZE,
  MIN_GRID_SIZE, MAX_GRID_SIZE, MIN_STRENGTH, MAX_STRENGTH, MAX_TEXT_LENGTH,
  type WatermarkResult,
};

export const DEFAULT_DM_SCALE = 4;
export const DEFAULT_DM_SIZE = 'auto';

export const DM_SIZES = [
  'auto',
  '10x10', '12x12', '14x14', '16x16', '18x18', '20x20',
  '22x22', '24x24', '26x26', '32x32', '36x36', '40x40',
  '44x44', '48x48', '52x52', '64x64',
] as const;
export type DmSize = typeof DM_SIZES[number];

/** Data capacity per symbol size — ISO/IEC 16022 Table 7.
 * `numeric`: max numeric-only characters.
 * `alpha`: max alphanumeric characters (letters, digits, punctuation). */
export const DM_CAPACITY: Record<string, { numeric: number; alpha: number }> = {
  '10x10': { numeric: 6,   alpha: 3   },
  '12x12': { numeric: 10,  alpha: 6   },
  '14x14': { numeric: 16,  alpha: 10  },
  '16x16': { numeric: 24,  alpha: 16  },
  '18x18': { numeric: 36,  alpha: 25  },
  '20x20': { numeric: 44,  alpha: 31  },
  '22x22': { numeric: 60,  alpha: 43  },
  '24x24': { numeric: 72,  alpha: 52  },
  '26x26': { numeric: 88,  alpha: 64  },
  '32x32': { numeric: 124, alpha: 91  },
  '36x36': { numeric: 172, alpha: 127 },
  '40x40': { numeric: 228, alpha: 169 },
  '44x44': { numeric: 288, alpha: 214 },
  '48x48': { numeric: 348, alpha: 259 },
  '52x52': { numeric: 408, alpha: 304 },
  '64x64': { numeric: 560, alpha: 418 },
};

export interface DataMatrixCanonical {
  size: number;
  Y: Float64Array;
}

const BWIP_CDN = 'https://cdn.jsdelivr.net/npm/bwip-js@4/dist/bwip-js.min.js';

function loadBwipScript(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((window as any).bwipjs) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${BWIP_CDN}"]`);
    if (existing) { existing.addEventListener('load', () => resolve()); return; }
    const s = document.createElement('script');
    s.src = BWIP_CDN;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load bwip-js from CDN'));
    document.head.appendChild(s);
  });
}

export async function generateDataMatrixNative(
  text: string,
  dmSize: DmSize,
  scale: number
): Promise<DataMatrixCanonical> {
  if (!text) throw new Error('Text cannot be empty');
  if (text.length > MAX_TEXT_LENGTH) throw new Error(`Text exceeds ${MAX_TEXT_LENGTH}-character limit`);

  // Load bwip-js from CDN rather than bundling it — bwip-js/browser uses
  // canvas APIs unavailable during SSR, and Next.js static analysis tries
  // to resolve dynamic imports at build time even with 'use client'.
  // Loading via Script injection sidesteps both issues entirely.
  await loadBwipScript();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bwip = (window as any).bwipjs;
  if (!bwip) throw new Error('bwip-js failed to load');

  const canvas = document.createElement('canvas');
  const opts: Record<string, unknown> = {
    bcid: 'datamatrix', text, scale,
    paddingwidth: 0, paddingheight: 0,
    backgroundcolor: 'ffffff', barcolor: '000000',
  };
  if (dmSize !== 'auto') opts.version = dmSize;

  bwip.toCanvas(canvas, opts);

  const size = Math.min(canvas.width, canvas.height);
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.getImageData(0, 0, size, size);
  const Y = new Float64Array(size * size);
  for (let i = 0; i < size * size; i++) {
    Y[i] = 0.299 * imgData.data[i * 4] + 0.587 * imgData.data[i * 4 + 1] + 0.114 * imgData.data[i * 4 + 2];
  }
  return { size, Y };
}

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
      const by = Math.floor(blockIdx / blocksPerSide) * 8;
      const bx = (blockIdx % blocksPerSide) * 8;
      const block: Block8 = makeBlock();
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++)
          block[y][x] = current[(by + y) * canonicalSize + (bx + x)];
      const F = dct8x8(block);
      const F2 = embedBitInCoeffs(F, seedBits[blockIdx] as 0 | 1, layer.coeff1, layer.coeff2, strength);
      const nb = idct8x8(F2);
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++)
          next[(by + y) * canonicalSize + (bx + x)] = nb[y][x];
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
    nativeSize: dm.size, watermarkedY, geometry, seedBits,
    seedBitsString: seedBits.join(''), layersApplied: layers.length,
  };
}
