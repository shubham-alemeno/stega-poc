// Functional test for src/lib/sqrNoisePoc.ts. Run: npx tsx scripts/test-sqr-noise-poc.ts
//
// Expected values (hashes of pixels, strings and the noise grid) were produced by a Python
// reference built from the backend's sqr_generator.py functions (qrcodegen, scipy DCT, zlib.crc32)
// for strength 120 and the prefix "https://example.com/v/". The structural checks compare the
// hybrid with the standard SQR from src/lib/sqrPoc.ts, which is already verified against the backend.

import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import {
  BLOCK_SIZE, CANONICAL_SIZE, QR_MODULES, TOTAL_BLOCKS,
  buildQrModules, crc32, encodeGrayPng, generateSqrPoc, type CoeffPair, type WatermarkColour,
} from '../src/lib/sqrPoc';
import {
  NOISE_BITS, NOISE_MODULE_COUNT, NOISE_SIZE, NOISE_START_MODULE, NOISE_START_PX, WATERMARKED_MODULES,
  buildNoiseGrid, countWatermarkArea, generateNoiseBits, generateSqrNoisePoc, isNoiseModule,
} from '../src/lib/sqrNoisePoc';

const PREFIX = 'https://example.com/v/';
const PAIRS: Record<number, CoeffPair[]> = {
  1: [[[3, 1], [1, 3]]],
  2: [[[3, 1], [1, 3]], [[1, 0], [0, 1]]],
};
interface Mode { colour: WatermarkColour; gray: number; pairs: number; pixelsSha: string; refSha: string; refLen: number; maskSha: string; noiseSha: string }
interface Fixture { id: string; crc: number; modes: Mode[] }
const FIXTURES: Fixture[] = [
  {
    "id": "Ab3Xy9Qw2Lm7",
    "crc": 3681399168,
    "modes": [
      {
        "colour": "all",
        "gray": 0,
        "pairs": 1,
        "pixelsSha": "5718f280b893f99ef6f4d66c85dc77bb5f96691a99efe61d7aaa4ce175c1de84",
        "refSha": "79940e7d2648d978fb9c367d318f26a473768f5333bbc2cf0855880b6eca03bb",
        "refLen": 792,
        "maskSha": "297aa7714f53eca8ac03c25f92b6988d7fd948f2a3ec5f94c9eeb33694dbdc4c",
        "noiseSha": "30bc7fe09f560ca412d256c41088bc693228f0b72424814034fd1d27d4d73e7d"
      },
      {
        "colour": "all",
        "gray": 64,
        "pairs": 1,
        "pixelsSha": "8ab2f10cde207c4697a543c63fb2c43e4477d7c41b3fa9a5f348f8b8aa153c8a",
        "refSha": "79940e7d2648d978fb9c367d318f26a473768f5333bbc2cf0855880b6eca03bb",
        "refLen": 792,
        "maskSha": "297aa7714f53eca8ac03c25f92b6988d7fd948f2a3ec5f94c9eeb33694dbdc4c",
        "noiseSha": "30bc7fe09f560ca412d256c41088bc693228f0b72424814034fd1d27d4d73e7d"
      },
      {
        "colour": "all",
        "gray": 255,
        "pairs": 1,
        "pixelsSha": "5ce0acff91452ceb993c84e6818e134aaf139979b78a29e16d765851bc488b81",
        "refSha": "79940e7d2648d978fb9c367d318f26a473768f5333bbc2cf0855880b6eca03bb",
        "refLen": 792,
        "maskSha": "297aa7714f53eca8ac03c25f92b6988d7fd948f2a3ec5f94c9eeb33694dbdc4c",
        "noiseSha": "30bc7fe09f560ca412d256c41088bc693228f0b72424814034fd1d27d4d73e7d"
      },
      {
        "colour": "black",
        "gray": 0,
        "pairs": 1,
        "pixelsSha": "2598b92e5b0ff5419d7cd46833f4371f6a595ec7ed823a330128116d7ce36888",
        "refSha": "8167b00dc5978bef0c14aaeb625a67dc82a920f80caff7e19ff8c5f436e84d32",
        "refLen": 406,
        "maskSha": "4a4dc831e55b3c4ee27dd3377e355b7463a8566c431975305e74ad40ed4f8efc",
        "noiseSha": "30bc7fe09f560ca412d256c41088bc693228f0b72424814034fd1d27d4d73e7d"
      },
      {
        "colour": "black",
        "gray": 64,
        "pairs": 1,
        "pixelsSha": "cb003af900891606fa04fffec0d0cc57654edc0b14165d918dff0b8e92923afe",
        "refSha": "8167b00dc5978bef0c14aaeb625a67dc82a920f80caff7e19ff8c5f436e84d32",
        "refLen": 406,
        "maskSha": "4a4dc831e55b3c4ee27dd3377e355b7463a8566c431975305e74ad40ed4f8efc",
        "noiseSha": "30bc7fe09f560ca412d256c41088bc693228f0b72424814034fd1d27d4d73e7d"
      },
      {
        "colour": "black",
        "gray": 255,
        "pairs": 1,
        "pixelsSha": "fa93f2953872dfee5af733c817d4a772384abe992fcf35b4ae1fe3b5faf0a0db",
        "refSha": "8167b00dc5978bef0c14aaeb625a67dc82a920f80caff7e19ff8c5f436e84d32",
        "refLen": 406,
        "maskSha": "4a4dc831e55b3c4ee27dd3377e355b7463a8566c431975305e74ad40ed4f8efc",
        "noiseSha": "30bc7fe09f560ca412d256c41088bc693228f0b72424814034fd1d27d4d73e7d"
      },
      {
        "colour": "white",
        "gray": 0,
        "pairs": 1,
        "pixelsSha": "6e2ce7c8878700c0ff40ed02f2adad74df76c8f3da54060ed16bc7308dc0c8d7",
        "refSha": "dafa1f93d217ddc4d337a2ded283d7e3f302788f865ed9488ee4a28d6116263d",
        "refLen": 386,
        "maskSha": "519c45c3ec857bbae11c8ec474a50e9c9f5154648ca2ee0925aa3bf4b5b2261b",
        "noiseSha": "30bc7fe09f560ca412d256c41088bc693228f0b72424814034fd1d27d4d73e7d"
      },
      {
        "colour": "white",
        "gray": 64,
        "pairs": 1,
        "pixelsSha": "3e55eb2b40178e9044e4e34665519b018339111931c564d80af162010c8cde87",
        "refSha": "dafa1f93d217ddc4d337a2ded283d7e3f302788f865ed9488ee4a28d6116263d",
        "refLen": 386,
        "maskSha": "519c45c3ec857bbae11c8ec474a50e9c9f5154648ca2ee0925aa3bf4b5b2261b",
        "noiseSha": "30bc7fe09f560ca412d256c41088bc693228f0b72424814034fd1d27d4d73e7d"
      },
      {
        "colour": "white",
        "gray": 255,
        "pairs": 1,
        "pixelsSha": "1a6cf53447acaa946aedac43cc59c12bddacf6841860ac47dc0193ef2c921ec9",
        "refSha": "dafa1f93d217ddc4d337a2ded283d7e3f302788f865ed9488ee4a28d6116263d",
        "refLen": 386,
        "maskSha": "519c45c3ec857bbae11c8ec474a50e9c9f5154648ca2ee0925aa3bf4b5b2261b",
        "noiseSha": "30bc7fe09f560ca412d256c41088bc693228f0b72424814034fd1d27d4d73e7d"
      },
      {
        "colour": "all",
        "gray": 64,
        "pairs": 2,
        "pixelsSha": "4ad1a0b791dc64a84632ea7633b5e36e0cc6975921798b5481d3009e6ac4cf7d",
        "refSha": "79940e7d2648d978fb9c367d318f26a473768f5333bbc2cf0855880b6eca03bb",
        "refLen": 792,
        "maskSha": "297aa7714f53eca8ac03c25f92b6988d7fd948f2a3ec5f94c9eeb33694dbdc4c",
        "noiseSha": "30bc7fe09f560ca412d256c41088bc693228f0b72424814034fd1d27d4d73e7d"
      }
    ]
  },
  {
    "id": "K7pQ0zTn4VbE",
    "crc": 2463663544,
    "modes": [
      {
        "colour": "all",
        "gray": 0,
        "pairs": 1,
        "pixelsSha": "ebf8a451c8675f7fca148de78923cb8ae93bbbacfd9d3668eb5ca43456602b09",
        "refSha": "7d4d774436ffd014a4b1296f751e69c34c51a58da3cdcf35dc2bc0f4002c8f92",
        "refLen": 792,
        "maskSha": "297aa7714f53eca8ac03c25f92b6988d7fd948f2a3ec5f94c9eeb33694dbdc4c",
        "noiseSha": "27800ca4d975f2a947820334e313c8f70a5340f68813148ffa1837b29e832760"
      },
      {
        "colour": "all",
        "gray": 64,
        "pairs": 1,
        "pixelsSha": "832d5cd3a9898e2dc2573700742c0eb2d97fe03406d01e2041660a40d63e8207",
        "refSha": "7d4d774436ffd014a4b1296f751e69c34c51a58da3cdcf35dc2bc0f4002c8f92",
        "refLen": 792,
        "maskSha": "297aa7714f53eca8ac03c25f92b6988d7fd948f2a3ec5f94c9eeb33694dbdc4c",
        "noiseSha": "27800ca4d975f2a947820334e313c8f70a5340f68813148ffa1837b29e832760"
      },
      {
        "colour": "all",
        "gray": 255,
        "pairs": 1,
        "pixelsSha": "dc13a28dd99c26eec103ef12cb0a42c8ddc311bbf8e16ecaa83201b0aefff5f0",
        "refSha": "7d4d774436ffd014a4b1296f751e69c34c51a58da3cdcf35dc2bc0f4002c8f92",
        "refLen": 792,
        "maskSha": "297aa7714f53eca8ac03c25f92b6988d7fd948f2a3ec5f94c9eeb33694dbdc4c",
        "noiseSha": "27800ca4d975f2a947820334e313c8f70a5340f68813148ffa1837b29e832760"
      },
      {
        "colour": "black",
        "gray": 0,
        "pairs": 1,
        "pixelsSha": "afc287d448a08a202d12768d0f227fc0cd0ac98a67c8d9585937fc2839c7656f",
        "refSha": "de708327b5fee7f21c381e1726008b6684203901b275d5b4eca554bc8e7c92f0",
        "refLen": 424,
        "maskSha": "d5ac0c57113643b8be8985ee1242892ec3d0e4e456118528d96661b202bc584f",
        "noiseSha": "27800ca4d975f2a947820334e313c8f70a5340f68813148ffa1837b29e832760"
      },
      {
        "colour": "black",
        "gray": 64,
        "pairs": 1,
        "pixelsSha": "94b608249eca18564dea43ce52d5996f0c32774f9b8580effc41139fff053e8d",
        "refSha": "de708327b5fee7f21c381e1726008b6684203901b275d5b4eca554bc8e7c92f0",
        "refLen": 424,
        "maskSha": "d5ac0c57113643b8be8985ee1242892ec3d0e4e456118528d96661b202bc584f",
        "noiseSha": "27800ca4d975f2a947820334e313c8f70a5340f68813148ffa1837b29e832760"
      },
      {
        "colour": "black",
        "gray": 255,
        "pairs": 1,
        "pixelsSha": "6eb2cb57db7dee266257ffdb991ec5eecf8ba141125b4df2e384a1aa74c7f033",
        "refSha": "de708327b5fee7f21c381e1726008b6684203901b275d5b4eca554bc8e7c92f0",
        "refLen": 424,
        "maskSha": "d5ac0c57113643b8be8985ee1242892ec3d0e4e456118528d96661b202bc584f",
        "noiseSha": "27800ca4d975f2a947820334e313c8f70a5340f68813148ffa1837b29e832760"
      },
      {
        "colour": "white",
        "gray": 0,
        "pairs": 1,
        "pixelsSha": "e010034238b2d35732cfefc0627359dc7ac9552733717eb693253610098e9d8d",
        "refSha": "a8a02d70154c720c0112d06403e5910277ef838385fc61ded7f9b4901a12e0e3",
        "refLen": 368,
        "maskSha": "65ca5652225b8790e21b7c82a4e85f9358b4aa06af492551cba990218a09fd4c",
        "noiseSha": "27800ca4d975f2a947820334e313c8f70a5340f68813148ffa1837b29e832760"
      },
      {
        "colour": "white",
        "gray": 64,
        "pairs": 1,
        "pixelsSha": "087cd38d5a0f8629082679d3e4915e5f6dbc4b9043fa2290ca55eb82bfd0a5ba",
        "refSha": "a8a02d70154c720c0112d06403e5910277ef838385fc61ded7f9b4901a12e0e3",
        "refLen": 368,
        "maskSha": "65ca5652225b8790e21b7c82a4e85f9358b4aa06af492551cba990218a09fd4c",
        "noiseSha": "27800ca4d975f2a947820334e313c8f70a5340f68813148ffa1837b29e832760"
      },
      {
        "colour": "white",
        "gray": 255,
        "pairs": 1,
        "pixelsSha": "b34027b47ddc325b284b51175fba5a104ba2c6a533445984cf2b10bb93074063",
        "refSha": "a8a02d70154c720c0112d06403e5910277ef838385fc61ded7f9b4901a12e0e3",
        "refLen": 368,
        "maskSha": "65ca5652225b8790e21b7c82a4e85f9358b4aa06af492551cba990218a09fd4c",
        "noiseSha": "27800ca4d975f2a947820334e313c8f70a5340f68813148ffa1837b29e832760"
      },
      {
        "colour": "all",
        "gray": 64,
        "pairs": 2,
        "pixelsSha": "b74bc3fd50504b2f823d89492502c0637ddb95950de53eb822d1209ad307a0ee",
        "refSha": "7d4d774436ffd014a4b1296f751e69c34c51a58da3cdcf35dc2bc0f4002c8f92",
        "refLen": 792,
        "maskSha": "297aa7714f53eca8ac03c25f92b6988d7fd948f2a3ec5f94c9eeb33694dbdc4c",
        "noiseSha": "27800ca4d975f2a947820334e313c8f70a5340f68813148ffa1837b29e832760"
      }
    ]
  },
  {
    "id": "mM1nN2oO3pP4",
    "crc": 3471756316,
    "modes": [
      {
        "colour": "all",
        "gray": 0,
        "pairs": 1,
        "pixelsSha": "53c3d11a7b5680b764b672516a993c559e4b3fb870abd841e77556d72184ceb3",
        "refSha": "9cdd195b6232adfb85119a0795e27f0707e009bd5f06189ed054abcbe81d3a67",
        "refLen": 792,
        "maskSha": "297aa7714f53eca8ac03c25f92b6988d7fd948f2a3ec5f94c9eeb33694dbdc4c",
        "noiseSha": "9c808ef3a3aaca62d144c933f5b5d1aedfcdbd677a8d00bcb726a413fbd3258b"
      },
      {
        "colour": "all",
        "gray": 64,
        "pairs": 1,
        "pixelsSha": "527a0996080247b804e6ca087736dc2bf4f57094b95f6b569e17a96a48723925",
        "refSha": "9cdd195b6232adfb85119a0795e27f0707e009bd5f06189ed054abcbe81d3a67",
        "refLen": 792,
        "maskSha": "297aa7714f53eca8ac03c25f92b6988d7fd948f2a3ec5f94c9eeb33694dbdc4c",
        "noiseSha": "9c808ef3a3aaca62d144c933f5b5d1aedfcdbd677a8d00bcb726a413fbd3258b"
      },
      {
        "colour": "all",
        "gray": 255,
        "pairs": 1,
        "pixelsSha": "528fa3fd7d469980851967d7a31dc51a1b9589cf3af7b8a7616ebd513b8ea759",
        "refSha": "9cdd195b6232adfb85119a0795e27f0707e009bd5f06189ed054abcbe81d3a67",
        "refLen": 792,
        "maskSha": "297aa7714f53eca8ac03c25f92b6988d7fd948f2a3ec5f94c9eeb33694dbdc4c",
        "noiseSha": "9c808ef3a3aaca62d144c933f5b5d1aedfcdbd677a8d00bcb726a413fbd3258b"
      },
      {
        "colour": "black",
        "gray": 0,
        "pairs": 1,
        "pixelsSha": "6a9f90f0a68ba8d196d688fe83f74af110652f120cf9e0fb78cc1d3e939ecb07",
        "refSha": "ae94400629d82a7fd090c4e4f11835a0f223434641b6fc270bc4c44ef5d6bb81",
        "refLen": 405,
        "maskSha": "c389ae5c46321806c8f57ac34ab514a7de50e938aaf1e083586d58f35d5ee6d5",
        "noiseSha": "9c808ef3a3aaca62d144c933f5b5d1aedfcdbd677a8d00bcb726a413fbd3258b"
      },
      {
        "colour": "black",
        "gray": 64,
        "pairs": 1,
        "pixelsSha": "4a0bbb9929afabbaf1a545029c961abceec3cf733ce96e279b0881672efaac30",
        "refSha": "ae94400629d82a7fd090c4e4f11835a0f223434641b6fc270bc4c44ef5d6bb81",
        "refLen": 405,
        "maskSha": "c389ae5c46321806c8f57ac34ab514a7de50e938aaf1e083586d58f35d5ee6d5",
        "noiseSha": "9c808ef3a3aaca62d144c933f5b5d1aedfcdbd677a8d00bcb726a413fbd3258b"
      },
      {
        "colour": "black",
        "gray": 255,
        "pairs": 1,
        "pixelsSha": "ec7b8dd7bf2e94ab0f8dbf815cf9b17a29981b01256cc82745a38f4a0ce6d1f7",
        "refSha": "ae94400629d82a7fd090c4e4f11835a0f223434641b6fc270bc4c44ef5d6bb81",
        "refLen": 405,
        "maskSha": "c389ae5c46321806c8f57ac34ab514a7de50e938aaf1e083586d58f35d5ee6d5",
        "noiseSha": "9c808ef3a3aaca62d144c933f5b5d1aedfcdbd677a8d00bcb726a413fbd3258b"
      },
      {
        "colour": "white",
        "gray": 0,
        "pairs": 1,
        "pixelsSha": "65f878820bd2a428778afbfd31195e6c4aadc4c84edce3348da2cc48208406d4",
        "refSha": "410c9cc14e789cd2073724a617bf71af3885372cfcddbec6e39d5d9794eab267",
        "refLen": 387,
        "maskSha": "1213979e527a78ca440935e4de1cf7f7437b4ef95b65e72fb856c01356842338",
        "noiseSha": "9c808ef3a3aaca62d144c933f5b5d1aedfcdbd677a8d00bcb726a413fbd3258b"
      },
      {
        "colour": "white",
        "gray": 64,
        "pairs": 1,
        "pixelsSha": "5414b615083cd4046e112bd8a347372fbe77be8c8d6dcdde136119b87bbce830",
        "refSha": "410c9cc14e789cd2073724a617bf71af3885372cfcddbec6e39d5d9794eab267",
        "refLen": 387,
        "maskSha": "1213979e527a78ca440935e4de1cf7f7437b4ef95b65e72fb856c01356842338",
        "noiseSha": "9c808ef3a3aaca62d144c933f5b5d1aedfcdbd677a8d00bcb726a413fbd3258b"
      },
      {
        "colour": "white",
        "gray": 255,
        "pairs": 1,
        "pixelsSha": "2bff6a596e227182ccd729eaea305df841897dbfd586299254ad8ef3232d537c",
        "refSha": "410c9cc14e789cd2073724a617bf71af3885372cfcddbec6e39d5d9794eab267",
        "refLen": 387,
        "maskSha": "1213979e527a78ca440935e4de1cf7f7437b4ef95b65e72fb856c01356842338",
        "noiseSha": "9c808ef3a3aaca62d144c933f5b5d1aedfcdbd677a8d00bcb726a413fbd3258b"
      },
      {
        "colour": "all",
        "gray": 64,
        "pairs": 2,
        "pixelsSha": "cba4f63d240068083b826c80e19e6da89e501ce7e13de774fd933ac7c69ac871",
        "refSha": "9cdd195b6232adfb85119a0795e27f0707e009bd5f06189ed054abcbe81d3a67",
        "refLen": 792,
        "maskSha": "297aa7714f53eca8ac03c25f92b6988d7fd948f2a3ec5f94c9eeb33694dbdc4c",
        "noiseSha": "9c808ef3a3aaca62d144c933f5b5d1aedfcdbd677a8d00bcb726a413fbd3258b"
      }
    ]
  }
];

