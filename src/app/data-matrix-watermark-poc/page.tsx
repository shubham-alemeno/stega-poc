'use client';

import { useMemo, useState } from 'react';
import MultiCoeffSelector from '@/components/MultiCoeffSelector';
import type { LayerSpec } from '@/lib/multiEncode';
import {
  generateDataMatrixNative, embedWatermarkGridDM, computeGridGeometry,
  lumaToPhysicalPng, DM_SIZES, DM_CAPACITY, MAX_TEXT_LENGTH, MIN_GRID_SIZE, MAX_GRID_SIZE,
  MIN_STRENGTH, MAX_STRENGTH, DEFAULT_SEED_STRING, DEFAULT_STRENGTH,
  DEFAULT_GRID_SIZE, DEFAULT_MM_SIZE, DEFAULT_DM_SCALE, type DmSize,
} from '@/lib/dataMatrixWatermarkPoc';

export default function DataMatrixWatermarkPocPage() {
  const [text, setText] = useState('https://example.com/verify/ABC123');
  const [dmSize, setDmSize] = useState<DmSize>('auto');
  const [dmScale, setDmScale] = useState(DEFAULT_DM_SCALE);
  const [seed, setSeed] = useState(DEFAULT_SEED_STRING);
  const [strength, setStrength] = useState(DEFAULT_STRENGTH);
  const [gridSize, setGridSize] = useState(DEFAULT_GRID_SIZE);
  const [layers, setLayers] = useState<LayerSpec[]>([{ coeff1: { u: 3, v: 1 }, coeff2: { u: 1, v: 3 } }]);
  const [mmSize, setMmSize] = useState(DEFAULT_MM_SIZE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bitsString, setBitsString] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dl1x, setDl1x] = useState<string | null>(null);
  const [dl2x, setDl2x] = useState<string | null>(null);
  const [stats, setStats] = useState<string | null>(null);
  const geo = useMemo(() => computeGridGeometry(gridSize), [gridSize]);

  async function generate() {
    setError(null); setStats(null); setBitsString(null); setPreviewUrl(null); setDl1x(null); setDl2x(null);
    if (seed.length !== 8) { setError('Seed must be exactly 8 characters.'); return; }
    if (!layers.length) { setError('At least one coefficient pair required.'); return; }
    setBusy(true);
    try {
      const dm = await generateDataMatrixNative(text, dmSize, dmScale);
      const result = embedWatermarkGridDM(dm, gridSize, layers, strength, seed);
      const pc = document.createElement('canvas');
      pc.width = pc.height = result.nativeSize;
      const ctx = pc.getContext('2d')!;
      const id = ctx.createImageData(result.nativeSize, result.nativeSize);
      for (let i = 0; i < result.nativeSize * result.nativeSize; i++) {
        const v = Math.round(result.watermarkedY[i]);
        id.data[i*4]=v; id.data[i*4+1]=v; id.data[i*4+2]=v; id.data[i*4+3]=255;
      }
      ctx.putImageData(id, 0, 0);
      setPreviewUrl(pc.toDataURL('image/png'));
      setDl1x(URL.createObjectURL(lumaToPhysicalPng(result.watermarkedY, result.nativeSize, 1, mmSize)));
      setDl2x(URL.createObjectURL(lumaToPhysicalPng(result.watermarkedY, result.nativeSize, 2, mmSize)));
      setBitsString(result.seedBitsString);
      setStats(`Data Matrix ${dmSize} · scale ${dmScale}px/module · native ${dm.size}x${dm.size}px · grid ${gridSize}x${gridSize} (${geo.canonicalSize}x${geo.canonicalSize}px) · ${geo.bitCapacity} bits · ${result.layersApplied} layer(s) · strength=${strength}`);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  return (
    <main className="max-w-3xl mx-auto p-8 space-y-5">
      <h1 className="text-2xl font-semibold">Watermarked Data Matrix POC</h1>
      <div>
        <label className="block text-sm font-medium mb-1">Text (max {MAX_TEXT_LENGTH} chars)</label>
        <input className="w-full border rounded px-3 py-2 bg-transparent" value={text} maxLength={MAX_TEXT_LENGTH} onChange={e => setText(e.target.value)} />
        <p className="text-xs text-neutral-500 mt-1">{text.length}/{MAX_TEXT_LENGTH}</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Symbol size</label>
          <select className="w-full border rounded px-3 py-2 bg-transparent" value={dmSize} onChange={e => setDmSize(e.target.value as DmSize)}>
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
      </div>
      <button onClick={generate} disabled={busy} className="px-4 py-2 rounded bg-black text-white disabled:opacity-50">
        {busy ? 'Generating…' : 'Generate Watermarked Data Matrix'}
      </button>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      {stats && <p className="text-sm text-neutral-600">{stats}</p>}
      <div className="border rounded p-4 flex flex-col items-center gap-3">
        {previewUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={previewUrl} alt="preview" style={{ imageRendering: 'pixelated', maxWidth: '100%' }} />
          : <p className="text-neutral-400 text-sm py-10">Result will appear here.</p>}
        {(dl1x || dl2x) && (
          <div className="flex gap-4">
            {dl1x && <a href={dl1x} download="watermarked-dm-1x.png" className="text-sm underline text-blue-600">Download PNG (1x)</a>}
            {dl2x && <a href={dl2x} download="watermarked-dm-2x.png" className="text-sm underline text-blue-600">Download PNG (2x)</a>}
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
