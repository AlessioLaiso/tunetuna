// MDX-Net (UVR) vocal separation DSP: STFT framing, chunking and reconstruction
// around an ONNX model that maps a mixture spectrogram to a vocal spectrogram.
// Mirrors UVR's MDX pipeline (torch.stft/istft, center=True, periodic Hann window).

export interface MdxConfig {
  nFft: number
  hop: number
  dimF: number
  dimT: number
  compensate: number
}

// Kim_Vocal_2: input/output tensor [1, 4, 3072, 256]
export const KIM_VOCAL_2: MdxConfig = {
  nFft: 7680,
  hop: 1024,
  dimF: 3072,
  dimT: 256,
  compensate: 1.009,
}

export const MDX_SAMPLE_RATE = 44100

/** Samples of output per model chunk once the context on either side is trimmed */
export const getSegmentLength = (cfg: MdxConfig = KIM_VOCAL_2) => cfg.hop * (cfg.dimT - 1) - cfg.nFft

/**
 * Complex FFT for sizes of the form 2^k * m (small odd m), e.g. 7680 = 512 * 15.
 * Splits the input into m interleaved radix-2 FFTs and combines them with a
 * direct m-point twiddle sum.
 */
export class MixedRadixFFT {
  readonly n: number
  private readonly m: number
  private readonly p: number
  private readonly cos: Float64Array
  private readonly sin: Float64Array
  private readonly bitrev: Uint32Array
  private readonly subRe: Float64Array
  private readonly subIm: Float64Array

  constructor(n: number) {
    let p = 1
    while (n % (p * 2) === 0) p *= 2
    this.n = n
    this.p = p
    this.m = n / p
    this.cos = new Float64Array(n)
    this.sin = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      this.cos[i] = Math.cos((2 * Math.PI * i) / n)
      this.sin[i] = Math.sin((2 * Math.PI * i) / n)
    }
    const bits = Math.log2(p)
    this.bitrev = new Uint32Array(p)
    for (let i = 0; i < p; i++) {
      let r = 0
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b)
      this.bitrev[i] = r
    }
    this.subRe = new Float64Array(n)
    this.subIm = new Float64Array(n)
  }

  /** In-place forward (sign -1) or inverse (sign +1, unscaled) transform */
  transform(re: Float64Array, im: Float64Array, inverse = false): void {
    const { n, m, p, cos, sin, bitrev, subRe, subIm } = this
    const sign = inverse ? 1 : -1

    // Sub-sequence r holds x[r], x[r+m], x[r+2m], ... in bit-reversed order
    for (let r = 0; r < m; r++) {
      const base = r * p
      for (let j = 0; j < p; j++) {
        const src = r + bitrev[j] * m
        subRe[base + j] = re[src]
        subIm[base + j] = im[src]
      }
      // Iterative radix-2 FFT of length p; twiddle W_p^k = W_n^(k*m)
      for (let size = 2; size <= p; size *= 2) {
        const half = size / 2
        const step = (n / size)
        for (let start = 0; start < p; start += size) {
          for (let k = 0; k < half; k++) {
            const t = k * step
            const wr = cos[t]
            const wi = sign * sin[t]
            const a = base + start + k
            const b = a + half
            const xr = subRe[b] * wr - subIm[b] * wi
            const xi = subRe[b] * wi + subIm[b] * wr
            subRe[b] = subRe[a] - xr
            subIm[b] = subIm[a] - xi
            subRe[a] += xr
            subIm[a] += xi
          }
        }
      }
    }

    // X[k] = sum_r W_n^(r*k) * F_r[k mod p]
    for (let k = 0; k < n; k++) {
      const kp = k % p
      let accRe = 0
      let accIm = 0
      let t = 0
      for (let r = 0; r < m; r++) {
        const fr = subRe[r * p + kp]
        const fi = subIm[r * p + kp]
        const wr = cos[t]
        const wi = sign * sin[t]
        accRe += fr * wr - fi * wi
        accIm += fr * wi + fi * wr
        t += k
        if (t >= n) t -= n
      }
      re[k] = accRe
      im[k] = accIm
    }
  }
}

function reflectIndex(i: number, len: number): number {
  if (len === 1) return 0
  const period = 2 * (len - 1)
  i = ((i % period) + period) % period
  return i < len ? i : period - i
}

/**
 * Separates one chunk: STFT of a stereo window -> model -> iSTFT.
 * Input chunks are hop * (dimT - 1) samples per channel.
 */
export class MdxChunkProcessor {
  readonly chunkSize: number
  private readonly fft: MixedRadixFFT
  private readonly window: Float64Array
  private readonly re: Float64Array
  private readonly im: Float64Array
  private readonly envelope: Float64Array

  constructor(private readonly cfg: MdxConfig) {
    this.chunkSize = cfg.hop * (cfg.dimT - 1)
    this.fft = new MixedRadixFFT(cfg.nFft)
    this.window = new Float64Array(cfg.nFft)
    for (let i = 0; i < cfg.nFft; i++) {
      this.window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / cfg.nFft)
    }
    this.re = new Float64Array(cfg.nFft)
    this.im = new Float64Array(cfg.nFft)

