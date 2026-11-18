/** Windowed radix-2 FFT, log-spaced 50Hz–16kHz bars. One small window at a time. */
export function spectrum(channels: Float32Array[], rate: number, bands = 32): number[] {
  const n = 1024,
    result = new Array<number>(bands).fill(0);
  for (const samples of channels) {
    const re = new Float64Array(n),
      im = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let reversed = 0;
      for (let bit = 0, x = i; bit < 10; bit++, x >>= 1) reversed = (reversed << 1) | (x & 1);
      re[reversed] = (samples[i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
    }
    for (let size = 2; size <= n; size *= 2) {
      for (let start = 0; start < n; start += size) {
        for (let j = 0; j < size / 2; j++) {
          const angle = (-2 * Math.PI * j) / size,
            a = start + j,
            b = a + size / 2;
          const real = re[b] * Math.cos(angle) - im[b] * Math.sin(angle);
          const imaginary = re[b] * Math.sin(angle) + im[b] * Math.cos(angle);
          re[b] = re[a] - real;
          im[b] = im[a] - imaginary;
          re[a] += real;
          im[a] += imaginary;
        }
      }
    }
    const ceiling = Math.min(16000, rate / 2);
    for (let b = 0; b < bands; b++) {
      const from = Math.max(1, Math.floor((50 * (ceiling / 50) ** (b / bands) * n) / rate));
      const to = Math.min(
        n / 2,
        Math.max(from + 1, Math.ceil((50 * (ceiling / 50) ** ((b + 1) / bands) * n) / rate)),
      );
      let peak = 0;
      for (let k = from; k < to; k++) peak = Math.max(peak, (Math.hypot(re[k], im[k]) * 4) / n);
      const db = 20 * Math.log10(Math.max(1e-6, peak));
      result[b] = Math.max(result[b], Math.round(255 * Math.max(0, Math.min(1, (db + 65) / 65))));
    }
  }
  return result;
}
