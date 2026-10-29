// Functional test for src/lib/sqrNoisePoc.ts. Run: npx tsx scripts/test-sqr-noise-poc.ts
//
// Expected values (hashes of pixels, strings and the noise grid) were produced by a Python reference
// built from the backend's sqr_generator.py functions (qrcodegen, scipy DCT, zlib.crc32) for strength 120
// and the prefix "https://example.com/v/". The codeword table (how many of the 70 codewords a 7x7 block
// touches at each of the 529 positions) comes from qrcodegen's own codeword placement. The structural
// checks compare the hybrid with the standard SQR from src/lib/sqrPoc.ts, which is already verified
// against the backend.

import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import {
  BLOCK_SIZE, CANONICAL_SIZE, QR_MODULES, TOTAL_BLOCKS,
  buildQrModules, crc32, encodeGrayPng, generateSqrPoc, type CoeffPair, type WatermarkColour,
} from '../src/lib/sqrPoc';
import {
  DEFAULT_NOISE_COL, DEFAULT_NOISE_ROW, MAX_NOISE_POSITION, NOISE_BITS, NOISE_MODULE_COUNT, NOISE_SIZE, QR_CORRECTABLE_CODEWORDS,
  QR_TOTAL_CODEWORDS, WATERMARKED_MODULES,
  buildNoiseGrid, countWatermarkArea, generateNoiseBits, generateSqrNoisePoc, isNoiseModule, noiseBlockInfo, qrModuleInfo, validateNoisePosition,
} from '../src/lib/sqrNoisePoc';

