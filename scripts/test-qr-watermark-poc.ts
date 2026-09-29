import {
  stringSeedToInt,
  generateSeedBits,
  generateQrNative,
  computeGridGeometry,
  embedWatermarkGrid,
} from '../src/lib/qrWatermarkPoc';

let allOk = true;
function check(label: string, cond: boolean) {
  console.log(`${cond ? 'OK  ' : 'FAIL'} - ${label}`);
  if (!cond) allOk = false;
}

// Determinism
check('stringSeedToInt deterministic', stringSeedToInt('witomark') === stringSeedToInt('witomark'));
check('stringSeedToInt seed-sensitive', stringSeedToInt('witomark') !== stringSeedToInt('different'));

const bits1 = generateSeedBits('witomark', 256);
const bits2 = generateSeedBits('witomark', 256);
check('generateSeedBits deterministic', bits1.join('') === bits2.join(''));
check('generateSeedBits correct length', bits1.length === 256);
check('generateSeedBits genuinely binary', bits1.every((b) => b === 0 || b === 1));

// Grid geometry
const geo16 = computeGridGeometry(16);
check('computeGridGeometry(16) canonicalSize=128', geo16.canonicalSize === 128);
check('computeGridGeometry(16) bitCapacity=256', geo16.bitCapacity === 256);
const geo1 = computeGridGeometry(1);
check('computeGridGeometry(1) canonicalSize=8', geo1.canonicalSize === 8);
const geo40 = computeGridGeometry(40);
check('computeGridGeometry(40) canonicalSize=320', geo40.canonicalSize === 320);

// QR generation across all versions
for (const version of [1, 2, 3, 4, 5] as const) {
  const qr = generateQrNative(`test-v${version}`, version, 'M');
  const expectedModules = version * 4 + 17;
  check(`version ${version}: correct module count`, qr.moduleCount === expectedModules);
  check(`version ${version}: native size = modules*8`, qr.size === expectedModules * 8);
}

// Reject empty / over-length text
try {
  generateQrNative('', 5, 'M');
  check('rejects empty text', false);
} catch {
  check('rejects empty text', true);
}
try {
  generateQrNative('x'.repeat(101), 5, 'M');
  check('rejects >100 char text', false);
} catch {
  check('rejects >100 char text', true);
}

// Full embed pipeline - output size matches native QR size regardless of grid size
const qr5 = generateQrNative('https://example.com/test', 5, 'M');
for (const gridSize of [8, 16, 32]) {
  const result = embedWatermarkGrid(
    qr5,
    gridSize,
    [{ coeff1: { u: 3, v: 1 }, coeff2: { u: 1, v: 3 } }],
    60,
    'witomark'
  );
  check(`gridSize=${gridSize}: output size matches native QR size`, result.watermarkedY.length === qr5.Y.length);
  check(`gridSize=${gridSize}: seedBits length matches bit capacity`, result.seedBits.length === gridSize * gridSize);

  // Confirm the watermark actually changed pixels (non-trivial embed)
  let maxDiff = 0;
  for (let i = 0; i < qr5.Y.length; i++) {
    maxDiff = Math.max(maxDiff, Math.abs(result.watermarkedY[i] - qr5.Y[i]));
  }
  check(`gridSize=${gridSize}: watermark produced a real, bounded change (0 < diff < 255)`, maxDiff > 0 && maxDiff < 255);
}

// Multi-layer cascade - more layers should generally mean more cumulative pixel change
const singleLayer = embedWatermarkGrid(qr5, 16, [{ coeff1: { u: 3, v: 1 }, coeff2: { u: 1, v: 3 } }], 60, 'witomark');
const tripleLayer = embedWatermarkGrid(
  qr5,
  16,
  [
    { coeff1: { u: 3, v: 1 }, coeff2: { u: 1, v: 3 } },
    { coeff1: { u: 2, v: 1 }, coeff2: { u: 1, v: 2 } },
    { coeff1: { u: 4, v: 2 }, coeff2: { u: 2, v: 4 } },
  ],
  60,
  'witomark'
);
check('3-layer cascade applies all layers', tripleLayer.layersApplied === 3);
let sumSingle = 0, sumTriple = 0;
for (let i = 0; i < qr5.Y.length; i++) {
  sumSingle += Math.abs(singleLayer.watermarkedY[i] - qr5.Y[i]);
  sumTriple += Math.abs(tripleLayer.watermarkedY[i] - qr5.Y[i]);
}
check('3-layer cascade produces more total change than 1 layer', sumTriple > sumSingle);

// Different seeds give different bit strings (and thus different output)
const seedA = embedWatermarkGrid(qr5, 16, [{ coeff1: { u: 3, v: 1 }, coeff2: { u: 1, v: 3 } }], 60, 'AAAAAAAA');
const seedB = embedWatermarkGrid(qr5, 16, [{ coeff1: { u: 3, v: 1 }, coeff2: { u: 1, v: 3 } }], 60, 'BBBBBBBB');
check('different seeds produce different bit strings', seedA.seedBitsString !== seedB.seedBitsString);

console.log(allOk ? '\nALL CHECKS PASSED' : '\nSOME CHECKS FAILED');
process.exit(allOk ? 0 : 1);
