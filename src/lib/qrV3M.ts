/*
 * QR Code encoder restricted to Version 3, error correction MEDIUM (29x29 modules).
 *
 * Ported from Project Nayuki's QR Code generator library (the same algorithm the
 * backend's Python `qrcodegen` runs), reduced to what SQR needs: fixed version 3,
 * ECC MEDIUM, no ECC boost, automatic mask. Segment mode is chosen like
 * QrSegment.make_segments (numeric, else alphanumeric, else UTF-8 bytes).
 *
 * Original: Copyright (c) Project Nayuki. (MIT License)
 * https://www.nayuki.io/page/qr-code-generator-library
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 * - The above copyright notice and this permission notice shall be included in
 *   all copies or substantial portions of the Software.
 * - The Software is provided "as is", without warranty of any kind, express or
 *   implied, including but not limited to the warranties of merchantability,
 *   fitness for a particular purpose and noninfringement. In no event shall the
 *   authors or copyright holders be liable for any claim, damages or other
 *   liability, whether in an action of contract, tort or otherwise, arising from,
 *   out of or in connection with the Software or the use or other dealings in the
 *   Software.
 */

const VERSION = 3;
export const QR_V3_SIZE = VERSION * 4 + 17; // 29
const ECC_CODEWORDS_PER_BLOCK = 26; // MEDIUM, version 3
const NUM_ERROR_CORRECTION_BLOCKS = 1; // MEDIUM, version 3
const ECC_FORMAT_BITS = 0; // MEDIUM

const PENALTY_N1 = 3;
const PENALTY_N2 = 3;
const PENALTY_N3 = 40;
const PENALTY_N4 = 10;

export class QrDataTooLongError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QrDataTooLongError';
  }
}

// ---- Segments ------------------------------------------------------------

interface Segment {
  modeBits: number;
  numChars: number;
  charCountBits: number; // for versions 1-9
  bits: number[];
}

const ALPHANUMERIC_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
const NUMERIC_REGEX = /^[0-9]*$/;
const ALPHANUMERIC_REGEX = /^[A-Z0-9 $%*+./:-]*$/;

function appendBits(bb: number[], val: number, len: number): void {
  for (let i = len - 1; i >= 0; i--) bb.push((val >>> i) & 1);
}

function makeSegments(text: string): Segment[] {
  if (text === '') return [];
  const bits: number[] = [];
  if (NUMERIC_REGEX.test(text)) {
    for (let i = 0; i < text.length; ) {
      const n = Math.min(text.length - i, 3);
      appendBits(bits, parseInt(text.substring(i, i + n), 10), n * 3 + 1);
      i += n;
    }
    return [{ modeBits: 0x1, numChars: text.length, charCountBits: 10, bits }];
  }
  if (ALPHANUMERIC_REGEX.test(text)) {
    let i: number;
    for (i = 0; i + 2 <= text.length; i += 2) {
      let temp = ALPHANUMERIC_CHARSET.indexOf(text.charAt(i)) * 45;
      temp += ALPHANUMERIC_CHARSET.indexOf(text.charAt(i + 1));
      appendBits(bits, temp, 11);
    }
    if (i < text.length) appendBits(bits, ALPHANUMERIC_CHARSET.indexOf(text.charAt(i)), 6);
    return [{ modeBits: 0x2, numChars: text.length, charCountBits: 9, bits }];
  }
  const bytes = new TextEncoder().encode(text);
  for (const b of bytes) appendBits(bits, b, 8);
  return [{ modeBits: 0x4, numChars: bytes.length, charCountBits: 8, bits }];
}

// ---- Reed-Solomon over GF(2^8/0x11D) -------------------------------------

function rsMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function rsComputeDivisor(degree: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < degree - 1; i++) result.push(0);
  result.push(1);
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = rsMultiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = rsMultiply(root, 0x02);
  }
  return result;
}

function rsComputeRemainder(data: number[], divisor: number[]): number[] {
  const result = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ (result.shift() as number);
    result.push(0);
    divisor.forEach((coef, i) => (result[i] ^= rsMultiply(coef, factor)));
  }
  return result;
}

// ---- Matrix ---------------------------------------------------------------

function numRawDataModules(ver: number): number {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}