const PREFIX = 'https://example.com/v/';
const PAIRS: Record<number, CoeffPair[]> = {
  1: [[[3, 1], [1, 3]]],
  2: [[[3, 1], [1, 3]], [[1, 0], [0, 1]]],
};
interface Mode { colour: WatermarkColour; gray: number; pairs: number; row: number; col: number; pixelsSha: string; refSha: string; refLen: number; maskSha: string; noiseSha: string }
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
    "row": 9,
    "col": 11,
    "pixelsSha": "1bf3a235a33721717b3236ad5f25257cdc688b04267dc37a24f7f8441370faf6",
    "refSha": "b4ffa5528a7d36929a1dba7f4764f44fa3f5900c0c259a2b2fc3d7d0f6997ad9",
    "refLen": 792,
    "maskSha": "efea6bc4da0ddd88c598d879b540fd6c6f8c6bbf5397bc384e136c0089c49ce0",
    "noiseSha": "30bc7fe09f560ca412d256c41088bc693228f0b72424814034fd1d27d4d73e7d"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "pixelsSha": "6531146a05d4f761cc6f1760ffb6171964b962a35703668f0b3afff077b46a35",
    "refSha": "b4ffa5528a7d36929a1dba7f4764f44fa3f5900c0c259a2b2fc3d7d0f6997ad9",
    "refLen": 792,
    "maskSha": "efea6bc4da0ddd88c598d879b540fd6c6f8c6bbf5397bc384e136c0089c49ce0",
    "noiseSha": "30bc7fe09f560ca412d256c41088bc693228f0b72424814034fd1d27d4d73e7d"
   },
   {
    "colour": "all",
    "gray": 255,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "pixelsSha": "71a7dd4ac4f7517921e02ea58675025c764fc9ea2ed8c9e005d3b23344ce11af",
    "refSha": "b4ffa5528a7d36929a1dba7f4764f44fa3f5900c0c259a2b2fc3d7d0f6997ad9",
    "refLen": 792,
    "maskSha": "efea6bc4da0ddd88c598d879b540fd6c6f8c6bbf5397bc384e136c0089c49ce0",
    "noiseSha": "30bc7fe09f560ca412d256c41088bc693228f0b72424814034fd1d27d4d73e7d"
   },
   {
    "colour": "black",
    "gray": 0,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "pixelsSha": "4c86bc26da50332ce526e5555aaf19bcd51a2d5cf25c5741558f867e72c3c2d8",
    "refSha": "d8bd7ed0240dce412b6a45db2d30af30f62dd62c309f5731acc13841c85b38f5",
    "refLen": 404,
    "maskSha": "97feb8f29691bb5a8aa68fab6a7e33767d37e68c80a75c24b43d0dd09cbaaf07",
    "noiseSha": "30bc7fe09f560ca412d256c41088bc693228f0b72424814034fd1d27d4d73e7d"
   },
   {
    "colour": "black",
    "gray": 64,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "pixelsSha": "f255007b6790bc95ebaa47b3d19fb49fb3a5ae5c1612ecbb73f7123ca49f008f",
    "refSha": "d8bd7ed0240dce412b6a45db2d30af30f62dd62c309f5731acc13841c85b38f5",
    "refLen": 404,
    "maskSha": "97feb8f29691bb5a8aa68fab6a7e33767d37e68c80a75c24b43d0dd09cbaaf07",
    "noiseSha": "30bc7fe09f560ca412d256c41088bc693228f0b72424814034fd1d27d4d73e7d"
   },
   {
    "colour": "black",
    "gray": 255,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "pixelsSha": "0a938e0666b8e6d1381fd0c52ef0878b697288b470a92e80c10d09080f2c3e98",
    "refSha": "d8bd7ed0240dce412b6a45db2d30af30f62dd62c309f5731acc13841c85b38f5",
    "refLen": 404,
    "maskSha": "97feb8f29691bb5a8aa68fab6a7e33767d37e68c80a75c24b43d0dd09cbaaf07",
    "noiseSha": "30bc7fe09f560ca412d256c41088bc693228f0b72424814034fd1d27d4d73e7d"
   },
   {
    "colour": "white",
    "gray": 0,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "pixelsSha": "4069fd78c94e2735aeed6e74014b3b664f32f7dbf5c09968a51c8750a9a187ff",
    "refSha": "2c10e2e7120994c811f71253062fae7446a38db671480995976b42b9a954a046",
    "refLen": 388,
    "maskSha": "5f30ccb670bb19f98fc543e1a58bbf1821cc595cd23d5c60e8ca040d40511968",
    "noiseSha": "30bc7fe09f560ca412d256c41088bc693228f0b72424814034fd1d27d4d73e7d"
   },
   {
    "colour": "white",
    "gray": 64,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "pixelsSha": "eba6f62e63ff24eeb4c047ea804cf33fed37bfa52833e46cedd5c09eb4ee8ce2",
    "refSha": "2c10e2e7120994c811f71253062fae7446a38db671480995976b42b9a954a046",
    "refLen": 388,
    "maskSha": "5f30ccb670bb19f98fc543e1a58bbf1821cc595cd23d5c60e8ca040d40511968",
    "noiseSha": "30bc7fe09f560ca412d256c41088bc693228f0b72424814034fd1d27d4d73e7d"
   },
   {
    "colour": "white",
    "gray": 255,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "pixelsSha": "b526921490bcccaf574ba4635b2e0019993110fdf2d0f50d39be5ccb204f6d48",
    "refSha": "2c10e2e7120994c811f71253062fae7446a38db671480995976b42b9a954a046",
    "refLen": 388,
    "maskSha": "5f30ccb670bb19f98fc543e1a58bbf1821cc595cd23d5c60e8ca040d40511968",
    "noiseSha": "30bc7fe09f560ca412d256c41088bc693228f0b72424814034fd1d27d4d73e7d"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 2,
    "row": 9,
    "col": 11,
    "pixelsSha": "dd8568cb38874bd87d7d55052671b6ba98a37516b6d83c6f823929bd123dc69c",
    "refSha": "b4ffa5528a7d36929a1dba7f4764f44fa3f5900c0c259a2b2fc3d7d0f6997ad9",
    "refLen": 792,
    "maskSha": "efea6bc4da0ddd88c598d879b540fd6c6f8c6bbf5397bc384e136c0089c49ce0",
    "noiseSha": "30bc7fe09f560ca412d256c41088bc693228f0b72424814034fd1d27d4d73e7d"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 11,
    "col": 11,
    "pixelsSha": "8ab2f10cde207c4697a543c63fb2c43e4477d7c41b3fa9a5f348f8b8aa153c8a",
    "refSha": "79940e7d2648d978fb9c367d318f26a473768f5333bbc2cf0855880b6eca03bb",
    "refLen": 792,
    "maskSha": "297aa7714f53eca8ac03c25f92b6988d7fd948f2a3ec5f94c9eeb33694dbdc4c",
    "noiseSha": "30bc7fe09f560ca412d256c41088bc693228f0b72424814034fd1d27d4d73e7d"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 0,
    "col": 0,
    "pixelsSha": "05dc5127b473cdc1a57d209f8d0a8f020aa38afbc3e22e631d00effb47460f1c",
    "refSha": "54f0f7b19eebdcbd50aa7c95ff49d0012acaf8073a1ffebe2767782587d7752c",
    "refLen": 792,
    "maskSha": "22891c54759ebacc4c35e9f5baea468063df8c1cecb571ed08ea61dea19688fc",
    "noiseSha": "30bc7fe09f560ca412d256c41088bc693228f0b72424814034fd1d27d4d73e7d"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 22,
    "col": 22,
    "pixelsSha": "1457204c798c8b4807380315113391a6ace58a0d7afaf1e77a9c98b3bc785dbc",
    "refSha": "75a7e3b83b3f63635f43abe2c87e1055e1ec0ce086ae3c9120916f23b2840913",
    "refLen": 792,
    "maskSha": "52e7c26d55b8b2f70d667860202d84a7b454795f860d76e61cf4ab23ad0c3564",
    "noiseSha": "30bc7fe09f560ca412d256c41088bc693228f0b72424814034fd1d27d4d73e7d"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 7,
    "col": 9,
    "pixelsSha": "8aa0a953867860d5179c1333f208351f5b144b0339996f66b92246b496498cf2",
    "refSha": "cc52980231c2fa83889158e8c86b3b80d9a55a2cba4f5a966c43fe7cc6fcd2f2",
    "refLen": 792,
    "maskSha": "d3f230f09f487c95a4fa2b45e7a78e3341599d324837acba16e580eaff5c5830",
    "noiseSha": "30bc7fe09f560ca412d256c41088bc693228f0b72424814034fd1d27d4d73e7d"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 13,
    "col": 20,
    "pixelsSha": "6f193ce2afb1769cb57d0cd47f94c47f1034fff1ebbc31969a48408b7fd9ebc0",
    "refSha": "3faf6df6f4537686acfddba3e4c513db065475d55313ac14414d6c00d4876449",
    "refLen": 792,
    "maskSha": "4ecd2ea5f6918295c7e30ac87f16088f5170a212b92127f8756597a5c79d4744",
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
    "row": 9,
    "col": 11,
    "pixelsSha": "654cf6c9ddda73984f9757c8ed2bd2fbaf1a89bcc0743352401b13ebe2eb265e",
    "refSha": "dd9eac7c81235249f84030d02a790fd8474b715e8ce9d50f2f00d83bab5713a6",
    "refLen": 792,
    "maskSha": "efea6bc4da0ddd88c598d879b540fd6c6f8c6bbf5397bc384e136c0089c49ce0",
    "noiseSha": "27800ca4d975f2a947820334e313c8f70a5340f68813148ffa1837b29e832760"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "pixelsSha": "6339ddfaf9329a2558c49d1c3d6fd5070ffa400d57fa4a19f3beb2c9b6815477",
    "refSha": "dd9eac7c81235249f84030d02a790fd8474b715e8ce9d50f2f00d83bab5713a6",
    "refLen": 792,
    "maskSha": "efea6bc4da0ddd88c598d879b540fd6c6f8c6bbf5397bc384e136c0089c49ce0",
    "noiseSha": "27800ca4d975f2a947820334e313c8f70a5340f68813148ffa1837b29e832760"
   },
   {
    "colour": "all",
    "gray": 255,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "pixelsSha": "0d760423d9655c3364b728f4ed587b0c09c48df84df6d8c3a1282042e6a30685",
    "refSha": "dd9eac7c81235249f84030d02a790fd8474b715e8ce9d50f2f00d83bab5713a6",
    "refLen": 792,
    "maskSha": "efea6bc4da0ddd88c598d879b540fd6c6f8c6bbf5397bc384e136c0089c49ce0",
    "noiseSha": "27800ca4d975f2a947820334e313c8f70a5340f68813148ffa1837b29e832760"
   },
   {
    "colour": "black",
    "gray": 0,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "pixelsSha": "3f4ef15f769cc51dddd2252c73304a277982e6f5de46e29f71777152b6d7cb62",
    "refSha": "477b0b34c3740ab7d485c3e6d4d105214f330e7a7cbc7d98c80dcd08c675612e",
    "refLen": 421,
    "maskSha": "3d1af2917b122ac269464afa0d13289ccb2368c95607558d31392e5903f78c21",
    "noiseSha": "27800ca4d975f2a947820334e313c8f70a5340f68813148ffa1837b29e832760"
   },
   {
    "colour": "black",
    "gray": 64,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "pixelsSha": "a4f1285882cc031da3214cbdeaef877be91523b7cf1ff956c40444073c360906",
    "refSha": "477b0b34c3740ab7d485c3e6d4d105214f330e7a7cbc7d98c80dcd08c675612e",
    "refLen": 421,
    "maskSha": "3d1af2917b122ac269464afa0d13289ccb2368c95607558d31392e5903f78c21",
    "noiseSha": "27800ca4d975f2a947820334e313c8f70a5340f68813148ffa1837b29e832760"
   },
   {
    "colour": "black",
    "gray": 255,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "pixelsSha": "fc4a834c302b12a286b3b4331402a9d646cb17ca84d76b1e67719185b8228996",
    "refSha": "477b0b34c3740ab7d485c3e6d4d105214f330e7a7cbc7d98c80dcd08c675612e",
    "refLen": 421,
    "maskSha": "3d1af2917b122ac269464afa0d13289ccb2368c95607558d31392e5903f78c21",
    "noiseSha": "27800ca4d975f2a947820334e313c8f70a5340f68813148ffa1837b29e832760"
   },
   {
    "colour": "white",
    "gray": 0,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "pixelsSha": "b8a551b8de32426e0fe299701110f79f04705f3f061930ca19d327bcd2416d74",
    "refSha": "5fb688685d88cd9a5352401c73b3830ca39eeadcee91e5c230749e29ba014a17",
    "refLen": 371,
    "maskSha": "d6651b1e83528ed0ad9374fb84d5daae3f632245111fcd6d2a77da49363a7d85",
    "noiseSha": "27800ca4d975f2a947820334e313c8f70a5340f68813148ffa1837b29e832760"
   },
   {
    "colour": "white",
    "gray": 64,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "pixelsSha": "c4a45f00de5ef1761f7661b147f437fbd1e78d829b7a0a31b37750dca00a35d1",
    "refSha": "5fb688685d88cd9a5352401c73b3830ca39eeadcee91e5c230749e29ba014a17",
    "refLen": 371,
    "maskSha": "d6651b1e83528ed0ad9374fb84d5daae3f632245111fcd6d2a77da49363a7d85",
    "noiseSha": "27800ca4d975f2a947820334e313c8f70a5340f68813148ffa1837b29e832760"
   },
   {
    "colour": "white",
    "gray": 255,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "pixelsSha": "b3c6098dd5c6b2bff80051324b867b3381a9fb33b285eae658191d1d837da435",
    "refSha": "5fb688685d88cd9a5352401c73b3830ca39eeadcee91e5c230749e29ba014a17",
    "refLen": 371,
    "maskSha": "d6651b1e83528ed0ad9374fb84d5daae3f632245111fcd6d2a77da49363a7d85",
    "noiseSha": "27800ca4d975f2a947820334e313c8f70a5340f68813148ffa1837b29e832760"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 2,
    "row": 9,
    "col": 11,
    "pixelsSha": "6add1b63d49ef48600485f5f42c0d46453abb9a6fcd1776189c41fe414e45a00",
    "refSha": "dd9eac7c81235249f84030d02a790fd8474b715e8ce9d50f2f00d83bab5713a6",
    "refLen": 792,
    "maskSha": "efea6bc4da0ddd88c598d879b540fd6c6f8c6bbf5397bc384e136c0089c49ce0",
    "noiseSha": "27800ca4d975f2a947820334e313c8f70a5340f68813148ffa1837b29e832760"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 11,
    "col": 11,
    "pixelsSha": "832d5cd3a9898e2dc2573700742c0eb2d97fe03406d01e2041660a40d63e8207",
    "refSha": "7d4d774436ffd014a4b1296f751e69c34c51a58da3cdcf35dc2bc0f4002c8f92",
    "refLen": 792,
    "maskSha": "297aa7714f53eca8ac03c25f92b6988d7fd948f2a3ec5f94c9eeb33694dbdc4c",
    "noiseSha": "27800ca4d975f2a947820334e313c8f70a5340f68813148ffa1837b29e832760"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 0,
    "col": 0,
    "pixelsSha": "2b577e4d95bb4d3f02926df74858b0c56bd0a2474e09fd738f6bb5d0b18b3169",
    "refSha": "9e42a635f98af2d1e5af411e5491de263f004d0e0e19d2b5e287e95febf011cc",
    "refLen": 792,
    "maskSha": "22891c54759ebacc4c35e9f5baea468063df8c1cecb571ed08ea61dea19688fc",
    "noiseSha": "27800ca4d975f2a947820334e313c8f70a5340f68813148ffa1837b29e832760"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 22,
    "col": 22,
    "pixelsSha": "0009d0aa5ae3a5bf656a615bfc96e019aa9ebc999a6f0efda4585a5fa1ebf48e",
    "refSha": "4a8cddb913abeb52b120502a56a3e9afe7c732d2703827eeb0dd2daf204279e4",
    "refLen": 792,
    "maskSha": "52e7c26d55b8b2f70d667860202d84a7b454795f860d76e61cf4ab23ad0c3564",
    "noiseSha": "27800ca4d975f2a947820334e313c8f70a5340f68813148ffa1837b29e832760"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 7,
    "col": 9,
    "pixelsSha": "04b948ec7eada64d62daa05dabf180ea1d31a5b07c9a22bcb446a15fb52685f1",
    "refSha": "436962d32e494049cabc6f7f74d0982eb0c71ec45f533eb05f799b8846e4cf23",
    "refLen": 792,
    "maskSha": "d3f230f09f487c95a4fa2b45e7a78e3341599d324837acba16e580eaff5c5830",
    "noiseSha": "27800ca4d975f2a947820334e313c8f70a5340f68813148ffa1837b29e832760"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 13,
    "col": 20,
    "pixelsSha": "9d89ac53cf404c4fc912937ec4327de1979a8ba1899e00b3e2e74a1fa8e47f70",
    "refSha": "699c1badcd300c7ef30fe04f87d4372b3aa424c03832c4e22b16d058490525f6",
    "refLen": 792,
    "maskSha": "4ecd2ea5f6918295c7e30ac87f16088f5170a212b92127f8756597a5c79d4744",
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
    "row": 9,
    "col": 11,
    "pixelsSha": "08716e2794c1ab01b03308f6aea58c536f4184be5cfc6f41406f29d7ce76ea2f",
    "refSha": "6af6830c4195feb2890b472334aa52ba496a8836081148e476afddb03421348e",
    "refLen": 792,
    "maskSha": "efea6bc4da0ddd88c598d879b540fd6c6f8c6bbf5397bc384e136c0089c49ce0",
    "noiseSha": "9c808ef3a3aaca62d144c933f5b5d1aedfcdbd677a8d00bcb726a413fbd3258b"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "pixelsSha": "c0c68d6641c1b360e65778daa2f76758713c48708f617071021e5e9814cd83af",
    "refSha": "6af6830c4195feb2890b472334aa52ba496a8836081148e476afddb03421348e",
    "refLen": 792,
    "maskSha": "efea6bc4da0ddd88c598d879b540fd6c6f8c6bbf5397bc384e136c0089c49ce0",
    "noiseSha": "9c808ef3a3aaca62d144c933f5b5d1aedfcdbd677a8d00bcb726a413fbd3258b"
   },
   {
    "colour": "all",
    "gray": 255,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "pixelsSha": "452d943cd2180b9802bbe95192c53ee1b05e0a9be70e968eea434ae4455f2861",
    "refSha": "6af6830c4195feb2890b472334aa52ba496a8836081148e476afddb03421348e",
    "refLen": 792,
    "maskSha": "efea6bc4da0ddd88c598d879b540fd6c6f8c6bbf5397bc384e136c0089c49ce0",
    "noiseSha": "9c808ef3a3aaca62d144c933f5b5d1aedfcdbd677a8d00bcb726a413fbd3258b"
   },
   {
    "colour": "black",
    "gray": 0,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "pixelsSha": "2a012cbb01e99bdbae84367639b6f3a81a7f5792630bc67e335ed6123209590b",
    "refSha": "c90bf8637888768135aecf3588623ea704f9149a90a5f658abf513afef2a7f37",
    "refLen": 406,
    "maskSha": "f3794a8c4f2bf4017897750a86db9cf30c68689b593a616d52fdaffb02bc2638",
    "noiseSha": "9c808ef3a3aaca62d144c933f5b5d1aedfcdbd677a8d00bcb726a413fbd3258b"
   },
   {
    "colour": "black",
    "gray": 64,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "pixelsSha": "c0b2879b1d2be9a7312b791fc427b28cf1b153eddcd4e649c93ae7709e7cdd0f",
    "refSha": "c90bf8637888768135aecf3588623ea704f9149a90a5f658abf513afef2a7f37",
    "refLen": 406,
    "maskSha": "f3794a8c4f2bf4017897750a86db9cf30c68689b593a616d52fdaffb02bc2638",
    "noiseSha": "9c808ef3a3aaca62d144c933f5b5d1aedfcdbd677a8d00bcb726a413fbd3258b"
   },
   {
    "colour": "black",
    "gray": 255,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "pixelsSha": "b6eba14c4f72b49d5b368c867bc2af54b2845cd7e35ed210976b37845cb92752",
    "refSha": "c90bf8637888768135aecf3588623ea704f9149a90a5f658abf513afef2a7f37",
    "refLen": 406,
    "maskSha": "f3794a8c4f2bf4017897750a86db9cf30c68689b593a616d52fdaffb02bc2638",
    "noiseSha": "9c808ef3a3aaca62d144c933f5b5d1aedfcdbd677a8d00bcb726a413fbd3258b"
   },
   {
    "colour": "white",
    "gray": 0,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "pixelsSha": "ff940748b6467c33ae1bb3908ca53fbbe5050ddc2f0b53c6c2a5d7da6f13d893",
    "refSha": "66f4e73306ba72bf0da3dee4457b6c944a4f2485c70d0db20395d09edd2fd57a",
    "refLen": 386,
    "maskSha": "303bd7b5c07fa7f68c9b8da3d895f5a789b025e8be268d218f21882c285bb6b2",
    "noiseSha": "9c808ef3a3aaca62d144c933f5b5d1aedfcdbd677a8d00bcb726a413fbd3258b"
   },
   {
    "colour": "white",
    "gray": 64,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "pixelsSha": "189154e4ca53e9b6b97b04aa9270cf286cfa6d8252b8d5e599c11ce261e25f03",
    "refSha": "66f4e73306ba72bf0da3dee4457b6c944a4f2485c70d0db20395d09edd2fd57a",
    "refLen": 386,
    "maskSha": "303bd7b5c07fa7f68c9b8da3d895f5a789b025e8be268d218f21882c285bb6b2",
    "noiseSha": "9c808ef3a3aaca62d144c933f5b5d1aedfcdbd677a8d00bcb726a413fbd3258b"
   },
   {
    "colour": "white",
    "gray": 255,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "pixelsSha": "4486e05cce7a0a86f409a87752233bd6a93cc6d36adef90d5fedf2b7d9926d95",
    "refSha": "66f4e73306ba72bf0da3dee4457b6c944a4f2485c70d0db20395d09edd2fd57a",
    "refLen": 386,
    "maskSha": "303bd7b5c07fa7f68c9b8da3d895f5a789b025e8be268d218f21882c285bb6b2",
    "noiseSha": "9c808ef3a3aaca62d144c933f5b5d1aedfcdbd677a8d00bcb726a413fbd3258b"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 2,
    "row": 9,
    "col": 11,
    "pixelsSha": "607026585abcb0401b72759eeaebf0b193ab48be7245267b10e78dd6bb2e38a2",
    "refSha": "6af6830c4195feb2890b472334aa52ba496a8836081148e476afddb03421348e",
    "refLen": 792,
    "maskSha": "efea6bc4da0ddd88c598d879b540fd6c6f8c6bbf5397bc384e136c0089c49ce0",
    "noiseSha": "9c808ef3a3aaca62d144c933f5b5d1aedfcdbd677a8d00bcb726a413fbd3258b"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 11,
    "col": 11,
    "pixelsSha": "527a0996080247b804e6ca087736dc2bf4f57094b95f6b569e17a96a48723925",
    "refSha": "9cdd195b6232adfb85119a0795e27f0707e009bd5f06189ed054abcbe81d3a67",
    "refLen": 792,
    "maskSha": "297aa7714f53eca8ac03c25f92b6988d7fd948f2a3ec5f94c9eeb33694dbdc4c",
    "noiseSha": "9c808ef3a3aaca62d144c933f5b5d1aedfcdbd677a8d00bcb726a413fbd3258b"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 0,
    "col": 0,
    "pixelsSha": "6ec254b4271f64c73ce8f6cd6e64c2d19957e02ab6c94cb76f869b42f15e8654",
    "refSha": "5f7d71aae18f73ea71abfb2629329c110e77760020e0c634ae7b144a7f39eeee",
    "refLen": 792,
    "maskSha": "22891c54759ebacc4c35e9f5baea468063df8c1cecb571ed08ea61dea19688fc",
    "noiseSha": "9c808ef3a3aaca62d144c933f5b5d1aedfcdbd677a8d00bcb726a413fbd3258b"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 22,
    "col": 22,
    "pixelsSha": "65f54a8f5a8dd687d2d31b72092b2fe80ee5e1a8ae018ea3d42dc987ce3980b4",
    "refSha": "cf8040a363d4c948b5008a6abe1b827dab0f1316bfda8d027e8103cc7da7f57f",
    "refLen": 792,
    "maskSha": "52e7c26d55b8b2f70d667860202d84a7b454795f860d76e61cf4ab23ad0c3564",
    "noiseSha": "9c808ef3a3aaca62d144c933f5b5d1aedfcdbd677a8d00bcb726a413fbd3258b"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 7,
    "col": 9,
    "pixelsSha": "13b166977e940a30f8a42d9fb57c06e72c72e1c32999f9cd957fddf62dfedad6",
    "refSha": "a8e1414fb221aabe0a8efe2b867df4dc1edd82dc597a8fd8197f55eea19735a1",
    "refLen": 792,
    "maskSha": "d3f230f09f487c95a4fa2b45e7a78e3341599d324837acba16e580eaff5c5830",
    "noiseSha": "9c808ef3a3aaca62d144c933f5b5d1aedfcdbd677a8d00bcb726a413fbd3258b"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 13,
    "col": 20,
    "pixelsSha": "78b909f42399c111d059400c87cb6ccd41f8bd56ad45852d18c24560ff8c09d0",
    "refSha": "aa6510c7e110cba18dfd0e16aac5f5bd86afe0353add53ab5ff0c7e84fa2fb57",
    "refLen": 792,
    "maskSha": "4ecd2ea5f6918295c7e30ac87f16088f5170a212b92127f8756597a5c79d4744",
    "noiseSha": "9c808ef3a3aaca62d144c933f5b5d1aedfcdbd677a8d00bcb726a413fbd3258b"
   }
  ]
 }
];
/** "row,col" -> [codewords touched, function-pattern modules covered], for every position 0..22 x 0..22. */
const LAYOUT_TABLE: Record<string, [number, number]> = {"0,0":[0,49],"0,1":[0,49],"0,2":[0,49],"0,3":[2,43],"0,4":[3,37],"0,5":[4,31],"0,6":[4,25],"0,7":[6,19],"0,8":[7,13],"0,9":[8,7],"0,10":[8,7],"0,11":[8,7],"0,12":[9,7],"0,13":[8,7],"0,14":[8,7],"0,15":[6,13],"0,16":[6,19],"0,17":[4,25],"0,18":[4,31],"0,19":[2,37],"0,20":[2,43],"0,21":[0,49],"0,22":[0,49],"1,0":[0,49],"1,1":[0,49],"1,2":[0,49],"1,3":[2,43],"1,4":[2,37],"1,5":[4,31],"1,6":[4,25],"1,7":[6,19],"1,8":[6,13],"1,9":[8,7],"1,10":[8,7],"1,11":[8,7],"1,12":[8,7],"1,13":[8,7],"1,14":[8,7],"1,15":[6,13],"1,16":[6,19],"1,17":[4,25],"1,18":[4,31],"1,19":[2,37],"1,20":[2,43],"1,21":[0,49],"1,22":[0,49],"2,0":[0,49],"2,1":[0,49],"2,2":[0,49],"2,3":[2,43],"2,4":[2,37],"2,5":[4,31],"2,6":[5,25],"2,7":[7,19],"2,8":[7,13],"2,9":[9,7],"2,10":[10,7],"2,11":[10,7],"2,12":[10,7],"2,13":[9,7],"2,14":[10,7],"2,15":[8,13],"2,16":[8,19],"2,17":[5,25],"2,18":[5,31],"2,19":[3,37],"2,20":[3,43],"2,21":[0,49],"2,22":[0,49],"3,0":[4,43],"3,1":[3,43],"3,2":[3,43],"3,3":[6,38],"3,4":[5,33],"3,5":[7,28],"3,6":[7,23],"3,7":[10,17],"3,8":[10,12],"3,9":[12,7],"3,10":[11,7],"3,11":[12,7],"3,12":[11,7],"3,13":[12,7],"3,14":[11,7],"3,15":[10,12],"3,16":[9,17],"3,17":[7,22],"3,18":[6,27],"3,19":[5,32],"3,20":[4,37],"3,21":[3,42],"3,22":[3,42],"4,0":[4,37],"4,1":[4,37],"4,2":[3,37],"4,3":[5,33],"4,4":[5,29],"4,5":[7,25],"4,6":[6,21],"4,7":[8,15],"4,8":[9,11],"4,9":[10,7],"4,10":[10,7],"4,11":[9,7],"4,12":[10,7],"4,13":[10,7],"4,14":[10,7],"4,15":[9,11],"4,16":[9,15],"4,17":[7,19],"4,18":[7,23],"4,19":[5,27],"4,20":[5,31],"4,21":[4,35],"4,22":[4,35],"5,0":[4,31],"5,1":[4,31],"5,2":[3,31],"5,3":[5,28],"5,4":[4,25],"5,5":[6,22],"5,6":[5,19],"5,7":[7,13],"5,8":[7,10],"5,9":[8,7],"5,10":[8,7],"5,11":[8,7],"5,12":[8,7],"5,13":[8,7],"5,14":[8,7],"5,15":[8,10],"5,16":[8,13],"5,17":[6,16],"5,18":[6,19],"5,19":[5,22],"5,20":[5,25],"5,21":[4,28],"5,22":[4,28],"6,0":[5,25],"6,1":[5,25],"6,2":[5,25],"6,3":[7,23],"6,4":[5,21],"6,5":[7,19],"6,6":[7,17],"6,7":[9,11],"6,8":[9,9],"6,9":[9,7],"6,10":[10,7],"6,11":[10,7],"6,12":[10,7],"6,13":[9,7],"6,14":[10,7],"6,15":[10,9],"6,16":[10,11],"6,17":[8,13],"6,18":[8,15],"6,19":[7,17],"6,20":[7,19],"6,21":[5,21],"6,22":[5,21],"7,0":[7,19],"7,1":[7,19],"7,2":[6,19],"7,3":[9,17],"7,4":[7,15],"7,5":[9,13],"7,6":[8,11],"7,7":[11,4],"7,8":[11,2],"7,9":[12,0],"7,10":[11,0],"7,11":[12,0],"7,12":[12,0],"7,13":[12,0],"7,14":[11,0],"7,15":[11,2],"7,16":[11,4],"7,17":[9,6],"7,18":[8,8],"7,19":[8,10],"7,20":[8,12],"7,21":[7,14],"7,22":[7,14],"8,0":[7,13],"8,1":[8,13],"8,2":[6,13],"8,3":[9,12],"8,4":[7,11],"8,5":[10,10],"8,6":[8,9],"8,7":[11,2],"8,8":[11,1],"8,9":[12,0],"8,10":[12,0],"8,11":[12,0],"8,12":[11,0],"8,13":[12,0],"8,14":[12,0],"8,15":[12,1],"8,16":[11,2],"8,17":[10,3],"8,18":[10,4],"8,19":[9,5],"8,20":[8,6],"8,21":[8,7],"8,22":[8,7],"9,0":[7,7],"9,1":[8,7],"9,2":[6,7],"9,3":[8,7],"9,4":[7,7],"9,5":[9,7],"9,6":[7,7],"9,7":[9,0],"9,8":[10,0],"9,9":[10,0],"9,10":[10,0],"9,11":[9,0],"9,12":[10,0],"9,13":[10,0],"9,14":[10,0],"9,15":[10,0],"9,16":[10,0],"9,17":[9,0],"9,18":[9,0],"9,19":[8,0],"9,20":[8,0],"9,21":[8,0],"9,22":[8,0],"10,0":[7,7],"10,1":[9,7],"10,2":[8,7],"10,3":[10,7],"10,4":[7,7],"10,5":[9,7],"10,6":[8,7],"10,7":[10,0],"10,8":[10,0],"10,9":[9,0],"10,10":[10,0],"10,11":[10,0],"10,12":[10,0],"10,13":[9,0],"10,14":[10,0],"10,15":[10,0],"10,16":[10,0],"10,17":[10,0],"10,18":[10,0],"10,19":[10,0],"10,20":[10,0],"10,21":[9,0],"10,22":[9,0],"11,0":[8,7],"11,1":[11,7],"11,2":[9,7],"11,3":[12,7],"11,4":[9,7],"11,5":[11,7],"11,6":[9,7],"11,7":[12,0],"11,8":[12,0],"11,9":[12,0],"11,10":[11,0],"11,11":[12,0],"11,12":[12,0],"11,13":[12,0],"11,14":[11,0],"11,15":[11,0],"11,16":[11,0],"11,17":[11,0],"11,18":[10,0],"11,19":[11,0],"11,20":[11,0],"11,21":[11,0],"11,22":[11,0],"12,0":[8,7],"12,1":[11,7],"12,2":[9,7],"12,3":[11,7],"12,4":[9,7],"12,5":[12,7],"12,6":[9,7],"12,7":[12,0],"12,8":[11,0],"12,9":[12,0],"12,10":[12,0],"12,11":[12,0],"12,12":[11,0],"12,13":[12,0],"12,14":[12,0],"12,15":[12,0],"12,16":[11,0],"12,17":[11,0],"12,18":[11,0],"12,19":[11,0],"12,20":[10,0],"12,21":[11,0],"12,22":[11,0],"13,0":[7,7],"13,1":[9,7],"13,2":[7,7],"13,3":[9,7],"13,4":[8,7],"13,5":[10,7],"13,6":[7,7],"13,7":[9,0],"13,8":[10,0],"13,9":[10,0],"13,10":[10,0],"13,11":[9,0],"13,12":[10,0],"13,13":[10,0],"13,14":[10,0],"13,15":[10,0],"13,16":[10,0],"13,17":[10,0],"13,18":[10,0],"13,19":[9,0],"13,20":[9,0],"13,21":[9,0],"13,22":[9,0],"14,0":[5,7],"14,1":[7,7],"14,2":[7,7],"14,3":[9,7],"14,4":[7,7],"14,5":[9,7],"14,6":[8,7],"14,7":[10,0],"14,8":[10,0],"14,9":[9,0],"14,10":[10,0],"14,11":[10,0],"14,12":[10,0],"14,13":[9,0],"14,14":[9,1],"14,15":[9,2],"14,16":[9,3],"14,17":[8,4],"14,18":[8,5],"14,19":[8,5],"14,20":[8,5],"14,21":[8,4],"14,22":[8,3],"15,0":[5,13],"15,1":[7,13],"15,2":[7,13],"15,3":[10,12],"15,4":[8,11],"15,5":[11,10],"15,6":[9,9],"15,7":[12,2],"15,8":[12,1],"15,9":[12,0],"15,10":[11,0],"15,11":[12,0],"15,12":[12,0],"15,13":[12,0],"15,14":[11,2],"15,15":[11,4],"15,16":[11,6],"15,17":[10,8],"15,18":[9,10],"15,19":[10,10],"15,20":[9,10],"15,21":[10,8],"15,22":[10,6],"16,0":[5,19],"16,1":[7,19],"16,2":[7,19],"16,3":[9,17],"16,4":[8,15],"16,5":[11,13],"16,6":[9,11],"16,7":[12,4],"16,8":[11,2],"16,9":[12,0],"16,10":[12,0],"16,11":[12,0],"16,12":[11,0],"16,13":[12,0],"16,14":[12,3],"16,15":[11,6],"16,16":[10,9],"16,17":[9,12],"16,18":[9,15],"16,19":[9,15],"16,20":[7,15],"16,21":[9,12],"16,22":[9,9],"17,0":[4,25],"17,1":[5,25],"17,2":[5,25],"17,3":[7,22],"17,4":[7,19],"17,5":[9,16],"17,6":[7,13],"17,7":[9,6],"17,8":[10,3],"17,9":[10,0],"17,10":[10,0],"17,11":[9,0],"17,12":[10,0],"17,13":[10,0],"17,14":[10,4],"17,15":[9,8],"17,16":[9,12],"17,17":[8,16],"17,18":[8,20],"17,19":[7,20],"17,20":[6,20],"17,21":[7,16],"17,22":[7,12],"18,0":[2,31],"18,1":[3,31],"18,2":[4,31],"18,3":[6,27],"18,4":[5,23],"18,5":[7,19],"18,6":[7,15],"18,7":[9,8],"18,8":[9,4],"18,9":[9,0],"18,10":[10,0],"18,11":[10,0],"18,12":[10,0],"18,13":[9,0],"18,14":[9,5],"18,15":[8,10],"18,16":[8,15],"18,17":[6,20],"18,18":[6,25],"18,19":[6,25],"18,20":[5,25],"18,21":[6,20],"18,22":[6,15],"19,0":[2,37],"19,1":[3,37],"19,2":[4,37],"19,3":[6,32],"19,4":[5,27],"19,5":[8,22],"19,6":[7,17],"19,7":[10,10],"19,8":[10,5],"19,9":[12,0],"19,10":[11,0],"19,11":[12,0],"19,12":[12,0],"19,13":[11,0],"19,14":[10,5],"19,15":[9,10],"19,16":[9,15],"19,17":[8,20],"19,18":[7,25],"19,19":[8,25],"19,20":[8,25],"19,21":[9,20],"19,22":[9,15],"20,0":[2,43],"20,1":[3,43],"20,2":[4,43],"20,3":[5,37],"20,4":[5,31],"20,5":[8,25],"20,6":[7,19],"20,7":[10,12],"20,8":[9,6],"20,9":[12,0],"20,10":[12,0],"20,11":[12,0],"20,12":[11,0],"20,13":[11,0],"20,14":[11,5],"20,15":[9,10],"20,16":[8,15],"20,17":[7,20],"20,18":[7,25],"20,19":[7,25],"20,20":[6,25],"20,21":[8,20],"20,22":[8,15],"21,0":[0,49],"21,1":[0,49],"21,2":[0,49],"21,3":[2,42],"21,4":[3,35],"21,5":[5,28],"21,6":[5,21],"21,7":[7,14],"21,8":[8,7],"21,9":[10,0],"21,10":[10,0],"21,11":[9,0],"21,12":[10,0],"21,13":[10,0],"21,14":[10,4],"21,15":[8,8],"21,16":[8,12],"21,17":[7,16],"21,18":[7,20],"21,19":[6,20],"21,20":[6,20],"21,21":[7,16],"21,22":[7,12],"22,0":[0,49],"22,1":[0,49],"22,2":[0,49],"22,3":[2,42],"22,4":[2,35],"22,5":[4,28],"22,6":[5,21],"22,7":[6,14],"22,8":[6,7],"22,9":[8,0],"22,10":[9,0],"22,11":[8,0],"22,12":[8,0],"22,13":[8,0],"22,14":[8,3],"22,15":[7,6],"22,16":[7,9],"22,17":[6,12],"22,18":[6,15],"22,19":[6,15],"22,20":[6,15],"22,21":[7,12],"22,22":[7,9]};

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
const inBlock = (y: number, x: number, row: number, col: number) =>
  y >= row * 8 && y < row * 8 + NOISE_SIZE && x >= col * 8 && x < col * 8 + NOISE_SIZE;

