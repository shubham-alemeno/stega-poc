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
  DEFAULT_NOISE_COL, DEFAULT_NOISE_GRID_SIZE, DEFAULT_NOISE_ROW, MAX_NOISE_POSITION, NOISE_GRID_SIZES, NOISE_SIZE_2X, NOISE_BITS, NOISE_MODULE_COUNT, NOISE_SIZE, QR_CORRECTABLE_CODEWORDS,
  QR_TOTAL_CODEWORDS, WATERMARKED_MODULES,
  buildNoiseGrid, buildNoiseGrid2x, countWatermarkArea, generateNoiseBits, generateSqrNoisePoc, isNoiseModule, noiseBitCount, noiseBlockInfo, qrModuleInfo, validateNoiseGridSize, validateNoisePosition, type NoiseGridSize,
} from '../src/lib/sqrNoisePoc';

type SqrNoiseOut = ReturnType<typeof generateSqrNoisePoc>;
const PREFIX = 'https://example.com/v/';
const PAIRS: Record<number, CoeffPair[]> = {
  1: [[[3, 1], [1, 3]]],
  2: [[[3, 1], [1, 3]], [[1, 0], [0, 1]]],
};
interface Mode { colour: WatermarkColour; gray: number; pairs: number; row: number; col: number; grid: number; pixelsSha: string; pixels2xSha: string; refSha: string; refLen: number; maskSha: string; noiseSha: string }
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
    "grid": 56,
    "pixelsSha": "1bf3a235a33721717b3236ad5f25257cdc688b04267dc37a24f7f8441370faf6",
    "pixels2xSha": "f9b00e82b621d71c0ea56409a3b23e3ed39560481f0aebc02de1bddd1499420a",
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
    "grid": 56,
    "pixelsSha": "6531146a05d4f761cc6f1760ffb6171964b962a35703668f0b3afff077b46a35",
    "pixels2xSha": "9c21d1b8f16aa127f16e55006c892e7d6b68095b562b32a94265d0f648dd2240",
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
    "grid": 56,
    "pixelsSha": "71a7dd4ac4f7517921e02ea58675025c764fc9ea2ed8c9e005d3b23344ce11af",
    "pixels2xSha": "93b4a0c0ed09aa9a89006d274c0f53b61be7763c28a26c894aca5d48172ce5e2",
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
    "grid": 56,
    "pixelsSha": "4c86bc26da50332ce526e5555aaf19bcd51a2d5cf25c5741558f867e72c3c2d8",
    "pixels2xSha": "ff7fcc6d27c2ab2c26f3e9391dbe587d383ad755b6f203c50aa3ec255bbe0b4d",
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
    "grid": 56,
    "pixelsSha": "f255007b6790bc95ebaa47b3d19fb49fb3a5ae5c1612ecbb73f7123ca49f008f",
    "pixels2xSha": "a67ee756c82248c86f32e500c391925ff3acb74057c713171e5cda03e97d2492",
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
    "grid": 56,
    "pixelsSha": "0a938e0666b8e6d1381fd0c52ef0878b697288b470a92e80c10d09080f2c3e98",
    "pixels2xSha": "e17d07a0054f54e51dd999e050147e7d933912fa55b6d31a8f421cabbd4c5227",
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
    "grid": 56,
    "pixelsSha": "4069fd78c94e2735aeed6e74014b3b664f32f7dbf5c09968a51c8750a9a187ff",
    "pixels2xSha": "95682c6c59ebcdad0db8100cfd35add5075b5817ebc4cf14f2413dd9759b028b",
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
    "grid": 56,
    "pixelsSha": "eba6f62e63ff24eeb4c047ea804cf33fed37bfa52833e46cedd5c09eb4ee8ce2",
    "pixels2xSha": "697d51b272edeb8782123241115a1cd7c31d87a01200163937bac66ce8d276b1",
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
    "grid": 56,
    "pixelsSha": "b526921490bcccaf574ba4635b2e0019993110fdf2d0f50d39be5ccb204f6d48",
    "pixels2xSha": "4c4abcee4ff402631ae71ed9f6b3b6f5419d23c3abe36164f05456d5ef6432fb",
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
    "grid": 56,
    "pixelsSha": "dd8568cb38874bd87d7d55052671b6ba98a37516b6d83c6f823929bd123dc69c",
    "pixels2xSha": "19dc6dde16c8fe6afd36a7bf489c67e02de13b6439b86e383b0f243725fefbc6",
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
    "grid": 56,
    "pixelsSha": "8ab2f10cde207c4697a543c63fb2c43e4477d7c41b3fa9a5f348f8b8aa153c8a",
    "pixels2xSha": "5aa10aa47e8b07f78f36bd89a64158fc405b1fe9476f30d612b600a20a0cdfc0",
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
    "grid": 56,
    "pixelsSha": "05dc5127b473cdc1a57d209f8d0a8f020aa38afbc3e22e631d00effb47460f1c",
    "pixels2xSha": "abba61f0f9f6f50d051d9ace40e5273f12ac44cb8db8e2994db4d84abdd2b166",
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
    "grid": 56,
    "pixelsSha": "1457204c798c8b4807380315113391a6ace58a0d7afaf1e77a9c98b3bc785dbc",
    "pixels2xSha": "d618bcff1dfb0584add285bee3656eb24412b4df2c4f6f19ff460a4e4e6757bf",
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
    "grid": 56,
    "pixelsSha": "8aa0a953867860d5179c1333f208351f5b144b0339996f66b92246b496498cf2",
    "pixels2xSha": "a93d4fca21cc60867c0a5f9de0061131a23d6a562642fa5551d1ddd374e4dc30",
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
    "grid": 56,
    "pixelsSha": "6f193ce2afb1769cb57d0cd47f94c47f1034fff1ebbc31969a48408b7fd9ebc0",
    "pixels2xSha": "2c6f95cbfa3fc56830483f8e7023d7f71b088d087b31a867c7f6637ebffe66a6",
    "refSha": "3faf6df6f4537686acfddba3e4c513db065475d55313ac14414d6c00d4876449",
    "refLen": 792,
    "maskSha": "4ecd2ea5f6918295c7e30ac87f16088f5170a212b92127f8756597a5c79d4744",
    "noiseSha": "30bc7fe09f560ca412d256c41088bc693228f0b72424814034fd1d27d4d73e7d"
   },
   {
    "colour": "all",
    "gray": 0,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 28,
    "pixelsSha": "b8280a48f27664014c1920034a1ea4a611eb4f4799795b8903e66d48c734269a",
    "pixels2xSha": "aa2c24de8e584110ba2510255b6813a282311c04b16c51f08e43a99ac1f74021",
    "refSha": "b4ffa5528a7d36929a1dba7f4764f44fa3f5900c0c259a2b2fc3d7d0f6997ad9",
    "refLen": 792,
    "maskSha": "efea6bc4da0ddd88c598d879b540fd6c6f8c6bbf5397bc384e136c0089c49ce0",
    "noiseSha": "b6bddd646a4b8396974c0f90467fc2c865f5a49543e09b701a44075c55362d62"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 28,
    "pixelsSha": "0f0fd59de8569dbed286147dabbd9bf0fda1601ba24a58982fda178ee0b2809a",
    "pixels2xSha": "0aea2ca480428be9a19e3e221d3ba388201dc5ff7783421f693a17dbb1d4f0b7",
    "refSha": "b4ffa5528a7d36929a1dba7f4764f44fa3f5900c0c259a2b2fc3d7d0f6997ad9",
    "refLen": 792,
    "maskSha": "efea6bc4da0ddd88c598d879b540fd6c6f8c6bbf5397bc384e136c0089c49ce0",
    "noiseSha": "b6bddd646a4b8396974c0f90467fc2c865f5a49543e09b701a44075c55362d62"
   },
   {
    "colour": "all",
    "gray": 255,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 28,
    "pixelsSha": "71a7dd4ac4f7517921e02ea58675025c764fc9ea2ed8c9e005d3b23344ce11af",
    "pixels2xSha": "93b4a0c0ed09aa9a89006d274c0f53b61be7763c28a26c894aca5d48172ce5e2",
    "refSha": "b4ffa5528a7d36929a1dba7f4764f44fa3f5900c0c259a2b2fc3d7d0f6997ad9",
    "refLen": 792,
    "maskSha": "efea6bc4da0ddd88c598d879b540fd6c6f8c6bbf5397bc384e136c0089c49ce0",
    "noiseSha": "b6bddd646a4b8396974c0f90467fc2c865f5a49543e09b701a44075c55362d62"
   },
   {
    "colour": "black",
    "gray": 0,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 28,
    "pixelsSha": "d1cb763e6e3ba0dcfa58a6e69553eb501249cc22cf213c2b9d01cfd2886e84a4",
    "pixels2xSha": "6eec8ba60c110de2263692b6db69d0b564ca9cc323649f63d1c3f2e9ef94a30e",
    "refSha": "d8bd7ed0240dce412b6a45db2d30af30f62dd62c309f5731acc13841c85b38f5",
    "refLen": 404,
    "maskSha": "97feb8f29691bb5a8aa68fab6a7e33767d37e68c80a75c24b43d0dd09cbaaf07",
    "noiseSha": "b6bddd646a4b8396974c0f90467fc2c865f5a49543e09b701a44075c55362d62"
   },
   {
    "colour": "black",
    "gray": 64,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 28,
    "pixelsSha": "e5a628c014c13a9b1d4e7acc6986627f1354b8958f5be7530ffa5036c813e918",
    "pixels2xSha": "8b7e75efdcb74ce67a01c9e79f83df2438dda4d0ed9292e20c3a19c1966da23b",
    "refSha": "d8bd7ed0240dce412b6a45db2d30af30f62dd62c309f5731acc13841c85b38f5",
    "refLen": 404,
    "maskSha": "97feb8f29691bb5a8aa68fab6a7e33767d37e68c80a75c24b43d0dd09cbaaf07",
    "noiseSha": "b6bddd646a4b8396974c0f90467fc2c865f5a49543e09b701a44075c55362d62"
   },
   {
    "colour": "black",
    "gray": 255,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 28,
    "pixelsSha": "0a938e0666b8e6d1381fd0c52ef0878b697288b470a92e80c10d09080f2c3e98",
    "pixels2xSha": "e17d07a0054f54e51dd999e050147e7d933912fa55b6d31a8f421cabbd4c5227",
    "refSha": "d8bd7ed0240dce412b6a45db2d30af30f62dd62c309f5731acc13841c85b38f5",
    "refLen": 404,
    "maskSha": "97feb8f29691bb5a8aa68fab6a7e33767d37e68c80a75c24b43d0dd09cbaaf07",
    "noiseSha": "b6bddd646a4b8396974c0f90467fc2c865f5a49543e09b701a44075c55362d62"
   },
   {
    "colour": "white",
    "gray": 0,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 28,
    "pixelsSha": "9799b100130f837da0d7ce45be68d5a9840ed8f7b119f113c97fc2361f1d6ba3",
    "pixels2xSha": "6cf885efc1baf24a8fdd1fe7980e507acd4a5b4c1ffd9403fabed2664465c8fc",
    "refSha": "2c10e2e7120994c811f71253062fae7446a38db671480995976b42b9a954a046",
    "refLen": 388,
    "maskSha": "5f30ccb670bb19f98fc543e1a58bbf1821cc595cd23d5c60e8ca040d40511968",
    "noiseSha": "b6bddd646a4b8396974c0f90467fc2c865f5a49543e09b701a44075c55362d62"
   },
   {
    "colour": "white",
    "gray": 64,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 28,
    "pixelsSha": "4d8737ec316bdfcbaac54631304a3c18b83079565b84b55ebb983e5b9a0dca0a",
    "pixels2xSha": "a3cc2127025953d42457caf4423898b3ba6eb632a31c9e47e899c9821bb9b3bf",
    "refSha": "2c10e2e7120994c811f71253062fae7446a38db671480995976b42b9a954a046",
    "refLen": 388,
    "maskSha": "5f30ccb670bb19f98fc543e1a58bbf1821cc595cd23d5c60e8ca040d40511968",
    "noiseSha": "b6bddd646a4b8396974c0f90467fc2c865f5a49543e09b701a44075c55362d62"
   },
   {
    "colour": "white",
    "gray": 255,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 28,
    "pixelsSha": "b526921490bcccaf574ba4635b2e0019993110fdf2d0f50d39be5ccb204f6d48",
    "pixels2xSha": "4c4abcee4ff402631ae71ed9f6b3b6f5419d23c3abe36164f05456d5ef6432fb",
    "refSha": "2c10e2e7120994c811f71253062fae7446a38db671480995976b42b9a954a046",
    "refLen": 388,
    "maskSha": "5f30ccb670bb19f98fc543e1a58bbf1821cc595cd23d5c60e8ca040d40511968",
    "noiseSha": "b6bddd646a4b8396974c0f90467fc2c865f5a49543e09b701a44075c55362d62"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 2,
    "row": 9,
    "col": 11,
    "grid": 28,
    "pixelsSha": "370b4f2b0ce1919729899ac21cfbdcd206e26c86e6d1ceb246e5e5a02211bc37",
    "pixels2xSha": "9e9bb20113781a1756d73bf9ffbb818c7e6bafea23774b3b01f787e59355862f",
    "refSha": "b4ffa5528a7d36929a1dba7f4764f44fa3f5900c0c259a2b2fc3d7d0f6997ad9",
    "refLen": 792,
    "maskSha": "efea6bc4da0ddd88c598d879b540fd6c6f8c6bbf5397bc384e136c0089c49ce0",
    "noiseSha": "b6bddd646a4b8396974c0f90467fc2c865f5a49543e09b701a44075c55362d62"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 11,
    "col": 11,
    "grid": 28,
    "pixelsSha": "8b41c5a0034f5e3bd188366e01a69f7024464960a2e32f677ae98d5df75d1948",
    "pixels2xSha": "587f48244baccdf2fdcbc65e6dd10fe9c4f17a9dac20559aaeb869ddbcb00d2c",
    "refSha": "79940e7d2648d978fb9c367d318f26a473768f5333bbc2cf0855880b6eca03bb",
    "refLen": 792,
    "maskSha": "297aa7714f53eca8ac03c25f92b6988d7fd948f2a3ec5f94c9eeb33694dbdc4c",
    "noiseSha": "b6bddd646a4b8396974c0f90467fc2c865f5a49543e09b701a44075c55362d62"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 0,
    "col": 0,
    "grid": 28,
    "pixelsSha": "8e45c37f6285e07f528c7e6dd8990e3d324908cc0e7bdd333e270de299c6cb65",
    "pixels2xSha": "b178ccc0ede42c990a943ea63c14a85422a1b906fe1113e7808e6f125e132a82",
    "refSha": "54f0f7b19eebdcbd50aa7c95ff49d0012acaf8073a1ffebe2767782587d7752c",
    "refLen": 792,
    "maskSha": "22891c54759ebacc4c35e9f5baea468063df8c1cecb571ed08ea61dea19688fc",
    "noiseSha": "b6bddd646a4b8396974c0f90467fc2c865f5a49543e09b701a44075c55362d62"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 22,
    "col": 22,
    "grid": 28,
    "pixelsSha": "92146ec28be23d720cc794d68ee62d8e15084d4df808b1a84cdd7fc9188e47db",
    "pixels2xSha": "6e9f003c4dad548984a9482acef8d83b10e8b7d2f215c5f1dffc80c6d55ba74f",
    "refSha": "75a7e3b83b3f63635f43abe2c87e1055e1ec0ce086ae3c9120916f23b2840913",
    "refLen": 792,
    "maskSha": "52e7c26d55b8b2f70d667860202d84a7b454795f860d76e61cf4ab23ad0c3564",
    "noiseSha": "b6bddd646a4b8396974c0f90467fc2c865f5a49543e09b701a44075c55362d62"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 7,
    "col": 9,
    "grid": 28,
    "pixelsSha": "3502b4244a255591f1df6dfe6546c177b7c5653a73557d661c0a748f5a755738",
    "pixels2xSha": "3cc021d90440f8039e87cf0d1aa1dc560d0511fbf4ab811a4c689dfdd2400528",
    "refSha": "cc52980231c2fa83889158e8c86b3b80d9a55a2cba4f5a966c43fe7cc6fcd2f2",
    "refLen": 792,
    "maskSha": "d3f230f09f487c95a4fa2b45e7a78e3341599d324837acba16e580eaff5c5830",
    "noiseSha": "b6bddd646a4b8396974c0f90467fc2c865f5a49543e09b701a44075c55362d62"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 13,
    "col": 20,
    "grid": 28,
    "pixelsSha": "3853d6418f56237d0b2da50552f1aa193b4acc3fbb5c6ec1db60de9e60f319f3",
    "pixels2xSha": "490a34bd18c0633485bbd3803a2279ad788e9ff4dcf3bb65eda513e55e0c120d",
    "refSha": "3faf6df6f4537686acfddba3e4c513db065475d55313ac14414d6c00d4876449",
    "refLen": 792,
    "maskSha": "4ecd2ea5f6918295c7e30ac87f16088f5170a212b92127f8756597a5c79d4744",
    "noiseSha": "b6bddd646a4b8396974c0f90467fc2c865f5a49543e09b701a44075c55362d62"
   },
   {
    "colour": "all",
    "gray": 0,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 112,
    "pixelsSha": "2c6aa871bc0e38633d40b6e398e5034541f79bc4be4619f0057aa74347c9b511",
    "pixels2xSha": "60d7e0dc33ff64efc2786129697b6d8675f2d684bec87a58d05598a819db986e",
    "refSha": "b4ffa5528a7d36929a1dba7f4764f44fa3f5900c0c259a2b2fc3d7d0f6997ad9",
    "refLen": 792,
    "maskSha": "efea6bc4da0ddd88c598d879b540fd6c6f8c6bbf5397bc384e136c0089c49ce0",
    "noiseSha": "4344a656f52879d43f87a1c6c64292ea8e501bc177309466b9b9abb41e7a5136"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 112,
    "pixelsSha": "592f8c5db95a296ecd575bf162dad8e9c0019e27ed0a620fa409c0117d9bf0e1",
    "pixels2xSha": "987b4fdfcf5b1a3e61b3fa5fa383caa4b396f65ec9b69d7f164ff0d2cb2d1db0",
    "refSha": "b4ffa5528a7d36929a1dba7f4764f44fa3f5900c0c259a2b2fc3d7d0f6997ad9",
    "refLen": 792,
    "maskSha": "efea6bc4da0ddd88c598d879b540fd6c6f8c6bbf5397bc384e136c0089c49ce0",
    "noiseSha": "4344a656f52879d43f87a1c6c64292ea8e501bc177309466b9b9abb41e7a5136"
   },
   {
    "colour": "all",
    "gray": 255,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 112,
    "pixelsSha": "71a7dd4ac4f7517921e02ea58675025c764fc9ea2ed8c9e005d3b23344ce11af",
    "pixels2xSha": "93b4a0c0ed09aa9a89006d274c0f53b61be7763c28a26c894aca5d48172ce5e2",
    "refSha": "b4ffa5528a7d36929a1dba7f4764f44fa3f5900c0c259a2b2fc3d7d0f6997ad9",
    "refLen": 792,
    "maskSha": "efea6bc4da0ddd88c598d879b540fd6c6f8c6bbf5397bc384e136c0089c49ce0",
    "noiseSha": "4344a656f52879d43f87a1c6c64292ea8e501bc177309466b9b9abb41e7a5136"
   },
   {
    "colour": "black",
    "gray": 0,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 112,
    "pixelsSha": "b6ed3e561415f31ab287ba6f8f320a41db5273ff3b6aefd499cf74060ab86ffe",
    "pixels2xSha": "d7f9ac3b9125bda0c434238f1a81a1c0c430078e2344a937f9d90d47483bd869",
    "refSha": "d8bd7ed0240dce412b6a45db2d30af30f62dd62c309f5731acc13841c85b38f5",
    "refLen": 404,
    "maskSha": "97feb8f29691bb5a8aa68fab6a7e33767d37e68c80a75c24b43d0dd09cbaaf07",
    "noiseSha": "4344a656f52879d43f87a1c6c64292ea8e501bc177309466b9b9abb41e7a5136"
   },
   {
    "colour": "black",
    "gray": 64,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 112,
    "pixelsSha": "bae36f246b31532b994b39d0c0197c50c387ca7c7ac16ba1dccae480e1060a4f",
    "pixels2xSha": "067b3d77348da050b0dd1ab9c48f793e225629f4feda41ffbdb752f2c99cb84a",
    "refSha": "d8bd7ed0240dce412b6a45db2d30af30f62dd62c309f5731acc13841c85b38f5",
    "refLen": 404,
    "maskSha": "97feb8f29691bb5a8aa68fab6a7e33767d37e68c80a75c24b43d0dd09cbaaf07",
    "noiseSha": "4344a656f52879d43f87a1c6c64292ea8e501bc177309466b9b9abb41e7a5136"
   },
   {
    "colour": "black",
    "gray": 255,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 112,
    "pixelsSha": "0a938e0666b8e6d1381fd0c52ef0878b697288b470a92e80c10d09080f2c3e98",
    "pixels2xSha": "e17d07a0054f54e51dd999e050147e7d933912fa55b6d31a8f421cabbd4c5227",
    "refSha": "d8bd7ed0240dce412b6a45db2d30af30f62dd62c309f5731acc13841c85b38f5",
    "refLen": 404,
    "maskSha": "97feb8f29691bb5a8aa68fab6a7e33767d37e68c80a75c24b43d0dd09cbaaf07",
    "noiseSha": "4344a656f52879d43f87a1c6c64292ea8e501bc177309466b9b9abb41e7a5136"
   },
   {
    "colour": "white",
    "gray": 0,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 112,
    "pixelsSha": "4535940385e0c4f038650b522500314acd81a6738fea816fe0c87b0255c7d201",
    "pixels2xSha": "180e90b2f6f3575931e86d37149313eeea6158141ec01cb5b2d0d5726fd9535f",
    "refSha": "2c10e2e7120994c811f71253062fae7446a38db671480995976b42b9a954a046",
    "refLen": 388,
    "maskSha": "5f30ccb670bb19f98fc543e1a58bbf1821cc595cd23d5c60e8ca040d40511968",
    "noiseSha": "4344a656f52879d43f87a1c6c64292ea8e501bc177309466b9b9abb41e7a5136"
   },
   {
    "colour": "white",
    "gray": 64,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 112,
    "pixelsSha": "f2e5c60d11e2e24ca2cb7461388a66292b8112a90b03a41f80fb7a8f961211a1",
    "pixels2xSha": "f024570b7c5d5737175a916e8e038423065dff659de214923c6d60fc75c8fda1",
    "refSha": "2c10e2e7120994c811f71253062fae7446a38db671480995976b42b9a954a046",
    "refLen": 388,
    "maskSha": "5f30ccb670bb19f98fc543e1a58bbf1821cc595cd23d5c60e8ca040d40511968",
    "noiseSha": "4344a656f52879d43f87a1c6c64292ea8e501bc177309466b9b9abb41e7a5136"
   },
   {
    "colour": "white",
    "gray": 255,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 112,
    "pixelsSha": "b526921490bcccaf574ba4635b2e0019993110fdf2d0f50d39be5ccb204f6d48",
    "pixels2xSha": "4c4abcee4ff402631ae71ed9f6b3b6f5419d23c3abe36164f05456d5ef6432fb",
    "refSha": "2c10e2e7120994c811f71253062fae7446a38db671480995976b42b9a954a046",
    "refLen": 388,
    "maskSha": "5f30ccb670bb19f98fc543e1a58bbf1821cc595cd23d5c60e8ca040d40511968",
    "noiseSha": "4344a656f52879d43f87a1c6c64292ea8e501bc177309466b9b9abb41e7a5136"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 2,
    "row": 9,
    "col": 11,
    "grid": 112,
    "pixelsSha": "d0d61457cb814015420377f46e331f210d8e213cdf9cef97c8903d558fa15c03",
    "pixels2xSha": "7a02eef4dd81564c3cd39c15046967c6b45f067dba47068f851de1704b8447bf",
    "refSha": "b4ffa5528a7d36929a1dba7f4764f44fa3f5900c0c259a2b2fc3d7d0f6997ad9",
    "refLen": 792,
    "maskSha": "efea6bc4da0ddd88c598d879b540fd6c6f8c6bbf5397bc384e136c0089c49ce0",
    "noiseSha": "4344a656f52879d43f87a1c6c64292ea8e501bc177309466b9b9abb41e7a5136"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 11,
    "col": 11,
    "grid": 112,
    "pixelsSha": "239f9417027c0d4f8798152aa2edffced5d0ff53ea404a476c85b4abd26ba892",
    "pixels2xSha": "30f43b409da333ed809f71ffed9a66c215d83ce46c1e3c9dfeb6b0bde9e72c40",
    "refSha": "79940e7d2648d978fb9c367d318f26a473768f5333bbc2cf0855880b6eca03bb",
    "refLen": 792,
    "maskSha": "297aa7714f53eca8ac03c25f92b6988d7fd948f2a3ec5f94c9eeb33694dbdc4c",
    "noiseSha": "4344a656f52879d43f87a1c6c64292ea8e501bc177309466b9b9abb41e7a5136"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 0,
    "col": 0,
    "grid": 112,
    "pixelsSha": "fd77f385993f9457ecbc7999776347868bca554c7241c3638f3ff2feabfec95a",
    "pixels2xSha": "f2fc8c84c4f3bc8fd5a646adcc487f83fd51027a333e5c6a071ebca12bc327a2",
    "refSha": "54f0f7b19eebdcbd50aa7c95ff49d0012acaf8073a1ffebe2767782587d7752c",
    "refLen": 792,
    "maskSha": "22891c54759ebacc4c35e9f5baea468063df8c1cecb571ed08ea61dea19688fc",
    "noiseSha": "4344a656f52879d43f87a1c6c64292ea8e501bc177309466b9b9abb41e7a5136"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 22,
    "col": 22,
    "grid": 112,
    "pixelsSha": "b4693972c931a13eddb47e023d86f0ef949d81bd193171509b06f7d535f03762",
    "pixels2xSha": "8b5c43b0d2084c68bf0762ab93fa16e9e951efa0f7d7e9d06e8654d2cdd0bcce",
    "refSha": "75a7e3b83b3f63635f43abe2c87e1055e1ec0ce086ae3c9120916f23b2840913",
    "refLen": 792,
    "maskSha": "52e7c26d55b8b2f70d667860202d84a7b454795f860d76e61cf4ab23ad0c3564",
    "noiseSha": "4344a656f52879d43f87a1c6c64292ea8e501bc177309466b9b9abb41e7a5136"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 7,
    "col": 9,
    "grid": 112,
    "pixelsSha": "6a26a40b1ff503f1ee14ea65712c1cf8b6b66341edad28fb78bbbb5c4e1cd8bf",
    "pixels2xSha": "5e8e0d5badb7acb84948d9bc9817feb855103ea7cb2efb0a52dc3266e762e248",
    "refSha": "cc52980231c2fa83889158e8c86b3b80d9a55a2cba4f5a966c43fe7cc6fcd2f2",
    "refLen": 792,
    "maskSha": "d3f230f09f487c95a4fa2b45e7a78e3341599d324837acba16e580eaff5c5830",
    "noiseSha": "4344a656f52879d43f87a1c6c64292ea8e501bc177309466b9b9abb41e7a5136"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 13,
    "col": 20,
    "grid": 112,
    "pixelsSha": "3bfdc367ac41b3b8297b9722a966c933c35400b6cd9df1fc5907e22db5816d03",
    "pixels2xSha": "a4bf08bdc05b62ad4617a23d97ee2c58fa3fc54c4c5f2cc13c02e32a317604be",
    "refSha": "3faf6df6f4537686acfddba3e4c513db065475d55313ac14414d6c00d4876449",
    "refLen": 792,
    "maskSha": "4ecd2ea5f6918295c7e30ac87f16088f5170a212b92127f8756597a5c79d4744",
    "noiseSha": "4344a656f52879d43f87a1c6c64292ea8e501bc177309466b9b9abb41e7a5136"
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
    "grid": 56,
    "pixelsSha": "654cf6c9ddda73984f9757c8ed2bd2fbaf1a89bcc0743352401b13ebe2eb265e",
    "pixels2xSha": "517d276a2550a844bcdbd1726b865cf83e2d286193fa77096f0f7bc41ea6d1ec",
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
    "grid": 56,
    "pixelsSha": "6339ddfaf9329a2558c49d1c3d6fd5070ffa400d57fa4a19f3beb2c9b6815477",
    "pixels2xSha": "c356b5856a183932fa76ffea9ce8bde229b5c7ddadd5ef5035cf0623ceb96864",
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
    "grid": 56,
    "pixelsSha": "0d760423d9655c3364b728f4ed587b0c09c48df84df6d8c3a1282042e6a30685",
    "pixels2xSha": "6ba44a58b7fdb0ebf17e768346738878205798abf423374681ca0bc31e49ff0c",
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
    "grid": 56,
    "pixelsSha": "3f4ef15f769cc51dddd2252c73304a277982e6f5de46e29f71777152b6d7cb62",
    "pixels2xSha": "ad46edd20fae6df9f7ebdb31fd5b9fbe30084da2c7f81afe06f5e926e6c8668f",
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
    "grid": 56,
    "pixelsSha": "a4f1285882cc031da3214cbdeaef877be91523b7cf1ff956c40444073c360906",
    "pixels2xSha": "043c631d78c5e8906f9dfdbce19e7bbb527a9df62bf60fb6039e7c2e319dc5f5",
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
    "grid": 56,
    "pixelsSha": "fc4a834c302b12a286b3b4331402a9d646cb17ca84d76b1e67719185b8228996",
    "pixels2xSha": "63742e12612fed6b601aae3266932454a49e09eed2310c456e90e8d62c552ee1",
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
    "grid": 56,
    "pixelsSha": "b8a551b8de32426e0fe299701110f79f04705f3f061930ca19d327bcd2416d74",
    "pixels2xSha": "a1223ab0643aa30bec5488aff9697b57bf94057fd21ed89756357e1cf59ffbc0",
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
    "grid": 56,
    "pixelsSha": "c4a45f00de5ef1761f7661b147f437fbd1e78d829b7a0a31b37750dca00a35d1",
    "pixels2xSha": "b898cde486ce72d56baf5d4fdcca2d997bc864cf534dff16594f7abbcbe87c6c",
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
    "grid": 56,
    "pixelsSha": "b3c6098dd5c6b2bff80051324b867b3381a9fb33b285eae658191d1d837da435",
    "pixels2xSha": "7718bdd396059b1c3942e9f58b3045697c2abb015463a77f306fb321bf176f51",
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
    "grid": 56,
    "pixelsSha": "6add1b63d49ef48600485f5f42c0d46453abb9a6fcd1776189c41fe414e45a00",
    "pixels2xSha": "a378cc88a09fd57fa53b953c830320d210229abbcc0b9c37671bda2d4d15e1fb",
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
    "grid": 56,
    "pixelsSha": "832d5cd3a9898e2dc2573700742c0eb2d97fe03406d01e2041660a40d63e8207",
    "pixels2xSha": "be4bc7b2a81b25b8db3b9f93d11abae8499bddbf2343307d679f94fb583c4209",
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
    "grid": 56,
    "pixelsSha": "2b577e4d95bb4d3f02926df74858b0c56bd0a2474e09fd738f6bb5d0b18b3169",
    "pixels2xSha": "d4f9e69ab7b97fda4d069c7ddec6fc2b6e97d11b17f4644bef6c27c99ec0769c",
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
    "grid": 56,
    "pixelsSha": "0009d0aa5ae3a5bf656a615bfc96e019aa9ebc999a6f0efda4585a5fa1ebf48e",
    "pixels2xSha": "0a4bd503a6a793c74558a5bdb262135258cb5e8b25213d06b7ace5ee73e14bdc",
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
    "grid": 56,
    "pixelsSha": "04b948ec7eada64d62daa05dabf180ea1d31a5b07c9a22bcb446a15fb52685f1",
    "pixels2xSha": "9e1e4d1ca28d3c01ae11a77bf03f276762b81f0bf86ee86741227e2c59bd6b67",
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
    "grid": 56,
    "pixelsSha": "9d89ac53cf404c4fc912937ec4327de1979a8ba1899e00b3e2e74a1fa8e47f70",
    "pixels2xSha": "e01cc9b745037d1775176182d1892e62fe86b39d598aa45a7794280e310d69d8",
    "refSha": "699c1badcd300c7ef30fe04f87d4372b3aa424c03832c4e22b16d058490525f6",
    "refLen": 792,
    "maskSha": "4ecd2ea5f6918295c7e30ac87f16088f5170a212b92127f8756597a5c79d4744",
    "noiseSha": "27800ca4d975f2a947820334e313c8f70a5340f68813148ffa1837b29e832760"
   },
   {
    "colour": "all",
    "gray": 0,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 28,
    "pixelsSha": "54b6755791e01056e6991e96c4a9e214970a8e1abfda2af5fa04ee86d99682c1",
    "pixels2xSha": "54737f6039435ac0973a972cc65ea17197ee31f48a79a8f90fe1ba7c6d7ae3ba",
    "refSha": "dd9eac7c81235249f84030d02a790fd8474b715e8ce9d50f2f00d83bab5713a6",
    "refLen": 792,
    "maskSha": "efea6bc4da0ddd88c598d879b540fd6c6f8c6bbf5397bc384e136c0089c49ce0",
    "noiseSha": "b0a3d109568b13ca49d06c5c9af05874cd62a7433ca860e0ab0ecb78fbd38973"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 28,
    "pixelsSha": "702c086e4157965046beb31f832742b5331ecce77482b38e852708ed580a2246",
    "pixels2xSha": "c74f41bfafac8cb2e376c8601d47a50b5e0a7eb4da3490cbc27eb1b8fdc19bb4",
    "refSha": "dd9eac7c81235249f84030d02a790fd8474b715e8ce9d50f2f00d83bab5713a6",
    "refLen": 792,
    "maskSha": "efea6bc4da0ddd88c598d879b540fd6c6f8c6bbf5397bc384e136c0089c49ce0",
    "noiseSha": "b0a3d109568b13ca49d06c5c9af05874cd62a7433ca860e0ab0ecb78fbd38973"
   },
   {
    "colour": "all",
    "gray": 255,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 28,
    "pixelsSha": "0d760423d9655c3364b728f4ed587b0c09c48df84df6d8c3a1282042e6a30685",
    "pixels2xSha": "6ba44a58b7fdb0ebf17e768346738878205798abf423374681ca0bc31e49ff0c",
    "refSha": "dd9eac7c81235249f84030d02a790fd8474b715e8ce9d50f2f00d83bab5713a6",
    "refLen": 792,
    "maskSha": "efea6bc4da0ddd88c598d879b540fd6c6f8c6bbf5397bc384e136c0089c49ce0",
    "noiseSha": "b0a3d109568b13ca49d06c5c9af05874cd62a7433ca860e0ab0ecb78fbd38973"
   },
   {
    "colour": "black",
    "gray": 0,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 28,
    "pixelsSha": "5e68af38462172c58d438a4f6fc783be71c25c06d038910437baf208b8dd202f",
    "pixels2xSha": "5d2981e8b54a59c41e8058e7f143440c4d5a8bdfc2e871cfbdde2c2e9d7c1550",
    "refSha": "477b0b34c3740ab7d485c3e6d4d105214f330e7a7cbc7d98c80dcd08c675612e",
    "refLen": 421,
    "maskSha": "3d1af2917b122ac269464afa0d13289ccb2368c95607558d31392e5903f78c21",
    "noiseSha": "b0a3d109568b13ca49d06c5c9af05874cd62a7433ca860e0ab0ecb78fbd38973"
   },
   {
    "colour": "black",
    "gray": 64,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 28,
    "pixelsSha": "aca4d8bf15fcdcb9bc8a23e868fc02f4dfebf38b48723e16eb76c34eafa4237e",
    "pixels2xSha": "93823ebdbd484afdba0d9ce29fefd93d21fb4447e32b22b624c3895332530bf3",
    "refSha": "477b0b34c3740ab7d485c3e6d4d105214f330e7a7cbc7d98c80dcd08c675612e",
    "refLen": 421,
    "maskSha": "3d1af2917b122ac269464afa0d13289ccb2368c95607558d31392e5903f78c21",
    "noiseSha": "b0a3d109568b13ca49d06c5c9af05874cd62a7433ca860e0ab0ecb78fbd38973"
   },
   {
    "colour": "black",
    "gray": 255,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 28,
    "pixelsSha": "fc4a834c302b12a286b3b4331402a9d646cb17ca84d76b1e67719185b8228996",
    "pixels2xSha": "63742e12612fed6b601aae3266932454a49e09eed2310c456e90e8d62c552ee1",
    "refSha": "477b0b34c3740ab7d485c3e6d4d105214f330e7a7cbc7d98c80dcd08c675612e",
    "refLen": 421,
    "maskSha": "3d1af2917b122ac269464afa0d13289ccb2368c95607558d31392e5903f78c21",
    "noiseSha": "b0a3d109568b13ca49d06c5c9af05874cd62a7433ca860e0ab0ecb78fbd38973"
   },
   {
    "colour": "white",
    "gray": 0,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 28,
    "pixelsSha": "6a4c6f8467251832bb449416151798e08c5e355b3cf523fb56a2e69d6388f184",
    "pixels2xSha": "11e146285719e6aa644a48aac9723879b5a0f73b3bd8b25209171bddc424556e",
    "refSha": "5fb688685d88cd9a5352401c73b3830ca39eeadcee91e5c230749e29ba014a17",
    "refLen": 371,
    "maskSha": "d6651b1e83528ed0ad9374fb84d5daae3f632245111fcd6d2a77da49363a7d85",
    "noiseSha": "b0a3d109568b13ca49d06c5c9af05874cd62a7433ca860e0ab0ecb78fbd38973"
   },
   {
    "colour": "white",
    "gray": 64,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 28,
    "pixelsSha": "23eebc2347edc2a849e93fcfbf606a3e19fb9785191adcb2e770551663b7c0c9",
    "pixels2xSha": "c42351ca912c85a6eb7c5fca33d5a1ca487b75fcd49e1a44402914daf0bf202d",
    "refSha": "5fb688685d88cd9a5352401c73b3830ca39eeadcee91e5c230749e29ba014a17",
    "refLen": 371,
    "maskSha": "d6651b1e83528ed0ad9374fb84d5daae3f632245111fcd6d2a77da49363a7d85",
    "noiseSha": "b0a3d109568b13ca49d06c5c9af05874cd62a7433ca860e0ab0ecb78fbd38973"
   },
   {
    "colour": "white",
    "gray": 255,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 28,
    "pixelsSha": "b3c6098dd5c6b2bff80051324b867b3381a9fb33b285eae658191d1d837da435",
    "pixels2xSha": "7718bdd396059b1c3942e9f58b3045697c2abb015463a77f306fb321bf176f51",
    "refSha": "5fb688685d88cd9a5352401c73b3830ca39eeadcee91e5c230749e29ba014a17",
    "refLen": 371,
    "maskSha": "d6651b1e83528ed0ad9374fb84d5daae3f632245111fcd6d2a77da49363a7d85",
    "noiseSha": "b0a3d109568b13ca49d06c5c9af05874cd62a7433ca860e0ab0ecb78fbd38973"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 2,
    "row": 9,
    "col": 11,
    "grid": 28,
    "pixelsSha": "b2b730abd28e190aa297a85f0832455a69201187f5cbdcab842a0eec3ee8d263",
    "pixels2xSha": "291d1239b4799f7f7b6d036630545f6fe54c997d2b694fa770c3d1182c66eaf6",
    "refSha": "dd9eac7c81235249f84030d02a790fd8474b715e8ce9d50f2f00d83bab5713a6",
    "refLen": 792,
    "maskSha": "efea6bc4da0ddd88c598d879b540fd6c6f8c6bbf5397bc384e136c0089c49ce0",
    "noiseSha": "b0a3d109568b13ca49d06c5c9af05874cd62a7433ca860e0ab0ecb78fbd38973"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 11,
    "col": 11,
    "grid": 28,
    "pixelsSha": "4072db0e463e0c3a43200efbabb4fb78d39dccea55d271ee5283ce6035fde970",
    "pixels2xSha": "4c71d78aaabc03c9d030b36eab2e66ce861cb9a707dbd6b5a165b44fb6443f73",
    "refSha": "7d4d774436ffd014a4b1296f751e69c34c51a58da3cdcf35dc2bc0f4002c8f92",
    "refLen": 792,
    "maskSha": "297aa7714f53eca8ac03c25f92b6988d7fd948f2a3ec5f94c9eeb33694dbdc4c",
    "noiseSha": "b0a3d109568b13ca49d06c5c9af05874cd62a7433ca860e0ab0ecb78fbd38973"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 0,
    "col": 0,
    "grid": 28,
    "pixelsSha": "2e90b301b8e68f98fd25cf4f39c8b17521ec8847511d9a7919f569227d806699",
    "pixels2xSha": "5c192914f1669d4e19423230921417c161b59fc68751397dff83c3cee027ea03",
    "refSha": "9e42a635f98af2d1e5af411e5491de263f004d0e0e19d2b5e287e95febf011cc",
    "refLen": 792,
    "maskSha": "22891c54759ebacc4c35e9f5baea468063df8c1cecb571ed08ea61dea19688fc",
    "noiseSha": "b0a3d109568b13ca49d06c5c9af05874cd62a7433ca860e0ab0ecb78fbd38973"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 22,
    "col": 22,
    "grid": 28,
    "pixelsSha": "e7a9f43120a3f47c8fa35c0fda10fe8d9037731724fd251c0a4b47409353f0d3",
    "pixels2xSha": "44bbcb4e26b88aece04b32f617bcfb8da5c5d198e1aad50a912b23d681655e6c",
    "refSha": "4a8cddb913abeb52b120502a56a3e9afe7c732d2703827eeb0dd2daf204279e4",
    "refLen": 792,
    "maskSha": "52e7c26d55b8b2f70d667860202d84a7b454795f860d76e61cf4ab23ad0c3564",
    "noiseSha": "b0a3d109568b13ca49d06c5c9af05874cd62a7433ca860e0ab0ecb78fbd38973"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 7,
    "col": 9,
    "grid": 28,
    "pixelsSha": "251dea29f55c2c7dc2e8322d7dec1cd7213c4fd0c2aa2ce20b59a43ed0269ce5",
    "pixels2xSha": "0a707cb17f77f29c66609ce1a7886f29c403fc8260033df02c4c1e310518e715",
    "refSha": "436962d32e494049cabc6f7f74d0982eb0c71ec45f533eb05f799b8846e4cf23",
    "refLen": 792,
    "maskSha": "d3f230f09f487c95a4fa2b45e7a78e3341599d324837acba16e580eaff5c5830",
    "noiseSha": "b0a3d109568b13ca49d06c5c9af05874cd62a7433ca860e0ab0ecb78fbd38973"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 13,
    "col": 20,
    "grid": 28,
    "pixelsSha": "a7277bbd30cf893763965746355446e1cd56e1c02c51beb52f3b89ebd54517ff",
    "pixels2xSha": "258613c138aab84975d97aae06baad305b8f73cf2e2a01836a5a5c16d26dc1ba",
    "refSha": "699c1badcd300c7ef30fe04f87d4372b3aa424c03832c4e22b16d058490525f6",
    "refLen": 792,
    "maskSha": "4ecd2ea5f6918295c7e30ac87f16088f5170a212b92127f8756597a5c79d4744",
    "noiseSha": "b0a3d109568b13ca49d06c5c9af05874cd62a7433ca860e0ab0ecb78fbd38973"
   },
   {
    "colour": "all",
    "gray": 0,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 112,
    "pixelsSha": "530ee2d61013f280dea1a815c76e1cbd8da5f224f322e7ae5b0f274f4bb759f4",
    "pixels2xSha": "4edd661c739944336c94c201c05da2ea1024229713a2ef63522e906b51a317b4",
    "refSha": "dd9eac7c81235249f84030d02a790fd8474b715e8ce9d50f2f00d83bab5713a6",
    "refLen": 792,
    "maskSha": "efea6bc4da0ddd88c598d879b540fd6c6f8c6bbf5397bc384e136c0089c49ce0",
    "noiseSha": "3c927473f716ae30be792d5822ae66201a792eb1fa0f2ce5b1d75f34353cff94"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 112,
    "pixelsSha": "619cf3343bcb9e27a4dd916ecc70135ed5002c22c19592ba321195fc37105217",
    "pixels2xSha": "b9d2fa9ce9477a81e780b0dcf689bfdd3d25b3c6f9bfa050546e6daeabfaf24e",
    "refSha": "dd9eac7c81235249f84030d02a790fd8474b715e8ce9d50f2f00d83bab5713a6",
    "refLen": 792,
    "maskSha": "efea6bc4da0ddd88c598d879b540fd6c6f8c6bbf5397bc384e136c0089c49ce0",
    "noiseSha": "3c927473f716ae30be792d5822ae66201a792eb1fa0f2ce5b1d75f34353cff94"
   },
   {
    "colour": "all",
    "gray": 255,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 112,
    "pixelsSha": "0d760423d9655c3364b728f4ed587b0c09c48df84df6d8c3a1282042e6a30685",
    "pixels2xSha": "6ba44a58b7fdb0ebf17e768346738878205798abf423374681ca0bc31e49ff0c",
    "refSha": "dd9eac7c81235249f84030d02a790fd8474b715e8ce9d50f2f00d83bab5713a6",
    "refLen": 792,
    "maskSha": "efea6bc4da0ddd88c598d879b540fd6c6f8c6bbf5397bc384e136c0089c49ce0",
    "noiseSha": "3c927473f716ae30be792d5822ae66201a792eb1fa0f2ce5b1d75f34353cff94"
   },
   {
    "colour": "black",
    "gray": 0,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 112,
    "pixelsSha": "978b937ed25c33d22e853b9b3ff475d4a2f45bc2ffd2d01625f8a69c0b4c707c",
    "pixels2xSha": "6ff50e10f05570352a81f683d25f8d1b766252b863b0da9d726c1eda0085ab07",
    "refSha": "477b0b34c3740ab7d485c3e6d4d105214f330e7a7cbc7d98c80dcd08c675612e",
    "refLen": 421,
    "maskSha": "3d1af2917b122ac269464afa0d13289ccb2368c95607558d31392e5903f78c21",
    "noiseSha": "3c927473f716ae30be792d5822ae66201a792eb1fa0f2ce5b1d75f34353cff94"
   },
   {
    "colour": "black",
    "gray": 64,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 112,
    "pixelsSha": "ec988e28458404c4d809827f67b1a91f460bce806697b9de1f140cc38fe5fde4",
    "pixels2xSha": "bbef122c67cc4fa3be4dadd92df0c93e5beb826a6e8de37a1dd14dac20dafa5e",
    "refSha": "477b0b34c3740ab7d485c3e6d4d105214f330e7a7cbc7d98c80dcd08c675612e",
    "refLen": 421,
    "maskSha": "3d1af2917b122ac269464afa0d13289ccb2368c95607558d31392e5903f78c21",
    "noiseSha": "3c927473f716ae30be792d5822ae66201a792eb1fa0f2ce5b1d75f34353cff94"
   },
   {
    "colour": "black",
    "gray": 255,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 112,
    "pixelsSha": "fc4a834c302b12a286b3b4331402a9d646cb17ca84d76b1e67719185b8228996",
    "pixels2xSha": "63742e12612fed6b601aae3266932454a49e09eed2310c456e90e8d62c552ee1",
    "refSha": "477b0b34c3740ab7d485c3e6d4d105214f330e7a7cbc7d98c80dcd08c675612e",
    "refLen": 421,
    "maskSha": "3d1af2917b122ac269464afa0d13289ccb2368c95607558d31392e5903f78c21",
    "noiseSha": "3c927473f716ae30be792d5822ae66201a792eb1fa0f2ce5b1d75f34353cff94"
   },
   {
    "colour": "white",
    "gray": 0,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 112,
    "pixelsSha": "6ec5458a607103c7caf5d6b0ed6bb0e414593b547ea3c45ffe878ac9fda0142b",
    "pixels2xSha": "d4a2b3b3de8d780547ada0a303aa03adfd3291f1140981cdc125d917e37292bf",
    "refSha": "5fb688685d88cd9a5352401c73b3830ca39eeadcee91e5c230749e29ba014a17",
    "refLen": 371,
    "maskSha": "d6651b1e83528ed0ad9374fb84d5daae3f632245111fcd6d2a77da49363a7d85",
    "noiseSha": "3c927473f716ae30be792d5822ae66201a792eb1fa0f2ce5b1d75f34353cff94"
   },
   {
    "colour": "white",
    "gray": 64,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 112,
    "pixelsSha": "668733cb5731d90b85fc96a26c5b5848191110b56d72d2ee6cb2924deb17e3f7",
    "pixels2xSha": "81603bac62da0ec3a2d5eb7f96977debaeabead937011abbd4f6ac704ac1f18c",
    "refSha": "5fb688685d88cd9a5352401c73b3830ca39eeadcee91e5c230749e29ba014a17",
    "refLen": 371,
    "maskSha": "d6651b1e83528ed0ad9374fb84d5daae3f632245111fcd6d2a77da49363a7d85",
    "noiseSha": "3c927473f716ae30be792d5822ae66201a792eb1fa0f2ce5b1d75f34353cff94"
   },
   {
    "colour": "white",
    "gray": 255,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 112,
    "pixelsSha": "b3c6098dd5c6b2bff80051324b867b3381a9fb33b285eae658191d1d837da435",
    "pixels2xSha": "7718bdd396059b1c3942e9f58b3045697c2abb015463a77f306fb321bf176f51",
    "refSha": "5fb688685d88cd9a5352401c73b3830ca39eeadcee91e5c230749e29ba014a17",
    "refLen": 371,
    "maskSha": "d6651b1e83528ed0ad9374fb84d5daae3f632245111fcd6d2a77da49363a7d85",
    "noiseSha": "3c927473f716ae30be792d5822ae66201a792eb1fa0f2ce5b1d75f34353cff94"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 2,
    "row": 9,
    "col": 11,
    "grid": 112,
    "pixelsSha": "0506d88f2f1e12e7ea1570f234701aa134ae630d66ec2a327d910a6d8be38dc5",
    "pixels2xSha": "b3f37be8a9621847ff6f6b4cd737d8459097a0d593fbc3b3162fdefee51fc91c",
    "refSha": "dd9eac7c81235249f84030d02a790fd8474b715e8ce9d50f2f00d83bab5713a6",
    "refLen": 792,
    "maskSha": "efea6bc4da0ddd88c598d879b540fd6c6f8c6bbf5397bc384e136c0089c49ce0",
    "noiseSha": "3c927473f716ae30be792d5822ae66201a792eb1fa0f2ce5b1d75f34353cff94"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 11,
    "col": 11,
    "grid": 112,
    "pixelsSha": "c1a787bb2d27c11ce9e3ba5b1898abf772ebd17c47a250140560bf2a5c809526",
    "pixels2xSha": "eaab5a94a109e964c4d183bc499f2c8ac8556c160cefa2a1957ad3fbd0940cd8",
    "refSha": "7d4d774436ffd014a4b1296f751e69c34c51a58da3cdcf35dc2bc0f4002c8f92",
    "refLen": 792,
    "maskSha": "297aa7714f53eca8ac03c25f92b6988d7fd948f2a3ec5f94c9eeb33694dbdc4c",
    "noiseSha": "3c927473f716ae30be792d5822ae66201a792eb1fa0f2ce5b1d75f34353cff94"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 0,
    "col": 0,
    "grid": 112,
    "pixelsSha": "8175d89e10131adf253beb1e03be2261f185a7e9c1d18b600a18eb65b0e889e7",
    "pixels2xSha": "7063a6254f64bae569f1d297da2e8359217121e50154390d218fca9854ee7bf8",
    "refSha": "9e42a635f98af2d1e5af411e5491de263f004d0e0e19d2b5e287e95febf011cc",
    "refLen": 792,
    "maskSha": "22891c54759ebacc4c35e9f5baea468063df8c1cecb571ed08ea61dea19688fc",
    "noiseSha": "3c927473f716ae30be792d5822ae66201a792eb1fa0f2ce5b1d75f34353cff94"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 22,
    "col": 22,
    "grid": 112,
    "pixelsSha": "7292ad0f28387f8180ebde5010a1f0b37ae72e5fceb9247fd9d687ad876683cd",
    "pixels2xSha": "fa5d0a92b7e272cf3288cdfffc9faa91f1e848a8c4527679b92b1af948a0f729",
    "refSha": "4a8cddb913abeb52b120502a56a3e9afe7c732d2703827eeb0dd2daf204279e4",
    "refLen": 792,
    "maskSha": "52e7c26d55b8b2f70d667860202d84a7b454795f860d76e61cf4ab23ad0c3564",
    "noiseSha": "3c927473f716ae30be792d5822ae66201a792eb1fa0f2ce5b1d75f34353cff94"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 7,
    "col": 9,
    "grid": 112,
    "pixelsSha": "abfa90c405ddd446e82a1b7fa400f80caf59041847693d3541ae75f963c40eea",
    "pixels2xSha": "8ce4be9c48c940a3433edabf4fa5b92bf2e964791aa0094623515d6367bb3dfe",
    "refSha": "436962d32e494049cabc6f7f74d0982eb0c71ec45f533eb05f799b8846e4cf23",
    "refLen": 792,
    "maskSha": "d3f230f09f487c95a4fa2b45e7a78e3341599d324837acba16e580eaff5c5830",
    "noiseSha": "3c927473f716ae30be792d5822ae66201a792eb1fa0f2ce5b1d75f34353cff94"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 13,
    "col": 20,
    "grid": 112,
    "pixelsSha": "4ee0547f4977d3c933b66f3211834d9efa3658b21e647692c85036654cdd5fe2",
    "pixels2xSha": "1f2a4e848cce077b256e24fddfbefe4aade520caa5edd9baafd45f81bb5eb6c5",
    "refSha": "699c1badcd300c7ef30fe04f87d4372b3aa424c03832c4e22b16d058490525f6",
    "refLen": 792,
    "maskSha": "4ecd2ea5f6918295c7e30ac87f16088f5170a212b92127f8756597a5c79d4744",
    "noiseSha": "3c927473f716ae30be792d5822ae66201a792eb1fa0f2ce5b1d75f34353cff94"
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
    "grid": 56,
    "pixelsSha": "08716e2794c1ab01b03308f6aea58c536f4184be5cfc6f41406f29d7ce76ea2f",
    "pixels2xSha": "137f491b21b9beabf85cff0b6a781f32a970355cbcba17139a30ebfec97754ec",
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
    "grid": 56,
    "pixelsSha": "c0c68d6641c1b360e65778daa2f76758713c48708f617071021e5e9814cd83af",
    "pixels2xSha": "166fa06b4fec4307ed77257c57fa827184beefa2575cf0d32c6d90c7c44cee8b",
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
    "grid": 56,
    "pixelsSha": "452d943cd2180b9802bbe95192c53ee1b05e0a9be70e968eea434ae4455f2861",
    "pixels2xSha": "04695119eae7a69df3bf3a62b257e5ab2894fc58cb10ab4d6fe69064944b3ee3",
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
    "grid": 56,
    "pixelsSha": "2a012cbb01e99bdbae84367639b6f3a81a7f5792630bc67e335ed6123209590b",
    "pixels2xSha": "32b07fcc3fcd5eab1fa9d89bf474edda00a9274c1f08e5214cd42caf80b1f7bd",
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
    "grid": 56,
    "pixelsSha": "c0b2879b1d2be9a7312b791fc427b28cf1b153eddcd4e649c93ae7709e7cdd0f",
    "pixels2xSha": "aa0e99e6714baefc73b61f3afe638cf53ed0f74e56c97376fbe02910c49fd786",
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
    "grid": 56,
    "pixelsSha": "b6eba14c4f72b49d5b368c867bc2af54b2845cd7e35ed210976b37845cb92752",
    "pixels2xSha": "fbd69deeac5b218be4550baad87406b0043e84730a33c2a72d051fb8010050bc",
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
    "grid": 56,
    "pixelsSha": "ff940748b6467c33ae1bb3908ca53fbbe5050ddc2f0b53c6c2a5d7da6f13d893",
    "pixels2xSha": "fd799d5b9a787b7e8466f5bd831628a0978f0a89999877d869ea222a3c9684de",
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
    "grid": 56,
    "pixelsSha": "189154e4ca53e9b6b97b04aa9270cf286cfa6d8252b8d5e599c11ce261e25f03",
    "pixels2xSha": "c0990069de173bb3f137eaffd62c3c646c0a7bdaafa3cbacd677114c7e37aba6",
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
    "grid": 56,
    "pixelsSha": "4486e05cce7a0a86f409a87752233bd6a93cc6d36adef90d5fedf2b7d9926d95",
    "pixels2xSha": "81eb36af5050328815121836a72896d6b58f3ddfc665003c751d93ee5cd01171",
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
    "grid": 56,
    "pixelsSha": "607026585abcb0401b72759eeaebf0b193ab48be7245267b10e78dd6bb2e38a2",
    "pixels2xSha": "4692bc542cfc0c1f5661729319f3bf5b6f6f2b880adf0d69cc927045e727ebfa",
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
    "grid": 56,
    "pixelsSha": "527a0996080247b804e6ca087736dc2bf4f57094b95f6b569e17a96a48723925",
    "pixels2xSha": "c1fa4201af7e91e92b90cada8a65ff6dc369df75425cc282c7dea62f2a612f27",
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
    "grid": 56,
    "pixelsSha": "6ec254b4271f64c73ce8f6cd6e64c2d19957e02ab6c94cb76f869b42f15e8654",
    "pixels2xSha": "6a7ee48e77da9d040861370662acb7a6133ead03af753fa7d69d0ef9c17f448b",
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
    "grid": 56,
    "pixelsSha": "65f54a8f5a8dd687d2d31b72092b2fe80ee5e1a8ae018ea3d42dc987ce3980b4",
    "pixels2xSha": "f62586d72c5cea36e0cdd1a6778bacc26bf2a384342ec6b96cd6e0b516e23200",
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
    "grid": 56,
    "pixelsSha": "13b166977e940a30f8a42d9fb57c06e72c72e1c32999f9cd957fddf62dfedad6",
    "pixels2xSha": "424cbbb6a98cefd9681584417e89b3a6022d78d7740fc168444c6cf252dce472",
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
    "grid": 56,
    "pixelsSha": "78b909f42399c111d059400c87cb6ccd41f8bd56ad45852d18c24560ff8c09d0",
    "pixels2xSha": "ffae84ba8dd890ebe31312885d810e19d277d02529415d9fdaf8850a99ae77ab",
    "refSha": "aa6510c7e110cba18dfd0e16aac5f5bd86afe0353add53ab5ff0c7e84fa2fb57",
    "refLen": 792,
    "maskSha": "4ecd2ea5f6918295c7e30ac87f16088f5170a212b92127f8756597a5c79d4744",
    "noiseSha": "9c808ef3a3aaca62d144c933f5b5d1aedfcdbd677a8d00bcb726a413fbd3258b"
   },
   {
    "colour": "all",
    "gray": 0,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 28,
    "pixelsSha": "e59b4964f677811a06d80fcf05bd4a78bf2ec64696e0e7fc6b2ad9f6e632937d",
    "pixels2xSha": "5a24cb5954c9a2cc0e415d0f4287a7f9183086d02188c875ae3e7366cf71e2e5",
    "refSha": "6af6830c4195feb2890b472334aa52ba496a8836081148e476afddb03421348e",
    "refLen": 792,
    "maskSha": "efea6bc4da0ddd88c598d879b540fd6c6f8c6bbf5397bc384e136c0089c49ce0",
    "noiseSha": "de1367bb52b753896961eb45fc248becc5ee3b3b06cf87f735fc1679e99093d5"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 28,
    "pixelsSha": "0c7cb257bdf0670fcfca4f8b4f1b79c6cf009a38abae1c18546c91bf4e7d798b",
    "pixels2xSha": "734ac5ffd23090743f33c95b10cac9aff847ec4f9d0512bce2f31404977b3821",
    "refSha": "6af6830c4195feb2890b472334aa52ba496a8836081148e476afddb03421348e",
    "refLen": 792,
    "maskSha": "efea6bc4da0ddd88c598d879b540fd6c6f8c6bbf5397bc384e136c0089c49ce0",
    "noiseSha": "de1367bb52b753896961eb45fc248becc5ee3b3b06cf87f735fc1679e99093d5"
   },
   {
    "colour": "all",
    "gray": 255,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 28,
    "pixelsSha": "452d943cd2180b9802bbe95192c53ee1b05e0a9be70e968eea434ae4455f2861",
    "pixels2xSha": "04695119eae7a69df3bf3a62b257e5ab2894fc58cb10ab4d6fe69064944b3ee3",
    "refSha": "6af6830c4195feb2890b472334aa52ba496a8836081148e476afddb03421348e",
    "refLen": 792,
    "maskSha": "efea6bc4da0ddd88c598d879b540fd6c6f8c6bbf5397bc384e136c0089c49ce0",
    "noiseSha": "de1367bb52b753896961eb45fc248becc5ee3b3b06cf87f735fc1679e99093d5"
   },
   {
    "colour": "black",
    "gray": 0,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 28,
    "pixelsSha": "34ee6c78dd2af3747023014509a66320bba4093d57fb20590adcf72e95341999",
    "pixels2xSha": "cd69d3f6f983467abd52ee729ca4864cfab4e7d0e0f8c89adb65d007750632ff",
    "refSha": "c90bf8637888768135aecf3588623ea704f9149a90a5f658abf513afef2a7f37",
    "refLen": 406,
    "maskSha": "f3794a8c4f2bf4017897750a86db9cf30c68689b593a616d52fdaffb02bc2638",
    "noiseSha": "de1367bb52b753896961eb45fc248becc5ee3b3b06cf87f735fc1679e99093d5"
   },
   {
    "colour": "black",
    "gray": 64,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 28,
    "pixelsSha": "629e75c4606b6e7fcbffcc8f8fd60ecb1c9b1b1e04d1306245f0e5bfdb08aed3",
    "pixels2xSha": "3783ee30152ffe5b53d316ead4605d58c01a2fe1990d69f31f36136bd213a098",
    "refSha": "c90bf8637888768135aecf3588623ea704f9149a90a5f658abf513afef2a7f37",
    "refLen": 406,
    "maskSha": "f3794a8c4f2bf4017897750a86db9cf30c68689b593a616d52fdaffb02bc2638",
    "noiseSha": "de1367bb52b753896961eb45fc248becc5ee3b3b06cf87f735fc1679e99093d5"
   },
   {
    "colour": "black",
    "gray": 255,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 28,
    "pixelsSha": "b6eba14c4f72b49d5b368c867bc2af54b2845cd7e35ed210976b37845cb92752",
    "pixels2xSha": "fbd69deeac5b218be4550baad87406b0043e84730a33c2a72d051fb8010050bc",
    "refSha": "c90bf8637888768135aecf3588623ea704f9149a90a5f658abf513afef2a7f37",
    "refLen": 406,
    "maskSha": "f3794a8c4f2bf4017897750a86db9cf30c68689b593a616d52fdaffb02bc2638",
    "noiseSha": "de1367bb52b753896961eb45fc248becc5ee3b3b06cf87f735fc1679e99093d5"
   },
   {
    "colour": "white",
    "gray": 0,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 28,
    "pixelsSha": "39864561bf8a914c5af1c74599e0deaca7129754aa65b8e3f03988215bb3229e",
    "pixels2xSha": "d807c6aad302c4b503f8ef182f7d64baaa404a9e7b1932bab9f56ec2c109ea59",
    "refSha": "66f4e73306ba72bf0da3dee4457b6c944a4f2485c70d0db20395d09edd2fd57a",
    "refLen": 386,
    "maskSha": "303bd7b5c07fa7f68c9b8da3d895f5a789b025e8be268d218f21882c285bb6b2",
    "noiseSha": "de1367bb52b753896961eb45fc248becc5ee3b3b06cf87f735fc1679e99093d5"
   },
   {
    "colour": "white",
    "gray": 64,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 28,
    "pixelsSha": "f7d1c647ed70273b2736a3f00f10a4fad769e247142caf0cd01411dab61a9f6f",
    "pixels2xSha": "4a55f3947acbdfa1c718abb9edca0d720be66c44a2fa9fd048b00a2675628058",
    "refSha": "66f4e73306ba72bf0da3dee4457b6c944a4f2485c70d0db20395d09edd2fd57a",
    "refLen": 386,
    "maskSha": "303bd7b5c07fa7f68c9b8da3d895f5a789b025e8be268d218f21882c285bb6b2",
    "noiseSha": "de1367bb52b753896961eb45fc248becc5ee3b3b06cf87f735fc1679e99093d5"
   },
   {
    "colour": "white",
    "gray": 255,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 28,
    "pixelsSha": "4486e05cce7a0a86f409a87752233bd6a93cc6d36adef90d5fedf2b7d9926d95",
    "pixels2xSha": "81eb36af5050328815121836a72896d6b58f3ddfc665003c751d93ee5cd01171",
    "refSha": "66f4e73306ba72bf0da3dee4457b6c944a4f2485c70d0db20395d09edd2fd57a",
    "refLen": 386,
    "maskSha": "303bd7b5c07fa7f68c9b8da3d895f5a789b025e8be268d218f21882c285bb6b2",
    "noiseSha": "de1367bb52b753896961eb45fc248becc5ee3b3b06cf87f735fc1679e99093d5"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 2,
    "row": 9,
    "col": 11,
    "grid": 28,
    "pixelsSha": "bf51b62a04c095e97b4862dc62c570f03b968d95f1a2d74b89688d7eca17a380",
    "pixels2xSha": "beedb23484e43541648a13b6af1ad26eb6250e0fda5aad2709580c68722686ea",
    "refSha": "6af6830c4195feb2890b472334aa52ba496a8836081148e476afddb03421348e",
    "refLen": 792,
    "maskSha": "efea6bc4da0ddd88c598d879b540fd6c6f8c6bbf5397bc384e136c0089c49ce0",
    "noiseSha": "de1367bb52b753896961eb45fc248becc5ee3b3b06cf87f735fc1679e99093d5"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 11,
    "col": 11,
    "grid": 28,
    "pixelsSha": "9cc3492323f567a39ba732f06e2f00523450a20f5bc29badaa97f54ac612f6db",
    "pixels2xSha": "ee652d7302ae3a704ff8517c7cfa32ad3d44b9d8cc76e67c58f66ba6316291a3",
    "refSha": "9cdd195b6232adfb85119a0795e27f0707e009bd5f06189ed054abcbe81d3a67",
    "refLen": 792,
    "maskSha": "297aa7714f53eca8ac03c25f92b6988d7fd948f2a3ec5f94c9eeb33694dbdc4c",
    "noiseSha": "de1367bb52b753896961eb45fc248becc5ee3b3b06cf87f735fc1679e99093d5"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 0,
    "col": 0,
    "grid": 28,
    "pixelsSha": "9c0d00b780baa88fa1ec7531e905dc3242788c877170882fbdc96bf0d39c5a23",
    "pixels2xSha": "1995b4a7f780a22e0a568623864ae59d6242a9f919107be7debe28b7a23a6bba",
    "refSha": "5f7d71aae18f73ea71abfb2629329c110e77760020e0c634ae7b144a7f39eeee",
    "refLen": 792,
    "maskSha": "22891c54759ebacc4c35e9f5baea468063df8c1cecb571ed08ea61dea19688fc",
    "noiseSha": "de1367bb52b753896961eb45fc248becc5ee3b3b06cf87f735fc1679e99093d5"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 22,
    "col": 22,
    "grid": 28,
    "pixelsSha": "049c44d592257dcef31c7c31f9e525cc6fcab7e6d41c6c8e71f099402d973ce1",
    "pixels2xSha": "1766bb2306bc294bed41ffa2b65d85e2c0f50611dcbac249a4b3bddb256247bd",
    "refSha": "cf8040a363d4c948b5008a6abe1b827dab0f1316bfda8d027e8103cc7da7f57f",
    "refLen": 792,
    "maskSha": "52e7c26d55b8b2f70d667860202d84a7b454795f860d76e61cf4ab23ad0c3564",
    "noiseSha": "de1367bb52b753896961eb45fc248becc5ee3b3b06cf87f735fc1679e99093d5"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 7,
    "col": 9,
    "grid": 28,
    "pixelsSha": "39b922f77499effbf47339f177a95d49fc18941034b9b91d9844cae40da07d7d",
    "pixels2xSha": "2abdb7ab14124af0157fe1e3262f6d836a2daa96d229699b8d8e13bb9b00a07e",
    "refSha": "a8e1414fb221aabe0a8efe2b867df4dc1edd82dc597a8fd8197f55eea19735a1",
    "refLen": 792,
    "maskSha": "d3f230f09f487c95a4fa2b45e7a78e3341599d324837acba16e580eaff5c5830",
    "noiseSha": "de1367bb52b753896961eb45fc248becc5ee3b3b06cf87f735fc1679e99093d5"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 13,
    "col": 20,
    "grid": 28,
    "pixelsSha": "96c387d2c32a90b12fbe03b7d9847803fb491ffbc67bec4d6fd858a89c97cc6b",
    "pixels2xSha": "18e6c4acad31b4105cba16bacd7edb987249f49ff3cc7afdcee6838a0457e1a0",
    "refSha": "aa6510c7e110cba18dfd0e16aac5f5bd86afe0353add53ab5ff0c7e84fa2fb57",
    "refLen": 792,
    "maskSha": "4ecd2ea5f6918295c7e30ac87f16088f5170a212b92127f8756597a5c79d4744",
    "noiseSha": "de1367bb52b753896961eb45fc248becc5ee3b3b06cf87f735fc1679e99093d5"
   },
   {
    "colour": "all",
    "gray": 0,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 112,
    "pixelsSha": "e02cc1ceab94f605bb721b7a874d104f9aa13ab15d747b1f8606212072b812a3",
    "pixels2xSha": "2c473a5abd08a8cd5360065c93c190398a7423efd5b08c0ba2b7edf53c1d3707",
    "refSha": "6af6830c4195feb2890b472334aa52ba496a8836081148e476afddb03421348e",
    "refLen": 792,
    "maskSha": "efea6bc4da0ddd88c598d879b540fd6c6f8c6bbf5397bc384e136c0089c49ce0",
    "noiseSha": "887796f4ff800367683ecc90eaf14ac88762fc2589af15fdc3a9b8f0bd16f993"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 112,
    "pixelsSha": "1d6ad8c997207e550075d5a2597531a6b03618abc8a67fdb73daaf23193bdcdf",
    "pixels2xSha": "5b17df14972524608d4a561923f28bb884820662648753166d9e26bce5c6d4d4",
    "refSha": "6af6830c4195feb2890b472334aa52ba496a8836081148e476afddb03421348e",
    "refLen": 792,
    "maskSha": "efea6bc4da0ddd88c598d879b540fd6c6f8c6bbf5397bc384e136c0089c49ce0",
    "noiseSha": "887796f4ff800367683ecc90eaf14ac88762fc2589af15fdc3a9b8f0bd16f993"
   },
   {
    "colour": "all",
    "gray": 255,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 112,
    "pixelsSha": "452d943cd2180b9802bbe95192c53ee1b05e0a9be70e968eea434ae4455f2861",
    "pixels2xSha": "04695119eae7a69df3bf3a62b257e5ab2894fc58cb10ab4d6fe69064944b3ee3",
    "refSha": "6af6830c4195feb2890b472334aa52ba496a8836081148e476afddb03421348e",
    "refLen": 792,
    "maskSha": "efea6bc4da0ddd88c598d879b540fd6c6f8c6bbf5397bc384e136c0089c49ce0",
    "noiseSha": "887796f4ff800367683ecc90eaf14ac88762fc2589af15fdc3a9b8f0bd16f993"
   },
   {
    "colour": "black",
    "gray": 0,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 112,
    "pixelsSha": "096abaa9075776d6c18d06e9c07d0ef89da7008846a64f5f9bf4b6a29203d6ff",
    "pixels2xSha": "a3d2bd033f9d44edc688fdc9ff0a96ed5b0d42f9e9ce94b5551d6ab2b736bd77",
    "refSha": "c90bf8637888768135aecf3588623ea704f9149a90a5f658abf513afef2a7f37",
    "refLen": 406,
    "maskSha": "f3794a8c4f2bf4017897750a86db9cf30c68689b593a616d52fdaffb02bc2638",
    "noiseSha": "887796f4ff800367683ecc90eaf14ac88762fc2589af15fdc3a9b8f0bd16f993"
   },
   {
    "colour": "black",
    "gray": 64,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 112,
    "pixelsSha": "a089b77095c634f8ef4ee93f6c7a94cfc78a2236b632e18d8800ef3304f4d509",
    "pixels2xSha": "7be81d2b0157146c586dd9d1bb3a8275df72de3ce346b5349da6ca020189c5ca",
    "refSha": "c90bf8637888768135aecf3588623ea704f9149a90a5f658abf513afef2a7f37",
    "refLen": 406,
    "maskSha": "f3794a8c4f2bf4017897750a86db9cf30c68689b593a616d52fdaffb02bc2638",
    "noiseSha": "887796f4ff800367683ecc90eaf14ac88762fc2589af15fdc3a9b8f0bd16f993"
   },
   {
    "colour": "black",
    "gray": 255,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 112,
    "pixelsSha": "b6eba14c4f72b49d5b368c867bc2af54b2845cd7e35ed210976b37845cb92752",
    "pixels2xSha": "fbd69deeac5b218be4550baad87406b0043e84730a33c2a72d051fb8010050bc",
    "refSha": "c90bf8637888768135aecf3588623ea704f9149a90a5f658abf513afef2a7f37",
    "refLen": 406,
    "maskSha": "f3794a8c4f2bf4017897750a86db9cf30c68689b593a616d52fdaffb02bc2638",
    "noiseSha": "887796f4ff800367683ecc90eaf14ac88762fc2589af15fdc3a9b8f0bd16f993"
   },
   {
    "colour": "white",
    "gray": 0,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 112,
    "pixelsSha": "12bbe30a56ababc6a8636fabeafbf932f8edde65a6f1ef870346b5d22947a6a2",
    "pixels2xSha": "e177d1915a28d63b3504972e8d27bd0fb24d550f8b76f0063c4342a94e27650c",
    "refSha": "66f4e73306ba72bf0da3dee4457b6c944a4f2485c70d0db20395d09edd2fd57a",
    "refLen": 386,
    "maskSha": "303bd7b5c07fa7f68c9b8da3d895f5a789b025e8be268d218f21882c285bb6b2",
    "noiseSha": "887796f4ff800367683ecc90eaf14ac88762fc2589af15fdc3a9b8f0bd16f993"
   },
   {
    "colour": "white",
    "gray": 64,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 112,
    "pixelsSha": "e8a330a354f8db69bfce70fd2738c76cc8ca06f8aa77b4858f0177a54e1b8d80",
    "pixels2xSha": "28dee3c16d053b0f5982ffd8539a02be7323a2ed0bb6b6d9b6804a86b9ebc069",
    "refSha": "66f4e73306ba72bf0da3dee4457b6c944a4f2485c70d0db20395d09edd2fd57a",
    "refLen": 386,
    "maskSha": "303bd7b5c07fa7f68c9b8da3d895f5a789b025e8be268d218f21882c285bb6b2",
    "noiseSha": "887796f4ff800367683ecc90eaf14ac88762fc2589af15fdc3a9b8f0bd16f993"
   },
   {
    "colour": "white",
    "gray": 255,
    "pairs": 1,
    "row": 9,
    "col": 11,
    "grid": 112,
    "pixelsSha": "4486e05cce7a0a86f409a87752233bd6a93cc6d36adef90d5fedf2b7d9926d95",
    "pixels2xSha": "81eb36af5050328815121836a72896d6b58f3ddfc665003c751d93ee5cd01171",
    "refSha": "66f4e73306ba72bf0da3dee4457b6c944a4f2485c70d0db20395d09edd2fd57a",
    "refLen": 386,
    "maskSha": "303bd7b5c07fa7f68c9b8da3d895f5a789b025e8be268d218f21882c285bb6b2",
    "noiseSha": "887796f4ff800367683ecc90eaf14ac88762fc2589af15fdc3a9b8f0bd16f993"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 2,
    "row": 9,
    "col": 11,
    "grid": 112,
    "pixelsSha": "8b01b243148f3c468e7484eb4d22ff8da6cfe01f593c5b8542e5c653124932de",
    "pixels2xSha": "1b5facc7b353dbec44742892992b0d0103c6d5ca1d6c881816b74554a934b715",
    "refSha": "6af6830c4195feb2890b472334aa52ba496a8836081148e476afddb03421348e",
    "refLen": 792,
    "maskSha": "efea6bc4da0ddd88c598d879b540fd6c6f8c6bbf5397bc384e136c0089c49ce0",
    "noiseSha": "887796f4ff800367683ecc90eaf14ac88762fc2589af15fdc3a9b8f0bd16f993"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 11,
    "col": 11,
    "grid": 112,
    "pixelsSha": "5a00b1ff04d168bbef18dc5ad8e5bd22ed5ce9ca1d9a99c51cd5aafd823dcbfe",
    "pixels2xSha": "728dcb4fbbab50cad98080584a03c8e1d5c70c8ab6f8e154b3dc2eeee5dfce8a",
    "refSha": "9cdd195b6232adfb85119a0795e27f0707e009bd5f06189ed054abcbe81d3a67",
    "refLen": 792,
    "maskSha": "297aa7714f53eca8ac03c25f92b6988d7fd948f2a3ec5f94c9eeb33694dbdc4c",
    "noiseSha": "887796f4ff800367683ecc90eaf14ac88762fc2589af15fdc3a9b8f0bd16f993"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 0,
    "col": 0,
    "grid": 112,
    "pixelsSha": "5d64b03e896bb8eba36d01683bc185670e7af9fe3ac21161ffb4cc24c274c8bc",
    "pixels2xSha": "f6f0b78e25efa722a62ed95d8564eca02d656c13664607045bf8e3f402742e01",
    "refSha": "5f7d71aae18f73ea71abfb2629329c110e77760020e0c634ae7b144a7f39eeee",
    "refLen": 792,
    "maskSha": "22891c54759ebacc4c35e9f5baea468063df8c1cecb571ed08ea61dea19688fc",
    "noiseSha": "887796f4ff800367683ecc90eaf14ac88762fc2589af15fdc3a9b8f0bd16f993"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 22,
    "col": 22,
    "grid": 112,
    "pixelsSha": "b0ae37c375f3d89c12cfb0788b3bcd158b28fab32079272566a0e5c2412d8cea",
    "pixels2xSha": "6c66a49d086b2f865b992d4dc2fb95fc8cf2026c08bce0f005d5b259b66e8d51",
    "refSha": "cf8040a363d4c948b5008a6abe1b827dab0f1316bfda8d027e8103cc7da7f57f",
    "refLen": 792,
    "maskSha": "52e7c26d55b8b2f70d667860202d84a7b454795f860d76e61cf4ab23ad0c3564",
    "noiseSha": "887796f4ff800367683ecc90eaf14ac88762fc2589af15fdc3a9b8f0bd16f993"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 7,
    "col": 9,
    "grid": 112,
    "pixelsSha": "94035e73fbb33ae1e847ae3fc4aa35e51f8f4cd197954a5984ffdf89b9ddd8b6",
    "pixels2xSha": "c36aea1f530d6a02f188bcf66e604fbcdfdebd10169c77c280eea566ed8b63fd",
    "refSha": "a8e1414fb221aabe0a8efe2b867df4dc1edd82dc597a8fd8197f55eea19735a1",
    "refLen": 792,
    "maskSha": "d3f230f09f487c95a4fa2b45e7a78e3341599d324837acba16e580eaff5c5830",
    "noiseSha": "887796f4ff800367683ecc90eaf14ac88762fc2589af15fdc3a9b8f0bd16f993"
   },
   {
    "colour": "all",
    "gray": 64,
    "pairs": 1,
    "row": 13,
    "col": 20,
    "grid": 112,
    "pixelsSha": "f4518384dc261445c4007137970764fe3a7233e4125d2c6731b0708d756e3f62",
    "pixels2xSha": "eab40760664be1117b9a7ce2d63a9a0aa6d374b59c1a0fe22c3d9acdf3be47bc",
    "refSha": "aa6510c7e110cba18dfd0e16aac5f5bd86afe0353add53ab5ff0c7e84fa2fb57",
    "refLen": 792,
    "maskSha": "4ecd2ea5f6918295c7e30ac87f16088f5170a212b92127f8756597a5c79d4744",
    "noiseSha": "887796f4ff800367683ecc90eaf14ac88762fc2589af15fdc3a9b8f0bd16f993"
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
/** The same block in the 2x PNG (464 x 464): 16 px per module, 112 px square. */
const inBlock2x = (y: number, x: number, row: number, col: number) =>
  y >= row * 16 && y < row * 16 + NOISE_SIZE_2X && x >= col * 16 && x < col * 16 + NOISE_SIZE_2X;

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
      const label = `${tag} ${m.grid}-grid ${m.colour} gray ${m.gray} ${m.pairs} pair${m.pairs === 2 ? 's' : ''} at (${m.row},${m.col})`;
      const area = countWatermarkArea(modules, m.row, m.col);
      check(`${label}: red area has 792 modules (black + white), 49 under the noise`, area.total === 792 && area.black + area.white === 792 && area.noiseModules === 49);
      const r = generateSqrNoisePoc({ prefix: PREFIX, fingerprintId: fx.id, strength: 120, mmSize: 10, colour: m.colour, noiseGray: m.gray, coeffPairs: PAIRS[m.pairs], noiseRow: m.row, noiseCol: m.col, noiseGridSize: m.grid as NoiseGridSize });

      // identical to the Python reference
      check(`${label}: 1x pixels identical to the reference`, sha(r.pixels1x) === m.pixelsSha);
      check(`${label}: reference string identical (len ${m.refLen})`, r.refBinaryString.length === m.refLen && sha(r.refBinaryString) === m.refSha);
      check(`${label}: mask identical`, sha(r.maskString) === m.maskSha);
      check(`${label}: noise bits identical`, sha(r.noiseBitsString) === m.noiseSha);
      check(`${label}: result reports the position and its scan margin`, r.noiseRow === m.row && r.noiseCol === m.col && r.noiseInfo.codewordsTouched === LAYOUT_TABLE[`${m.row},${m.col}`][0]);

      // the 112x112 pixels of the 2x PNG at the noise position are exactly the noise grid: bit 1 = gray, bit 0 = 255, never watermarked
      const cell2 = NOISE_SIZE_2X / m.grid; // pixels per value in the 2x PNG: 4, 2 or 1
      const at2x = (y: number, x: number) => r.pixels2x[(m.row * 16 + y) * 464 + (m.col * 16 + x)];
      let noiseOk = true;
      let cellsUniform = true;
      let grayPixels = 0;
      for (let y = 0; y < NOISE_SIZE_2X; y++)
        for (let x = 0; x < NOISE_SIZE_2X; x++) {
          const v = at2x(y, x);
          const one = r.noiseBitsString[Math.floor(y / cell2) * m.grid + Math.floor(x / cell2)] === '1';
          if (v !== (one ? m.gray : 255)) noiseOk = false;
          if (one && v === m.gray) grayPixels++;
          if (v !== at2x(Math.floor(y / cell2) * cell2, Math.floor(x / cell2) * cell2)) cellsUniform = false;
        }
      check(`${label}: ${m.grid * m.grid} noise values, each a ${cell2}x${cell2} px cell in the 2x PNG`, r.noiseBitsString.length === m.grid * m.grid && r.noiseGridSize === m.grid && r.noiseCell2xPx === cell2 && cellsUniform);
      check(`${label}: the 112x112 px block of the 2x PNG is exactly the noise grid (watermark never touches it)`, noiseOk);
      check(`${label}: the gray level is on the black pixels only (${grayPixels} of ${r.noiseBlackPixels}; ${r.noiseBlackCells} black values x ${cell2 * cell2})`, grayPixels === r.noiseBlackPixels && r.noiseBlackPixels === r.noiseBlackCells * cell2 * cell2);
      check(`${label}: 2x pixels identical to the reference`, sha(r.pixels2x) === m.pixels2xSha);
      let oneXOk = true; // the 1x block is the 2x2 average of the 2x block, truncated (exact for the 28 and 56 grids)
      for (let y = 0; y < NOISE_SIZE; y++)
        for (let x = 0; x < NOISE_SIZE; x++) {
          const sum = at2x(2 * y, 2 * x) + at2x(2 * y, 2 * x + 1) + at2x(2 * y + 1, 2 * x) + at2x(2 * y + 1, 2 * x + 1);
          if (r.pixels1x[(m.row * 8 + y) * CANONICAL_SIZE + (m.col * 8 + x)] !== Math.floor(sum / 4)) oneXOk = false;
        }
      check(`${label}: the 1x block is the 2x2 average of the 2x block`, oneXOk);

      // outside the noise block, identical to the standard SQR of the same settings
      const std = generateSqrPoc({ prefix: PREFIX, fingerprintId: fx.id, strength: 120, mmSize: 10, colour: m.colour, coeffPairs: PAIRS[m.pairs] });
      let outsideOk = true;
      for (let y = 0; y < CANONICAL_SIZE && outsideOk; y++)
        for (let x = 0; x < CANONICAL_SIZE; x++)
          if (!inBlock(y, x, m.row, m.col) && r.pixels1x[y * CANONICAL_SIZE + x] !== std.pixels1x[y * CANONICAL_SIZE + x]) { outsideOk = false; break; }
      check(`${label}: every pixel outside the noise block equals the standard SQR`, outsideOk);
      let outside2xOk = true;
      for (let y = 0; y < 464 && outside2xOk; y++)
        for (let x = 0; x < 464; x++)
          if (!inBlock2x(y, x, m.row, m.col) && r.pixels2x[y * 464 + x] !== std.pixels2x[y * 464 + x]) { outside2xOk = false; break; }
      check(`${label}: every 2x pixel outside the noise block equals the standard SQR`, outside2xOk);

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

  // The grid option (28, 56, 112): same block, different resolution, nothing else changes
  const mk = (grid: NoiseGridSize) => generateSqrNoisePoc({ prefix: PREFIX, fingerprintId: sample.id, strength: 120, mmSize: 10, noiseGray: 64, noiseGridSize: grid });
  const g28 = mk(28), g56 = mk(56), g112 = mk(112);
  check('grid size defaults to 56 and the options are 28, 56 and 112', DEFAULT_NOISE_GRID_SIZE === 56 && NOISE_GRID_SIZES.join(',') === '28,56,112' && a.noiseGridSize === 56 && a.noiseCell2xPx === 2);
  check('noiseBitCount: 784 for 28, 3136 for 56, 12544 for 112', noiseBitCount(28) === 784 && noiseBitCount(56) === 3136 && noiseBitCount(112) === 12544);
  check('values per grid: 784, 3136, 12544; pixels per value in the 2x PNG: 4, 2, 1',
    g28.noiseBitsString.length === 784 && g56.noiseBitsString.length === 3136 && g112.noiseBitsString.length === 12544
    && g28.noiseCell2xPx === 4 && g56.noiseCell2xPx === 2 && g112.noiseCell2xPx === 1 && g28.noiseGridSize === 28 && g112.noiseGridSize === 112);
  check('same seed and stream, from draw 0: every grid is a prefix of the standard stream and of the larger grids',
    g28.noiseBitsString === g28.fullBinaryString.slice(0, 784) && g28.noiseBitsString === g56.noiseBitsString.slice(0, 784)
    && g56.noiseBitsString === g112.noiseBitsString.slice(0, 3136) && g112.noiseBitsString.slice(0, 841) === g112.fullBinaryString);
  check('switching the grid keeps the reference string, the mask, the counts and the 792 watermarked modules', [g28, g112].every((g) =>
    g56.refBinaryString === g.refBinaryString && g56.maskString === g.maskString && g.selectedCount === 792 && g56.counts.black === g.counts.black));
  check('switching the grid changes only the noise block: every 1x and 2x pixel outside it is identical', (() => {
    for (const g of [g28, g112]) {
      for (let y = 0; y < CANONICAL_SIZE; y++) for (let x = 0; x < CANONICAL_SIZE; x++)
        if (!inBlock(y, x, 9, 11) && g56.pixels1x[y * CANONICAL_SIZE + x] !== g.pixels1x[y * CANONICAL_SIZE + x]) return false;
      for (let y = 0; y < 464; y++) for (let x = 0; x < 464; x++)
        if (!inBlock2x(y, x, 9, 11) && g56.pixels2x[y * 464 + x] !== g.pixels2x[y * 464 + x]) return false;
    }
    return true;
  })());
  check('the three noise blocks are different patterns', (() => {
    const diff = (p: SqrNoiseOut, q: SqrNoiseOut) => { let d = 0; for (let y = 144; y < 256; y++) for (let x = 176; x < 288; x++) if (p.pixels2x[y * 464 + x] !== q.pixels2x[y * 464 + x]) d++; return d; };
    return diff(g28, g56) > 1000 && diff(g56, g112) > 1000 && diff(g28, g112) > 1000;
  })());
  check('the 28 and 56 grids: the whole 2x image is exactly the nearest-neighbour upscale of the 1x image', [g28, g56].every((g) => {
    for (let y = 0; y < 464; y++) for (let x = 0; x < 464; x++) if (g.pixels2x[y * 464 + x] !== g.pixels1x[(y >> 1) * CANONICAL_SIZE + (x >> 1)]) return false;
    return true;
  }));
  check('the 112 grid: the 2x image is the nearest-neighbour upscale everywhere except inside the noise block', (() => {
    let inside = 0;
    for (let y = 0; y < 464; y++) for (let x = 0; x < 464; x++) {
      const up = g112.pixels1x[(y >> 1) * CANONICAL_SIZE + (x >> 1)];
      if (g112.pixels2x[y * 464 + x] !== up) { if (!inBlock2x(y, x, 9, 11)) return false; inside++; }
    }
    return inside > 1000;
  })());
  check('buildNoiseGrid2x: value (r,c) fills a (112/grid) square of pixels, for the 28, 56 and 112 grids', (() => {
    const px = (g: Uint8Array, y: number, x: number) => g[y * 112 + x];
    const b28 = new Uint8Array(784); b28[0] = 1; b28[28 * 3 + 5] = 1; b28[783] = 1;
    const g = buildNoiseGrid2x(b28, 90, 28);
    const ok28 = px(g, 0, 0) === 90 && px(g, 3, 3) === 90 && px(g, 0, 4) === 255 && px(g, 4, 0) === 255 && px(g, 12, 20) === 90 && px(g, 15, 23) === 90 && px(g, 12, 24) === 255 && px(g, 111, 111) === 90 && px(g, 108, 108) === 90 && px(g, 107, 107) === 255;
    const b56 = new Uint8Array(3136); b56[0] = 1; b56[56 * 2 + 7] = 1;
    const h = buildNoiseGrid2x(b56, 90, 56);
    const ok56 = px(h, 0, 0) === 90 && px(h, 1, 1) === 90 && px(h, 0, 2) === 255 && px(h, 4, 14) === 90 && px(h, 5, 15) === 90 && px(h, 4, 16) === 255;
    const b112 = new Uint8Array(12544); b112[0] = 1; b112[112 * 5 + 9] = 1; b112[12543] = 1;
    const k = buildNoiseGrid2x(b112, 90, 112);
    const ok112 = px(k, 0, 0) === 90 && px(k, 0, 1) === 255 && px(k, 1, 0) === 255 && px(k, 5, 9) === 90 && px(k, 5, 10) === 255 && px(k, 111, 111) === 90 && px(k, 111, 110) === 255;
    return ok28 && ok56 && ok112;
  })());
  check('buildNoiseGrid (1x block): exact for the 28 grid (2 x 2 px per value), the 2x2 average (truncated) for the 112 grid', (() => {
    const b28 = new Uint8Array(784); b28[0] = 1; b28[28 * 3 + 5] = 1; b28[783] = 1;
    const g = buildNoiseGrid(b28, 90, 28);
    const px = (y: number, x: number) => g[y * 56 + x];
    const ok28 = px(0, 0) === 90 && px(0, 1) === 90 && px(1, 0) === 90 && px(1, 1) === 90 && px(0, 2) === 255 && px(2, 0) === 255 && px(6, 10) === 90 && px(7, 11) === 90 && px(6, 12) === 255 && px(55, 55) === 90 && px(54, 54) === 90 && px(54, 52) === 255;
    const b112 = new Uint8Array(12544); b112[0] = 1; // one black value in the top-left 2x2 group: (90 + 255 + 255 + 255) / 4 = 213.75 -> 213
    const h = buildNoiseGrid(b112, 90, 112);
    b112[1] = 1; b112[112] = 1; b112[113] = 1; // all four black: 90
    const h2 = buildNoiseGrid(b112, 90, 112);
    return ok28 && h[0] === Math.floor((90 + 765) / 4) && h[1] === 255 && h2[0] === 90;
  })());
  check('noise grid sizes other than 28, 56 and 112 are rejected', [0, 14, 27, 55, 57, 111, 113, 224, Number.NaN].every((n) => throws(() => validateNoiseGridSize(n)) && throws(() => generateSqrNoisePoc({ prefix: PREFIX, fingerprintId: sample.id, strength: 120, mmSize: 10, noiseGray: 64, noiseGridSize: n as unknown as NoiseGridSize }))));
  check('noise grid sizes 28, 56 and 112 are accepted', [28, 56, 112].every((n) => !throws(() => validateNoiseGridSize(n))));
  check('the error message lists the options', (() => { try { validateNoiseGridSize(30); return false; } catch (e) { return e instanceof Error && e.message.includes('28, 56 or 112'); } })());

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