function alignmentPatternPositions(ver: number, size: number): number[] {
  if (ver === 1) return [];
  const numAlign = Math.floor(ver / 7) + 2;
  const step = ver === 32 ? 26 : Math.floor((ver * 4 + numAlign * 2 + 1) / (numAlign * 2 - 2)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
  return result;
}

const MASK_PATTERNS: Array<(x: number, y: number) => number> = [
  (x, y) => (x + y) % 2,
  (_x, y) => y % 2,
  (x) => x % 3,
  (x, y) => (x + y) % 3,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2,
  (x, y) => ((x * y) % 2) + ((x * y) % 3),
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2,
];

class Matrix {
  readonly size = QR_V3_SIZE;
  readonly modules: boolean[][] = [];
  private readonly isFunction: boolean[][] = [];

  constructor(dataCodewords: number[]) {
    for (let i = 0; i < this.size; i++) {
      this.modules.push(new Array<boolean>(this.size).fill(false));
      this.isFunction.push(new Array<boolean>(this.size).fill(false));
    }
    this.drawFunctionPatterns();
    this.drawCodewords(this.addEccAndInterleave(dataCodewords));

    // Automatic mask: lowest penalty, first one wins ties
    let mask = 0;
    let minPenalty = Infinity;
    for (let i = 0; i < 8; i++) {
      this.applyMask(i);
      this.drawFormatBits(i);
      const penalty = this.penaltyScore();
      if (penalty < minPenalty) {
        mask = i;
        minPenalty = penalty;
      }
      this.applyMask(i); // undo
    }
    this.applyMask(mask);
    this.drawFormatBits(mask);
  }

  private setFunctionModule(x: number, y: number, isDark: boolean): void {
    this.modules[y][x] = isDark;
    this.isFunction[y][x] = true;
  }

  private drawFunctionPatterns(): void {
    for (let i = 0; i < this.size; i++) {
      this.setFunctionModule(6, i, i % 2 === 0);
      this.setFunctionModule(i, 6, i % 2 === 0);
    }
    this.drawFinderPattern(3, 3);
    this.drawFinderPattern(this.size - 4, 3);
    this.drawFinderPattern(3, this.size - 4);

    const pos = alignmentPatternPositions(VERSION, this.size);
    const n = pos.length;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
        this.drawAlignmentPattern(pos[i], pos[j]);
      }

    this.drawFormatBits(0); // dummy mask, overwritten later
    // drawVersion() only applies to versions >= 7
  }

  private drawFormatBits(mask: number): void {
    const data = (ECC_FORMAT_BITS << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    const bit = (i: number) => ((bits >>> i) & 1) !== 0;

    for (let i = 0; i <= 5; i++) this.setFunctionModule(8, i, bit(i));
    this.setFunctionModule(8, 7, bit(6));
    this.setFunctionModule(8, 8, bit(7));
    this.setFunctionModule(7, 8, bit(8));
    for (let i = 9; i < 15; i++) this.setFunctionModule(14 - i, 8, bit(i));

    for (let i = 0; i < 8; i++) this.setFunctionModule(this.size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) this.setFunctionModule(8, this.size - 15 + i, bit(i));
    this.setFunctionModule(8, this.size - 8, true);
  }

  private drawFinderPattern(x: number, y: number): void {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const xx = x + dx;
        const yy = y + dy;
        if (0 <= xx && xx < this.size && 0 <= yy && yy < this.size)
          this.setFunctionModule(xx, yy, dist !== 2 && dist !== 4);
      }
  }

  private drawAlignmentPattern(x: number, y: number): void {
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++)
        this.setFunctionModule(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }

  private addEccAndInterleave(data: number[]): number[] {
    // Version 3-M has a single block, so interleaving is data followed by ECC.
    const rawCodewords = Math.floor(numRawDataModules(VERSION) / 8);
    const divisor = rsComputeDivisor(ECC_CODEWORDS_PER_BLOCK);
    const ecc = rsComputeRemainder(data, divisor);
    const result = data.concat(ecc);
    if (NUM_ERROR_CORRECTION_BLOCKS !== 1 || result.length !== rawCodewords)
      throw new Error('Unexpected codeword count');
    return result;
  }

  private drawCodewords(data: number[]): void {
    let i = 0;
    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < this.size; vert++)
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? this.size - 1 - vert : vert;
          if (!this.isFunction[y][x] && i < data.length * 8) {
            this.modules[y][x] = ((data[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
            i++;
          }
        }
    }
  }

  private applyMask(mask: number): void {
    const masker = MASK_PATTERNS[mask];
    for (let y = 0; y < this.size; y++)
      for (let x = 0; x < this.size; x++)
        if (masker(x, y) === 0 && !this.isFunction[y][x]) this.modules[y][x] = !this.modules[y][x];
  }

  private penaltyScore(): number {
    let result = 0;
    const size = this.size;
    const modules = this.modules;

    for (let y = 0; y < size; y++) {
      let runColor = false;
      let runX = 0;
      const runHistory = [0, 0, 0, 0, 0, 0, 0];
      for (let x = 0; x < size; x++) {
        if (modules[y][x] === runColor) {
          runX++;
          if (runX === 5) result += PENALTY_N1;
          else if (runX > 5) result++;
        } else {
          this.finderPenaltyAddHistory(runX, runHistory);
          if (!runColor) result += this.finderPenaltyCountPatterns(runHistory) * PENALTY_N3;
          runColor = modules[y][x];
          runX = 1;
        }
      }
      result += this.finderPenaltyTerminateAndCount(runColor, runX, runHistory) * PENALTY_N3;
    }
    for (let x = 0; x < size; x++) {
      let runColor = false;
      let runY = 0;
      const runHistory = [0, 0, 0, 0, 0, 0, 0];
      for (let y = 0; y < size; y++) {
        if (modules[y][x] === runColor) {
          runY++;
          if (runY === 5) result += PENALTY_N1;
          else if (runY > 5) result++;
        } else {
          this.finderPenaltyAddHistory(runY, runHistory);
          if (!runColor) result += this.finderPenaltyCountPatterns(runHistory) * PENALTY_N3;
          runColor = modules[y][x];
          runY = 1;
        }
      }
      result += this.finderPenaltyTerminateAndCount(runColor, runY, runHistory) * PENALTY_N3;
    }

    for (let y = 0; y < size - 1; y++)
      for (let x = 0; x < size - 1; x++) {
        const c = modules[y][x];
        if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) result += PENALTY_N2;
      }

    let dark = 0;
    for (const row of modules) for (const cell of row) if (cell) dark++;
    const total = size * size;
    const k = Math.floor((Math.abs(dark * 20 - total * 10) + total - 1) / total) - 1;
    result += k * PENALTY_N4;
    return result;
  }

  private finderPenaltyCountPatterns(runHistory: number[]): number {
    const n = runHistory[1];
    const core =
      n > 0 && runHistory[2] === n && runHistory[3] === n * 3 && runHistory[4] === n && runHistory[5] === n;
    return (
      (core && runHistory[0] >= n * 4 && runHistory[6] >= n ? 1 : 0) +
      (core && runHistory[6] >= n * 4 && runHistory[0] >= n ? 1 : 0)
    );
  }

  private finderPenaltyTerminateAndCount(currentRunColor: boolean, currentRunLength: number, runHistory: number[]): number {
    if (currentRunColor) {
      this.finderPenaltyAddHistory(currentRunLength, runHistory);
      currentRunLength = 0;
    }
    currentRunLength += this.size;
    this.finderPenaltyAddHistory(currentRunLength, runHistory);
    return this.finderPenaltyCountPatterns(runHistory);
  }

  private finderPenaltyAddHistory(currentRunLength: number, runHistory: number[]): void {
    if (runHistory[0] === 0) currentRunLength += this.size;
    runHistory.pop();
    runHistory.unshift(currentRunLength);
  }
}