(async () => {
  // Geometry
  check('noise grid is 7 x 7 modules = 56 x 56 px = 3136 bits', NOISE_SIZE === 56 && NOISE_BITS === 3136 && NOISE_MODULE_COUNT === 49);
  check('default position is row 9, column 11 (modules 9..15 and 11..17, pixels y 72..127, x 88..143)', DEFAULT_NOISE_ROW === 9 && DEFAULT_NOISE_COL === 11);
  check('watermark covers 841 - 49 = 792 modules', WATERMARKED_MODULES === 792 && TOTAL_BLOCKS === 841);
  check('the top-left module can be 0..22 so the block fits in the 29x29 QR', MAX_NOISE_POSITION === 22);
  check('isNoiseModule edges at the default position: (9,11) yes, (15,17) yes, (8,11) no, (16,17) no, (9,10) no, (9,18) no',
    isNoiseModule(9, 11) && isNoiseModule(15, 17) && !isNoiseModule(8, 11) && !isNoiseModule(16, 17) && !isNoiseModule(9, 10) && !isNoiseModule(9, 18));
  check('isNoiseModule covers exactly 49 modules at every position', (() => {
    for (let r = 0; r <= 22; r++) for (let c = 0; c <= 22; c++) {
      let n = 0;
      for (let y = 0; y < 29; y++) for (let x = 0; x < 29; x++) if (isNoiseModule(y, x, r, c)) n++;
      if (n !== 49) return false;
    }
    return true;
  })());
  check('position rule: 0 and 22 are accepted, -1, 23, 1.5 and NaN are rejected', !throws(() => validateNoisePosition(0, 22)) && !throws(() => validateNoisePosition(22, 0))
    && throws(() => validateNoisePosition(-1, 0)) && throws(() => validateNoisePosition(0, 23)) && throws(() => validateNoisePosition(1.5, 0)) && throws(() => validateNoisePosition(Number.NaN, 0)));

  // QR layout and scan margin
  let fnCount = 0, cwCount = 0;
  const perCodeword = new Array<number>(QR_TOTAL_CODEWORDS).fill(0);
  for (let r = 0; r < 29; r++) for (let c = 0; c < 29; c++) {
    const m = qrModuleInfo(r, c);
    if (m.isFunction) fnCount++;
    if (m.codeword >= 0) { cwCount++; perCodeword[m.codeword]++; }
  }
  check('Version 3 layout: 274 function modules, 560 codeword modules (70 codewords x 8)', fnCount === 274 && cwCount === 560 && 841 - fnCount === 567);
  check('every one of the 70 codewords has exactly 8 modules', perCodeword.every((n) => n === 8));
  const here = noiseBlockInfo(DEFAULT_NOISE_ROW, DEFAULT_NOISE_COL);
  check('default position touches 9 of 70 codewords, 4 to spare, no function modules', here.codewordsTouched === 9 && here.spare === 4 && here.functionModules === 0 && here.correctable === QR_CORRECTABLE_CODEWORDS);
  const centre = noiseBlockInfo(11, 11);
  check('the exact centre (11,11) touches 12 codewords, 1 to spare', centre.codewordsTouched === 12 && centre.spare === 1 && centre.functionModules === 0);
  check('a block over a finder pattern is flagged: (0,0) covers function modules', noiseBlockInfo(0, 0).functionModules > 0);
  check('all 529 positions: codewords touched and function modules match the qrcodegen table', (() => {
    let bad = 0;
    for (const [key, expected] of Object.entries(LAYOUT_TABLE)) {
      const [r, c] = key.split(',').map(Number);
      const i = noiseBlockInfo(r, c);
      if (i.codewordsTouched !== expected[0] || i.functionModules !== expected[1]) bad++;
    }
    return bad === 0 && Object.keys(LAYOUT_TABLE).length === 529;
  })());
  check('function-free positions touch between 8 and 12 codewords (never more than the 13 that can be corrected)', (() => {
    let lo = 99, hi = 0, n = 0;
    for (let r = 0; r <= 22; r++) for (let c = 0; c <= 22; c++) {
      const i = noiseBlockInfo(r, c);
      if (i.functionModules === 0) { n++; lo = Math.min(lo, i.codewordsTouched); hi = Math.max(hi, i.codewordsTouched); }
    }
    return n === 139 && lo === 8 && hi === 12;
  })());

  for (const fx of FIXTURES) {
    const tag = fx.id;
    check(`${tag}: crc32 matches Python zlib.crc32`, crc32(fx.id) === fx.crc);
    const modules = buildQrModules(PREFIX + fx.id);

    for (const m of fx.modes) {
      const label = `${tag} ${m.colour} gray ${m.gray} ${m.pairs} pair${m.pairs === 2 ? 's' : ''} at (${m.row},${m.col})`;
      const area = countWatermarkArea(modules, m.row, m.col);
      check(`${label}: red area has 792 modules (black + white), 49 under the noise`, area.total === 792 && area.black + area.white === 792 && area.noiseModules === 49);
      const r = generateSqrNoisePoc({ prefix: PREFIX, fingerprintId: fx.id, strength: 120, mmSize: 10, colour: m.colour, noiseGray: m.gray, coeffPairs: PAIRS[m.pairs], noiseRow: m.row, noiseCol: m.col });

      // identical to the Python reference
      check(`${label}: 1x pixels identical to the reference`, sha(r.pixels1x) === m.pixelsSha);
      check(`${label}: reference string identical (len ${m.refLen})`, r.refBinaryString.length === m.refLen && sha(r.refBinaryString) === m.refSha);
      check(`${label}: mask identical`, sha(r.maskString) === m.maskSha);
      check(`${label}: noise bits identical`, sha(r.noiseBitsString) === m.noiseSha);
      check(`${label}: result reports the position and its scan margin`, r.noiseRow === m.row && r.noiseCol === m.col && r.noiseInfo.codewordsTouched === LAYOUT_TABLE[`${m.row},${m.col}`][0]);

      // the 56x56 pixels at the noise position are exactly the noise grid: bit 1 = gray, bit 0 = 255, never watermarked
      let noiseOk = true;
      let grayPixels = 0;
      for (let y = 0; y < NOISE_SIZE; y++)
        for (let x = 0; x < NOISE_SIZE; x++) {
          const v = r.pixels1x[(m.row * 8 + y) * CANONICAL_SIZE + (m.col * 8 + x)];
          const one = r.noiseBitsString[y * NOISE_SIZE + x] === '1';
          if (v !== (one ? m.gray : 255)) noiseOk = false;
          if (one && v === m.gray) grayPixels++;
        }
      check(`${label}: the block at the noise position is exactly the noise grid (watermark never touches it)`, noiseOk);
      check(`${label}: the gray level is on the black pixels only (${grayPixels} of ${r.noiseBlackPixels})`, grayPixels === r.noiseBlackPixels);

      // outside the noise block, identical to the standard SQR of the same settings
      const std = generateSqrPoc({ prefix: PREFIX, fingerprintId: fx.id, strength: 120, mmSize: 10, colour: m.colour, coeffPairs: PAIRS[m.pairs] });
      let outsideOk = true;
      for (let y = 0; y < CANONICAL_SIZE && outsideOk; y++)
        for (let x = 0; x < CANONICAL_SIZE; x++)
          if (!inBlock(y, x, m.row, m.col) && r.pixels1x[y * CANONICAL_SIZE + x] !== std.pixels1x[y * CANONICAL_SIZE + x]) { outsideOk = false; break; }
      check(`${label}: every pixel outside the noise block equals the standard SQR`, outsideOk);

      // no noise module is in the mask; the reference string is the standard string without the noise positions
      let maskNoiseOk = true;
      const expectedRef: string[] = [];
      for (let idx = 0; idx < TOTAL_BLOCKS; idx++) {
        const row = Math.floor(idx / QR_MODULES), col = idx % QR_MODULES;
        if (isNoiseModule(row, col, m.row, m.col) && r.maskString[idx] !== '0') maskNoiseOk = false;
        if (r.maskString[idx] === '1') expectedRef.push(r.fullBinaryString[idx]);
      }
      check(`${label}: no module under the noise is watermarked`, maskNoiseOk);
      check(`${label}: reference string = standard ${TOTAL_BLOCKS}-bit string filtered by the mask`, expectedRef.join('') === r.refBinaryString && r.selectedCount === r.refBinaryString.length);
      if (m.colour === 'all') check(`${label}: standard mode watermarks 792 modules`, r.selectedCount === 792 && r.refBinaryString.length === 792);
    }
  }

  // Moving the noise moves the watermarked area with it
  const sample = FIXTURES[0];
  const a = generateSqrNoisePoc({ prefix: PREFIX, fingerprintId: sample.id, strength: 120, mmSize: 10, noiseGray: 64 }); // default (9,11)
  const b = generateSqrNoisePoc({ prefix: PREFIX, fingerprintId: sample.id, strength: 120, mmSize: 10, noiseGray: 64, noiseRow: 11, noiseCol: 11 });
  check('default position when none is given: row 9, column 11', a.noiseRow === 9 && a.noiseCol === 11);
  check('moving the noise changes the mask (different modules are skipped) but both watermark 792 modules', a.maskString !== b.maskString && a.selectedCount === 792 && b.selectedCount === 792);
  check('modules skipped by one position and watermarked by the other follow the noise', (() => {
    for (let idx = 0; idx < TOTAL_BLOCKS; idx++) {
      const row = Math.floor(idx / QR_MODULES), col = idx % QR_MODULES;
      if ((a.maskString[idx] === '0') !== isNoiseModule(row, col, 9, 11)) return false;
      if ((b.maskString[idx] === '0') !== isNoiseModule(row, col, 11, 11)) return false;
    }
    return true;
  })());
  check('pixels outside both noise blocks are identical between the two positions', (() => {
    for (let y = 0; y < CANONICAL_SIZE; y++) for (let x = 0; x < CANONICAL_SIZE; x++)
      if (!inBlock(y, x, 9, 11) && !inBlock(y, x, 11, 11) && a.pixels1x[y * CANONICAL_SIZE + x] !== b.pixels1x[y * CANONICAL_SIZE + x]) return false;
    return true;
  })());
  check('the noise grid itself does not depend on its position (same bits)', a.noiseBitsString === b.noiseBitsString);

  // The noise grid comes from the same seed and stream as the watermark
  const bits = generateNoiseBits(crc32(sample.id));
  check('noise bits: 3136 values, first 841 equal the standard SQR string (same seed, same stream)', bits.length === 3136 && Array.from(bits.subarray(0, 841)).join('') === a.fullBinaryString);
  check('buildNoiseGrid: bit 1 -> gray, bit 0 -> 255', (() => { const g = buildNoiseGrid(Uint8Array.from([1, 0, 1, 0]), 77); return g[0] === 77 && g[1] === 255 && g[2] === 77 && g[3] === 255; })());
  const white = generateSqrNoisePoc({ prefix: PREFIX, fingerprintId: sample.id, strength: 120, mmSize: 10, noiseGray: 255 });
  check('gray 255: the noise grid is all white (the noise disappears)', (() => { for (let y = 0; y < NOISE_SIZE; y++) for (let x = 0; x < NOISE_SIZE; x++) if (white.pixels1x[(72 + y) * CANONICAL_SIZE + 88 + x] !== 255) return false; return true; })());
  const dark = generateSqrNoisePoc({ prefix: PREFIX, fingerprintId: sample.id, strength: 120, mmSize: 10, noiseGray: 0 });
  check('changing the gray level changes only the noise block', (() => { for (let y = 0; y < CANONICAL_SIZE; y++) for (let x = 0; x < CANONICAL_SIZE; x++) if (!inBlock(y, x, 9, 11) && dark.pixels1x[y * CANONICAL_SIZE + x] !== white.pixels1x[y * CANONICAL_SIZE + x]) return false; return true; })());
  check('default colour is "all" (792 watermarked modules)', a.colour === 'all' && a.selectedCount === 792);

  // PNG: 8-bit grayscale, 464x464, DPI chunk, pixels survive a zlib round trip (both code paths)
  check('2x pixels are the 1x pixels, nearest-neighbour', a.size2x === 464 && a.pixels2x[0] === a.pixels1x[0] && a.pixels2x[464 * 3 + 5] === a.pixels1x[1 * 232 + 2]);
  check('DPI = 2 x round(232 / mm * 25.4)', a.dpi2x === 2 * Math.round((232 / 10) * 25.4));

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
    return { sig, crcOk, w: ihdr.getUint32(0), h: ihdr.getUint32(4), depth: chunks['IHDR'][8], ctype: chunks['IHDR'][9], ppm: phys.getUint32(0), unit: chunks['pHYs'][8], same: Buffer.from(px).equals(Buffer.from(a.pixels2x)) };
  }
  const g = globalThis as unknown as { CompressionStream?: unknown };
  for (const mode of ['compressed', 'stored (no CompressionStream)']) {
    const saved = g.CompressionStream;
    if (mode !== 'compressed') g.CompressionStream = undefined;
    const png = await encodeGrayPng(a.pixels2x, a.size2x, a.dpi2x);
    g.CompressionStream = saved;
    const i = await inspect(png);
    check(`PNG ${mode}: signature, 464x464, 8-bit grayscale`, i.sig && i.w === 464 && i.h === 464 && i.depth === 8 && i.ctype === 0);
    check(`PNG ${mode}: all chunk CRCs valid`, i.crcOk);
    check(`PNG ${mode}: pHYs = round(dpi / 0.0254) px/m, unit metre`, i.ppm === Math.round(a.dpi2x / 0.0254) && i.unit === 1);
    check(`PNG ${mode}: pixels survive the zlib round trip`, i.same);
  }

  // Guard rails
  const base = { prefix: PREFIX, fingerprintId: sample.id, strength: 120, mmSize: 10, noiseGray: 64 };
  check('noise gray -1, 256, 12.5 and NaN are rejected', [-1, 256, 12.5, Number.NaN].every((v) => throws(() => generateSqrNoisePoc({ ...base, noiseGray: v }))));
  check('noise gray 0 and 255 are accepted', !throws(() => generateSqrNoisePoc({ ...base, noiseGray: 0 })) && !throws(() => generateSqrNoisePoc({ ...base, noiseGray: 255 })));
  check('noise row -1 / 23 / 1.5 and column -1 / 23 / 1.5 are rejected', [[-1, 11], [23, 11], [1.5, 11], [9, -1], [9, 23], [9, 1.5]].every(([r, c]) => throws(() => generateSqrNoisePoc({ ...base, noiseRow: r, noiseCol: c }))));
  check('noise positions (0,0), (22,22), (0,22), (22,0) are accepted', [[0, 0], [22, 22], [0, 22], [22, 0]].every(([r, c]) => !throws(() => generateSqrNoisePoc({ ...base, noiseRow: r, noiseCol: c }))));
  check('noiseBlockInfo rejects an out-of-range position', throws(() => noiseBlockInfo(23, 0)) && throws(() => noiseBlockInfo(0, -1)));
  check('strength 0 and 1001 are rejected', throws(() => generateSqrNoisePoc({ ...base, strength: 0 })) && throws(() => generateSqrNoisePoc({ ...base, strength: 1001 })));
  check('empty fingerprint ID is rejected', throws(() => generateSqrNoisePoc({ ...base, fingerprintId: '' })));
  check('size 0 mm is rejected', throws(() => generateSqrNoisePoc({ ...base, mmSize: 0 })));
  check('a repeated coefficient is rejected', throws(() => generateSqrNoisePoc({ ...base, coeffPairs: [[[3, 1], [1, 3]], [[3, 1], [0, 1]]] })));
  check('too-long QR content is rejected with an error', throws(() => generateSqrNoisePoc({ ...base, prefix: 'https://example.com/a-very-long-prefix-that-cannot-fit/' })));
  check('BLOCK_SIZE is 8', BLOCK_SIZE === 8);

  console.log(allOk ? '\nALL CHECKS PASSED' : '\nSOME CHECKS FAILED');
  process.exit(allOk ? 0 : 1);
})();