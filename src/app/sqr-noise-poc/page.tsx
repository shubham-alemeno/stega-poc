'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CANONICAL_SIZE,
  DEFAULT_COEFF_PAIRS,
  DEFAULT_ID_LENGTH,
  DEFAULT_MM_SIZE,
  DEFAULT_PREFIX,
  DEFAULT_SECOND_PAIR,
  DEFAULT_STRENGTH,
  MAX_STRENGTH,
  MIN_STRENGTH,
  QR_MODULES,
  TOTAL_BLOCKS,
  buildQrModules,
  crc32,
  encodeGrayPng,
  generateFingerprintId,
  validateCoeffPairs,
  type CoeffPair,
  type WatermarkColour,
} from '@/lib/sqrPoc';
import {
  DEFAULT_NOISE_COL,
  DEFAULT_NOISE_GRID_SIZE,
  DEFAULT_NOISE_GRAY,
  DEFAULT_NOISE_ROW,
  MAX_NOISE_GRAY,
  MAX_NOISE_POSITION,
  MIN_NOISE_GRAY,
  NOISE_BITS,
  NOISE_GRID_SIZES,
  NOISE_MODULE_COUNT,
  NOISE_MODULES,
  NOISE_SIZE,
  QR_TOTAL_CODEWORDS,
  WATERMARKED_MODULES,
  countWatermarkArea,
  generateSqrNoisePoc,
  isNoiseModule,
  noiseBitCount,
  noiseBlockInfo,
  validateNoisePosition,
  type NoiseGridSize,
  type SqrNoiseResult,
  type WatermarkAreaCounts,
} from '@/lib/sqrNoisePoc';

const INDICES = [0, 1, 2, 3, 4, 5, 6, 7];

function IndexSelect({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="flex items-center gap-1 text-xs">
      <span className="opacity-60">{label}</span>
      <select
        className="rounded border border-gray-400/60 bg-transparent px-1 py-1 text-sm"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {INDICES.map((n) => (
          <option key={n} value={n} className="text-black">
            {n}
          </option>
        ))}
      </select>
    </label>
  );
}

function PairEditor({ title, pair, onChange }: { title: string; pair: CoeffPair; onChange: (p: CoeffPair) => void }) {
  const set = (which: 0 | 1, axis: 0 | 1, n: number) => {
    const next: CoeffPair = [[...pair[0]], [...pair[1]]] as CoeffPair;
    next[which][axis] = n;
    onChange(next);
  };
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded border border-gray-400/40 px-3 py-2">
      <span className="w-14 text-sm font-medium">{title}</span>
      <div className="flex items-center gap-2">
        <span className="text-xs opacity-60">A</span>
        <IndexSelect label="u" value={pair[0][0]} onChange={(n) => set(0, 0, n)} />
        <IndexSelect label="v" value={pair[0][1]} onChange={(n) => set(0, 1, n)} />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs opacity-60">B</span>
        <IndexSelect label="u" value={pair[1][0]} onChange={(n) => set(1, 0, n)} />
        <IndexSelect label="v" value={pair[1][1]} onChange={(n) => set(1, 1, n)} />
      </div>
      <span className="text-xs opacity-60">
        bit 1 when F[{pair[0][0]}][{pair[0][1]}] &gt; F[{pair[1][0]}][{pair[1][1]}]
      </span>
    </div>
  );
}

/** The 29x29 module grid: red = watermarked, blue = noise grid (not touched), gray = not watermarked. */
function ZoneMap({ mask, noiseRow, noiseCol }: { mask: string; noiseRow: number; noiseCol: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const CELL = 12;
  const GAP = 1;
  const size = QR_MODULES * (CELL + GAP) + GAP;
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, size, size);
    for (let row = 0; row < QR_MODULES; row++)
      for (let col = 0; col < QR_MODULES; col++) {
        ctx.fillStyle = isNoiseModule(row, col, noiseRow, noiseCol) ? '#3498db' : mask[row * QR_MODULES + col] === '1' ? '#c0392b' : '#6b7280';
        ctx.fillRect(GAP + col * (CELL + GAP), GAP + row * (CELL + GAP), CELL, CELL);
      }
  }, [mask, noiseRow, noiseCol, size]);
  return <canvas ref={ref} width={size} height={size} style={{ maxWidth: '100%', height: 'auto' }} aria-label="Watermarked and noise modules" />;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const COLOUR_LABELS: Record<WatermarkColour, string> = {
  all: 'All modules',
  black: 'Black modules only',
  white: 'White modules only',
};

