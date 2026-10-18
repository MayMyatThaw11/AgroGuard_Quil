const MODULUS = 2147483647;
const MULTIPLIER = 16807;

export function lcg(seed: number): () => number {
  let state = Math.floor(seed) % MODULUS;
  if (state <= 0) state += MODULUS - 1;
  return () => {
    state = (state * MULTIPLIER) % MODULUS;
    return (state - 1) / (MODULUS - 1);
  };
}
