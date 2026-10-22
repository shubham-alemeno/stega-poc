'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CANONICAL_SIZE,
  DEFAULT_COEFF_PAIRS,
  DEFAULT_MM_SIZE,
  DEFAULT_STRENGTH,
  MAX_STRENGTH,
  MIN_STRENGTH,
  TOTAL_BLOCKS,
  buildQrModules,
  countModules,
  crc32,
  encodeGrayPng,
  generateFingerprintId,
  generateSqrPoc,
  type ModuleCounts,
  type SqrPocResult,
  type WatermarkColour,
} from '@/lib/sqrPoc';

const DEFAULT_PREFIX = 'https://example.com/v/';

type Chosen = Exclude<WatermarkColour, 'all'>;

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

export default function SqrPocPage() {
  const [prefix, setPrefix] = useState(DEFAULT_PREFIX);
  const [fingerprintId, setFingerprintId] = useState('');
  const [strength, setStrength] = useState(DEFAULT_STRENGTH);
  const [mmSize, setMmSize] = useState(DEFAULT_MM_SIZE);
  const [colour, setColour] = useState<Chosen>('black');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SqrPocResult | null>(null);
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
  }, [prefix, fingerprintId, strength, mmSize, colour]);

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

  // Live module counts for the QR that the current prefix + ID produce.
  const live = useMemo<{ counts: ModuleCounts | null; problem: string | null }>(() => {
    if (!fingerprintUrl) return { counts: null, problem: null };
    try {
      return { counts: countModules(buildQrModules(fingerprintUrl)), problem: null };
    } catch {
      return {
        counts: null,
        problem: 'This prefix + ID is too long for a Version 3-M QR (about 42 bytes). Shorten the prefix or the ID.',
      };
    }
  }, [fingerprintUrl]);

  const seed = useMemo(() => (fingerprintId ? crc32(fingerprintId) : null), [fingerprintId]);

  async function handleGenerate() {
    setError(null);
    setBusy(true);
    try {
      const r = generateSqrPoc({ prefix, fingerprintId, strength, mmSize, colour });
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

  const baseName = `${fingerprintId}_${colour}`;
  const pct = (n: number, t: number) => (t ? ((100 * n) / t).toFixed(1) : '0.0');

  const inputClass =
    'w-full rounded border border-gray-400/60 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const buttonClass =
    'rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50';
  const ghostButtonClass =
    'rounded border border-gray-400/60 px-3 py-1.5 text-xs hover:bg-gray-500/10 disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">SQR</h1>
        <p className="text-sm opacity-70">
          Secure-QR as generated on the backend (Version 3, medium ECC, 29×29 modules, 8 px per module, one
          watermark bit per module, no emblem), with module counting and watermarking of only the black or
          only the white modules. The fingerprint ID is the seed.
        </p>
      </header>

      <section className="space-y-4 rounded border border-gray-400/40 p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium">URL prefix</span>
            <input className={inputClass} value={prefix} onChange={(e) => setPrefix(e.target.value)} />
            <span className="block text-xs opacity-60">QR content = prefix + fingerprint ID.</span>
          </label>

          <div className="space-y-1 text-sm">
            <span className="font-medium">Fingerprint ID (seed)</span>
            <div className="flex gap-2">
              <input
                className={`${inputClass} font-mono`}
                value={fingerprintId}
                onChange={(e) => setFingerprintId(e.target.value.trim())}
                spellCheck={false}
              />
              <button type="button" className={ghostButtonClass} onClick={() => setFingerprintId(generateFingerprintId())}>
                New ID
              </button>
            </div>
            <span className="block text-xs opacity-60">
              Seed = CRC-32 of this ID{seed !== null ? ` (${seed})` : ''}. Paste an ID to reproduce a
              fingerprint.
            </span>
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
          <span className="font-medium">Watermark which modules</span>
          <div role="radiogroup" aria-label="Module colour to watermark" className="inline-flex overflow-hidden rounded border border-gray-400/60">
            {(['black', 'white'] as const).map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={colour === c}
                onClick={() => setColour(c)}
                className={`px-5 py-2 text-sm capitalize ${
                  colour === c ? 'bg-blue-600 text-white' : 'hover:bg-gray-500/10'
                }`}
              >
                {c} modules only
              </button>
            ))}
          </div>
          <span className="block text-xs opacity-60">
            The other colour stays exactly as in the plain QR. Both coefficient pairs{' '}
            {DEFAULT_COEFF_PAIRS.map((p) => `(${p[0].join(',')})/(${p[1].join(',')})`).join(' and ')} are
            embedded in every selected module.
          </span>
        </div>

        <div className="space-y-2">
          <h2 className="text-sm font-medium">Modules in the QR</h2>
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
                <tr className="border-t border-gray-400/40">
                  <td className="py-1 pr-4">Total</td>
                  <td className="py-1 pr-4">{live.counts.total}</td>
                  <td className="py-1">100%</td>
                </tr>
              </tbody>
            </table>
          )}
          <p className="text-xs opacity-60">
            Counted over the whole 29×29 grid, finder, timing and alignment patterns included.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button type="button" className={buttonClass} onClick={handleGenerate} disabled={busy || !fingerprintId || !!live.problem}>
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
                alt="Watermarked SQR"
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
              <div className="flex gap-2"><dt className="w-44 opacity-60">Black modules</dt><dd>{result.counts.black}</dd></div>
              <div className="flex gap-2"><dt className="w-44 opacity-60">White modules</dt><dd>{result.counts.white}</dd></div>
              <div className="flex gap-2"><dt className="w-44 opacity-60">Watermarked</dt><dd>{result.selectedCount} {result.colour} modules of {TOTAL_BLOCKS}</dd></div>
              <div className="flex gap-2"><dt className="w-44 opacity-60">Strength</dt><dd>{strength}</dd></div>
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
              One bit per watermarked {result.colour} module, in row-major order (left to right, top to bottom).
              Each bit is the same bit the standard SQR string has at that module, so this is the 841-bit
              string for this ID with the other colour&apos;s positions left out.
            </p>
          </div>

          <details className="space-y-2 text-sm">
            <summary className="cursor-pointer font-medium">Module mask and the full 841-bit string</summary>
            <div className="space-y-2 pt-2">
              <div className="flex items-center gap-2">
                <span className="font-medium">Mask (1 = watermarked, 841 chars)</span>
                <button type="button" className={ghostButtonClass} onClick={() => copy('mask', result.maskString)}>
                  {copied === 'mask' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <textarea readOnly rows={4} value={result.maskString} className={`${inputClass} font-mono text-xs`} />
              <div className="flex items-center gap-2">
                <span className="font-medium">Standard SQR string for this ID (841 bits)</span>
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
