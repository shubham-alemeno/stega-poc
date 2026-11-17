// Version-5 / EC-H QR fingerprint watermarking POC, black-modules-only.
// Ported from the sqr-black-poc Python prototype (D:\LabelBlind\Misc\sqr-black-poc):
// fixed version 5 / EC-H (37x37 modules, matching fingerprint_app/core/qr_gen.py's
// production spec), one DCT block per QR module (8px/module == 8x8 block, so no
// resize-then-delta mismatch), and the SAME seed -> random-bit algorithm already
// used by qrWatermarkPoc.ts (stringSeedToInt + mulberry32 via generateSeedBits) so
// an existing decoder re-deriving bits from the fingerprint ID needs no new logic.
//
// The key difference from qrWatermarkPoc.ts: white (light) modules are left
// byte-for-byte untouched — only blocks whose QR module is black get the DCT
// coefficient-pair embed.

import QRCode from 'qrcode';
import {
  dct8x8,
  idct8x8,
  embedBitInCoeffs,
  extractBitFromCoeffs,
  makeBlock,
  type Block8,
} from './dct';
import { generateSeedBits } from './qrWatermarkPoc';
import type { LayerSpec } from './multiEncode';
import { resizeBilinear } from './resize';
import { buildGrayscalePng, injectPhysChunk, mmToPixelsPerMeter } from './qrWatermarkPoc';

export const QR_VERSION = 5;
export const EC_LEVEL = 'H';
export const MODULE_COUNT = 17 + 4 * QR_VERSION; // 37
export const PX_PER_MODULE = 8;
export const CANONICAL_SIZE = MODULE_COUNT * PX_PER_MODULE; // 296 (600dpi)
export const TOTAL_BLOCKS = MODULE_COUNT * MODULE_COUNT; // 1369

export const FINGERPRINT_ID_LENGTH = 8;
const FINGERPRINT_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export const MIN_STRENGTH = 0;
export const MAX_STRENGTH = 2000;
export const DEFAULT_STRENGTH = 120;
export const DEFAULT_LAYERS: LayerSpec[] = [{ coeff1: { u: 3, v: 1 }, coeff2: { u: 1, v: 3 } }];

// 600dpi size (296px) is the canonical/native size itself; 300dpi is exactly
// half (148px = 4px/module). Both report the same physical mm size.
export const DPI_600_SIZE = CANONICAL_SIZE; // 296
export const DPI_300_SIZE = CANONICAL_SIZE / 2; // 148
export const PHYSICAL_MM_SIZE = (CANONICAL_SIZE / 600) * 25.4; // ~12.5173mm

export function generateFingerprintId(): string {
  let id = '';
  const bytes = new Uint32Array(FINGERPRINT_ID_LENGTH);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < FINGERPRINT_ID_LENGTH; i++) {
    id += FINGERPRINT_ALPHABET[bytes[i] % FINGERPRINT_ALPHABET.length];
  }
  return id;
}

export interface QrNativeWithModules {
  size: number; // CANONICAL_SIZE, px
  Y: Float64Array; // size*size, row-major luma (0 black .. 255 white)
  moduleDark: boolean[][]; // MODULE_COUNT x MODULE_COUNT, true = black module
}

/** Generates the fixed version-5/EC-H QR natively at 8px/module (296x296),
 * exposing per-module darkness so the embed step can skip white modules. */
export function generateQrNative(fingerprintId: string): QrNativeWithModules {
  if (fingerprintId.length !== FINGERPRINT_ID_LENGTH) {
    throw new Error(`Fingerprint ID must be exactly ${FINGERPRINT_ID_LENGTH} characters, got "${fingerprintId}"`);
  }

  const qr = QRCode.create(fingerprintId, { errorCorrectionLevel: EC_LEVEL, version: QR_VERSION });
  const moduleCount = qr.modules.size;
  if (moduleCount !== MODULE_COUNT) {
    throw new Error(`Unexpected module count ${moduleCount}, expected version ${QR_VERSION} (${MODULE_COUNT})`);
  }
  const data = new Uint8Array(qr.modules.data);
  const size = moduleCount * PX_PER_MODULE;

  const moduleDark: boolean[][] = Array.from({ length: moduleCount }, () => new Array<boolean>(moduleCount));
  const Y = new Float64Array(size * size);
  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      const dark = data[row * moduleCount + col] !== 0;
      moduleDark[row][col] = dark;
      const val = dark ? 0 : 255;
      for (let py = 0; py < PX_PER_MODULE; py++) {
        for (let px = 0; px < PX_PER_MODULE; px++) {
          Y[(row * PX_PER_MODULE + py) * size + (col * PX_PER_MODULE + px)] = val;
        }
      }
    }
  }

  return { size, Y, moduleDark };
}

/** Crisp QR render straight from the module grid at an arbitrary pixel
 * scale — no resampling filter, so module edges stay sharp at any size. */
export function renderModulesNative(moduleDark: boolean[][], pxPerModule: number): Float64Array {
  const moduleCount = moduleDark.length;
  const size = moduleCount * pxPerModule;
  const Y = new Float64Array(size * size);
  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      const val = moduleDark[row][col] ? 0 : 255;
      for (let py = 0; py < pxPerModule; py++) {
        for (let px = 0; px < pxPerModule; px++) {
          Y[(row * pxPerModule + py) * size + (col * pxPerModule + px)] = val;
        }
      }
    }
  }
  return Y;
}

export interface WatermarkResult {
  fingerprintId: string;
  nativeSize: number; // CANONICAL_SIZE
  original: Float64Array;
  watermarkedY: Float64Array;
  moduleDark: boolean[][];
  bits: number[]; // TOTAL_BLOCKS, full seed-derived stream
  blackBlockCount: number;
  layersApplied: number;
}

