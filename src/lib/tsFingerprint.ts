// TS Fingerprint marker — TypeScript POC using Reed-Solomon encoding.
//
// Fixed single spec (from the POC spec sheet):
//   final_px=120, outer_border=8, white_border=9, small_square=22
//   grid_px=104, cell_size=4px, grid_cells=26x26
//   Available cells: 26x26 - 10x10 (clear zone) = 676 - 100 = 576 cells
//   RS codeword: 144 bits (payloadCodecRS), fits exactly 4 copies in 576 cells
//
// Two POC simplifications vs production ts_fingerprint.py:
//   1. PRNG: SHA-256 XOR-folded to 32-bit -> mulberry32 (not PCG64)
//   2. RS parameters: GF(2^6)/144-bit (payloadCodecRS) not GF(2^8)/160-bit (reedsolo)
// Corner code squares omitted per POC spec.

import { mulberry32, generateMaskBits, xorBits } from './prng';
import { prepareTxBitsRS, resolveRxBitsRS } from './payloadCodecRS';

// ── Fixed spec ───────────────────────────────────────────────────────────────
export const TS_SPEC = {
  final_px: 120,
  outer_border: 8,
  white_border: 9,
  small_square: 22,
  grid_px: 104,
  cell_size: 4,
  grid_cells: 26,
  per_px_mm: 7 / 120,
  total_data_bits: 576,
  payload_bits: 144,   // RS codeword unit length (payloadCodecRS)
  copies: 4,           // 576 / 144 = 4 exact copies
};

export const WHITE = 255;
export const BLACK = 0;

// ── Seed helpers ──────────────────────────────────────────────────────────────
async function sha256Int(seedString: string): Promise<number> {
  const data = new TextEncoder().encode(seedString);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint32Array(hashBuffer);
  let seed = 0;
  for (let i = 0; i < hashArray.length; i++) seed = (seed ^ hashArray[i]) >>> 0;
  return seed;
}

// ── Available mask (cell-level) ───────────────────────────────────────────────
export function buildAvailableMask(): boolean[] {
  const gc = TS_SPEC.grid_cells;
  const cz_px = TS_SPEC.small_square + 2 * TS_SPEC.white_border; // 40px
  const cz_cells = Math.ceil(cz_px / TS_SPEC.cell_size);         // 10 cells
  const mask = new Array<boolean>(gc * gc).fill(true);
  for (let r = 0; r < cz_cells; r++)
    for (let c = 0; c < cz_cells; c++)
      mask[r * gc + c] = false;
  return mask;
}

// ── Grid painting ─────────────────────────────────────────────────────────────
async function paintGrid(
  fingerprintId: string,
  seed: string,
  maskSeed?: string
): Promise<Uint8Array> {
  const gc = TS_SPEC.grid_cells;
  const cs = TS_SPEC.cell_size;
  const gp = TS_SPEC.grid_px;

  const availMask = buildAvailableMask();
  const nCells = availMask.filter(Boolean).length; // 576

  // RS-encode the ID into a repeating bit stream using payloadCodecRS
  const seedInt = await sha256Int(seed);
  const { txBits } = prepareTxBitsRS(fingerprintId, nCells, seedInt);

  // Optional second XOR pass: mask/use-case seed for brand isolation
  let finalBits = txBits;
  if (maskSeed) {
    const maskSeedInt = await sha256Int(maskSeed + '_mask');
    const brandMask = generateMaskBits(maskSeedInt, nCells);
    finalBits = xorBits(txBits, brandMask);
  }

  // Place into cell grid and scale up to pixels
  const cellCanvas = new Uint8Array(gc * gc).fill(BLACK);
  let px = 0;
  for (let i = 0; i < gc * gc; i++) {
    if (availMask[i]) cellCanvas[i] = finalBits[px++] === 1 ? WHITE : BLACK;
  }

  const pixelCanvas = new Uint8Array(gp * gp);
  for (let cr = 0; cr < gc; cr++)
    for (let cc = 0; cc < gc; cc++) {
      const val = cellCanvas[cr * gc + cc];
      for (let pr = 0; pr < cs; pr++)
        for (let pc = 0; pc < cs; pc++)
          pixelCanvas[(cr * cs + pr) * gp + (cc * cs + pc)] = val;
    }
  return pixelCanvas;
}

