// Functional test for src/lib/sqrPoc.ts. Run: npx tsx scripts/test-sqr-poc.ts
// Expected values were produced by the backend's sqr_generator.py algorithm
// (Python: qrcodegen, scipy DCT, zlib.crc32) for strength 120 and prefix
// "https://example.com/v/", no emblem. The 'all' mode is the standard SQR.

import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { encodeQrV3M, QrDataTooLongError } from '../src/lib/qrV3M';
import {
  BLOCK_SIZE, CANONICAL_SIZE, QR_MODULES, TOTAL_BLOCKS,
  buildQrModules, countModules, crc32, encodeGrayPng, generateFingerprintId, generateMaskBits,
  generateSqrPoc, renderCanonical, type WatermarkColour,
} from '../src/lib/sqrPoc';

const PREFIX = 'https://example.com/v/';
const QR_FIXTURES: Array<{ label: string; text: string; sha?: string; mask?: number; tooLong?: boolean }> = [
  {
    "label": "numeric, 40 digits",
    "text": "0123456789012345678901234567890123456789",
    "sha": "0e09122d6ff3d0275f1fabb4997c10b7dcc6d4dbffb2d4206181953f03f00848",
    "mask": 6
  },
  {
    "label": "numeric, 101 digits (max)",
    "text": "01234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890",
    "sha": "519b77af51e83af9626179c4ae5f546e087be40199fecb071b5a9f4bfc43cb08",
    "mask": 6
  },
  {
    "label": "numeric, 102 digits",
    "text": "012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901",
    "tooLong": true
  },
  {
    "label": "alphanumeric",
    "text": "HTTPS://WMK.IO/ABC123 $%*+-./:",
    "sha": "1147127e57fe9c43db571675b76d1b948d529c6887a5a45e25c7e673108a49b0",
    "mask": 4
  },
  {
    "label": "alphanumeric, 61 chars (max)",
    "text": "HTTPS://WMK.IO/ABC123XYZHTTPS://WMK.IO/ABC123XYZHTTPS://WMK.I",
    "sha": "63ed046da64401a39f5d1019a75ed4b2cc6c0f901d586bab8f6f933c881d918a",
    "mask": 2
  },
  {
    "label": "alphanumeric, 62 chars",
    "text": "HTTPS://WMK.IO/ABC123XYZHTTPS://WMK.IO/ABC123XYZHTTPS://WMK.IO",
    "tooLong": true
  },
  {
    "label": "byte",
    "text": "https://wmk.io/s/Ab3Xy9Qw2Lm7",
    "sha": "69a69ea5493876f553e65a9f7892922cfdf4d357b59fab5e5d0d3369a19ca5fe",
    "mask": 0
  },
  {
    "label": "byte, UTF-8",
    "text": "https://example.com/é日😀",
    "sha": "45a4305bb56c2cba4990c7c972603789dfe4010c7dc63a80bf245d2fd8355169",
    "mask": 3
  },
  {
    "label": "byte, 42 bytes (max)",
    "text": "https://example.com/v/aaaaaaaaaaaaaaaaaaaa",
    "sha": "819b8d4fe928c7f4d619af1c2b019905598e603d08920d1f05a33df756f7a38d",
    "mask": 2
  },
  {
    "label": "byte, 43 bytes",
    "text": "https://example.com/v/aaaaaaaaaaaaaaaaaaaaa",
    "tooLong": true
  }
];
const FIXTURES = [
  {
    "id": "Ab3Xy9Qw2Lm7",
    "crc": 3681399168,
    "blackModules": 426,
    "whiteModules": 415,
    "modulesSha": "b462a3a46cde0f803738a13b7344f68b2334e15d27cfb01c99fe096ca42337c8",
    "fullSha": "2ae70aeaa6525766fc0ba6786c13083728d7d55eae64a627fcecc709cd8c96ea",
    "modes": {
      "all": {
        "pixelsSha": "c4753b4caa2a2d4b1a05265496b6f07566f561fc9a4abcd0670bbc46aa49217c",
        "refSha": "2ae70aeaa6525766fc0ba6786c13083728d7d55eae64a627fcecc709cd8c96ea",
        "refLen": 841,
        "maskSha": "4a2cff9d7ab3a3d3a0946b49bdfef4d3503098f5d174aba42d2030f94dd71e93"
      },
      "black": {
        "pixelsSha": "9950b15ebdce3e49265a37741daffd8e23c380c6f339d71ff6553aaa061fe20d",
        "refSha": "e1f762b7691454a6ced564bd8cdfbbca22154b2e3323920479f131e9c082d5e9",
        "refLen": 426,
        "maskSha": "b462a3a46cde0f803738a13b7344f68b2334e15d27cfb01c99fe096ca42337c8"
      },
      "white": {
        "pixelsSha": "bbf7c0a097b3618558a82da9675a2f0f7a3632080a6bf815a8c50adfd73c4524",
        "refSha": "276f24585e66e9e97500957f9c4c43498c46caf1bec5ff9ba323debe05ac8004",
        "refLen": 415,
        "maskSha": "fc0f46d52fd8ad2cf239a035bc6f3f1d32fe5b7fb5fca510892a5fd79f1a01c5"
      }
    }
  },
  {
    "id": "K7pQ0zTn4VbE",
    "crc": 2463663544,
    "blackModules": 443,
    "whiteModules": 398,
    "modulesSha": "834896645ad5712deda163ea9405ceedc7ec68673a52d37f63ae67b605f8f1b2",
    "fullSha": "0f2317eb8fb5e996a7473a8d531f91dbc975444a4c8f48291a99b1b1ca2eb32b",
    "modes": {
      "all": {
        "pixelsSha": "1772142da863931709ce30d6672722de9c1560387e8a24a2b27934b478080371",
        "refSha": "0f2317eb8fb5e996a7473a8d531f91dbc975444a4c8f48291a99b1b1ca2eb32b",
        "refLen": 841,
        "maskSha": "4a2cff9d7ab3a3d3a0946b49bdfef4d3503098f5d174aba42d2030f94dd71e93"
      },
      "black": {
        "pixelsSha": "2dfcb21d471ffdce2a0bb3cacb6f95c3fe2ebe48dbbb03f86b87a60aa493ac50",
        "refSha": "e6aad05985deb027fcf76d4518e121956a12ba6509dca9d26024fc3078d406ed",
        "refLen": 443,
        "maskSha": "834896645ad5712deda163ea9405ceedc7ec68673a52d37f63ae67b605f8f1b2"
      },
      "white": {
        "pixelsSha": "fa0bfa4a336e04b0c33fbf5fdb32a82ba335d76e32abf3fce48dd98188e97230",
        "refSha": "d9403d015a952d1c259d9a9c101191040fb6031ef66c79483cf88a34e66ac4d3",
        "refLen": 398,
        "maskSha": "a75e96437828db3152a6f72dabdd14a8015d7b2503eeda73934c755790d8d8b3"
      }
    }
  },
  {
    "id": "mM1nN2oO3pP4",
    "crc": 3471756316,
    "blackModules": 428,
    "whiteModules": 413,
    "modulesSha": "2aadae69046ad567c7c75965a8e6a80f26bc1cc405d05f449e5a300adb1fb3de",
    "fullSha": "9204abc4f68bb5bfc3982b56fa84ab6aa819e5d8d1a96a2cdffb4dd848769e80",
    "modes": {
      "all": {
        "pixelsSha": "5f7fb57a4c15aebffb01c1497e603e721b92e142bdd54b615b5c4be6cfcdbbc3",
        "refSha": "9204abc4f68bb5bfc3982b56fa84ab6aa819e5d8d1a96a2cdffb4dd848769e80",
        "refLen": 841,
        "maskSha": "4a2cff9d7ab3a3d3a0946b49bdfef4d3503098f5d174aba42d2030f94dd71e93"
      },
      "black": {
        "pixelsSha": "e7377cdf175896191c137cdb807529cb1deda72a7b34fac2acd79e25795e8c0a",
        "refSha": "064117afd4fadb3066eaa80a2b4384fa04b9a96cd0c4cd98607a3511732b99ef",
        "refLen": 428,
        "maskSha": "2aadae69046ad567c7c75965a8e6a80f26bc1cc405d05f449e5a300adb1fb3de"
      },
      "white": {
        "pixelsSha": "954672650d404382afb43b3c87ed07010ea2cd9345aa46f034b19128dcbdd818",
        "refSha": "d5e8d12505abed8e16281f5d917f9a3b797e069de8203ff6d4bb88fe17b3bec7",
        "refLen": 413,
        "maskSha": "26e24a19afc71bcc1e87d4c1ac6869373508ca6168d6b9fcfdf8423992d3947d"
      }
    }
  }
];

