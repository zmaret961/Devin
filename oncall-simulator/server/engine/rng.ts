export type Rng = () => number;

/** Small deterministic PRNG (mulberry32) so every run is reproducible from its seed. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const int = (rng: Rng, min: number, max: number) => Math.floor(rng() * (max - min + 1)) + min;
export const pick = <T>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)];
export const hex = (rng: Rng, len: number) => Array.from({ length: len }, () => Math.floor(rng() * 16).toString(16)).join('');

/** Sample from Beta(a, b) via two Gamma draws (Marsaglia–Tsang), used for Thompson sampling. */
export function betaSample(rng: Rng, a: number, b: number): number {
  const x = gammaSample(rng, a);
  const y = gammaSample(rng, b);
  return x / (x + y);
}

function gammaSample(rng: Rng, k: number): number {
  if (k < 1) return gammaSample(rng, k + 1) * Math.pow(rng(), 1 / k);
  const d = k - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      const u1 = rng() || 1e-9;
      const u2 = rng();
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
