import Link from "next/link";

export default function Home() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16">
      <div className="relative overflow-hidden rounded-lg border border-neutral-800 mb-10">
        <div className="absolute inset-0 mosaic-accent" />
        <div className="relative px-8 py-12">
          <h1 className="text-4xl font-bold text-neutral-50 tracking-tight">Covert Code</h1>
          <p className="text-sm text-neutral-400 mt-3 max-w-md leading-relaxed">
            Frequency-domain image watermarking. Hide an 8-character message inside any photo
            using DCT coefficient encoding, protected with BCH error correction so corrupted or
            unwatermarked images are rejected rather than misread.
          </p>
        </div>
        <div className="h-1 w-full stripe-accent" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/encode"
          className="group border border-neutral-800 rounded-lg p-6 hover:border-red-600 transition-colors"
        >
          <h2 className="text-lg font-semibold text-neutral-50 group-hover:text-red-400">Encode</h2>
          <p className="text-sm text-neutral-500 mt-2 leading-relaxed">
            Upload any image, any resolution. Set your secret, strength, seed, and coefficient pair.
          </p>
        </Link>
        <Link
          href="/decode"
          className="group border border-neutral-800 rounded-lg p-6 hover:border-red-600 transition-colors"
        >
          <h2 className="text-lg font-semibold text-neutral-50 group-hover:text-red-400">Decode</h2>
          <p className="text-sm text-neutral-500 mt-2 leading-relaxed">
            Upload an image, or scan a printed marker live with your camera.
          </p>
        </Link>
      </div>

      <div className="mt-12">
        <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wide mb-3">Liquor POC</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            href="/liquor/encode"
            className="group border border-neutral-800 rounded-lg p-6 hover:border-red-600 transition-colors"
          >
            <h3 className="text-lg font-semibold text-neutral-50 group-hover:text-red-400">Encode</h3>
            <p className="text-sm text-neutral-500 mt-2 leading-relaxed">
              Plain 1024-bit DCT embedding — no BCH, no error correction. Strength, seed, and a single
              coefficient pair; outputs the encoded image plus the raw bit string for authentication.
            </p>
          </Link>
        </div>
      </div>
      
      <div className="mt-12">
        <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wide mb-3">SQR</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            href="/sqr-poc"
            className="group border border-neutral-800 rounded-lg p-6 hover:border-red-600 transition-colors"
          >
            <h3 className="text-lg font-semibold text-neutral-50 group-hover:text-red-400">Generate</h3>
            <p className="text-sm text-neutral-500 mt-2 leading-relaxed">
              Secure-QR as generated on the backend (Version 3, 29x29 modules). Counts the black and
              white modules, watermarks only the black or only the white ones, and outputs the 2x PNG
              plus the reference binary string. The fingerprint ID is the seed.
            </p>
                    </Link>
        </div>
      </div>
      
      <div className="mt-12">
        <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wide mb-3">SQR + Noise</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            href="/sqr-noise-poc"
            className="group border border-neutral-800 rounded-lg p-6 hover:border-red-600 transition-colors"
          >
            <h3 className="text-lg font-semibold text-neutral-50 group-hover:text-red-400">Hybrid</h3>
            <p className="text-sm text-neutral-500 mt-2 leading-relaxed">
              Secure-QR with a 56x56 pixel noise grid in place of the centre 7x7 modules, generated from the
              same seed as the watermark. Only the other 792 modules are watermarked. The black pixels of the
              noise take a gray level of your choice. Outputs the 2x grayscale PNG, the 792-bit reference string
              and the 3136-bit noise grid.
            </p>
          </Link>
        </div>
      </div>
    </main>
  );
}