export default function SqrNoisePocPage() {
  const [prefix, setPrefix] = useState(DEFAULT_PREFIX);
  const [fingerprintId, setFingerprintId] = useState('');
  const [strength, setStrength] = useState(DEFAULT_STRENGTH);
  const [mmSize, setMmSize] = useState(DEFAULT_MM_SIZE);
  const [noiseGray, setNoiseGray] = useState(DEFAULT_NOISE_GRAY);
  const [noiseRow, setNoiseRow] = useState(DEFAULT_NOISE_ROW);
  const [noiseCol, setNoiseCol] = useState(DEFAULT_NOISE_COL);
  const [noiseGridSize, setNoiseGridSize] = useState<NoiseGridSize>(DEFAULT_NOISE_GRID_SIZE);
  const [pairCount, setPairCount] = useState<1 | 2>(1);
  const [pair1, setPair1] = useState<CoeffPair>(DEFAULT_COEFF_PAIRS[0]);
  const [pair2, setPair2] = useState<CoeffPair>(DEFAULT_SECOND_PAIR);
  const [colour, setColour] = useState<WatermarkColour>('all');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SqrNoiseResult | null>(null);
  const [pngBlob, setPngBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // The ID is generated on the client after mount (random, so it must not run during SSR).
  useEffect(() => {
    setFingerprintId(generateFingerprintId());
  }, []);

  // Any input change makes the previous output stale.
  useEffect(() => {
    setResult(null);
    setPngBlob(null);
    setError(null);
  }, [prefix, fingerprintId, strength, mmSize, noiseGray, noiseRow, noiseCol, noiseGridSize, colour, pairCount, pair1, pair2]);

  useEffect(() => {
    if (!pngBlob) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pngBlob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pngBlob]);

  const fingerprintUrl = fingerprintId ? `${prefix}${fingerprintId}` : '';

  // Live module counts, outside the noise grid, for the QR that the current prefix + ID produce.
  const live = useMemo<{ counts: WatermarkAreaCounts | null; problem: string | null }>(() => {
    if (!fingerprintUrl) return { counts: null, problem: null };
    try {
      return { counts: countWatermarkArea(buildQrModules(fingerprintUrl), noiseRow, noiseCol), problem: null };
    } catch {
      return {
        counts: null,
        problem: 'This prefix + ID is too long for a Version 3-M QR (about 42 bytes). Shorten the prefix or the ID.',
      };
    }
  }, [fingerprintUrl, noiseRow, noiseCol]);

  const seed = useMemo(() => (fingerprintId ? crc32(fingerprintId) : null), [fingerprintId]);

  const activePairs = useMemo<CoeffPair[]>(() => (pairCount === 2 ? [pair1, pair2] : [pair1]), [pairCount, pair1, pair2]);
  const pairsProblem = useMemo<string | null>(() => {
    try {
      validateCoeffPairs(activePairs);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }, [activePairs]);
  const strengthProblem =
    Number.isInteger(strength) && strength >= MIN_STRENGTH && strength <= MAX_STRENGTH
      ? null
      : `Strength must be a whole number from ${MIN_STRENGTH} to ${MAX_STRENGTH}.`;
  const positionProblem = useMemo<string | null>(() => {
    try {
      validateNoisePosition(noiseRow, noiseCol);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }, [noiseRow, noiseCol]);
  const blockInfo = useMemo(() => (positionProblem ? null : noiseBlockInfo(noiseRow, noiseCol)), [positionProblem, noiseRow, noiseCol]);
  const grayProblem =
    Number.isInteger(noiseGray) && noiseGray >= MIN_NOISE_GRAY && noiseGray <= MAX_NOISE_GRAY
      ? null
      : `Gray level must be a whole number from ${MIN_NOISE_GRAY} to ${MAX_NOISE_GRAY}.`;

  async function handleGenerate() {
    setError(null);
    setBusy(true);
    try {
      const r = generateSqrNoisePoc({ prefix, fingerprintId, strength, mmSize, colour, noiseGray, noiseRow, noiseCol, noiseGridSize, coeffPairs: activePairs });
      const bytes = await encodeGrayPng(r.pixels2x, r.size2x, r.dpi2x);
      setResult(r);
      setPngBlob(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
    } catch (e) {
      setResult(null);
      setPngBlob(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function copy(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied((c) => (c === label ? null : c)), 1500);
    } catch {
      setError('Copy failed. Select the text and copy it manually.');
    }
  }

  const baseName = `${fingerprintId}_noise${noiseGridSize === 28 ? '28' : ''}_r${noiseRow}c${noiseCol}`;
  const pct = (n: number, t: number) => (t ? ((100 * n) / t).toFixed(1) : '0.0');
  const grayValue = Number.isInteger(noiseGray) ? Math.min(255, Math.max(0, noiseGray)) : 0;

  const inputClass =
    'w-full rounded border border-gray-400/60 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const buttonClass =
    'rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50';
  const ghostButtonClass =
    'rounded border border-gray-400/60 px-3 py-1.5 text-xs hover:bg-gray-500/10 disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">SQR + Noise (hybrid experiment)</h1>
        <p className="text-sm opacity-70">
          Secure-QR (Version 3, medium ECC, 29×29 modules, 8 px per module) with a {NOISE_MODULES}×{NOISE_MODULES} block of modules
          replaced by a {NOISE_SIZE}×{NOISE_SIZE} pixel block of noise (a {NOISE_SIZE}×{NOISE_SIZE} grid of {NOISE_BITS} binary values, or
          a coarser 28×28 grid of 784), by default at rows 9–15, columns 11–17. The noise comes from the same seed as the watermark, and only its black pixels take the gray level
          you choose. The watermark is embedded as usual, but the {NOISE_MODULE_COUNT} modules under the noise are skipped, so
          it encodes {WATERMARKED_MODULES} bits instead of {TOTAL_BLOCKS}. Move the noise and the watermarked area moves with
          it. Output: 2× grayscale PNG.
        </p>
      </header>

      <section className="space-y-4 rounded border border-gray-400/40 p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium">URL prefix</span>
            <input className={inputClass} value={prefix} onChange={(e) => setPrefix(e.target.value)} />
            <span className="block text-xs opacity-60">Same prefix the backend uses. QR content = prefix + fingerprint ID.</span>
          </label>

          <div className="space-y-1 text-sm">
            <span className="font-medium">Fingerprint ID (seed)</span>
            <div className="flex gap-2">
              <input
                className={`${inputClass} font-mono`}
                value={fingerprintId}
                maxLength={DEFAULT_ID_LENGTH}
                onChange={(e) => setFingerprintId(e.target.value.trim())}
                spellCheck={false}
              />
              <button type="button" className={ghostButtonClass} onClick={() => setFingerprintId(generateFingerprintId())}>
                New ID
              </button>
            </div>
            <span className="block text-xs opacity-60">
              {DEFAULT_ID_LENGTH} characters (A–Z, a–z, 0–9) like the backend. Seed = CRC-32 of this ID
              {seed !== null ? ` (${seed})` : ''}. It drives both the watermark bits and the noise grid.
            </span>
          </div>

          <div className="space-y-1 text-sm">
            <span className="font-medium">
              Noise gray level ({MIN_NOISE_GRAY}–{MAX_NOISE_GRAY})
            </span>
            <div className="flex items-center gap-3">
              <input
                type="number"
                className={`${inputClass} max-w-28`}
                min={MIN_NOISE_GRAY}
                max={MAX_NOISE_GRAY}
                value={noiseGray}
                onChange={(e) => setNoiseGray(Number(e.target.value))}
              />
              <input
                type="range"
                aria-label="Noise gray level"
                className="flex-1"
                min={MIN_NOISE_GRAY}
                max={MAX_NOISE_GRAY}
                value={grayValue}
                onChange={(e) => setNoiseGray(Number(e.target.value))}
              />
              <span
                className="inline-block h-8 w-8 shrink-0 rounded border border-gray-400/60"
                style={{ backgroundColor: `rgb(${grayValue},${grayValue},${grayValue})` }}
                title={`Gray ${grayValue}`}
              />
            </div>
            <span className={`block text-xs ${grayProblem ? 'text-red-500' : 'opacity-60'}`}>
              {grayProblem ??
                'The colour of the noise grid’s black pixels (its white pixels stay 255). 0 is black, 255 is white, so the noise disappears. Darker noise scans more reliably: in my tests ZXing read every gray level, while an OpenCV-based reader failed more often on small images as the gray got lighter.'}
            </span>
          </div>

          <div className="space-y-1 text-sm sm:col-span-2">
            <span className="font-medium">Noise grid</span>
            <div role="radiogroup" aria-label="Noise grid resolution" className="flex flex-wrap overflow-hidden rounded border border-gray-400/60 sm:inline-flex">
              {NOISE_GRID_SIZES.map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={noiseGridSize === n}
                  onClick={() => setNoiseGridSize(n)}
                  className={`px-5 py-2 text-sm ${noiseGridSize === n ? 'bg-blue-600 text-white' : 'hover:bg-gray-500/10'}`}
                >
                  {n}×{n} grid ({noiseBitCount(n)} values, {NOISE_SIZE / n}×{NOISE_SIZE / n} px each)
                </button>
              ))}
            </div>
            <span className="block text-xs opacity-60">
              Both fill the same {NOISE_SIZE}×{NOISE_SIZE} pixel block ({NOISE_MODULES}×{NOISE_MODULES} modules). The 28×28 grid is coarser: each
              of its 784 values is drawn as a 2×2 pixel cell. The values come from the same seed and stream (draw 0 onwards). Nothing else
              changes: same position, same {WATERMARKED_MODULES} watermarked modules, same reference string. In my tests both scanned equally well.
            </span>
          </div>

          <div className="space-y-2 text-sm sm:col-span-2">
            <span className="font-medium">
              Noise position (top-left module of the {NOISE_MODULES}×{NOISE_MODULES} block)
            </span>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2">
                <span className="opacity-60">Row</span>
                <input
                  type="number"
                  className={`${inputClass} max-w-24`}
                  min={0}
                  max={MAX_NOISE_POSITION}
                  value={noiseRow}
                  onChange={(e) => setNoiseRow(Number(e.target.value))}
                />
              </label>
              <label className="flex items-center gap-2">
                <span className="opacity-60">Column</span>
                <input
                  type="number"
                  className={`${inputClass} max-w-24`}
                  min={0}
                  max={MAX_NOISE_POSITION}
                  value={noiseCol}
                  onChange={(e) => setNoiseCol(Number(e.target.value))}
                />
              </label>
              <button
                type="button"
                className={ghostButtonClass}
                onClick={() => {
                  setNoiseRow(DEFAULT_NOISE_ROW);
                  setNoiseCol(DEFAULT_NOISE_COL);
                }}
              >
                Reset to {DEFAULT_NOISE_ROW}, {DEFAULT_NOISE_COL}
              </button>
            </div>
            <span className={`block text-xs ${positionProblem ? 'text-red-500' : 'opacity-60'}`}>
              {positionProblem ??
                `Module rows ${noiseRow}–${noiseRow + NOISE_MODULES - 1}, columns ${noiseCol}–${noiseCol + NOISE_MODULES - 1} (pixels y ${noiseRow * 8}–${noiseRow * 8 + NOISE_SIZE - 1}, x ${noiseCol * 8}–${noiseCol * 8 + NOISE_SIZE - 1}). Rows and columns are counted from 0 at the top left; 0 to ${MAX_NOISE_POSITION} keeps the block inside the QR. The ${NOISE_MODULE_COUNT} modules under it are not watermarked, so the watermarked area moves with the noise.`}
            </span>
            {blockInfo &&
              (blockInfo.functionModules > 0 ? (
                <span className="block text-xs text-red-500">
                  This block covers {blockInfo.functionModules} finder, timing, alignment or format-information module
                  {blockInfo.functionModules === 1 ? '' : 's'}, so the QR will not scan. Move it.
                </span>
              ) : (
                <span className={`block text-xs ${blockInfo.spare <= 1 ? 'text-amber-500' : blockInfo.spare >= 4 ? 'text-green-500' : 'opacity-80'}`}>
                  Scan margin: the noise touches {blockInfo.codewordsTouched} of the QR&apos;s {QR_TOTAL_CODEWORDS} codewords, and a
                  Version 3-M code corrects up to {blockInfo.correctable}. That leaves {blockInfo.spare} to spare for blur or print
                  damage. (For reference, the exact centre, row 11 column 11, touches 12.)
                </span>
              ))}
          </div>

          <label className="space-y-1 text-sm">
            <span className="font-medium">
              Strength ({MIN_STRENGTH}–{MAX_STRENGTH})
            </span>
            <input
              type="number"
              className={inputClass}
              min={MIN_STRENGTH}
              max={MAX_STRENGTH}
              value={strength}
              onChange={(e) => setStrength(Number(e.target.value))}
            />
            <span className={`block text-xs ${strengthProblem ? 'text-red-500' : 'opacity-60'}`}>
              {strengthProblem ?? 'Whole number. Very low values (under about 10) are lost to 8-bit rounding in black modules.'}
            </span>
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium">Physical size (mm)</span>
            <input
              type="number"
              className={inputClass}
              min={1}
              step={0.5}
              value={mmSize}
              onChange={(e) => setMmSize(Number(e.target.value))}
            />
            <span className="block text-xs opacity-60">Sets the DPI stored in the PNG (232 px = this size at 1x).</span>
          </label>
        </div>

        <div className="space-y-1 text-sm">
          <span className="font-medium">Watermark which modules (outside the noise grid)</span>
          <div role="radiogroup" aria-label="Modules to watermark" className="inline-flex overflow-hidden rounded border border-gray-400/60">
            {(['all', 'black', 'white'] as const).map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={colour === c}
                onClick={() => setColour(c)}
                className={`px-5 py-2 text-sm ${colour === c ? 'bg-blue-600 text-white' : 'hover:bg-gray-500/10'}`}
              >
                {COLOUR_LABELS[c]}
              </button>
            ))}
          </div>
          <span className="block text-xs opacity-60">
            “All modules” is the experiment as written: {WATERMARKED_MODULES} watermarked modules. The black and white options
            work as on the SQR page.
          </span>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-medium">Coefficient pairs</span>
            <div role="radiogroup" aria-label="Number of coefficient pairs" className="inline-flex overflow-hidden rounded border border-gray-400/60">
              {([1, 2] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={pairCount === n}
                  onClick={() => setPairCount(n)}
                  className={`px-4 py-1.5 text-sm ${pairCount === n ? 'bg-blue-600 text-white' : 'hover:bg-gray-500/10'}`}
                >
                  {n} pair{n === 2 ? 's' : ''}
                </button>
              ))}
            </div>
          </div>
          <PairEditor title="Pair 1" pair={pair1} onChange={setPair1} />
          {pairCount === 2 && <PairEditor title="Pair 2" pair={pair2} onChange={setPair2} />}
          {pairsProblem && <p className="text-xs text-red-500">{pairsProblem}</p>}
          <p className="text-xs opacity-60">
            F[u][v] is the 8×8 DCT coefficient at row frequency u and column frequency v (0 to 7). Every coefficient must be
            different. The default is the single pair (3,1)/(1,3), which is what the backend generates.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-sm font-medium">Modules outside the noise grid</h2>
          {live.problem && <p className="text-sm text-red-500">{live.problem}</p>}
          {live.counts && (
            <table className="w-full max-w-md border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-400/40 text-left">
                  <th className="py-1 pr-4">Colour</th>
                  <th className="py-1 pr-4">Modules</th>
                  <th className="py-1">Share</th>
                </tr>
              </thead>
              <tbody>
                <tr className={colour === 'black' ? 'font-semibold' : ''}>
                  <td className="py-1 pr-4">Black</td>
                  <td className="py-1 pr-4">{live.counts.black}</td>
                  <td className="py-1">{pct(live.counts.black, live.counts.total)}%</td>
                </tr>
                <tr className={colour === 'white' ? 'font-semibold' : ''}>
                  <td className="py-1 pr-4">White</td>
                  <td className="py-1 pr-4">{live.counts.white}</td>
                  <td className="py-1">{pct(live.counts.white, live.counts.total)}%</td>
                </tr>
                <tr className={`border-t border-gray-400/40 ${colour === 'all' ? 'font-semibold' : ''}`}>
                  <td className="py-1 pr-4">Total (red area)</td>
                  <td className="py-1 pr-4">{live.counts.total}</td>
                  <td className="py-1">100%</td>
                </tr>
              </tbody>
            </table>
          )}
          <p className="text-xs opacity-60">
            The {NOISE_MODULES}×{NOISE_MODULES} noise block ({NOISE_MODULE_COUNT} modules, {NOISE_SIZE}×{NOISE_SIZE} px) is left out of these
            counts.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            className={buttonClass}
            onClick={handleGenerate}
            disabled={busy || !fingerprintId || !!live.problem || !!strengthProblem || !!pairsProblem || !!grayProblem || !!positionProblem}
          >
            {busy ? 'Generating…' : 'Generate'}
          </button>
          {error && <span className="text-sm text-red-500">{error}</span>}
        </div>
      </section>

      {result && previewUrl && pngBlob && (
        <section className="space-y-4 rounded border border-gray-400/40 p-4">
          <h2 className="text-lg font-medium">Result</h2>

          <div className="grid gap-6 sm:grid-cols-[auto,1fr]">
            <div className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="SQR with noise grid"
                width={result.size2x}
                height={result.size2x}
                style={{ imageRendering: 'pixelated', maxWidth: '100%', height: 'auto' }}
                className="border border-gray-400/40 bg-white"
              />
              <button type="button" className={buttonClass} onClick={() => downloadBlob(pngBlob, `${baseName}_2x.png`)}>
                Download PNG 2x
              </button>
              <p className="text-xs opacity-60">
                {result.size2x}×{result.size2x} px, 8-bit grayscale, {result.dpi2x} DPI
              </p>
            </div>

            <dl className="space-y-1 text-sm">
              <div className="flex gap-2"><dt className="w-44 opacity-60">QR content</dt><dd className="break-all font-mono">{result.fingerprintUrl}</dd></div>
              <div className="flex gap-2"><dt className="w-44 opacity-60">Seed (CRC-32 of ID)</dt><dd className="font-mono">{result.seed}</dd></div>
              <div className="flex gap-2"><dt className="w-44 opacity-60">Watermarked</dt><dd>{result.selectedCount} modules ({COLOUR_LABELS[result.colour].toLowerCase()}) of {TOTAL_BLOCKS}; the {NOISE_MODULE_COUNT} noise modules are skipped</dd></div>
              <div className="flex gap-2"><dt className="w-44 opacity-60">Noise grid</dt><dd>
                  {result.noiseGridSize}×{result.noiseGridSize} grid, {result.noiseBitsString.length} binary values
                  {result.noiseCellPx > 1 ? `, each a ${result.noiseCellPx}×${result.noiseCellPx} px cell` : ' (1 px each)'}, filling the {NOISE_SIZE}×{NOISE_SIZE} px block;{' '}
                  {result.noiseBlackCells} black values ({result.noiseBlackPixels} black pixels)
                </dd></div>
              <div className="flex gap-2">
                <dt className="w-44 opacity-60">Noise position</dt>
                <dd>
                  modules rows {result.noiseRow}–{result.noiseRow + NOISE_MODULES - 1}, columns {result.noiseCol}–{result.noiseCol + NOISE_MODULES - 1}; touches{' '}
                  {result.noiseInfo.codewordsTouched} of {QR_TOTAL_CODEWORDS} codewords ({result.noiseInfo.spare} to spare)
                </dd>
              </div>
              <div className="flex gap-2"><dt className="w-44 opacity-60">Noise gray level</dt><dd>{result.noiseGray} (black pixels); white pixels 255</dd></div>
              <div className="flex gap-2"><dt className="w-44 opacity-60">Strength</dt><dd>{result.strength}</dd></div>
              <div className="flex gap-2">
                <dt className="w-44 opacity-60">Coefficient pairs</dt>
                <dd className="font-mono">
                  {result.coeffPairs.map((p, i) => (
                    <span key={i} className="block">
                      ({p[0].join(',')}) vs ({p[1].join(',')}): bit 1 when the first is larger
                    </span>
                  ))}
                </dd>
              </div>
              <div className="flex gap-2"><dt className="w-44 opacity-60">Canvas</dt><dd>{CANONICAL_SIZE}×{CANONICAL_SIZE} px at 1x</dd></div>
            </dl>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-medium">Reference binary string ({result.refBinaryString.length} bits)</h3>
              <button type="button" className={ghostButtonClass} onClick={() => copy('ref', result.refBinaryString)}>
                {copied === 'ref' ? 'Copied' : 'Copy'}
              </button>
              <button
                type="button"
                className={ghostButtonClass}
                onClick={() => downloadBlob(new Blob([result.refBinaryString], { type: 'text/plain' }), `${baseName}_ref.txt`)}
              >
                Download .txt
              </button>
            </div>
            <textarea readOnly rows={5} value={result.refBinaryString} className={`${inputClass} font-mono text-xs`} />
            <p className="text-xs opacity-60">
              One bit per watermarked module, row-major (left to right, top to bottom). Each bit is the same bit the standard
              {` ${TOTAL_BLOCKS}`}-bit SQR string has at that module, so this is that string with the {NOISE_MODULE_COUNT} noise positions
              left out.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-medium">Noise grid binary values ({result.noiseBitsString.length} bits)</h3>
              <button type="button" className={ghostButtonClass} onClick={() => copy('noise', result.noiseBitsString)}>
                {copied === 'noise' ? 'Copied' : 'Copy'}
              </button>
              <button
                type="button"
                className={ghostButtonClass}
                onClick={() => downloadBlob(new Blob([result.noiseBitsString], { type: 'text/plain' }), `${baseName}_grid.txt`)}
              >
                Download .txt
              </button>
            </div>
            <textarea readOnly rows={6} value={result.noiseBitsString} className={`${inputClass} font-mono text-xs`} />
            <p className="text-xs opacity-60">
              {result.noiseGridSize} rows of {result.noiseGridSize} values, row-major, from the same seed as the watermark (draw 0 onwards). 1 is black
              {result.noiseCellPx > 1 ? ` (a ${result.noiseCellPx}×${result.noiseCellPx} px cell)` : ' (a pixel)'}, drawn in the chosen gray; 0 is white. Its first{' '}
              {Math.min(result.noiseBitsString.length, TOTAL_BLOCKS)} values are the same bits as the start of the standard {TOTAL_BLOCKS}-bit string,
              because both come from the same stream.
            </p>
          </div>

          <details className="space-y-2 text-sm">
            <summary className="cursor-pointer font-medium">Watermark map, module mask and the full {TOTAL_BLOCKS}-bit string</summary>
            <div className="space-y-3 pt-2">
              <div className="space-y-2">
                <ZoneMap mask={result.maskString} noiseRow={result.noiseRow} noiseCol={result.noiseCol} />
                <p className="text-xs opacity-60">
                  <span className="inline-block h-3 w-3 align-middle" style={{ backgroundColor: '#c0392b' }} /> watermarked ·{' '}
                  <span className="inline-block h-3 w-3 align-middle" style={{ backgroundColor: '#3498db' }} /> noise grid, not
                  touched · <span className="inline-block h-3 w-3 align-middle" style={{ backgroundColor: '#6b7280' }} /> not
                  watermarked (colour filter)
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">Mask (1 = watermarked, {TOTAL_BLOCKS} chars)</span>
                <button type="button" className={ghostButtonClass} onClick={() => copy('mask', result.maskString)}>
                  {copied === 'mask' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <textarea readOnly rows={4} value={result.maskString} className={`${inputClass} font-mono text-xs`} />
              <div className="flex items-center gap-2">
                <span className="font-medium">Standard SQR string for this ID ({TOTAL_BLOCKS} bits)</span>
                <button type="button" className={ghostButtonClass} onClick={() => copy('full', result.fullBinaryString)}>
                  {copied === 'full' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <textarea readOnly rows={4} value={result.fullBinaryString} className={`${inputClass} font-mono text-xs`} />
            </div>
          </details>
        </section>
      )}
    </main>
  );
}