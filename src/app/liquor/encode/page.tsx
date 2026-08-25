'use client';

import { useRef, useState } from 'react';
import { encodeLiquorImage, extractLiquorBits, MAX_STRENGTH_HINT } from '@/lib/liquorEncode';
import { computeBER } from '@/lib/ber';
import { computeAvgCoeffDifferencePenalized } from '@/lib/imageStego';
import { loadImageFileNative, imageToRgbaNative, rgbaToCanvas } from '@/lib/canvasUtils';
import CoeffGridSelector from '@/components/CoeffGridSelector';
import type { CoeffPos } from '@/lib/dct';
import type { RgbaImage } from '@/lib/imageStego';

type Tab = 'encode' | 'verify';

export default function LiquorEncodePage() {
  const [tab, setTab] = useState<Tab>('encode');

  // --- Encode state ---
  const [strength, setStrength] = useState(150);
  const [seed, setSeed] = useState(1592639710);
  const [coeff1, setCoeff1] = useState<CoeffPos>({ u: 2, v: 3 });
  const [coeff2, setCoeff2] = useState<CoeffPos>({ u: 3, v: 4 });
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState('liquor-encoded.png');
  const [bitString, setBitString] = useState<string | null>(null);
  const [uploadedImage, setUploadedImage] = useState<RgbaImage | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  function runEncode(rgba: RgbaImage) {
    setError(null);
    setBusy(true);
    try {
      const result = encodeLiquorImage(rgba, { strength, seed, coeff1, coeff2 });

      const canvas = canvasRef.current!;
      rgbaToCanvas(result.image, canvas);
      setDownloadUrl(canvas.toDataURL('image/png'));
      setDownloadName(`liquor_seed-${seed}_c1-${coeff1.u}x${coeff1.v}_c2-${coeff2.u}x${coeff2.v}_str-${strength}.png`);
      setBitString(result.bitString);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(file: File) {
    setDownloadUrl(null);
    setBitString(null);
    setFileName(file.name);
    setBusy(true);
    try {
      const { img, width, height } = await loadImageFileNative(file);
      const rgba = imageToRgbaNative(img, width, height);
      setUploadedImage(rgba);
      runEncode(rgba);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  function downloadBitString() {
    if (!bitString) return;
    const blob = new Blob([bitString], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `liquor_seed-${seed}_bits.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // --- Verify state ---
  const [vCoeff1, setVCoeff1] = useState<CoeffPos>({ u: 2, v: 3 });
  const [vCoeff2, setVCoeff2] = useState<CoeffPos>({ u: 3, v: 4 });
  const [referenceBitString, setReferenceBitString] = useState('');
  const [vImage, setVImage] = useState<RgbaImage | null>(null);
  const [vFileName, setVFileName] = useState<string | null>(null);
  const [vError, setVError] = useState<string | null>(null);
  const [vBusy, setVBusy] = useState(false);
  const [vResult, setVResult] = useState<{ ber: number; avgDiff: number; rawAvgDiff: number; flipped: number } | null>(null);

  async function handleVerifyFile(file: File) {
    setVError(null);
    setVResult(null);
    setVFileName(file.name);
    const { img, width, height } = await loadImageFileNative(file);
    setVImage(imageToRgbaNative(img, width, height));
  }

  function runVerify() {
    setVError(null);
    setVResult(null);
    const cleaned = referenceBitString.trim();
    if (cleaned.length !== 1024 || !/^[01]+$/.test(cleaned)) {
      setVError('Reference bit string must be exactly 1024 characters of 0s and 1s.');
      return;
    }
    if (!vImage) {
      setVError('Upload an image to verify.');
      return;
    }
    setVBusy(true);
    try {
      const referenceBits = cleaned.split('').map(Number);
      const { bits: extractedBits } = extractLiquorBits(vImage, vCoeff1, vCoeff2);
      const ber = computeBER(referenceBits, extractedBits);
      const diff = computeAvgCoeffDifferencePenalized(vImage, vCoeff1, vCoeff2, referenceBits);
      setVResult({ ber, avgDiff: diff.averageDifference, rawAvgDiff: diff.rawAverageDifference, flipped: diff.flippedBlocks });
    } catch (e) {
      setVError(e instanceof Error ? e.message : String(e));
    } finally {
      setVBusy(false);
    }
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-10 space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-neutral-50">Liquor POC</h1>
        <p className="text-sm text-neutral-400 mt-1 leading-relaxed">
          Plain DCT coefficient-pair embedding of a raw 1024-bit string — no BCH, no error
          correction, no PRNG masking. The seed deterministically generates all 1024 bits; every bit
          maps 1:1 onto one of the 1024 canonical blocks, no padding or gaps.
        </p>
      </div>

      <div className="flex gap-2 border border-neutral-800 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab('encode')}
          className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${tab === 'encode' ? 'bg-red-600 text-white' : 'text-neutral-400 hover:text-neutral-200'}`}
        >
          Encode
        </button>
        <button
          onClick={() => setTab('verify')}
          className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${tab === 'verify' ? 'bg-red-600 text-white' : 'text-neutral-400 hover:text-neutral-200'}`}
        >
          Verify
        </button>
      </div>

      {tab === 'encode' && (
        <>
          <section className="space-y-5 border border-neutral-800 rounded-lg p-6 bg-neutral-950">
            <div>
              <label className="block text-sm font-medium text-neutral-200 mb-1">
                Strength: <span className="font-mono text-red-400">{strength}</span> / {MAX_STRENGTH_HINT}
              </label>
              <input
                type="range"
                min={0}
                max={MAX_STRENGTH_HINT}
                value={strength}
                onChange={(e) => setStrength(Number(e.target.value))}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-200 mb-1">Seed</label>
              <input
                type="number"
                className="w-full border border-neutral-700 rounded px-3 py-2 bg-black text-neutral-100"
                value={seed}
                onChange={(e) => setSeed(Number(e.target.value) || 0)}
              />
            </div>

            <CoeffGridSelector coeff1={coeff1} coeff2={coeff2} onChange={(c1, c2) => { setCoeff1(c1); setCoeff2(c2); }} />
            <p className="text-xs text-neutral-500">
              Pair: <span className="font-mono text-red-400">({coeff1.u},{coeff1.v})</span> vs{' '}
              <span className="font-mono text-neutral-300">({coeff2.u},{coeff2.v})</span>
            </p>

            <div>
              <label className="block text-sm font-medium text-neutral-200 mb-2">Target image</label>
              <input
                type="file"
                accept="image/*"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
                className="block text-sm text-neutral-300"
              />
              {fileName && <p className="text-xs text-neutral-500 mt-1">{fileName}</p>}
            </div>

            {uploadedImage && (
              <button
                onClick={() => runEncode(uploadedImage)}
                disabled={busy}
                className="w-full px-4 py-2.5 rounded border border-red-700 text-red-400 font-medium hover:bg-red-950/40 transition-colors disabled:opacity-50"
              >
                Re-encode with current settings
              </button>
            )}

            {busy && <p className="text-sm text-neutral-400 animate-pulse">Encoding…</p>}
            {error && <p className="text-sm text-red-500 font-medium">{error}</p>}
          </section>

          <section className="border border-neutral-800 rounded-lg p-6 flex flex-col items-center gap-3 bg-neutral-950">
            <canvas ref={canvasRef} className="border border-neutral-800 rounded max-w-full" />
            {downloadUrl && (
              <>
                <a href={downloadUrl} download={downloadName} className="text-sm text-red-400 font-medium hover:text-red-300">
                  Download encoded PNG
                </a>
                <p className="text-[11px] text-neutral-600 font-mono break-all text-center">{downloadName}</p>
              </>
            )}
          </section>

          {bitString && (
            <section className="border border-neutral-800 rounded-lg p-6 bg-neutral-950 space-y-3">
              <h2 className="text-sm font-semibold text-neutral-200">1024-bit string (for authentication)</h2>
              <textarea
                readOnly
                value={bitString}
                className="w-full h-24 bg-black border border-neutral-800 rounded p-2 text-xs font-mono text-neutral-300 resize-none"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => navigator.clipboard.writeText(bitString)}
                  className="text-xs text-red-400 hover:text-red-300 underline"
                >
                  Copy to clipboard
                </button>
                <button onClick={downloadBitString} className="text-xs text-red-400 hover:text-red-300 underline">
                  Download as .txt
                </button>
              </div>
            </section>
          )}
        </>
      )}

      {tab === 'verify' && (
        <section className="space-y-5 border border-neutral-800 rounded-lg p-6 bg-neutral-950">
          <p className="text-xs text-neutral-500 leading-relaxed">
            Paste the original 1024-bit string, set the same coefficient pair used at encode time, and
            upload the image to check against — reports BER and the penalized average coefficient
            difference, same diagnostics used elsewhere in the app.
          </p>

          <div>
            <label className="block text-sm font-medium text-neutral-200 mb-1">Reference 1024-bit string</label>
            <textarea
              value={referenceBitString}
              onChange={(e) => setReferenceBitString(e.target.value)}
              placeholder="Paste the 1024-character binary string exported at encode time"
              className="w-full h-24 bg-black border border-neutral-700 rounded p-2 text-xs font-mono text-neutral-300 resize-none"
            />
            <p className="text-xs text-neutral-500 mt-1">{referenceBitString.trim().length} / 1024 characters</p>
          </div>

          <CoeffGridSelector coeff1={vCoeff1} coeff2={vCoeff2} onChange={(c1, c2) => { setVCoeff1(c1); setVCoeff2(c2); }} />

          <div>
            <label className="block text-sm font-medium text-neutral-200 mb-2">Image to verify</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleVerifyFile(f);
              }}
              className="block text-sm text-neutral-300"
            />
            {vFileName && <p className="text-xs text-neutral-500 mt-1">{vFileName}</p>}
          </div>

          {vError && <p className="text-sm text-red-500 font-medium">{vError}</p>}

          <button
            onClick={runVerify}
            disabled={!vImage || vBusy}
            className="w-full px-4 py-2.5 rounded bg-red-600 text-white font-medium hover:bg-red-500 transition-colors disabled:opacity-40"
          >
            {vBusy ? 'Verifying…' : 'Verify'}
          </button>

          {vResult && (
            <div className="border border-neutral-800 rounded p-4 space-y-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-neutral-500">BER</p>
                  <p className="text-2xl font-mono text-red-400">{(vResult.ber * 100).toFixed(2)}%</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500">Avg coeff diff (penalized)</p>
                  <p className="text-2xl font-mono text-red-400">{vResult.avgDiff.toFixed(2)}</p>
                </div>
              </div>
              <p className="text-[11px] text-neutral-500">
                raw (unpenalized): {vResult.rawAvgDiff.toFixed(2)} · {vResult.flipped} flipped blocks
              </p>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
