'use client';

import { useMemo, useState } from 'react';
import MultiCoeffSelector from '@/components/MultiCoeffSelector';
import type { LayerSpec } from '@/lib/multiEncode';
import { generateQrNative, embedWatermarkGrid, computeGridGeometry, lumaToPhysicalPng, type QrVersion, type EcLevel } from '@/lib/qrWatermarkPoc';
import { generateDataMatrixNative, embedWatermarkGridDM, DM_SIZES, DM_CAPACITY, type DmSize } from '@/lib/dataMatrixWatermarkPoc';
import { MAX_TEXT_LENGTH, MIN_GRID_SIZE, MAX_GRID_SIZE, MIN_STRENGTH, MAX_STRENGTH, DEFAULT_SEED_STRING, DEFAULT_STRENGTH, DEFAULT_GRID_SIZE, DEFAULT_MM_SIZE, DEFAULT_DM_SCALE } from '@/lib/dataMatrixWatermarkPoc';
import { generateTsMarker, TS_SPEC } from '@/lib/tsFingerprint';
import { generateSeedBits } from '@/lib/qrWatermarkPoc';

type BarcodeType = 'qr' | 'datamatrix' | 'ts';
const QR_VERSIONS: QrVersion[] = [1, 2, 3, 4, 5];
const EC_LEVELS: EcLevel[] = ['L', 'M', 'Q', 'H'];