    // Squared-window overlap-add envelope for iSTFT normalization (full padded signal)
    const padded = this.chunkSize + cfg.nFft
    this.envelope = new Float64Array(padded)
    for (let t = 0; t < cfg.dimT; t++) {
      const off = t * cfg.hop
      for (let i = 0; i < cfg.nFft; i++) this.envelope[off + i] += this.window[i] * this.window[i]
    }
  }

  /** Builds the [4, dimF, dimT] model input (L re, L im, R re, R im) */
  stft(left: Float32Array, right: Float32Array, out: Float32Array): void {
    const { nFft, hop, dimF, dimT } = this.cfg
    const { re, im, window, fft } = this
    const half = nFft / 2
    const len = left.length
    const plane = dimF * dimT

    for (let t = 0; t < dimT; t++) {
      // Pack both real channels into one complex FFT: z = l + i*r
      const start = t * hop - half
      for (let i = 0; i < nFft; i++) {
        const idx = reflectIndex(start + i, len)
        re[i] = left[idx] * window[i]
        im[i] = right[idx] * window[i]
      }
      fft.transform(re, im)
      // Unpack: L[k] = (Z[k] + conj(Z[N-k])) / 2, R[k] = (Z[k] - conj(Z[N-k])) / 2i
      for (let f = 0; f < dimF; f++) {
        const nk = f === 0 ? 0 : nFft - f
        const zr = re[f], zi = im[f], cr = re[nk], ci = -im[nk]
        const o = f * dimT + t
        // First 3 bins are zeroed, as in UVR
        if (f < 3) {
          out[o] = 0; out[plane + o] = 0; out[2 * plane + o] = 0; out[3 * plane + o] = 0
          continue
        }
        out[o] = (zr + cr) / 2
        out[plane + o] = (zi + ci) / 2
        out[2 * plane + o] = (zi - ci) / 2
        out[3 * plane + o] = -(zr - cr) / 2
      }
    }
  }

  /** Inverts a [4, dimF, dimT] spectrogram back to stereo samples (chunkSize each) */
  istft(spec: Float32Array, outLeft: Float32Array, outRight: Float32Array): void {
    const { nFft, hop, dimF, dimT } = this.cfg
    const { re, im, window, fft, envelope } = this
    const half = nFft / 2
    const plane = dimF * dimT
    const padded = this.chunkSize + nFft
    const accL = new Float64Array(padded)
    const accR = new Float64Array(padded)

    for (let t = 0; t < dimT; t++) {
      // Rebuild Z = L + i*R over the full Hermitian spectrum; bins >= dimF are zero
      re.fill(0)
      im.fill(0)
      for (let f = 0; f < dimF; f++) {
        const o = f * dimT + t
        const lr = spec[o], li = spec[plane + o], rr = spec[2 * plane + o], ri = spec[3 * plane + o]
        // Z[f] = L[f] + i R[f]
        re[f] += lr - ri
        im[f] += li + rr
        if (f > 0) {
          // Z[N-f] = conj(L[f]) + i conj(R[f])
          const nk = nFft - f
          re[nk] += lr + ri
          im[nk] += -li + rr
        }
      }
      fft.transform(re, im, true)
      const off = t * hop
      for (let i = 0; i < nFft; i++) {
        const w = window[i] / nFft
        accL[off + i] += re[i] * w
        accR[off + i] += im[i] * w
      }
    }

    for (let i = 0; i < this.chunkSize; i++) {
      const env = envelope[i + half]
      const norm = env > 1e-11 ? 1 / env : 0
      outLeft[i] = accL[i + half] * norm
      outRight[i] = accR[i + half] * norm
    }
  }
}

export type RunModel = (input: Float32Array) => Promise<Float32Array>

/**
 * Separates vocals from a stereo 44.1kHz mixture one segment at a time, so results
 * can be used before the whole track is done. Each model chunk keeps nFft/2 samples
 * of context on either side, which are trimmed after inference; segment i covers
 * samples [i * segmentLength, (i + 1) * segmentLength) of the input.
 * The instrumental is mixture - vocals.
 */
export class MdxSeparator {
  readonly segmentLength: number
  readonly segmentCount: number
  private readonly proc: MdxChunkProcessor
  private readonly trim: number
  private readonly length: number
  private readonly mixLeft: Float32Array
  private readonly mixRight: Float32Array
  private readonly input: Float32Array
  private readonly outLeft: Float32Array
  private readonly outRight: Float32Array

  constructor(left: Float32Array, right: Float32Array, private readonly cfg: MdxConfig = KIM_VOCAL_2) {
    this.proc = new MdxChunkProcessor(cfg)
    this.trim = cfg.nFft / 2
    this.segmentLength = getSegmentLength(cfg)
    this.length = left.length
    this.segmentCount = Math.max(1, Math.ceil(this.length / this.segmentLength))

    const total = this.segmentCount * this.segmentLength + 2 * this.trim
    this.mixLeft = new Float32Array(total)
    this.mixRight = new Float32Array(total)
    this.mixLeft.set(left, this.trim)
    this.mixRight.set(right, this.trim)
    this.input = new Float32Array(4 * cfg.dimF * cfg.dimT)
    this.outLeft = new Float32Array(this.proc.chunkSize)
    this.outRight = new Float32Array(this.proc.chunkSize)
  }

  async separateSegment(index: number, runModel: RunModel): Promise<[Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>]> {
    const { proc, trim, segmentLength, cfg } = this
    const start = index * segmentLength
    const chunk = proc.chunkSize
    proc.stft(this.mixLeft.subarray(start, start + chunk), this.mixRight.subarray(start, start + chunk), this.input)
    const spec = await runModel(this.input)
    proc.istft(spec, this.outLeft, this.outRight)

    const count = Math.min(segmentLength, this.length - start)
    const vocalsLeft = new Float32Array(count)
    const vocalsRight = new Float32Array(count)
    for (let j = 0; j < count; j++) {
      vocalsLeft[j] = this.outLeft[trim + j] * cfg.compensate
      vocalsRight[j] = this.outRight[trim + j] * cfg.compensate
    }
    return [vocalsLeft, vocalsRight]
  }
}
