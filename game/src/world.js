// The VOIDLIGHT simulation: one wisp of light against the shard swarm. Everything
// the renderer draws and every rule the player feels is decided here, in fixed
// steps, from a seeded random source — the same seed always plays the same run.

import { COLORS, ENEMY, PICKUP, PLAYER, VIEW, WAVES_TOTAL } from './config.js';
import { createRandom } from './random.js';

const TAU = Math.PI * 2;

export const PHASE = { INTERMISSION: 'intermission', ACTIVE: 'active' };

function distanceSquared(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export class World {
  constructor(seed = 1) {
    this.reset(seed);
  }

  reset(seed) {
    this.rng = createRandom(seed);
    this.time = 0;
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.kills = 0;
    this.wave = 0;
    this.waveStartedAt = -10;
    this.phase = PHASE.INTERMISSION;
    this.phaseTimer = 1.6; // a breath before wave 1
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.shake = 0;
    this.over = false;
    this.won = false;
    this.events = []; // sound cues for the shell: 'shoot', 'boom', ...
    this.player = {
      x: VIEW.width / 2,
      y: VIEW.height / 2,
      vx: 0,
      vy: 0,
      hull: PLAYER.hull,
      fireCooldown: 0,
      invulnerableUntil: -1,
      rapidUntil: -1,
      shieldUntil: -1,
      alive: true,
    };
    this.bullets = [];
    this.orbs = []; // enemy shots
    this.enemies = [];
    this.particles = [];
    this.floaters = [];
    this.pickups = [];
  }

  get multiplier() {
    return 1 + Math.min(4, Math.floor(this.combo / 8));
  }

  /** Build the spawn queue for a wave: more shards each wave, new kinds join in turn. */
  planWave(wave) {
    const queue = [];
    const add = (kind, count) => {
      for (let i = 0; i < count; i += 1) queue.push(kind);
    };
    add('shard', 4 + wave * 2);
    if (wave >= 2) add('darter', wave + 1);
    if (wave >= 3) add('weaver', Math.floor(wave * 0.9));
    if (wave % 4 === 0) add('brute', wave / 4);
    // Shuffle so kinds arrive mixed, not in blocks.
    for (let i = queue.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.rng.next() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
    return queue;
  }

  beginWave() {
    this.wave += 1;
    this.spawnQueue = this.planWave(this.wave);
    this.spawnTimer = 0.4;
    this.phase = PHASE.ACTIVE;
    this.waveStartedAt = this.time;
    this.events.push('wave');
  }

  /** A point on the arena edge, kept away from the player so spawns feel fair. */
  spawnPoint() {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const side = this.rng.int(0, 3);
      const point =
        side === 0
          ? { x: this.rng.range(0, VIEW.width), y: -30 }
          : side === 1
            ? { x: VIEW.width + 30, y: this.rng.range(0, VIEW.height) }
            : side === 2
              ? { x: this.rng.range(0, VIEW.width), y: VIEW.height + 30 }
              : { x: -30, y: this.rng.range(0, VIEW.height) };
      if (distanceSquared(point.x, point.y, this.player.x, this.player.y) > 300 * 300) return point;
    }
    return { x: 40, y: 40 };
  }

  spawnEnemy(kind) {
    const spec = ENEMY[kind];
    const point = this.spawnPoint();
    this.enemies.push({
      kind,
      x: point.x,
      y: point.y,
      vx: 0,
      vy: 0,
      hull: spec.hull,
      maxHull: spec.hull,
      radius: spec.radius,
      age: 0,
      phase: this.rng.range(0, TAU),
      fireTimer: this.rng.range(1.2, 2.6),
      dashTimer: this.rng.range(0.8, 1.8),
      dashTime: 0,
      dashVx: 0,
      dashVy: 0,
    });
  }

  burst(x, y, color, count, speed, size, life = 0.55) {
    for (let i = 0; i < count; i += 1) {
      const angle = this.rng.range(0, TAU);
      const velocity = this.rng.range(speed * 0.25, speed);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life: this.rng.range(life * 0.4, life),
        maxLife: life,
        size: this.rng.range(size * 0.5, size),
        color,
      });
    }
  }

  floater(x, y, text, color) {
    this.floaters.push({ x, y, text, color, life: 0.9 });
  }

  /** Advance the whole world by one fixed step. `control` is the player's intent. */
  step(dt, control) {
    if (this.over || this.won) {
      this.updateParticles(dt);
      return;
    }
    this.time += dt;
    this.stepPlayer(dt, control);
    this.stepWaves(dt);
    this.stepEnemies(dt);
    this.stepProjectiles(dt);
    this.stepPickups(dt);
    this.updateParticles(dt);
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }
    this.shake = Math.max(0, this.shake - dt * 26);
  }

  stepPlayer(dt, control) {
    const player = this.player;
    const length = Math.hypot(control.moveX, control.moveY) || 1;
    const targetVx = (control.moveX / length) * PLAYER.speed * (control.moveX !== 0 || control.moveY !== 0 ? 1 : 0);
    const targetVy = (control.moveY / length) * PLAYER.speed * (control.moveX !== 0 || control.moveY !== 0 ? 1 : 0);
    const blend = 1 - Math.pow(0.0001, dt); // snappy but not teleporting
    player.vx += (targetVx - player.vx) * blend;
    player.vy += (targetVy - player.vy) * blend;
    player.x = Math.min(VIEW.width - PLAYER.radius, Math.max(PLAYER.radius, player.x + player.vx * dt));
    player.y = Math.min(VIEW.height - PLAYER.radius, Math.max(PLAYER.radius, player.y + player.vy * dt));

    // Engine trail: a short ribbon of fading sparks behind the wisp.
    if (Math.abs(player.vx) + Math.abs(player.vy) > 40 && this.rng.chance(0.65)) {
      this.particles.push({
        x: player.x - player.vx * 0.04,
        y: player.y - player.vy * 0.04,
        vx: -player.vx * 0.25 + this.rng.range(-24, 24),
        vy: -player.vy * 0.25 + this.rng.range(-24, 24),
        life: this.rng.range(0.2, 0.42),
        maxLife: 0.42,
        size: this.rng.range(2, 5),
        color: COLORS.player,
      });
    }

    player.fireCooldown -= dt;
    if (control.firing && player.fireCooldown <= 0) {
      const interval = this.time < player.rapidUntil ? PLAYER.fireInterval * 0.45 : PLAYER.fireInterval;
      player.fireCooldown = interval;
      const angle = Math.atan2(control.aimY - player.y, control.aimX - player.x);
      const spread = this.rng.range(-0.035, 0.035);
      this.bullets.push({
        x: player.x + Math.cos(angle) * (PLAYER.radius + 6),
        y: player.y + Math.sin(angle) * (PLAYER.radius + 6),
        vx: Math.cos(angle + spread) * PLAYER.bulletSpeed,
        vy: Math.sin(angle + spread) * PLAYER.bulletSpeed,
        life: 1.1,
      });
      this.events.push('shoot');
    }
  }

  stepWaves(dt) {
    if (this.phase === PHASE.INTERMISSION) {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) this.beginWave();
      return;
    }
    if (this.spawnQueue.length > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = Math.max(0.24, 0.62 - this.wave * 0.03);
        this.spawnEnemy(this.spawnQueue.pop());
      }
    } else if (this.enemies.length === 0) {
      // Wave cleared: bank a bonus and breathe before the next.
      const bonus = 100 + this.wave * 25;
      this.score += bonus;
      this.floater(this.player.x, this.player.y - 44, `WAVE ${this.wave} CLEAR  +${bonus}`, COLORS.pickupHeal);
      if (this.wave >= WAVES_TOTAL) {
        this.won = true;
        this.events.push('victory');
        return;
      }
      this.phase = PHASE.INTERMISSION;
      this.phaseTimer = 2.6;
    }
  }

  stepEnemies(dt) {
    const player = this.player;
    for (const enemy of this.enemies) {
      enemy.age += dt;
      const spec = ENEMY[enemy.kind];
      const toPlayer = Math.atan2(player.y - enemy.y, player.x - enemy.x);
      let vx = Math.cos(toPlayer) * spec.speed;
      let vy = Math.sin(toPlayer) * spec.speed;

      if (enemy.kind === 'weaver') {
        const sway = Math.sin(enemy.age * 3.1 + enemy.phase) * 0.85;
        vx += Math.cos(toPlayer + Math.PI / 2) * spec.speed * sway;
        vy += Math.sin(toPlayer + Math.PI / 2) * spec.speed * sway;
        enemy.fireTimer -= dt;
        if (enemy.fireTimer <= 0 && distanceSquared(enemy.x, enemy.y, player.x, player.y) < 520 * 520) {
          enemy.fireTimer = this.rng.range(2.4, 3.6);
          this.fireOrb(enemy, toPlayer);
        }
      } else if (enemy.kind === 'darter') {
        enemy.dashTimer -= dt;
        if (enemy.dashTime > 0) {
          enemy.dashTime -= dt;
          vx = enemy.dashVx; // ride out the lunge at its locked velocity
          vy = enemy.dashVy;
        } else if (enemy.dashTimer <= 0) {
          enemy.dashTimer = this.rng.range(1.6, 2.5);
          enemy.dashTime = 0.34;
          enemy.dashVx = Math.cos(toPlayer) * spec.speed * 2.15;
          enemy.dashVy = Math.sin(toPlayer) * spec.speed * 2.15;
          vx = enemy.dashVx;
          vy = enemy.dashVy;
        }
      } else if (enemy.kind === 'brute') {
        enemy.fireTimer -= dt;
        if (enemy.fireTimer <= 0) {
          enemy.fireTimer = 2.4;
          for (const offset of [-0.28, 0, 0.28]) this.fireOrb(enemy, toPlayer + offset);
          this.events.push('orb');
        }
      } else {
        // shard: plain pursuit with a nervous wobble
        vx += Math.cos(enemy.phase + enemy.age * 2.2) * 26;
        vy += Math.sin(enemy.phase + enemy.age * 2.2) * 26;
      }

      enemy.vx = vx;
      enemy.vy = vy;
      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;

      // Contact: the shard spends itself against the wisp.
      const reach = enemy.radius + PLAYER.radius;
      if (distanceSquared(enemy.x, enemy.y, player.x, player.y) < reach * reach) {
        enemy.hull = 0;
        enemy.crashed = true;
        this.damagePlayer(spec.damage, enemy.x, enemy.y);
      }
    }
    // Separation: shards jostle for room instead of stacking into one blob,
    // which reads better and keeps a swarm a swarm rather than a single point.
    for (let i = 0; i < this.enemies.length; i += 1) {
      for (let j = i + 1; j < this.enemies.length; j += 1) {
        const a = this.enemies[i];
        const b = this.enemies[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const min = (a.radius + b.radius) * 0.92;
        const d2 = dx * dx + dy * dy;
        if (d2 > 0.01 && d2 < min * min) {
          const d = Math.sqrt(d2);
          const push = ((min - d) / d) * 0.5;
          a.x -= dx * push;
          a.y -= dy * push;
          b.x += dx * push;
          b.y += dy * push;
        }
      }
    }
    this.enemies = this.enemies.filter((enemy) => {
      if (enemy.hull > 0) return true;
      this.killEnemy(enemy);
      return false;
    });
  }

  fireOrb(enemy, angle) {
    this.orbs.push({
      x: enemy.x + Math.cos(angle) * (enemy.radius + 4),
      y: enemy.y + Math.sin(angle) * (enemy.radius + 4),
      vx: Math.cos(angle) * 185,
      vy: Math.sin(angle) * 185,
      life: 4.5,
    });
  }

  killEnemy(enemy) {
    const spec = ENEMY[enemy.kind];
    this.kills += 1;
    this.combo += 1;
    this.comboTimer = 3;
    const gained = spec.score * this.multiplier;
    this.score += gained;
    const big = enemy.kind === 'brute';
    this.burst(enemy.x, enemy.y, colorOf(enemy.kind), big ? 54 : 22, big ? 360 : 260, big ? 8.5 : 5.4);
    this.shake = Math.min(14, this.shake + (big ? 11 : 3.2));
    this.floater(enemy.x, enemy.y - enemy.radius - 6, `+${gained}`, COLORS.bullet);
    this.events.push(big ? 'bigboom' : 'boom');
    if (!enemy.crashed && (big || this.rng.chance(PICKUP.dropChance))) this.dropPickup(enemy.x, enemy.y, big);
  }

  dropPickup(x, y, guaranteed) {
    const roll = this.rng.next();
    const kind = guaranteed ? 'heal' : roll < 0.42 ? 'heal' : roll < 0.70 ? 'rapid' : 'shield';
    // Keep drops inside the playfield and below the HUD band, where they can be seen.
    const px = Math.min(VIEW.width - 36, Math.max(36, x));
    const py = Math.min(VIEW.height - 36, Math.max(120, y));
    this.pickups.push({ kind, x: px, y: py, age: 0 });
  }

  damagePlayer(amount, fromX, fromY) {
    const player = this.player;
    if (this.time < player.invulnerableUntil || !player.alive) return;
    if (this.time < player.shieldUntil) {
      this.burst(fromX, fromY, COLORS.pickupShield, 10, 200, 3.6);
      this.events.push('shieldhit');
      return;
    }
    player.hull -= amount;
    player.invulnerableUntil = this.time + PLAYER.invulnerableSeconds;
    this.shake = Math.min(16, this.shake + 7);
    this.combo = 0;
    this.burst(player.x, player.y, COLORS.danger, 22, 300, 5);
    this.events.push('hurt');
    if (player.hull <= 0) {
      player.hull = 0;
      player.alive = false;
      this.over = true;
      this.burst(player.x, player.y, COLORS.player, 70, 420, 6, 0.9);
      this.burst(player.x, player.y, COLORS.bullet, 40, 300, 5, 0.8);
      this.events.push('gameover');
    }
  }

  stepProjectiles(dt) {
    for (const bullet of this.bullets) {
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;
      for (const enemy of this.enemies) {
        if (enemy.hull <= 0) continue;
        const reach = enemy.radius + PLAYER.bulletRadius;
        if (distanceSquared(bullet.x, bullet.y, enemy.x, enemy.y) < reach * reach) {
          enemy.hull -= PLAYER.bulletDamage;
          bullet.life = 0;
          this.burst(bullet.x, bullet.y, COLORS.bullet, 4, 170, 3);
          this.events.push('hit');
          break;
        }
      }
    }
    this.bullets = this.bullets.filter(
      (b) => b.life > 0 && b.x > -20 && b.x < VIEW.width + 20 && b.y > -20 && b.y < VIEW.height + 20,
    );

    for (const orb of this.orbs) {
      orb.x += orb.vx * dt;
      orb.y += orb.vy * dt;
      orb.life -= dt;
      const reach = PLAYER.radius + 7;
      if (this.player.alive && distanceSquared(orb.x, orb.y, this.player.x, this.player.y) < reach * reach) {
        orb.life = 0;
        this.damagePlayer(8, orb.x, orb.y);
      }
    }
    this.orbs = this.orbs.filter(
      (o) => o.life > 0 && o.x > -20 && o.x < VIEW.width + 20 && o.y > -20 && o.y < VIEW.height + 20,
    );
  }

  stepPickups(dt) {
    const player = this.player;
    for (const pickup of this.pickups) {
      pickup.age += dt;
      const d2 = distanceSquared(pickup.x, pickup.y, player.x, player.y);
      if (d2 < 120 * 120) {
        // Magnet drift: help the player finish the pickup.
        const angle = Math.atan2(player.y - pickup.y, player.x - pickup.x);
        pickup.x += Math.cos(angle) * 190 * dt;
        pickup.y += Math.sin(angle) * 190 * dt;
      }
      const reach = PICKUP.radius + PLAYER.radius + 4;
      if (player.alive && d2 < reach * reach) {
        pickup.age = PICKUP.lifetime + 1; // consumed
        this.collectPickup(pickup);
      }
    }
    this.pickups = this.pickups.filter((pickup) => pickup.age <= PICKUP.lifetime);
  }

  collectPickup(pickup) {
    const player = this.player;
    if (pickup.kind === 'heal') {
      player.hull = Math.min(PLAYER.hull, player.hull + PICKUP.healAmount);
      this.floater(player.x, player.y - 34, `+${PICKUP.healAmount} HULL`, COLORS.pickupHeal);
    } else if (pickup.kind === 'rapid') {
      player.rapidUntil = this.time + PICKUP.rapidSeconds;
      this.floater(player.x, player.y - 34, 'RAPID FIRE', COLORS.pickupRapid);
    } else {
      player.shieldUntil = this.time + PICKUP.shieldSeconds;
      this.floater(player.x, player.y - 34, 'SHIELD UP', COLORS.pickupShield);
    }
    this.burst(pickup.x, pickup.y, colorOfPickup(pickup.kind), 12, 180, 3.6);
    this.events.push('pickup');
  }

  updateParticles(dt) {
    for (const particle of this.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= Math.pow(0.12, dt);
      particle.vy *= Math.pow(0.12, dt);
      particle.life -= dt;
    }
    this.particles = this.particles.filter((particle) => particle.life > 0);
    for (const floater of this.floaters) {
      floater.y -= 44 * dt;
      floater.life -= dt;
    }
    this.floaters = this.floaters.filter((floater) => floater.life > 0);
  }
}

export function colorOf(kind) {
  return COLORS[kind] ?? '#ffffff';
}

export function colorOfPickup(kind) {
  if (kind === 'heal') return COLORS.pickupHeal;
  if (kind === 'rapid') return COLORS.pickupRapid;
  return COLORS.pickupShield;
}
