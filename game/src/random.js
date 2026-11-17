// A tiny seeded random generator (mulberry32). The world draws every random number
// from one of these, so a seed fully determines a run — that is what makes the
// screenshot scenes reproducible frame for frame.

export function createRandom(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    /** Float in [min, max). */
    range: (min, max) => min + next() * (max - min),
    /** Integer in [min, max]. */
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    /** True with probability p. */
    chance: (p) => next() < p,
    /** One element of the array. */
    pick: (items) => items[Math.floor(next() * items.length)],
    /** -1 or +1. */
    sign: () => (next() < 0.5 ? -1 : 1),
  };
}
