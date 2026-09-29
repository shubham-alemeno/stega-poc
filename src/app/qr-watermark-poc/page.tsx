'use client';

import { useMemo, useRef, useState } from 'react';
import MultiCoeffSelector from '@/components/MultiCoeffSelector';
import type { LayerSpec } from '@/lib/multiEncode';
import {
  generateQrNative,
  embedWatermarkGrid,
  computeGridGeometry,
  lumaToPhysicalPng,
  MAX_TEXT_LENGTH,
  MIN_GRID_SIZE,
  MAX_GRID_SIZE,
  MIN_STRENGTH,
  MAX_STRENGTH,
  DEFAULT_SEED_STRING,
  DEFAULT_STRENGTH,
  DEFAULT_GRID_SIZE,
  DEFAULT_MM_SIZE,
  type QrVersion,
  type EcLevel,
} from '@/lib/qrWatermarkPoc';

const QR_VERSIONS: QrVersion[] = [1, 2, 3, 4, 5];
const EC_LEVELS: EcLevel[] = ['L', 'M', 'Q', 'H'];

export default function QrWatermarkPocPage() {
  const [text, setText] = useState('https://example.com/verify/ABC123');
  const [version, setVersion] = useState<QrVersion>(5);
  const [ecLevel, setEcLevel] = useState<EcLevel>('M');
  const [seed, setSeed] = useState(DEFAULT_SEED_STRING);
  const [strength, setStrength] = useState(DEFAULT_STRENGTH);
  const [gridSize, setGridSize] = useState(DEFAULT_GRID_SIZE);
  const [layers, setLayers] = useState<LayerSpec[]>([{ coeff1: { u: 3, v: 1 }, coeff2: { u: 1, v: 3 } }]);
  const [mmSize, setMmSize] = useState(DEFAULT_MM_SIZE);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bitsString, setBitsString] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [downloadUrl1x, setDownloadUrl1x] = useState<string | null>(null);
  const [downloadUrl2x, setDownloadUrl2x] = useState<string | null>(null);
  const [stats, setStats] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const liveGeometry = useMemo(() => computeGridGeometry(gridSize), [gridSize]);

  async function handleGenerate() {
    setError(null);
    setStats(null);
    setBitsString(null);
    setPreviewUrl(null);
    setDownloadUrl1x(null);
    setDownloadUrl2x(null);

    if (seed.length !== 8) {
      setError('Watermarking seed must be exactly 8 characters.');
      return;
    }
    if (layers.length === 0) {
      setError('At least one DCT coefficient pair is required.');
      return;
    }

    setBusy(true);
    try {
      const qr = generateQrNative(text, version, ecLevel);
      const result = embedWatermarkGrid(qr, gridSize, layers, strength, seed);

      const canvas = canvasRef.current!;
      canvas.width = result.nativeSize;
      canvas.height = result.nativeSize;
      const ctx = canvas.getContext('2d')!;
      const imgData = ctx.createImageData(result.nativeSize, result.nativeSize);
      for (let i = 0; i < result.nativeSize * result.nativeSize; i++) {
        const v = Math.round(result.watermarkedY[i]);
        imgData.data[i * 4] = v;
        imgData.data[i * 4 + 1] = v;
        imgData.data[i * 4 + 2] = v;
        imgData.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(imgData, 0, 0);
      setPreviewUrl(canvas.toDataURL('image/png'));

      const blob1x = await lumaToPhysicalPng(result.watermarkedY, result.nativeSize, 1, mmSize);
      const blob2x = await lumaToPhysicalPng(result.watermarkedY, result.nativeSize, 2, mmSize);
      setDownloadUrl1x(URL.createObjectURL(blob1x));
      setDownloadUrl2x(URL.createObjectURL(blob2x));

      setBitsString(result.seedBitsString);
      setStats(
        `QR: version ${version} (${qr.moduleCount}x${qr.moduleCount} modules, EC ${ecLevel}), native size ${qr.size}x${qr.size}px · ` +
          `Watermark grid: ${gridSize}x${gridSize} (canonical ${liveGeometry.canonicalSize}x${liveGeometry.canonicalSize}px), ` +
          `${liveGeometry.bitCapacity} bits capacity, ${result.layersApplied} coefficient-pair layer(s), strength=${strength}`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="max-w-3xl mx-auto p-8 space-y-6">
      <h1 className="text-2xl font-semibold">Watermarked Barcode POC — QR Generation</h1>
      <p className="text-sm text-neutral-500">
        Generates a QR code, then watermarks it with a seed-derived random bit string via multi-layer
        DCT coefficient embedding, using the same resize-then-delta architecture as the general image
        stego pipeline — parameterized here by an independent watermark grid size, not tied to the
        QR&apos;s own module count.
      </p>

      <div className="space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1">Text for code (max {MAX_TEXT_LENGTH} characters)</label>
          <input
            className="w-full border rounded px-3 py-2 bg-transparent"
            value={text}
            maxLength={MAX_TEXT_LENGTH}
            onChange={(e) => setText(e.target.value)}
          />
          <p className="text-xs text-neutral-500 mt-1">{text.length}/{MAX_TEXT_LENGTH} characters</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">QR Version</label>
            <select
              className="w-full border rounded px-3 py-2 bg-transparent"
              value={version}
              onChange={(e) => setVersion(Number(e.target.value) as QrVersion)}
            >
              {QR_VERSIONS.map((v) => (
                <option key={v} value={v}>
                  Version {v} ({(v * 4 + 17)}x{v * 4 + 17})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">QR Error Correction</label>
            <select
              className="w-full border rounded px-3 py-2 bg-transparent"
              value={ecLevel}
              onChange={(e) => setEcLevel(e.target.value as EcLevel)}
            >
              {EC_LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {lvl}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Watermarking seed (8 characters)</label>
          <input
            className="w-full border rounded px-3 py-2 bg-transparent"
            value={seed}
            maxLength={8}
            onChange={(e) => setSeed(e.target.value)}
          />
          <p className="text-xs text-neutral-500 mt-1">{seed.length}/8 characters</p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Watermark strength: {strength}
          </label>
          <input
            type="range"
            min={MIN_STRENGTH}
            max={MAX_STRENGTH}
            value={strength}
            onChange={(e) => setStrength(Number(e.target.value))}
            className="w-full"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Watermarking grid size: {gridSize}
          </label>
          <input
            type="range"
            min={MIN_GRID_SIZE}
            max={MAX_GRID_SIZE}
            value={gridSize}
            onChange={(e) => setGridSize(Number(e.target.value))}
            className="w-full"
          />
          <p className="text-xs text-neutral-500 mt-1">
            Canonical grid: {liveGeometry.canonicalSize}x{liveGeometry.canonicalSize}px &middot;{' '}
            Bit capacity: {liveGeometry.bitCapacity} bits
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">DCT coefficient pair selection</label>
          <MultiCoeffSelector layers={layers} onChange={setLayers} />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">MM size of image</label>
          <input
            type="number"
            min={1}
            step={0.1}
            className="w-full border rounded px-3 py-2 bg-transparent"
            value={mmSize}
            onChange={(e) => setMmSize(Number(e.target.value))}
          />
          <p className="text-xs text-neutral-500 mt-1">
            Physical size (mm) the 1x PNG should report to image-editing software. The 2x PNG keeps the
            same physical size at double the pixel resolution and DPI.
          </p>
        </div>

        <button
          onClick={handleGenerate}
          disabled={busy}
          className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
        >
          {busy ? 'Generating…' : 'Generate Watermarked QR'}
        </button>

        {error && <p className="text-red-600 text-sm">{error}</p>}
        {stats && <p className="text-sm text-neutral-600">{stats}</p>}
      </div>

      <div className="border rounded p-4 flex flex-col items-center gap-3">
        <canvas ref={canvasRef} className="hidden" />
        {previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="Watermarked QR preview" style={{ imageRendering: 'pixelated', maxWidth: '100%' }} />
        )}
        {(downloadUrl1x || downloadUrl2x) && (
          <div className="flex gap-4">
            {downloadUrl1x && (
              <a href={downloadUrl1x} download="watermarked-qr-1x.png" className="text-sm underline text-blue-600">
                Download PNG (1x)
              </a>
            )}
            {downloadUrl2x && (
              <a href={downloadUrl2x} download="watermarked-qr-2x.png" className="text-sm underline text-blue-600">
                Download PNG (2x)
              </a>
            )}
          </div>
        )}
        {bitsString && (
          <div className="w-full">
            <p className="text-xs font-medium text-neutral-400 mb-1">Random binary string ({bitsString.length} bits)</p>
            <textarea
              readOnly
              value={bitsString}
              className="w-full text-xs font-mono border rounded p-2 bg-transparent h-24"
            />
          </div>
        )}
      </div>
    </main>
  );
}
