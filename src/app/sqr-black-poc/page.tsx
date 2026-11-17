'use client';

import { useRef, useState } from 'react';
import {
  generateFingerprintId,
  generateQrNative,
  embedWatermarkBlackOnly,
  renderPhysicalOutputs,
  blackModuleBitMatch,
  FINGERPRINT_ID_LENGTH,
  MIN_STRENGTH,
  MAX_STRENGTH,
  DEFAULT_STRENGTH,
  MODULE_COUNT,
  TOTAL_BLOCKS,
  DPI_300_SIZE,
  DPI_600_SIZE,
  PHYSICAL_MM_SIZE,
} from '@/lib/qrBlackOnlyWatermarkPoc';

export default function SqrBlackPocPage() {
  const [fingerprintId, setFingerprintId] = useState(generateFingerprintId());
  const [strength, setStrength] = useState(DEFAULT_STRENGTH);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [downloadUrl300, setDownloadUrl300] = useState<string | null>(null);
  const [downloadUrl600, setDownloadUrl600] = useState<string | null>(null);
  const [stats, setStats] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  function handleRandomId() {
    setFingerprintId(generateFingerprintId());
  }

  async function handleGenerate() {
    setError(null);
    setStats(null);
    setPreviewUrl(null);
    setDownloadUrl300(null);
    setDownloadUrl600(null);

    if (fingerprintId.length !== FINGERPRINT_ID_LENGTH) {
      setError(`Fingerprint ID must be exactly ${FINGERPRINT_ID_LENGTH} characters.`);
      return;
    }

    setBusy(true);
    try {
      const qr = generateQrNative(fingerprintId);
      const result = embedWatermarkBlackOnly(qr, fingerprintId, strength);
      const { matched, total } = blackModuleBitMatch(result);
      const outputs = renderPhysicalOutputs(result);

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

      setDownloadUrl300(URL.createObjectURL(outputs.png300dpi));
      setDownloadUrl600(URL.createObjectURL(outputs.png600dpi));

      setStats(
        `Version 5 / EC-H QR (${MODULE_COUNT}x${MODULE_COUNT} modules) · ` +
          `${result.blackBlockCount}/${TOTAL_BLOCKS} black modules watermarked, strength=${strength} · ` +
          `bit-match on black modules: ${matched}/${total} (${((100 * matched) / total).toFixed(1)}%) · ` +
          `300dpi ${DPI_300_SIZE}x${DPI_300_SIZE}px / 600dpi ${DPI_600_SIZE}x${DPI_600_SIZE}px, ${PHYSICAL_MM_SIZE.toFixed(2)}mm`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="max-w-3xl mx-auto p-8 space-y-6">
      <h1 className="text-2xl font-semibold">SQR Black-Modules-Only Watermark POC</h1>
      <p className="text-sm text-neutral-500">
        Fixed version 5 / EC-H QR fingerprint (37x37 modules, 8px/module = one DCT block per module — no
        grid resize needed). Only BLACK modules get the DCT coefficient-pair watermark; white modules are
        left untouched. The embedded bit stream is derived from the fingerprint ID with the same
        seed-&gt;PRNG algorithm as the <code>qr-watermark-poc</code> page, so a decoder re-deriving bits
        from the ID needs no new logic.
      </p>

      <div className="space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1">Fingerprint ID ({FINGERPRINT_ID_LENGTH} characters)</label>
          <div className="flex gap-2">
            <input
              className="flex-1 border rounded px-3 py-2 bg-transparent font-mono uppercase"
              value={fingerprintId}
              maxLength={FINGERPRINT_ID_LENGTH}
              onChange={(e) => setFingerprintId(e.target.value.toUpperCase())}
            />
            <button type="button" onClick={handleRandomId} className="px-3 py-2 rounded border text-sm">
              Random
            </button>
          </div>
          <p className="text-xs text-neutral-500 mt-1">{fingerprintId.length}/{FINGERPRINT_ID_LENGTH} characters</p>
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
        {(downloadUrl300 || downloadUrl600) && (
          <div className="flex gap-4">
            {downloadUrl300 && (
              <a href={downloadUrl300} download={`${fingerprintId}_300dpi.png`} className="text-sm underline text-blue-600">
                Download PNG (300dpi)
              </a>
            )}
            {downloadUrl600 && (
              <a href={downloadUrl600} download={`${fingerprintId}_600dpi.png`} className="text-sm underline text-blue-600">
                Download PNG (600dpi)
              </a>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