let allOk = true;
function check(label: string, cond: boolean) {
  console.log(`${cond ? 'OK  ' : 'FAIL'} - ${label}`);
  if (!cond) allOk = false;
}
const sha = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');

(async () => {
  // CRC-32 standard check value and ID generator
  check('crc32("123456789") = 0xCBF43926', crc32('123456789') === 0xcbf43926);
  const id1 = generateFingerprintId();
  check('generateFingerprintId: 12 alphanumeric chars', /^[A-Za-z0-9]{12}$/.test(id1));
  check('generateFingerprintId: IDs differ', generateFingerprintId() !== generateFingerprintId());

  // QR encoder (src/lib/qrV3M.ts) against Python qrcodegen: all segment modes and the capacity limits
  for (const q of QR_FIXTURES) {
    let result: string;
    try { result = sha(encodeQrV3M(q.text).flat().map((b) => (b ? '1' : '0')).join('')); }
    catch (e) { if (e instanceof QrDataTooLongError) result = 'TOO_LONG'; else throw e; }
    check(`QR encoder: ${q.label}`, q.tooLong ? result === 'TOO_LONG' : result === q.sha);
  }

  for (const fx of FIXTURES) {
    const tag = fx.id;
    check(`${tag}: crc32 matches Python zlib.crc32`, crc32(fx.id) === fx.crc);

    const modules = buildQrModules(PREFIX + fx.id);
    const counts = countModules(modules);
    check(`${tag}: 29x29 modules, black + white = 841`, modules.length === 29 && counts.total === 841 && counts.black + counts.white === 841);
    check(`${tag}: black/white counts match the backend QR`, counts.black === fx.blackModules && counts.white === fx.whiteModules);
    check(`${tag}: QR modules identical to backend (qrcodegen V3-M)`, sha(modules.flat().map((b) => (b ? '1' : '0')).join('')) === fx.modulesSha);
    check(`${tag}: 841 mulberry32 bits identical to backend`, sha(Array.from(generateMaskBits(crc32(fx.id), TOTAL_BLOCKS)).join('')) === fx.fullSha);

    for (const colour of ['all', 'black', 'white'] as WatermarkColour[]) {
      const exp = fx.modes[colour];
      const r = generateSqrPoc({ prefix: PREFIX, fingerprintId: fx.id, strength: 120, mmSize: 10, colour });
      check(`${tag} ${colour}: 1x pixels identical to backend`, sha(r.pixels1x) === exp.pixelsSha);
      check(`${tag} ${colour}: reference string identical (len ${exp.refLen})`, r.refBinaryString.length === exp.refLen && sha(r.refBinaryString) === exp.refSha);
      check(`${tag} ${colour}: mask identical`, sha(r.maskString) === exp.maskSha);

      // Only the chosen colour's blocks may change
      const canon = renderCanonical(modules);
      let untouchedOk = true, changedSelected = 0;
      for (let idx = 0; idx < TOTAL_BLOCKS; idx++) {
        const row = Math.floor(idx / QR_MODULES), col = idx % QR_MODULES;
        let changed = false;
        for (let y = 0; y < BLOCK_SIZE && !changed; y++)
          for (let x = 0; x < BLOCK_SIZE; x++) {
            const p = (row * BLOCK_SIZE + y) * CANONICAL_SIZE + col * BLOCK_SIZE + x;
            if (r.pixels1x[p] !== canon[p]) { changed = true; break; }
          }
        if (r.maskString[idx] === '1') { if (changed) changedSelected++; } else if (changed) untouchedOk = false;
      }
      check(`${tag} ${colour}: unselected modules are untouched`, untouchedOk);
      check(`${tag} ${colour}: every selected module was changed`, changedSelected === r.selectedCount);
    }
  }

  // PNG: 8-bit grayscale, correct size, DPI chunk, pixels survive a zlib round trip (both code paths)
  const r = generateSqrPoc({ prefix: PREFIX, fingerprintId: FIXTURES[0].id, strength: 120, mmSize: 10, colour: 'white' });
  check('2x pixels are the 1x pixels, nearest-neighbour', r.size2x === 464 && r.pixels2x[0] === r.pixels1x[0] && r.pixels2x[464 * 3 + 5] === r.pixels1x[1 * 232 + 2]);
  check('DPI = 2 x round(232 / mm * 25.4)', r.dpi2x === 2 * Math.round((232 / 10) * 25.4));

  async function inspect(png: Uint8Array) {
    const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => png[i] === b);
    let off = 8; const chunks: Record<string, Uint8Array> = {}; let crcOk = true;
    while (off < png.length) {
      const len = dv.getUint32(off); const type = String.fromCharCode(...png.subarray(off + 4, off + 8));
      const data = png.subarray(off + 8, off + 8 + len);
      const crcStored = dv.getUint32(off + 8 + len);
      const body = png.subarray(off + 4, off + 8 + len);
      crcOk = crcOk && crcStored === crc32Check(body);
      chunks[type] = data; off += 12 + len;
    }
    const raw = inflateSync(chunks['IDAT']);
    const px = new Uint8Array(464 * 464);
    for (let y = 0; y < 464; y++) px.set(raw.subarray(y * 465 + 1, y * 465 + 465), y * 464);
    const ihdr = new DataView(chunks['IHDR'].buffer, chunks['IHDR'].byteOffset, 13);
    const phys = new DataView(chunks['pHYs'].buffer, chunks['pHYs'].byteOffset, 9);
    return { sig, crcOk, w: ihdr.getUint32(0), h: ihdr.getUint32(4), depth: chunks['IHDR'][8], ctype: chunks['IHDR'][9], ppm: phys.getUint32(0), unit: chunks['pHYs'][8], same: Buffer.from(px).equals(Buffer.from(r.pixels2x)) };
  }
  // Independent CRC-32 over raw bytes (chunk type + data), so the PNG CRCs are not checked with the code under test
  function crc32Check(bytes: Uint8Array): number {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) { c ^= bytes[i]; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; }
    return (c ^ 0xffffffff) >>> 0;
  }

  for (const mode of ['compressed', 'stored (no CompressionStream)']) {
    const saved = (globalThis as any).CompressionStream;
    if (mode !== 'compressed') (globalThis as any).CompressionStream = undefined;
    const png = await encodeGrayPng(r.pixels2x, r.size2x, r.dpi2x);
    (globalThis as any).CompressionStream = saved;
    const i = await inspect(png);
    check(`PNG ${mode}: signature, 464x464, 8-bit grayscale`, i.sig && i.w === 464 && i.h === 464 && i.depth === 8 && i.ctype === 0);
    check(`PNG ${mode}: all chunk CRCs valid`, i.crcOk);
    check(`PNG ${mode}: pHYs = round(dpi / 0.0254) px/m, unit metre`, i.ppm === Math.round(r.dpi2x / 0.0254) && i.unit === 1);
    check(`PNG ${mode}: pixels survive the zlib round trip`, i.same);
  }

  // Guard rails
  let threw = false;
  try { generateSqrPoc({ prefix: 'https://example.com/a-very-long-prefix-that-cannot-fit/', fingerprintId: 'Ab3Xy9Qw2Lm7', strength: 120, mmSize: 10, colour: 'black' }); } catch { threw = true; }
  check('too-long QR content is rejected with an error', threw);

  console.log(allOk ? '\nALL CHECKS PASSED' : '\nSOME CHECKS FAILED');
  process.exit(allOk ? 0 : 1);
})();
