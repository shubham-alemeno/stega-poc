// TS Fingerprint marker — TypeScript port of ts_fingerprint.py for the POC.
//
// Fixed single spec (from the POC spec sheet):
//   final_px=120, outer_border=8, white_border=9, small_square=22
//   grid_px=104 (104/4 = 26 cells per side), cell_size=4px
//   Available cells: 26x26 - 10x10 (clear zone) = 676 - 100 = 576 cells
//   Payload: 160 bits, copies: 576/160 = 3.6
//
// Key difference from production: the 6 corner-code squares (bottom-left +
// bottom-right triangles) are OMITTED — those cells remain as noise. This
// is exactly why the spec shows 576 available (not 564 as in production).
// The clear zone (alignment square + white margin) IS kept.

import { mulberry32 } from './prng';

// ── Fixed spec ───────────────────────────────────────────────────────────────
export const TS_SPEC = {
  final_px: 120,
  outer_border: 8,
  white_border: 9,
  small_square: 22,
  grid_px: 104,             // final_px - 2*outer_border = 120 - 16
  cell_size: 4,             // px per cell: grid_px / grid_cells = 104/26
  grid_cells: 26,           // cells per side
  per_px_mm: 7 / 120,      // 7mm physical size
  total_data_bits: 576,     // available cells (26x26 - 10x10 clear zone)
  payload_bits: 160,        // 8-char ASCII = 64 bits, but spec uses 160 (RS-protected)
  copies: 3.6,              // 576 / 160
};

export const WHITE = 255;
export const BLACK = 0;

// ── Seed -> mask (cell-level) ─────────────────────────────────────────────────
// SHA-256 -> fold to 32-bit -> mulberry32. Not bit-for-bit identical to
// Python's PCG64 but deterministic for the POC — flagged in the UI.
async function sha256Int(seedString: string): Promise<number> {
  const data = new TextEncoder().encode(seedString);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint32Array(hashBuffer);
  let seed = 0;
  for (let i = 0; i < hashArray.length; i++) seed = (seed ^ hashArray[i]) >>> 0;
  return seed;
}

export async function makeMask(seedString: string, nCells: number): Promise<Uint8Array> {
  const seedInt = await sha256Int(seedString);
  const rand = mulberry32(seedInt);
  const mask = new Uint8Array(nCells);
  for (let i = 0; i < nCells; i++) mask[i] = rand() < 0.5 ? 1 : 0;
  return mask;
}

// ── Available mask (cell-level) ───────────────────────────────────────────────
// true = usable for noise, false = reserved (clear zone only, corners omitted).
export function buildAvailableMask(): boolean[] {
  const gc = TS_SPEC.grid_cells;    // 26
  const cz_px = TS_SPEC.small_square + 2 * TS_SPEC.white_border; // 40px
  const cz_cells = Math.ceil(cz_px / TS_SPEC.cell_size); // = 10 cells

  const mask = new Array<boolean>(gc * gc).fill(true);
  for (let r = 0; r < cz_cells; r++)
    for (let c = 0; c < cz_cells; c++)
      mask[r * gc + c] = false;
  return mask;
}

// ── Payload encoding ──────────────────────────────────────────────────────────
// 8-char ASCII -> 64 raw bits, repeated to fill 576 available cells (3.6x).
// Production uses Reed-Solomon (160 bits = 8 data + 12 parity bytes).
// POC uses raw repetition — flagged in UI.
export function encodeIdBits(fingerprintId: string): number[] {
  if (fingerprintId.length !== 8) throw new Error('TS Fingerprint ID must be exactly 8 characters');
  const bits: number[] = [];
  for (let i = 0; i < fingerprintId.length; i++) {
    const b = fingerprintId.charCodeAt(i);
    for (let k = 7; k >= 0; k--) bits.push((b >> k) & 1);
  }
  return bits; // 64 bits
}