/**
 * Encode text as a Version 3, ECC MEDIUM QR Code (auto mask, no ECC boost).
 * Returns modules[y][x], true = dark. Throws QrDataTooLongError when it does not fit
 * (42 bytes in byte mode, 61 alphanumeric characters, 101 digits).
 */
export function encodeQrV3M(text: string): boolean[][] {
  const segs = makeSegments(text);
  const capacityBits = (Math.floor(numRawDataModules(VERSION) / 8) - ECC_CODEWORDS_PER_BLOCK * NUM_ERROR_CORRECTION_BLOCKS) * 8;

  let usedBits = 0;
  for (const seg of segs) {
    if (seg.numChars >= 1 << seg.charCountBits) throw new QrDataTooLongError('Segment too long');
    usedBits += 4 + seg.charCountBits + seg.bits.length;
  }
  if (usedBits > capacityBits)
    throw new QrDataTooLongError(`Data length = ${usedBits} bits, Max capacity = ${capacityBits} bits`);

  const bb: number[] = [];
  for (const seg of segs) {
    appendBits(bb, seg.modeBits, 4);
    appendBits(bb, seg.numChars, seg.charCountBits);
    for (const b of seg.bits) bb.push(b);
  }
  appendBits(bb, 0, Math.min(4, capacityBits - bb.length));
  appendBits(bb, 0, (8 - (bb.length % 8)) % 8);
  for (let padByte = 0xec; bb.length < capacityBits; padByte ^= 0xec ^ 0x11) appendBits(bb, padByte, 8);

  const dataCodewords: number[] = new Array(bb.length / 8).fill(0);
  bb.forEach((bit, i) => (dataCodewords[i >>> 3] |= bit << (7 - (i & 7))));

  return new Matrix(dataCodewords).modules;
}