export default function WatermarkBarcodePocPage() {
  const [barcodeType, setBarcodeType] = useState<BarcodeType>('qr');
  const [text, setText] = useState('https://example.com/verify/ABC123');
  const [seed, setSeed] = useState(DEFAULT_SEED_STRING);
  const [strength, setStrength] = useState(DEFAULT_STRENGTH);
  const [gridSize, setGridSize] = useState(DEFAULT_GRID_SIZE);
  const [layers, setLayers] = useState<LayerSpec[]>([{ coeff1: { u: 3, v: 1 }, coeff2: { u: 1, v: 3 } }]);
  const [mmSize, setMmSize] = useState(DEFAULT_MM_SIZE);
  const [qrVersion, setQrVersion] = useState<QrVersion>(5);
  const [ecLevel, setEcLevel] = useState<EcLevel>('M');
  const [dmSize, setDmSize] = useState<DmSize>('auto');
  const [dmScale, setDmScale] = useState(DEFAULT_DM_SCALE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bitsString, setBitsString] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dl1x, setDl1x] = useState<string | null>(null);
  const [dl2x, setDl2x] = useState<string | null>(null);
  const [stats, setStats] = useState<string | null>(null);
  const geo = useMemo(() => computeGridGeometry(gridSize), [gridSize]);

  function resetOutput() { setError(null); setStats(null); setBitsString(null); setPreviewUrl(null); setDl1x(null); setDl2x(null); }

  async function generate() {
    resetOutput();
    if (seed.length !== 8) { setError('Seed must be exactly 8 characters.'); return; }
    if (!layers.length) { setError('At least one coefficient pair required.'); return; }
    setBusy(true);
    try {
      let watermarkedY: Float64Array, nativeSize: number, layersApplied: number, seedBitsString: string, carrierInfo: string;
      if (barcodeType === 'qr') {
        const qr = generateQrNative(text, qrVersion, ecLevel);
        const r = embedWatermarkGrid(qr, gridSize, layers, strength, seed);
        watermarkedY = r.watermarkedY; nativeSize = r.nativeSize; layersApplied = r.layersApplied;
        seedBitsString = r.seedBitsString;
        carrierInfo = `QR v${qrVersion} EC-${ecLevel} · ${qr.moduleCount}x${qr.moduleCount} modules · native ${qr.size}x${qr.size}px`;
      } else if (barcodeType === 'datamatrix') {
        const dm = await generateDataMatrixNative(text, dmSize, dmScale);
        const r = embedWatermarkGridDM(dm, gridSize, layers, strength, seed);
        watermarkedY = r.watermarkedY; nativeSize = r.nativeSize; layersApplied = r.layersApplied;
        seedBitsString = r.seedBitsString;
        carrierInfo = `Data Matrix ${dmSize} · scale ${dmScale}px/module · native ${dm.size}x${dm.size}px`;
      } else {
        // TS Fingerprint — fixed spec, no carrier-specific inputs beyond seed
        if (text.length !== 8) throw new Error('TS Fingerprint requires exactly an 8-character fingerprint ID');
        const marker = await generateTsMarker(text, seed);
        // Wrap the flat pixel array as a Float64Array for the shared watermarking path
        const Y = new Float64Array(marker.pixels.length);
        for (let i = 0; i < marker.pixels.length; i++) Y[i] = marker.pixels[i];
        const r = embedWatermarkGrid(
          { size: marker.size, moduleCount: marker.size, Y },
          gridSize, layers, strength, seed
        );
        watermarkedY = r.watermarkedY; nativeSize = r.nativeSize; layersApplied = r.layersApplied;
        seedBitsString = generateSeedBits(seed, r.geometry.bitCapacity).join('');
        carrierInfo = `TS Fingerprint · fixed spec ${TS_SPEC.final_px}x${TS_SPEC.final_px}px · ${TS_SPEC.total_data_bits} data bits · ${TS_SPEC.copies} copies`;
      }
      const pc = document.createElement('canvas');
      pc.width = pc.height = nativeSize;
      const ctx = pc.getContext('2d')!;
      const id = ctx.createImageData(nativeSize, nativeSize);
      for (let i = 0; i < nativeSize * nativeSize; i++) {
        const v = Math.round(watermarkedY[i]);
        id.data[i*4]=v; id.data[i*4+1]=v; id.data[i*4+2]=v; id.data[i*4+3]=255;
      }
      ctx.putImageData(id, 0, 0);
      setPreviewUrl(pc.toDataURL('image/png'));
      setDl1x(URL.createObjectURL(lumaToPhysicalPng(watermarkedY, nativeSize, 1, mmSize)));
      setDl2x(URL.createObjectURL(lumaToPhysicalPng(watermarkedY, nativeSize, 2, mmSize)));
      setBitsString(seedBitsString);
      setStats(`${carrierInfo} · grid ${gridSize}x${gridSize} (${geo.canonicalSize}x${geo.canonicalSize}px) · ${geo.bitCapacity} bits · ${layersApplied} layer(s) · strength=${strength}`);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  return (
    <main className="max-w-3xl mx-auto p-8 space-y-5">
      <h1 className="text-2xl font-semibold">Watermarked Barcode POC</h1>
      <p className="text-sm text-neutral-500">DCT watermarking via resize-then-delta. Toggle between QR and Data Matrix as the carrier — all watermark parameters are shared.</p>

      {/* Toggle */}
      <div className="inline-flex rounded-lg border border-neutral-300 overflow-hidden text-sm font-medium">
        {([['qr', 'QR Code'], ['datamatrix', 'Data Matrix'], ['ts', 'TS Fingerprint']] as [BarcodeType, string][]).map(([t, label]) => (
          <button key={t} onClick={() => { setBarcodeType(t); resetOutput(); }}
            className={`px-5 py-2 transition-colors ${barcodeType === t ? 'bg-black text-white' : 'bg-white text-neutral-600 hover:bg-neutral-100'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Text */}
      <div>
        <label className="block text-sm font-medium mb-1">Text (max {MAX_TEXT_LENGTH} chars)</label>
        <input className="w-full border rounded px-3 py-2 bg-transparent" value={text} maxLength={MAX_TEXT_LENGTH} onChange={e => setText(e.target.value)} />
        <p className="text-xs text-neutral-500 mt-1">{text.length}/{MAX_TEXT_LENGTH}</p>
      </div>

      {/* QR-specific */}
      {barcodeType === 'qr' && (
        <div className="grid grid-cols-2 gap-4 p-4 border rounded bg-neutral-900">
          <div>
            <label className="block text-sm font-medium mb-1">QR Version</label>
            <select className="w-full border border-neutral-700 rounded px-3 py-2 bg-neutral-800 text-neutral-100" value={qrVersion} onChange={e => setQrVersion(Number(e.target.value) as QrVersion)}>
              {QR_VERSIONS.map(v => <option key={v} value={v}>Version {v} ({v*4+17}x{v*4+17})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Error Correction</label>
            <select className="w-full border border-neutral-700 rounded px-3 py-2 bg-neutral-800 text-neutral-100" value={ecLevel} onChange={e => setEcLevel(e.target.value as EcLevel)}>
              {EC_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Data Matrix-specific */}
      {barcodeType === 'datamatrix' && (
        <div className="grid grid-cols-2 gap-4 p-4 border rounded bg-neutral-900">
          <div>
            <label className="block text-sm font-medium mb-1">Symbol size</label>
            <select className="w-full border border-neutral-700 rounded px-3 py-2 bg-neutral-800 text-neutral-100" value={dmSize} onChange={e => setDmSize(e.target.value as DmSize)}>
              {DM_SIZES.map(s => {
                const cap = DM_CAPACITY[s];
                const label = s === 'auto' ? 'Auto (smallest that fits)' : `${s} — up to ${cap.alpha} alpha / ${cap.numeric} numeric`;
                return <option key={s} value={s}>{label}</option>;
              })}
            </select>
            {dmSize !== 'auto' && DM_CAPACITY[dmSize] && (
              <p className="text-xs text-neutral-400 mt-1">
                Capacity: <span className="text-neutral-200">{DM_CAPACITY[dmSize].alpha} alphanumeric</span> or <span className="text-neutral-200">{DM_CAPACITY[dmSize].numeric} numeric</span> chars (ISO/IEC 16022)
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Scale (px/module): {dmScale}</label>
            <input type="range" min={1} max={10} value={dmScale} onChange={e => setDmScale(Number(e.target.value))} className="w-full mt-2" />
          </div>
        </div>
      )}

      {/* TS Fingerprint info panel */}
      {barcodeType === 'ts' && (
        <div className="p-4 border rounded bg-neutral-900 text-xs text-neutral-400 space-y-1">
          <p className="text-neutral-200 font-medium text-sm mb-2">TS Fingerprint — Fixed spec</p>
          <p>Final marker: <span className="text-neutral-100">{TS_SPEC.final_px}×{TS_SPEC.final_px}px ({(TS_SPEC.final_px * TS_SPEC.per_px_mm).toFixed(1)}mm)</span></p>
          <p>Outer border: <span className="text-neutral-100">{TS_SPEC.outer_border}px</span> · White border: <span className="text-neutral-100">{TS_SPEC.white_border}px</span> · Alignment square: <span className="text-neutral-100">{TS_SPEC.small_square}px</span></p>
          <p>Grid: <span className="text-neutral-100">{TS_SPEC.grid_cells}×{TS_SPEC.grid_cells} cells</span> ({TS_SPEC.grid_px}×{TS_SPEC.grid_px}px, {TS_SPEC.cell_size}px/cell)</p>
          <p>Data: <span className="text-neutral-100">{TS_SPEC.total_data_bits} bits total · {TS_SPEC.payload_bits} bits payload · {TS_SPEC.copies} copies</span></p>
          <p className="text-amber-400 mt-2">Corner code squares omitted per POC spec. Payload text must be exactly 8 characters.</p>
        </div>
      )}

      {/* Shared watermark params */}
      <div>
        <label className="block text-sm font-medium mb-1">Seed (8 characters)</label>
        <input className="w-full border rounded px-3 py-2 bg-transparent" value={seed} maxLength={8} onChange={e => setSeed(e.target.value)} />
        <p className="text-xs text-neutral-500 mt-1">{seed.length}/8</p>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Strength: {strength}</label>
        <input type="range" min={MIN_STRENGTH} max={MAX_STRENGTH} value={strength} onChange={e => setStrength(Number(e.target.value))} className="w-full" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Grid size: {gridSize}</label>
        <input type="range" min={MIN_GRID_SIZE} max={MAX_GRID_SIZE} value={gridSize} onChange={e => setGridSize(Number(e.target.value))} className="w-full" />
        <p className="text-xs text-neutral-500 mt-1">Canonical: {geo.canonicalSize}x{geo.canonicalSize}px · {geo.bitCapacity} bits</p>
      </div>
      <div>
        <label className="block text-sm font-medium mb-2">DCT coefficient pairs</label>
        <MultiCoeffSelector layers={layers} onChange={setLayers} />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">MM size</label>
        <input type="number" min={1} step={0.1} className="w-full border rounded px-3 py-2 bg-transparent" value={mmSize} onChange={e => setMmSize(Number(e.target.value))} />
        <p className="text-xs text-neutral-500 mt-1">Physical size (mm) for the 1x PNG. 2x keeps the same mm at double the DPI.</p>
      </div>

      <button onClick={generate} disabled={busy} className="px-4 py-2 rounded bg-black text-white disabled:opacity-50">
        {busy ? 'Generating…' : `Generate Watermarked ${barcodeType === 'qr' ? 'QR Code' : barcodeType === 'datamatrix' ? 'Data Matrix' : 'TS Fingerprint'}`}
      </button>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      {stats && <p className="text-sm text-neutral-600">{stats}</p>}

      {/* Result */}
      <div className="border rounded p-4 flex flex-col items-center gap-3">
        {previewUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={previewUrl} alt="preview" style={{ imageRendering: 'pixelated', maxWidth: '100%' }} />
          : <p className="text-neutral-400 text-sm py-10">Result will appear here.</p>}
        {(dl1x || dl2x) && (
          <div className="flex gap-4">
            {dl1x && <a href={dl1x} download={`watermarked-${barcodeType}-1x.png`} className="text-sm underline text-blue-600">Download PNG (1x)</a>}
            {dl2x && <a href={dl2x} download={`watermarked-${barcodeType}-2x.png`} className="text-sm underline text-blue-600">Download PNG (2x)</a>}
          </div>
        )}
        {bitsString && (
          <div className="w-full">
            <p className="text-xs font-medium text-neutral-400 mb-1">Binary string ({bitsString.length} bits)</p>
            <textarea readOnly value={bitsString} className="w-full text-xs font-mono border rounded p-2 bg-transparent h-24" />
          </div>
        )}
      </div>
    </main>
  );
}