export function fillAvailable(msgBits: number[], nCells: number): Uint8Array {
  const flat = new Uint8Array(nCells);
  for (let i = 0; i < nCells; i++) flat[i] = msgBits[i % msgBits.length];
  return flat;
}

// ── Grid painting (cell-level, then scale up to pixels) ──────────────────────
async function paintGrid(
  fingerprintId: string,
  seed: string,
  brandSeed?: string
): Promise<Uint8Array> {
  const gc = TS_SPEC.grid_cells;
  const cs = TS_SPEC.cell_size;
  const gp = TS_SPEC.grid_px;

  const availMask = buildAvailableMask();
  const nCells = availMask.filter(Boolean).length; // = 576

  // Layer 1: shared seed mask (ID encoding)
  const maskArr = await makeMask(seed, nCells);
  const msgBits = encodeIdBits(fingerprintId);
  const flat = fillAvailable(msgBits, nCells);

  // Layer 2: brand/use-case mask — applied as a second XOR pass on top of
  // the already-encoded noise. Independent of the ID encoding: the same
  // fingerprint ID + shared seed produces a completely different noise
  // pattern for each brand seed, making two use cases visually and
  // numerically distinct even when encoding the same ID.
  const brandMask = brandSeed
    ? await makeMask(brandSeed + '_brand', nCells)
    : null;

  // XOR with mask(s), place into cell grid
  const cellCanvas = new Uint8Array(gc * gc).fill(BLACK);
  let px = 0;
  for (let i = 0; i < gc * gc; i++) {
    if (availMask[i]) {
      let bit = flat[px] ^ maskArr[px];
      if (brandMask) bit = bit ^ brandMask[px];
      cellCanvas[i] = bit === 1 ? WHITE : BLACK;
      px++;
    }
  }

  // Scale cell grid up to pixel grid (each cell = cell_size x cell_size px)
  const pixelCanvas = new Uint8Array(gp * gp);
  for (let cr = 0; cr < gc; cr++) {
    for (let cc = 0; cc < gc; cc++) {
      const val = cellCanvas[cr * gc + cc];
      for (let pr = 0; pr < cs; pr++) {
        for (let pc = 0; pc < cs; pc++) {
          pixelCanvas[(cr * cs + pr) * gp + (cc * cs + pc)] = val;
        }
      }
    }
  }
  return pixelCanvas;
}

// ── Full marker rendering ─────────────────────────────────────────────────────
export interface TsMarkerResult {
  pixels: Uint8Array;    // final_px * final_px, 8-bit grayscale
  size: number;          // final_px
  availableCells: number; // 576
}

export async function generateTsMarker(
  fingerprintId: string,
  seed: string,
  brandSeed?: string
): Promise<TsMarkerResult> {
  const { final_px, outer_border, white_border, small_square, grid_px } = TS_SPEC;
  const S = final_px;   // 120
  const B = outer_border; // 8
  const G = grid_px;    // 104
  const W = white_border; // 9
  const Q = small_square; // 22
  const CZ = Q + 2 * W; // 40px clear zone

  const gridCanvas = await paintGrid(fingerprintId, seed, brandSeed);

  const pixels = new Uint8Array(S * S).fill(BLACK); // outer black border

  // White grid area
  for (let r = B; r < B + G; r++)
    for (let c = B; c < B + G; c++)
      pixels[r * S + c] = WHITE;

  // Paste noise grid
  for (let r = 0; r < G; r++)
    for (let c = 0; c < G; c++)
      pixels[(B + r) * S + (B + c)] = gridCanvas[r * G + c];

  // Clear zone (white)
  for (let r = B; r < B + CZ; r++)
    for (let c = B; c < B + CZ; c++)
      pixels[r * S + c] = WHITE;

  // Alignment square (black)
  for (let r = B + W; r < B + W + Q; r++)
    for (let c = B + W; c < B + W + Q; c++)
      pixels[r * S + c] = BLACK;

  // Corner code squares intentionally omitted (POC spec).

  return { pixels, size: S, availableCells: 576 };
}