// ── Full marker rendering ─────────────────────────────────────────────────────
export interface TsMarkerResult {
  pixels: Uint8Array;
  size: number;
  availableCells: number;
}

export async function generateTsMarker(
  fingerprintId: string,
  seed: string,
  maskSeed?: string
): Promise<TsMarkerResult> {
  const { final_px, outer_border, white_border, small_square, grid_px } = TS_SPEC;
  const S = final_px, B = outer_border, G = grid_px;
  const W = white_border, Q = small_square, CZ = Q + 2 * W;

  const gridCanvas = await paintGrid(fingerprintId, seed, maskSeed);
  const pixels = new Uint8Array(S * S).fill(BLACK);

  for (let r = B; r < B + G; r++)
    for (let c = B; c < B + G; c++)
      pixels[r * S + c] = WHITE;

  for (let r = 0; r < G; r++)
    for (let c = 0; c < G; c++)
      pixels[(B + r) * S + (B + c)] = gridCanvas[r * G + c];

  for (let r = B; r < B + CZ; r++)
    for (let c = B; c < B + CZ; c++)
      pixels[r * S + c] = WHITE;

  for (let r = B + W; r < B + W + Q; r++)
    for (let c = B + W; c < B + W + Q; c++)
      pixels[r * S + c] = BLACK;

  return { pixels, size: S, availableCells: 576 };
}

// ── Decode ────────────────────────────────────────────────────────────────────
export interface TsDecodeResult {
  fingerprintId: string | null;
  validCopies: number;
  totalCopies: number;
  errorsFixed: number;
  status: 'ok' | 'failed';
}

export async function decodeTsMarker(
  imageData: ImageData,
  seed: string,
  maskSeed?: string
): Promise<TsDecodeResult> {
  const { final_px, outer_border, grid_px, grid_cells, cell_size } = TS_SPEC;
  const S = final_px, B = outer_border, gc = grid_cells, cs = cell_size;

  if (imageData.width < S || imageData.height < S)
    throw new Error(`Image too small: ${imageData.width}x${imageData.height}px, need at least ${S}x${S}px`);

  // 1. Sample each cell (4×4 px → average → threshold at 127)
  const cellValues = new Uint8Array(gc * gc);
  for (let cr = 0; cr < gc; cr++)
    for (let cc = 0; cc < gc; cc++) {
      let sum = 0;
      for (let pr = 0; pr < cs; pr++)
        for (let pc = 0; pc < cs; pc++) {
          const row = B + cr * cs + pr;
          const col = B + cc * cs + pc;
          const idx = (row * imageData.width + col) * 4;
          sum += 0.299 * imageData.data[idx] + 0.587 * imageData.data[idx + 1] + 0.114 * imageData.data[idx + 2];
        }
      cellValues[cr * gc + cc] = sum / (cs * cs) > 127 ? 1 : 0;
    }

  // 2. Extract available cells
  const availMask = buildAvailableMask();
  const nCells = availMask.filter(Boolean).length;
  const extracted: number[] = [];
  for (let i = 0; i < gc * gc; i++)
    if (availMask[i]) extracted.push(cellValues[i]);

  // 3. Reverse brand mask if used (applied after RS mask on encode, so undo first)
  let rxBits = extracted;
  if (maskSeed) {
    const maskSeedInt = await sha256Int(maskSeed + '_mask');
    const brandMask = generateMaskBits(maskSeedInt, nCells);
    rxBits = xorBits(extracted, brandMask);
  }

  // 4. RS decode via resolveRxBitsRS (handles unmask + majority vote + RS correction)
  const seedInt = await sha256Int(seed);
  const result = resolveRxBitsRS(rxBits, seedInt);

  if (!result.message) {
    return { fingerprintId: null, validCopies: result.validCopies, totalCopies: result.totalCopies, errorsFixed: 0, status: 'failed' };
  }

  return {
    fingerprintId: result.message,
    validCopies: result.validCopies,
    totalCopies: result.totalCopies,
    errorsFixed: result.totalSymbolErrorsCorrected,
    status: 'ok',
  };
}