/** Embeds the seed-derived bit stream into the QR, ONE DCT block per QR
 * module (no grid resize needed — 8px/module already equals an 8x8 block),
 * but ONLY for blocks whose module is black. White modules are copied
 * through untouched. */
export function embedWatermarkBlackOnly(
  qr: QrNativeWithModules,
  fingerprintId: string,
  strength: number,
  layers: LayerSpec[] = DEFAULT_LAYERS
): WatermarkResult {
  if (layers.length === 0) throw new Error('At least one coefficient pair (layer) is required');
  if (strength < MIN_STRENGTH || strength > MAX_STRENGTH) {
    throw new Error(`strength must be between ${MIN_STRENGTH} and ${MAX_STRENGTH}, got ${strength}`);
  }

  const bits = generateSeedBits(fingerprintId, TOTAL_BLOCKS);
  const out = Float64Array.from(qr.Y);
  let blackBlockCount = 0;

  for (let row = 0; row < MODULE_COUNT; row++) {
    for (let col = 0; col < MODULE_COUNT; col++) {
      if (!qr.moduleDark[row][col]) continue; // never touch white modules
      blackBlockCount++;
      const blockIdx = row * MODULE_COUNT + col;
      const by = row * PX_PER_MODULE;
      const bx = col * PX_PER_MODULE;

      let block: Block8 = makeBlock();
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          block[y][x] = qr.Y[(by + y) * qr.size + (bx + x)];
        }
      }

      let F = dct8x8(block);
      const bit = bits[blockIdx] as 0 | 1;
      for (const layer of layers) {
        F = embedBitInCoeffs(F, bit, layer.coeff1, layer.coeff2, strength);
      }
      block = idct8x8(F);

      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          out[(by + y) * qr.size + (bx + x)] = Math.min(255, Math.max(0, block[y][x]));
        }
      }
    }
  }

  return {
    fingerprintId,
    nativeSize: qr.size,
    original: qr.Y,
    watermarkedY: out,
    moduleDark: qr.moduleDark,
    bits,
    blackBlockCount,
    layersApplied: layers.length,
  };
}

/** Extracts a bit from a block via one coefficient pair — used only for the
 * in-browser self-check (bit-match rate on black modules), not a real decoder. */
export function decodeBit(Y: Float64Array, size: number, row: number, col: number, coeff: LayerSpec): 0 | 1 {
  const by = row * PX_PER_MODULE;
  const bx = col * PX_PER_MODULE;
  const block: Block8 = makeBlock();
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) block[y][x] = Y[(by + y) * size + (bx + x)];
  }
  const F = dct8x8(block);
  return extractBitFromCoeffs(F, coeff.coeff1, coeff.coeff2);
}

export function blackModuleBitMatch(result: WatermarkResult, coeff: LayerSpec = DEFAULT_LAYERS[0]): { matched: number; total: number } {
  let matched = 0;
  let total = 0;
  for (let row = 0; row < MODULE_COUNT; row++) {
    for (let col = 0; col < MODULE_COUNT; col++) {
      if (!result.moduleDark[row][col]) continue;
      total++;
      const decoded = decodeBit(result.watermarkedY, result.nativeSize, row, col, coeff);
      const expected = result.bits[row * MODULE_COUNT + col];
      if (decoded === expected) matched++;
    }
  }
  return { matched, total };
}

// ---------------------------------------------------------------------------
// Output: 300dpi (148px) via delta-on-crisp-native, 600dpi (296px) direct.
// ---------------------------------------------------------------------------

function toPhysicalGrayscalePng(Y: Float64Array, size: number, mmSize: number): Blob {
  const pixels = new Uint8Array(size * size);
  for (let i = 0; i < pixels.length; i++) pixels[i] = Math.min(255, Math.max(0, Math.round(Y[i])));
  const pngBytes = buildGrayscalePng(pixels, size, size);
  const patched = injectPhysChunk(pngBytes, mmToPixelsPerMeter(size, mmSize));
  return new Blob([patched.buffer as ArrayBuffer], { type: 'image/png' });
}

export interface PhysicalOutputs {
  png600dpi: Blob;
  png300dpi: Blob;
}

/** 600dpi is the native 296px render, saved directly. 300dpi is built from
 * only the watermark's delta (watermarked - original), downsampled and added
 * onto a crisp native 148px (4px/module) render — so the sharp module edges
 * are never passed through a resampling filter, only the subtle watermark
 * perturbation is (a whole-image downscale instead blurs/rings the edges). */
export function renderPhysicalOutputs(result: WatermarkResult): PhysicalOutputs {
  const delta600 = new Float64Array(result.nativeSize * result.nativeSize);
  for (let i = 0; i < delta600.length; i++) delta600[i] = result.watermarkedY[i] - result.original[i];

  const delta300 = resizeBilinear(delta600, result.nativeSize, result.nativeSize, DPI_300_SIZE, DPI_300_SIZE);
  const native300 = renderModulesNative(result.moduleDark, DPI_300_SIZE / MODULE_COUNT);
  const Y300 = new Float64Array(DPI_300_SIZE * DPI_300_SIZE);
  for (let i = 0; i < Y300.length; i++) Y300[i] = Math.min(255, Math.max(0, native300[i] + delta300[i]));

  return {
    png600dpi: toPhysicalGrayscalePng(result.watermarkedY, DPI_600_SIZE, PHYSICAL_MM_SIZE),
    png300dpi: toPhysicalGrayscalePng(Y300, DPI_300_SIZE, PHYSICAL_MM_SIZE),
  };
}