let allOk = true;
function check(label: string, cond: boolean) {
  console.log(`${cond ? 'OK  ' : 'FAIL'} - ${label}`);
  if (!cond) allOk = false;
}
const sha = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');
function throws(fn: () => unknown): boolean {
  try { fn(); return false; } catch { return true; }
}
function crc32Of(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

(async () => {
  // Geometry constants from the write-up
  check('noise grid is 7 x 7 modules = 56 x 56 px = 3136 bits', NOISE_SIZE === 56 && NOISE_BITS === 3136 && NOISE_MODULE_COUNT === 49);
  check('noise grid is centred: modules 11..17, pixels 88..143', NOISE_START_MODULE === 11 && NOISE_START_PX === 88);
  check('watermark covers 841 - 49 = 792 modules', WATERMARKED_MODULES === 792 && TOTAL_BLOCKS === 841);
  check('isNoiseModule is true for exactly 49 modules', (() => { let n = 0; for (let r = 0; r < 29; r++) for (let c = 0; c < 29; c++) if (isNoiseModule(r, c)) n++; return n === 49; })());
  check('isNoiseModule edges: (10,10) no, (11,11) yes, (17,17) yes, (18,18) no', !isNoiseModule(10, 10) && isNoiseModule(11, 11) && isNoiseModule(17, 17) && !isNoiseModule(18, 18));

  for (const fx of FIXTURES) {
    const tag = fx.id;
    check(`${tag}: crc32 matches Python zlib.crc32`, crc32(fx.id) === fx.crc);
    const modules = buildQrModules(PREFIX + fx.id);
    const area = countWatermarkArea(modules);
    check(`${tag}: red area has 792 modules (black + white), 49 noise modules`, area.total === 792 && area.black + area.white === 792 && area.noiseModules === 49);

    for (const m of fx.modes) {
      const label = `${tag} ${m.colour} gray ${m.gray} ${m.pairs} pair${m.pairs === 2 ? 's' : ''}`;
      const r = generateSqrNoisePoc({ prefix: PREFIX, fingerprintId: fx.id, strength: 120, mmSize: 10, colour: m.colour, noiseGray: m.gray, coeffPairs: PAIRS[m.pairs] });

      // identical to the Python reference
      check(`${label}: 1x pixels identical to the reference`, sha(r.pixels1x) === m.pixelsSha);
      check(`${label}: reference string identical (len ${m.refLen})`, r.refBinaryString.length === m.refLen && sha(r.refBinaryString) === m.refSha);
      check(`${label}: mask identical`, sha(r.maskString) === m.maskSha);
      check(`${label}: noise bits identical`, sha(r.noiseBitsString) === m.noiseSha);

      // the centre 56x56 pixels are exactly the noise grid: bit 1 = gray, bit 0 = 255, never watermarked
      let centreOk = true;
      let grayPixels = 0;
      for (let y = 0; y < NOISE_SIZE; y++)
        for (let x = 0; x < NOISE_SIZE; x++) {
          const v = r.pixels1x[(NOISE_START_PX + y) * CANONICAL_SIZE + (NOISE_START_PX + x)];
          const expected = r.noiseBitsString[y * NOISE_SIZE + x] === '1' ? m.gray : 255;
          if (v !== expected) centreOk = false;
          if (r.noiseBitsString[y * NOISE_SIZE + x] === '1' && v === m.gray) grayPixels++;
        }
      check(`${label}: centre 56x56 is exactly the noise grid (watermark never touches it)`, centreOk);
      check(`${label}: the gray level is on the black pixels only (${grayPixels} of ${r.noiseBlackPixels})`, grayPixels === r.noiseBlackPixels);

      // outside the centre, identical to the standard SQR of the same settings
      const std = generateSqrPoc({ prefix: PREFIX, fingerprintId: fx.id, strength: 120, mmSize: 10, colour: m.colour, coeffPairs: PAIRS[m.pairs] });
      let outsideOk = true;
      for (let y = 0; y < CANONICAL_SIZE && outsideOk; y++)
        for (let x = 0; x < CANONICAL_SIZE; x++) {
          const inCentre = y >= NOISE_START_PX && y < NOISE_START_PX + NOISE_SIZE && x >= NOISE_START_PX && x < NOISE_START_PX + NOISE_SIZE;
          if (!inCentre && r.pixels1x[y * CANONICAL_SIZE + x] !== std.pixels1x[y * CANONICAL_SIZE + x]) { outsideOk = false; break; }
        }
      check(`${label}: every pixel outside the centre equals the standard SQR`, outsideOk);

      // no centre module is in the mask; the reference string is the standard string without the noise positions
      let maskCentreOk = true;
      const expectedRef: string[] = [];
      for (let idx = 0; idx < TOTAL_BLOCKS; idx++) {
        const row = Math.floor(idx / QR_MODULES), col = idx % QR_MODULES;
        if (isNoiseModule(row, col) && r.maskString[idx] !== '0') maskCentreOk = false;
        if (r.maskString[idx] === '1') expectedRef.push(r.fullBinaryString[idx]);
      }
      check(`${label}: no noise module is watermarked`, maskCentreOk);
      check(`${label}: reference string = standard ${TOTAL_BLOCKS}-bit string filtered by the mask`, expectedRef.join('') === r.refBinaryString && r.selectedCount === r.refBinaryString.length);
      if (m.colour === 'all') check(`${label}: standard mode watermarks 792 modules`, r.selectedCount === 792 && r.refBinaryString.length === 792);
    }
  }

  // The noise grid comes from the same seed and stream as the watermark
  const sample = FIXTURES[0];
  const seed = crc32(sample.id);
  const bits = generateNoiseBits(seed);
  const rs = generateSqrNoisePoc({ prefix: PREFIX, fingerprintId: sample.id, strength: 120, mmSize: 10, noiseGray: 64 });
  check('noise bits: 3136 values, first 841 equal the standard SQR string (same seed, same stream)', bits.length === 3136 && Array.from(bits.subarray(0, 841)).join('') === rs.fullBinaryString);
  check('buildNoiseGrid: bit 1 -> gray, bit 0 -> 255', (() => { const g = buildNoiseGrid(Uint8Array.from([1, 0, 1, 0]), 77); return g[0] === 77 && g[1] === 255 && g[2] === 77 && g[3] === 255; })());
  const white = generateSqrNoisePoc({ prefix: PREFIX, fingerprintId: sample.id, strength: 120, mmSize: 10, noiseGray: 255 });
  check('gray 255: the noise grid is all white (the noise disappears)', (() => { for (let y = 0; y < NOISE_SIZE; y++) for (let x = 0; x < NOISE_SIZE; x++) if (white.pixels1x[(NOISE_START_PX + y) * CANONICAL_SIZE + NOISE_START_PX + x] !== 255) return false; return true; })());
  const dark = generateSqrNoisePoc({ prefix: PREFIX, fingerprintId: sample.id, strength: 120, mmSize: 10, noiseGray: 0 });
  check('changing the gray level changes only the centre', (() => { for (let i = 0; i < dark.pixels1x.length; i++) { const y = Math.floor(i / CANONICAL_SIZE), x = i % CANONICAL_SIZE; const inCentre = y >= 88 && y < 144 && x >= 88 && x < 144; if (!inCentre && dark.pixels1x[i] !== white.pixels1x[i]) return false; } return true; })());
  check('default colour is "all" (792 watermarked modules)', rs.colour === 'all' && rs.selectedCount === 792);

  // PNG: 8-bit grayscale, 464x464, DPI chunk, pixels survive a zlib round trip (both code paths)
  check('2x pixels are the 1x pixels, nearest-neighbour', rs.size2x === 464 && rs.pixels2x[0] === rs.pixels1x[0] && rs.pixels2x[464 * 3 + 5] === rs.pixels1x[1 * 232 + 2]);
  check('DPI = 2 x round(232 / mm * 25.4)', rs.dpi2x === 2 * Math.round((232 / 10) * 25.4));

  async function inspect(png: Uint8Array) {
    const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => png[i] === b);
    let off = 8;
    const chunks: Record<string, Uint8Array> = {};
    let crcOk = true;
    while (off < png.length) {
      const len = dv.getUint32(off);
      const type = String.fromCharCode(...png.subarray(off + 4, off + 8));
      chunks[type] = png.subarray(off + 8, off + 8 + len);
      crcOk = crcOk && dv.getUint32(off + 8 + len) === crc32Of(png.subarray(off + 4, off + 8 + len));
      off += 12 + len;
    }
    const raw = inflateSync(chunks['IDAT']);
    const px = new Uint8Array(464 * 464);
    for (let y = 0; y < 464; y++) px.set(raw.subarray(y * 465 + 1, y * 465 + 465), y * 464);
    const ihdr = new DataView(chunks['IHDR'].buffer, chunks['IHDR'].byteOffset, 13);
    const phys = new DataView(chunks['pHYs'].buffer, chunks['pHYs'].byteOffset, 9);
    return { sig, crcOk, w: ihdr.getUint32(0), h: ihdr.getUint32(4), depth: chunks['IHDR'][8], ctype: chunks['IHDR'][9], ppm: phys.getUint32(0), unit: chunks['pHYs'][8], same: Buffer.from(px).equals(Buffer.from(rs.pixels2x)) };
  }
  const g = globalThis as unknown as { CompressionStream?: unknown };
  for (const mode of ['compressed', 'stored (no CompressionStream)']) {
    const saved = g.CompressionStream;
    if (mode !== 'compressed') g.CompressionStream = undefined;
    const png = await encodeGrayPng(rs.pixels2x, rs.size2x, rs.dpi2x);
    g.CompressionStream = saved;
    const i = await inspect(png);
    check(`PNG ${mode}: signature, 464x464, 8-bit grayscale`, i.sig && i.w === 464 && i.h === 464 && i.depth === 8 && i.ctype === 0);
    check(`PNG ${mode}: all chunk CRCs valid`, i.crcOk);
    check(`PNG ${mode}: pHYs = round(dpi / 0.0254) px/m, unit metre`, i.ppm === Math.round(rs.dpi2x / 0.0254) && i.unit === 1);
    check(`PNG ${mode}: pixels survive the zlib round trip`, i.same);
  }

  // Guard rails
  const base = { prefix: PREFIX, fingerprintId: sample.id, strength: 120, mmSize: 10, noiseGray: 64 };
  check('noise gray -1 is rejected', throws(() => generateSqrNoisePoc({ ...base, noiseGray: -1 })));
  check('noise gray 256 is rejected', throws(() => generateSqrNoisePoc({ ...base, noiseGray: 256 })));
  check('noise gray 12.5 is rejected', throws(() => generateSqrNoisePoc({ ...base, noiseGray: 12.5 })));
  check('noise gray NaN is rejected', throws(() => generateSqrNoisePoc({ ...base, noiseGray: Number.NaN })));
  check('noise gray 0 and 255 are accepted', !throws(() => generateSqrNoisePoc({ ...base, noiseGray: 0 })) && !throws(() => generateSqrNoisePoc({ ...base, noiseGray: 255 })));
  check('strength 0 and 1001 are rejected', throws(() => generateSqrNoisePoc({ ...base, strength: 0 })) && throws(() => generateSqrNoisePoc({ ...base, strength: 1001 })));
  check('empty fingerprint ID is rejected', throws(() => generateSqrNoisePoc({ ...base, fingerprintId: '' })));
  check('size 0 mm is rejected', throws(() => generateSqrNoisePoc({ ...base, mmSize: 0 })));
  check('a repeated coefficient is rejected', throws(() => generateSqrNoisePoc({ ...base, coeffPairs: [[[3, 1], [1, 3]], [[3, 1], [0, 1]]] })));
  check('too-long QR content is rejected with an error', throws(() => generateSqrNoisePoc({ ...base, prefix: 'https://example.com/a-very-long-prefix-that-cannot-fit/' })));
  check('BLOCK_SIZE is 8', BLOCK_SIZE === 8);

  console.log(allOk ? '\nALL CHECKS PASSED' : '\nSOME CHECKS FAILED');
  process.exit(allOk ? 0 : 1);
})();