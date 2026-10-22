// Functional test for src/lib/sqrPoc.ts. Run: npx tsx scripts/test-sqr-poc.ts
// Expected values were produced by the backend's sqr_generator.py algorithm
// (Python: qrcodegen, scipy DCT, zlib.crc32) for the backend's single pair (3,1)/(1,3) and prefix
// "https://witomark.com/sqr/", no emblem. The 'all' mode is the standard SQR.

import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { encodeQrV3M, QrDataTooLongError } from '../src/lib/qrV3M';
import {
  BLOCK_SIZE, CANONICAL_SIZE, QR_MODULES, TOTAL_BLOCKS,
  buildQrModules, countModules, crc32, encodeGrayPng, generateFingerprintId, generateMaskBits,
  generateSqrPoc, renderCanonical, decodeBlock, validateCoeffPairs, DEFAULT_COEFF_PAIRS, DEFAULT_PREFIX,
  MIN_STRENGTH, MAX_STRENGTH, type CoeffPair, type WatermarkColour,
} from '../src/lib/sqrPoc';

const PREFIX = 'https://witomark.com/sqr/';
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
    "id": "Ab3Xy9Qw",
    "crc": 1190987868,
    "blackModules": 443,
    "whiteModules": 398,
    "modulesSha": "5ffe066fee23a25586521629b63483cc7e6448bea2b76487ddc5700ee9b283b8",
    "fullSha": "4c22f66a998f139bbd9514f842907220f5fe728d79e83e0a0a25b7af84c9e76f",
    "modes": {
      "all": {
        "pixelsSha": "0184817d7de4efb903defb6dda1072a400648e2616232151ab0c59b7ae00059f",
        "refSha": "4c22f66a998f139bbd9514f842907220f5fe728d79e83e0a0a25b7af84c9e76f",
        "refLen": 841,
        "maskSha": "4a2cff9d7ab3a3d3a0946b49bdfef4d3503098f5d174aba42d2030f94dd71e93"
      },
      "black": {
        "pixelsSha": "e3fcbe55600fca26c8e8c2ac0c25f0e88e5bdd1f376a1b8b313ad3b356d86f7f",
        "refSha": "f8004148757ac7d1dc666b485091bd7f57ae2b9f152965697e2c1d9fea02dcec",
        "refLen": 443,
        "maskSha": "5ffe066fee23a25586521629b63483cc7e6448bea2b76487ddc5700ee9b283b8"
      },
      "white": {
        "pixelsSha": "36458a88e055c2fe80a86072779c3a90697a124714f57f4630e0361b9b529484",
        "refSha": "a2346b72a5582f96be0b1663587c106b818cc2883e13b7ed980e81ae4db81024",
        "refLen": 398,
        "maskSha": "5951c46c635cea482f12e5284cc329c6a8f9e3a1b0c193028419166211cdc459"
      }
    }
  },
  {
    "id": "K7pQ0zTn",
    "crc": 2949689500,
    "blackModules": 424,
    "whiteModules": 417,
    "modulesSha": "84562b8ae2b5a0f2d8c47aaef45c08ae918ba7c700ce3da9276318bb6157e6ad",
    "fullSha": "cc31afcd3d2f921f63251f7de6eaa4ba3130d48e0477b5f02dccc9f6f6405397",
    "modes": {
      "all": {
        "pixelsSha": "87093cfd1ef1458e244714844f7306b8d92ee2f9f6632a8776bfd3fee66d5c47",
        "refSha": "cc31afcd3d2f921f63251f7de6eaa4ba3130d48e0477b5f02dccc9f6f6405397",
        "refLen": 841,
        "maskSha": "4a2cff9d7ab3a3d3a0946b49bdfef4d3503098f5d174aba42d2030f94dd71e93"
      },
      "black": {
        "pixelsSha": "93684c8ef8a217369a011182633acbf2475480dfe13c655dfb06192e37ab05f3",
        "refSha": "1e66e1051e02c53095effd0a9b665c999259fdb8cf5d5f5ccbf3a99a074718cc",
        "refLen": 424,
        "maskSha": "84562b8ae2b5a0f2d8c47aaef45c08ae918ba7c700ce3da9276318bb6157e6ad"
      },
      "white": {
        "pixelsSha": "5ae11167ed06ad4e62c8c453aabb3d2ab5b3e53f3684399ece68ffe6761bb917",
        "refSha": "716534ded4d3e55cfe73af03202abfcf5d8b273856140463c572042629441982",
        "refLen": 417,
        "maskSha": "85a059aa71f6a76713474069198708c60731d7f0b57245082e00a114506e17a6"
      }
    }
  },
  {
    "id": "mM1nN2oO",
    "crc": 3122025991,
    "blackModules": 436,
    "whiteModules": 405,
    "modulesSha": "539882a9f37875fe1071427327fff0c654ec94e65b7be4672cdce8f1f06c1780",
    "fullSha": "5adec92ea241a7bdb83f0db68805ebef05caadd857cdfb51ee3233484bb19170",
    "modes": {
      "all": {
        "pixelsSha": "68cf9f8f7147f487ab41a21ef8b594b672779a85eea4ef333d40903ba07a5501",
        "refSha": "5adec92ea241a7bdb83f0db68805ebef05caadd857cdfb51ee3233484bb19170",
        "refLen": 841,
        "maskSha": "4a2cff9d7ab3a3d3a0946b49bdfef4d3503098f5d174aba42d2030f94dd71e93"
      },
      "black": {
        "pixelsSha": "40a842aee206b962584b3928c32d1ed1a0455ff8325973e9d5cf0d9833eba3c0",
        "refSha": "70f8dec1808667a23b6d9400aff82693ac667506ea86a01594faee624902e6da",
        "refLen": 436,
        "maskSha": "539882a9f37875fe1071427327fff0c654ec94e65b7be4672cdce8f1f06c1780"
      },
      "white": {
        "pixelsSha": "f5185581d324f51b078b71f827a8361c10b4835eb94b0f1f13daa06363055a0f",
        "refSha": "d4a600d57041173e146e25a24007c7c9bc03dac50c24694e043469f20d26b224",
        "refLen": 405,
        "maskSha": "34fe9d5104162a12d54a0c615b28652f7f64100fdb79752d794d1f3185af7973"
      }
    }
  }
];

