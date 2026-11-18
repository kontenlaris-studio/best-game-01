// VOIDLIGHT tuning: every number that shapes how the game feels lives here, so the
// world, the renderer and the screenshot scenes all agree on the same arena.

export const VIEW = { width: 1280, height: 800 };

export const STEP = 1 / 120; // fixed simulation step, seconds

export const PLAYER = {
  radius: 14,
  speed: 335, // px per second
  hull: 100, // hit points; the run ends at zero
  fireInterval: 0.16, // seconds between shots at base rate
  bulletSpeed: 780,
  bulletDamage: 34,
  bulletRadius: 5,
  invulnerableSeconds: 1.0, // mercy window after taking a hit
};

export const WAVES_TOTAL = 12; // clear the twelfth wave to win

export const ENEMY = {
  // kind: [radius, hull, speed, contact damage, score]
  shard: { radius: 16, hull: 34, speed: 118, damage: 9, score: 50 },
  darter: { radius: 12, hull: 24, speed: 205, damage: 7, score: 80 },
  weaver: { radius: 15, hull: 48, speed: 132, damage: 10, score: 110 },
  brute: { radius: 34, hull: 340, speed: 56, damage: 20, score: 600 },
};

export const PICKUP = {
  radius: 13,
  lifetime: 11, // seconds before an unclaimed pickup fades
  healAmount: 26,
  rapidSeconds: 7,
  shieldSeconds: 6,
  dropChance: 0.16,
};

export const COLORS = {
  void: '#0a0a20',
  nebulaA: '#2a1a5e',
  nebulaB: '#0e3a5e',
  player: '#8ff7ff',
  playerCore: '#ffffff',
  bullet: '#ffe066',
  shard: '#ff5d8f',
  darter: '#ffb84d',
  weaver: '#b98cff',
  brute: '#ff4d5e',
  pickupHeal: '#5dff9d',
  pickupRapid: '#ffd75d',
  pickupShield: '#5db9ff',
  text: '#f2f9ff',
  textDim: '#a9bde0',
  danger: '#ff5d6c',
};