const CONFIG_FIXTURES: Array<{ label: string; id: string; colour: WatermarkColour; strength: number; pairs: CoeffPair[]; pixelsSha: string; refSha: string }> = [
  {
    "label": "strength 1, black",
    "id": "Ab3Xy9Qw",
    "colour": "black",
    "strength": 1,
    "pairs": [
      [
        [
          3,
          1
        ],
        [
          1,
          3
        ]
      ]
    ],
    "pixelsSha": "9b1d5f8fd3a7bb0f2a288ea429865611fb80a1c5e9c81e66fa066002c48a2879",
    "refSha": "f8004148757ac7d1dc666b485091bd7f57ae2b9f152965697e2c1d9fea02dcec"
  },
  {
    "label": "strength 1, white",
    "id": "Ab3Xy9Qw",
    "colour": "white",
    "strength": 1,
    "pairs": [
      [
        [
          3,
          1
        ],
        [
          1,
          3
        ]
      ]
    ],
    "pixelsSha": "5b8ab73a97eb173a2e3a964b78e7b21782c8ff6635d63e3bf0968d3cd74418bf",
    "refSha": "a2346b72a5582f96be0b1663587c106b818cc2883e13b7ed980e81ae4db81024"
  },
  {
    "label": "strength 10, all",
    "id": "K7pQ0zTn",
    "colour": "all",
    "strength": 10,
    "pairs": [
      [
        [
          3,
          1
        ],
        [
          1,
          3
        ]
      ]
    ],
    "pixelsSha": "99e096104c35560fde6aeed4c41a7dc16add4c95fd2c607346c46bb27d02ee1e",
    "refSha": "cc31afcd3d2f921f63251f7de6eaa4ba3130d48e0477b5f02dccc9f6f6405397"
  },
  {
    "label": "strength 500, white",
    "id": "K7pQ0zTn",
    "colour": "white",
    "strength": 500,
    "pairs": [
      [
        [
          3,
          1
        ],
        [
          1,
          3
        ]
      ]
    ],
    "pixelsSha": "fa989e6701601c49871e7a74cfc63397440fb3eaaa4bce45cee9bdd6465a3a08",
    "refSha": "716534ded4d3e55cfe73af03202abfcf5d8b273856140463c572042629441982"
  },
  {
    "label": "strength 1000, black",
    "id": "mM1nN2oO",
    "colour": "black",
    "strength": 1000,
    "pairs": [
      [
        [
          3,
          1
        ],
        [
          1,
          3
        ]
      ]
    ],
    "pixelsSha": "ea2ea628e7e858c984f1359d2d99aa8b0bf2ab321f7efdec231467d5f3661449",
    "refSha": "70f8dec1808667a23b6d9400aff82693ac667506ea86a01594faee624902e6da"
  },
  {
    "label": "strength 1000, all",
    "id": "mM1nN2oO",
    "colour": "all",
    "strength": 1000,
    "pairs": [
      [
        [
          3,
          1
        ],
        [
          1,
          3
        ]
      ]
    ],
    "pixelsSha": "6b18a2b9e6b5e1a04dafb915e98a21f5aef350e13a7561d7d886b79cb499cf38",
    "refSha": "5adec92ea241a7bdb83f0db68805ebef05caadd857cdfb51ee3233484bb19170"
  },
  {
    "label": "two pairs (3,1)/(1,3)+(1,0)/(0,1), black",
    "id": "Ab3Xy9Qw",
    "colour": "black",
    "strength": 120,
    "pairs": [
      [
        [
          3,
          1
        ],
        [
          1,
          3
        ]
      ],
      [
        [
          1,
          0
        ],
        [
          0,
          1
        ]
      ]
    ],
    "pixelsSha": "83507bcf59409f02b178dbd10c1e3bd2e3d1f9e16313f66390a3ca5e2bef6eb3",
    "refSha": "f8004148757ac7d1dc666b485091bd7f57ae2b9f152965697e2c1d9fea02dcec"
  },
  {
    "label": "two pairs (2,1)/(1,2)+(3,2)/(2,3), white",
    "id": "K7pQ0zTn",
    "colour": "white",
    "strength": 300,
    "pairs": [
      [
        [
          2,
          1
        ],
        [
          1,
          2
        ]
      ],
      [
        [
          3,
          2
        ],
        [
          2,
          3
        ]
      ]
    ],
    "pixelsSha": "b47dc39f422de6da34a5074cb6d4505626abb6d7e69d7c3494debd3f3fc1095c",
    "refSha": "716534ded4d3e55cfe73af03202abfcf5d8b273856140463c572042629441982"
  },
  {
    "label": "two pairs with DC (7,7)/(0,0)+(6,5)/(2,2), all",
    "id": "mM1nN2oO",
    "colour": "all",
    "strength": 200,
    "pairs": [
      [
        [
          7,
          7
        ],
        [
          0,
          0
        ]
      ],
      [
        [
          6,
          5
        ],
        [
          2,
          2
        ]
      ]
    ],
    "pixelsSha": "1be9a44615571ec4e2f41f34db0cae559d2f7fa9428aaa2b4150b715e606eaaa",
    "refSha": "5adec92ea241a7bdb83f0db68805ebef05caadd857cdfb51ee3233484bb19170"
  },
  {
    "label": "single pair (0,1)/(1,0), black",
    "id": "Ab3Xy9Qw",
    "colour": "black",
    "strength": 120,
    "pairs": [
      [
        [
          0,
          1
        ],
        [
          1,
          0
        ]
      ]
    ],
    "pixelsSha": "bbb1250d8a102bfbf28787b8c2f211251bb1e1c07944a50b537aecacff1428f8",
    "refSha": "f8004148757ac7d1dc666b485091bd7f57ae2b9f152965697e2c1d9fea02dcec"
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
  check('generateFingerprintId: 8 alphanumeric chars, like the backend', /^[A-Za-z0-9]{8}$/.test(id1));
  check('DEFAULT_PREFIX is the backend prefix', DEFAULT_PREFIX === 'https://witomark.com/sqr/');
  check('default pair is the backend single pair (3,1)/(1,3)', JSON.stringify(DEFAULT_COEFF_PAIRS) === JSON.stringify([[[3, 1], [1, 3]]]));
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

  // Strength 1-1000 and any pair choice, against the backend algorithm
  for (const c of CONFIG_FIXTURES) {
    const r = generateSqrPoc({ prefix: PREFIX, fingerprintId: c.id, strength: c.strength, mmSize: 10, colour: c.colour, coeffPairs: c.pairs });
    check(`${c.label}: 1x pixels identical to backend`, sha(r.pixels1x) === c.pixelsSha);
    check(`${c.label}: reference string identical`, sha(r.refBinaryString) === c.refSha);
  }

  // A clean copy reads back with no errors for a normal strength and any valid pair choice
  for (const pairs of [DEFAULT_COEFF_PAIRS, [[[2, 1], [1, 2]], [[3, 2], [2, 3]]] as CoeffPair[]]) {
    for (const colour of ['black', 'white'] as WatermarkColour[]) {
      const r = generateSqrPoc({ prefix: PREFIX, fingerprintId: FIXTURES[1].id, strength: 120, mmSize: 10, colour, coeffPairs: pairs });
      const px = Float64Array.from(r.pixels1x);
      let wrong = 0, k = 0;
      for (let idx = 0; idx < TOTAL_BLOCKS; idx++) {
        if (r.maskString[idx] !== '1') continue;
        const row = Math.floor(idx / QR_MODULES), col = idx % QR_MODULES;
        const block = new Float64Array(64);
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) block[y * 8 + x] = px[(row * 8 + y) * CANONICAL_SIZE + col * 8 + x];
        const want = Number(r.refBinaryString[k++]);
        for (const pair of pairs) if (decodeBlock(block, pair) !== want) wrong++;
      }
      check(`read-back, ${pairs.length} pair(s), ${colour}: 0 bit errors`, wrong === 0);
    }
  }

  // Validation rules
  const gen = (strength: number, pairs?: CoeffPair[]) =>
    generateSqrPoc({ prefix: PREFIX, fingerprintId: FIXTURES[0].id, strength, mmSize: 10, colour: 'black', coeffPairs: pairs });
  const throws = (fn: () => unknown) => { try { fn(); return false; } catch { return true; } };
  check(`strength range is ${MIN_STRENGTH}-${MAX_STRENGTH}`, MIN_STRENGTH === 1 && MAX_STRENGTH === 1000);
  check('strength 1 and 1000 are accepted', !throws(() => gen(1)) && !throws(() => gen(1000)));
  check('strength 0, 1001 and 120.5 are rejected', throws(() => gen(0)) && throws(() => gen(1001)) && throws(() => gen(120.5)));
  check('pair with two identical coefficients is rejected', throws(() => validateCoeffPairs([[[3, 1], [3, 1]]])));
  check('coefficient shared between two pairs is rejected', throws(() => validateCoeffPairs([[[3, 1], [1, 3]], [[1, 3], [0, 1]]])));
  check('coefficient index 8 or -1 is rejected', throws(() => validateCoeffPairs([[[8, 1], [1, 3]]])) && throws(() => validateCoeffPairs([[[-1, 1], [1, 3]]])));
  check('no pairs is rejected', throws(() => validateCoeffPairs([])));
  check('two valid pairs and the DC term are accepted', !throws(() => validateCoeffPairs([[[3, 1], [1, 3]], [[1, 0], [0, 1]]])) && !throws(() => validateCoeffPairs([[[0, 0], [1, 1]]])));

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