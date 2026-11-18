// Everything the player sees. The renderer reads the world and paints it: a deep
// void with parallax stars and nebula wash, additive glow for anything made of
// light, and flat readable shapes for anything made of shard. Screens (title,
// game over, victory) are drawn here too, over the world they belong to.

import { COLORS, ENEMY, PLAYER, VIEW, WAVES_TOTAL } from './config.js';
import { createRandom } from './random.js';
import { colorOf, colorOfPickup, PHASE } from './world.js';

const FONT = '"Avenir Next", "Segoe UI", system-ui, sans-serif';

export const SCREEN = { TITLE: 'title', PLAY: 'play', OVER: 'over', WON: 'won' };

export class Renderer {
  constructor() {
    this.background = this.paintBackground();
    this.starLayers = this.makeStars();
  }

  /** The static deep-space backdrop, painted once: gradient, nebulae, dust, vignette. */
  paintBackground() {
    const canvas = document.createElement('canvas');
    canvas.width = VIEW.width;
    canvas.height = VIEW.height;
    const ctx = canvas.getContext('2d');
    const wash = ctx.createLinearGradient(0, 0, VIEW.width * 0.4, VIEW.height);
    wash.addColorStop(0, '#141438');
    wash.addColorStop(0.5, COLORS.void);
    wash.addColorStop(1, '#0a0a1e');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    const nebula = (x, y, radius, color) => {
      const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
      glow.addColorStop(0, color);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    };
    // Saturated colour fields, laid in pairs so neighbouring hues blend where
    // they overlap: violet over indigo, teal under cyan, a warm amber breath
    // low on the right to balance the cool blues.
    nebula(240, 150, 430, 'rgba(96,44,190,0.78)');
    nebula(1080, 620, 470, 'rgba(18,96,150,0.72)');
    nebula(880, 120, 310, 'rgba(150,30,110,0.55)');
    nebula(300, 700, 330, 'rgba(16,80,130,0.62)');
    nebula(660, 420, 390, 'rgba(40,60,140,0.45)');
    nebula(1020, 300, 260, 'rgba(14,120,110,0.40)');
    nebula(180, 430, 240, 'rgba(120,50,160,0.38)');
    nebula(1150, 760, 300, 'rgba(150,80,20,0.30)');
    nebula(520, 90, 200, 'rgba(30,110,170,0.36)');
    // Star dust: hundreds of faint grains baked into the wash, so the dark
    // between the painted stars still has texture at thumbnail size.
    const dust = createRandom(777);
    for (let i = 0; i < 700; i += 1) {
      const x = dust.range(0, VIEW.width);
      const y = dust.range(0, VIEW.height);
      ctx.globalAlpha = dust.range(0.04, 0.16);
      ctx.fillStyle = dust.chance(0.5) ? '#cfe8ff' : '#ffe2b8';
      ctx.fillRect(x, y, 1.3, 1.3);
    }
    ctx.globalAlpha = 1;
    const vignette = ctx.createRadialGradient(640, 400, 340, 640, 400, 800);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    return canvas;
  }

  /** Three star layers; nearer layers drift further against the player's motion. */
  makeStars() {
    const rng = createRandom(20240);
    const layers = [];
    const specs = [
      { count: 110, size: 1.3, depth: 0.012, alpha: 0.6 },
      { count: 70, size: 1.9, depth: 0.03, alpha: 0.8 },
      { count: 34, size: 2.7, depth: 0.055, alpha: 1 },
    ];
    const tints = ['#ffffff', '#cfe8ff', '#ffe2b8', '#ffc4dd'];
    for (const spec of specs) {
      const stars = [];
      for (let i = 0; i < spec.count; i += 1) {
        stars.push({
          x: rng.range(0, VIEW.width),
          y: rng.range(0, VIEW.height),
          phase: rng.range(0, 6.28),
          speed: rng.range(0.6, 2.2),
          tint: tints[rng.int(0, tints.length - 1)],
          bright: spec.size > 2 && rng.chance(0.45),
        });
      }
      layers.push({ ...spec, stars });
    }
    return layers;
  }

  drawBackground(ctx, world) {
    ctx.drawImage(this.background, 0, 0);
    const cx = world.player.x - VIEW.width / 2;
    const cy = world.player.y - VIEW.height / 2;
    for (const layer of this.starLayers) {
      for (const star of layer.stars) {
        const twinkle = 0.6 + 0.4 * Math.sin(world.time * star.speed + star.phase);
        ctx.globalAlpha = layer.alpha * twinkle;
        let x = (star.x - cx * layer.depth) % VIEW.width;
        let y = (star.y - cy * layer.depth) % VIEW.height;
        if (x < 0) x += VIEW.width;
        if (y < 0) y += VIEW.height;
        ctx.fillStyle = star.tint;
        ctx.fillRect(x, y, layer.size, layer.size);
        if (star.bright) {
          // A cross sparkle on the biggest stars: four short rays that read
          // as a glint even when the frame is shrunk to a thumbnail.
          ctx.globalAlpha = layer.alpha * twinkle * 0.55;
          ctx.fillRect(x - layer.size * 2.2, y + layer.size * 0.3, layer.size * 5.4, 1);
          ctx.fillRect(x + layer.size * 0.3, y - layer.size * 2.2, 1, layer.size * 5.4);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  /** The whole frame for the current screen. */
  draw(ctx, world, screen, bestScore) {
    ctx.save();
    if (world.shake > 0.2) {
      const t = world.time * 131.7;
      ctx.translate(Math.sin(t) * world.shake * 0.55, Math.cos(t * 1.31) * world.shake * 0.55);
    }
    this.drawBackground(ctx, world);
    this.drawPickups(ctx, world);
    this.drawOrbs(ctx, world);
    this.drawEnemies(ctx, world);
    this.drawBullets(ctx, world);
    if (world.player.alive) this.drawPlayer(ctx, world);
    this.drawParticles(ctx, world);
    this.drawFloaters(ctx, world);
    ctx.restore();

    if (screen === SCREEN.PLAY) this.drawHud(ctx, world);
    if (screen === SCREEN.TITLE) this.drawTitle(ctx, world, bestScore);
    if (screen === SCREEN.OVER) this.drawGameOver(ctx, world);
    if (screen === SCREEN.WON) this.drawVictory(ctx, world);
  }

  glowCircle(ctx, x, y, radius, color) {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, color);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  drawPlayer(ctx, world) {
    const player = world.player;
    // Mercy invulnerability blinks the wisp's light; it never changes its colour,
    // so the player can never be mistaken for a shard.
    const blink = world.time < player.invulnerableUntil && Math.floor(world.time * 14) % 2 === 0;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    this.glowCircle(ctx, player.x, player.y, 104, 'rgba(80,200,255,0.55)');
    this.glowCircle(ctx, player.x, player.y, 46, 'rgba(170,240,255,0.5)');
    ctx.restore();
    // A slow breathing ring around the wisp: it gives the hero a silhouette
    // the eye can find instantly in a crowded frame.
    const breathe = 0.5 + 0.5 * Math.sin(world.time * 3.2);
    ctx.save();
    ctx.strokeStyle = 'rgba(143,247,255,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(player.x, player.y, PLAYER.radius + 6 + breathe * 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    if (world.time < player.shieldUntil) {
      ctx.strokeStyle = COLORS.pickupShield;
      ctx.globalAlpha = 0.75 + 0.25 * Math.sin(world.time * 6);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(player.x, player.y, PLAYER.radius + 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.globalAlpha = blink ? 0.35 : 1;
    ctx.fillStyle = COLORS.player;
    ctx.beginPath();
    ctx.arc(player.x, player.y, PLAYER.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.playerCore;
    ctx.beginPath();
    ctx.arc(player.x, player.y, PLAYER.radius * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  drawBullets(ctx, world) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const bullet of world.bullets) {
      const angle = Math.atan2(bullet.vy, bullet.vx);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      this.glowCircle(ctx, bullet.x, bullet.y, 17, 'rgba(255,214,80,0.45)');
      // A gold streak with a white-hot spine, long enough to read as motion
      // in a frozen frame.
      ctx.strokeStyle = COLORS.bullet;
      ctx.lineWidth = 5.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(bullet.x - cos * 17, bullet.y - sin * 17);
      ctx.lineTo(bullet.x, bullet.y);
      ctx.stroke();
      ctx.strokeStyle = '#fffbe8';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(bullet.x - cos * 13, bullet.y - sin * 13);
      ctx.lineTo(bullet.x + cos * 2, bullet.y + sin * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawOrbs(ctx, world) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const orb of world.orbs) {
      const pulse = 7.5 + Math.sin(world.time * 9 + orb.x) * 1.8;
      this.glowCircle(ctx, orb.x, orb.y, 30, 'rgba(255,77,140,0.5)');
      ctx.fillStyle = '#ff7ab0';
      ctx.beginPath();
      ctx.arc(orb.x, orb.y, pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffe3f0';
      ctx.beginPath();
      ctx.arc(orb.x, orb.y, pulse * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  polygon(ctx, x, y, radius, sides, rotation) {
    ctx.beginPath();
    for (let i = 0; i < sides; i += 1) {
      const angle = rotation + (i / sides) * Math.PI * 2;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  drawEnemies(ctx, world) {
    for (const enemy of world.enemies) {
      const color = colorOf(enemy.kind);
      const angle = Math.atan2(enemy.vy, enemy.vx);
      ctx.save();
      ctx.translate(enemy.x, enemy.y);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      this.glowCircle(ctx, 0, 0, enemy.radius * 2.6, 'rgba(255,80,120,0.26)');
      ctx.restore();
      // Body: a rich fill kept close to the full hue, a bright rim, and a
      // smaller full-strength silhouette inside, so every shard keeps a hard
      // readable edge and a glowing heart at any size.
      ctx.fillStyle = shade(color, 0.68);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3.5;
      ctx.shadowColor = color;
      ctx.shadowBlur = 13;
      if (enemy.kind === 'shard') {
        this.polygon(ctx, 0, 0, enemy.radius, 3, angle + Math.PI / 2);
      } else if (enemy.kind === 'darter') {
        const stretch = enemy.dashTime > 0 ? 1.5 : 1;
        ctx.rotate(angle);
        this.polygon(ctx, 0, 0, enemy.radius * stretch, 4, 0);
        ctx.scale(1, 1);
      } else if (enemy.kind === 'weaver') {
        this.polygon(ctx, 0, 0, enemy.radius, 5, enemy.age * 1.7 + enemy.phase);
      } else {
        this.polygon(ctx, 0, 0, enemy.radius, 6, enemy.age * 0.5);
      }
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.85;
      if (enemy.kind === 'shard') {
        this.polygon(ctx, 0, 0, enemy.radius * 0.58, 3, angle + Math.PI / 2);
      } else if (enemy.kind === 'darter') {
        this.polygon(ctx, 0, 0, enemy.radius * 0.58, 4, 0);
      } else if (enemy.kind === 'weaver') {
        this.polygon(ctx, 0, 0, enemy.radius * 0.58, 5, enemy.age * 1.7 + enemy.phase);
      } else {
        this.polygon(ctx, 0, 0, enemy.radius * 0.58, 6, enemy.age * 0.5);
      }
      ctx.fill();
      ctx.globalAlpha = 1;
      // White-hot core, and for the brute a hull ring that empties as it breaks.
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, enemy.radius * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, enemy.radius * 0.17, 0, Math.PI * 2);
      ctx.fill();
      if (enemy.kind === 'brute') {
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, enemy.radius + 9, -Math.PI / 2, -Math.PI / 2 + (enemy.hull / enemy.maxHull) * Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  drawPickups(ctx, world) {
    for (const pickup of world.pickups) {
      const color = colorOfPickup(pickup.kind);
      const bob = Math.sin(world.time * 3.4 + pickup.x * 0.05) * 3;
      const fading = pickup.age > 8 && Math.floor(world.time * 6) % 2 === 0;
      ctx.save();
      ctx.translate(pickup.x, pickup.y + bob);
      ctx.globalAlpha = fading ? 0.35 : 1;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      this.glowCircle(ctx, 0, 0, 40, 'rgba(120,255,170,0.32)');
      ctx.restore();
      // A pulsing beacon ring, so a drop calls out from across the arena.
      const beacon = (world.time * 0.7 + pickup.x * 0.01) % 1;
      ctx.strokeStyle = color;
      ctx.globalAlpha = (fading ? 0.2 : 0.5) * (1 - beacon);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 13 + beacon * 13, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = fading ? 0.35 : 1;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 3;
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(0, 0, 13, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      if (pickup.kind === 'heal') {
        ctx.fillRect(-3, -9, 6, 18);
        ctx.fillRect(-9, -3, 18, 6);
      } else if (pickup.kind === 'rapid') {
        ctx.beginPath();
        ctx.moveTo(2, -9);
        ctx.lineTo(-5, 2);
        ctx.lineTo(0, 2);
        ctx.lineTo(-2, 9);
        ctx.lineTo(6, -2);
        ctx.lineTo(1, -2);
        ctx.closePath();
        ctx.fill();
      } else {
        this.polygon(ctx, 0, 0, 8, 6, Math.PI / 6);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  drawParticles(ctx, world) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const particle of world.particles) {
      const fade = Math.max(0, particle.life / particle.maxLife);
      ctx.globalAlpha = Math.min(1, fade * 1.35);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size * (0.45 + 0.55 * fade) + 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  drawFloaters(ctx, world) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `800 21px ${FONT}`;
    for (const floater of world.floaters) {
      ctx.globalAlpha = Math.min(1, floater.life * 1.6);
      // A soft dark halo behind the digits keeps score popups readable over
      // bright bursts, with a glow in the floater's own colour on top.
      ctx.shadowColor = 'rgba(2,2,12,0.9)';
      ctx.shadowBlur = 7;
      ctx.fillStyle = floater.color;
      ctx.fillText(floater.text, floater.x, floater.y);
      ctx.shadowColor = floater.color;
      ctx.shadowBlur = 12;
      ctx.fillText(floater.text, floater.x, floater.y);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** A translucent rounded plate behind a HUD cluster, so figures stay legible over bright play. */
  hudPanel(ctx, x, y, width, height) {
    ctx.save();
    ctx.fillStyle = 'rgba(5,6,20,0.55)';
    ctx.strokeStyle = 'rgba(150,190,255,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 12);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  drawHud(ctx, world) {
    ctx.save();
    this.hudPanel(ctx, 14, 14, 252, 100);
    this.hudPanel(ctx, VIEW.width / 2 - 130, 14, 260, 100);
    this.hudPanel(ctx, VIEW.width - 282, 14, 268, 100);
    // Score and combo, top left.
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.textDim;
    ctx.font = `600 15px ${FONT}`;
    ctx.fillText('SCORE', 28, 36);
    ctx.fillStyle = COLORS.text;
    ctx.font = `800 34px ${FONT}`;
    ctx.shadowColor = 'rgba(140,220,255,0.65)';
    ctx.shadowBlur = 12;
    ctx.fillText(String(world.score).padStart(6, '0'), 28, 72);
    ctx.shadowBlur = 0;
    if (world.combo >= 4) {
      ctx.fillStyle = COLORS.bullet;
      ctx.font = `800 21px ${FONT}`;
      ctx.shadowColor = 'rgba(255,200,60,0.7)';
      ctx.shadowBlur = 10;
      ctx.fillText(`${world.combo} CHAIN  ×${world.multiplier}`, 28, 102);
      ctx.shadowBlur = 0;
    }
    // Wave, top centre.
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.textDim;
    ctx.font = `600 15px ${FONT}`;
    ctx.fillText('WAVE', VIEW.width / 2, 36);
    ctx.fillStyle = COLORS.text;
    ctx.font = `800 30px ${FONT}`;
    ctx.shadowColor = 'rgba(140,220,255,0.65)';
    ctx.shadowBlur = 12;
    ctx.fillText(`${Math.max(1, world.wave)} / ${WAVES_TOTAL}`, VIEW.width / 2, 70);
    ctx.shadowBlur = 0;
    const remaining = world.enemies.length + world.spawnQueue.length;
    if (world.phase === PHASE.ACTIVE && remaining > 0) {
      ctx.fillStyle = COLORS.textDim;
      ctx.font = `600 15px ${FONT}`;
      ctx.fillText(`${remaining} shards remain`, VIEW.width / 2, 96);
    }
    // Hull, top right: a bar that drains green -> amber -> red.
    const hull = world.player.hull / PLAYER.hull;
    const barWidth = 240;
    const barX = VIEW.width - 28 - barWidth;
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.textDim;
    ctx.font = `600 15px ${FONT}`;
    ctx.fillText('HULL', VIEW.width - 28, 36);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(barX, 46, barWidth, 18);
    const hullColor = hull > 0.5 ? COLORS.pickupHeal : hull > 0.25 ? COLORS.pickupRapid : COLORS.danger;
    ctx.fillStyle = hullColor;
    ctx.shadowColor = hullColor;
    ctx.shadowBlur = hull <= 0.25 ? 14 : 7;
    ctx.fillRect(barX, 46, barWidth * hull, 18);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, 46, barWidth, 18);
    // Power-up timers under the hull bar.
    ctx.font = `700 15px ${FONT}`;
    let timerY = 92;
    if (world.time < world.player.rapidUntil) {
      ctx.fillStyle = COLORS.pickupRapid;
      ctx.fillText(`RAPID FIRE ${Math.ceil(world.player.rapidUntil - world.time)}s`, VIEW.width - 28, timerY);
      timerY += 22;
    }
    if (world.time < world.player.shieldUntil) {
      ctx.fillStyle = COLORS.pickupShield;
      ctx.fillText(`SHIELD ${Math.ceil(world.player.shieldUntil - world.time)}s`, VIEW.width - 28, timerY);
    }
    // Wave banner, centre, for the first moments of a wave.
    if (world.phase === PHASE.ACTIVE && world.time - world.waveStartedAt < 1.7) {
      const age = world.time - world.waveStartedAt;
      ctx.globalAlpha = age < 1.2 ? 1 : 1 - (age - 1.2) / 0.5;
      ctx.textAlign = 'center';
      ctx.fillStyle = COLORS.text;
      ctx.font = `800 54px ${FONT}`;
      ctx.shadowColor = 'rgba(120,200,255,0.8)';
      ctx.shadowBlur = 26;
      ctx.fillText(`WAVE ${world.wave}`, VIEW.width / 2, 210);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  bannerTitle(ctx, title, subtitle, color) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.shadowColor = color;
    ctx.shadowBlur = 38;
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 96px ${FONT}`;
    ctx.fillText(title, VIEW.width / 2, 268);
    ctx.shadowBlur = 18;
    ctx.fillText(title, VIEW.width / 2, 268);
    ctx.shadowBlur = 0;
    ctx.fillStyle = color;
    ctx.font = `600 25px ${FONT}`;
    ctx.fillText(subtitle, VIEW.width / 2, 316);
    // A glowing rule under the subtitle, fading at both ends.
    const rule = ctx.createLinearGradient(VIEW.width / 2 - 260, 0, VIEW.width / 2 + 260, 0);
    rule.addColorStop(0, 'rgba(0,0,0,0)');
    rule.addColorStop(0.5, color);
    rule.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rule;
    ctx.globalAlpha = 0.8;
    ctx.fillRect(VIEW.width / 2 - 260, 336, 520, 3);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /** One legend glyph on the title screen: the enemy's own shape, in its own colour. */
  legendGlyph(ctx, kind, x, y) {
    const color = COLORS[kind];
    const radius = kind === 'brute' ? 21 : 15;
    const sides = kind === 'shard' ? 3 : kind === 'darter' ? 4 : kind === 'weaver' ? 5 : 6;
    ctx.save();
    ctx.translate(x, y);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    this.glowCircle(ctx, 0, 0, radius * 2.4, 'rgba(255,80,120,0.25)');
    ctx.restore();
    ctx.fillStyle = shade(color, 0.68);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    this.polygon(ctx, 0, 0, radius, sides, kind === 'shard' ? Math.PI / 2 : Math.PI / 6);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawTitle(ctx, world, bestScore) {
    ctx.save();
    ctx.fillStyle = 'rgba(4,4,16,0.30)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    this.bannerTitle(ctx, 'VOIDLIGHT', 'ONE WISP AGAINST THE SHARD SWARM', 'rgba(110,210,255,0.9)');
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.text;
    ctx.font = `500 21px ${FONT}`;
    ctx.fillText('Survive all 12 waves. Shatter shards, chain combos, catch the light they drop.', VIEW.width / 2, 388);
    ctx.fillStyle = COLORS.textDim;
    ctx.font = `500 19px ${FONT}`;
    ctx.fillText('MOVE  WASD or arrow keys        AIM  mouse        FIRE  hold mouse or Space', VIEW.width / 2, 440);
    ctx.fillText('Green cross repairs hull · gold bolt is rapid fire · blue ring is a shield', VIEW.width / 2, 472);
    // The swarm, introduced: each enemy kind in its own shape and colour.
    const legend = [
      ['shard', 'SHARD'],
      ['darter', 'DARTER'],
      ['weaver', 'WEAVER'],
      ['brute', 'BRUTE'],
    ];
    legend.forEach(([kind, name], i) => {
      const x = VIEW.width / 2 + (i - 1.5) * 170;
      this.legendGlyph(ctx, kind, x, 522);
      ctx.fillStyle = COLORS.textDim;
      ctx.font = `600 14px ${FONT}`;
      ctx.fillText(name, x, 560);
    });
    const pulse = 0.72 + 0.28 * Math.sin(world.time * 4);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = COLORS.bullet;
    ctx.font = `800 27px ${FONT}`;
    ctx.fillText('CLICK OR PRESS ENTER TO BEGIN', VIEW.width / 2, 622);
    ctx.globalAlpha = 1;
    if (bestScore > 0) {
      ctx.fillStyle = COLORS.textDim;
      ctx.font = `600 18px ${FONT}`;
      ctx.fillText(`BEST SCORE  ${bestScore}`, VIEW.width / 2, 668);
    }
    ctx.restore();
  }

  drawGameOver(ctx, world) {
    ctx.save();
    ctx.fillStyle = 'rgba(24,3,10,0.46)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    this.bannerTitle(ctx, 'THE LIGHT GOES OUT', `THE SWARM TAKES WAVE ${Math.max(1, world.wave)}`, 'rgba(255,80,100,0.9)');
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.text;
    ctx.font = `800 44px ${FONT}`;
    ctx.fillText(`SCORE  ${world.score}`, VIEW.width / 2, 428);
    ctx.fillStyle = COLORS.textDim;
    ctx.font = `500 21px ${FONT}`;
    ctx.fillText(`${world.kills} shards shattered before the dark`, VIEW.width / 2, 470);
    const pulse = 0.72 + 0.28 * Math.sin(world.time * 4);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = COLORS.bullet;
    ctx.font = `800 26px ${FONT}`;
    ctx.fillText('PRESS R OR CLICK TO TRY AGAIN', VIEW.width / 2, 552);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  drawVictory(ctx, world) {
    ctx.save();
    ctx.fillStyle = 'rgba(12,16,3,0.40)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    this.bannerTitle(ctx, 'THE VOID RECEDES', 'ALL 12 WAVES SURVIVED — YOU WIN', 'rgba(255,215,90,0.95)');
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.text;
    ctx.font = `800 44px ${FONT}`;
    ctx.fillText(`SCORE  ${world.score}`, VIEW.width / 2, 428);
    ctx.fillStyle = COLORS.textDim;
    ctx.font = `500 21px ${FONT}`;
    ctx.fillText(`${world.kills} shards shattered · hull at ${world.player.hull} · the light holds`, VIEW.width / 2, 470);
    const pulse = 0.72 + 0.28 * Math.sin(world.time * 4);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = COLORS.bullet;
    ctx.font = `800 26px ${FONT}`;
    ctx.fillText('PRESS R OR CLICK TO PLAY AGAIN', VIEW.width / 2, 552);
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

/** Darken a #rrggbb colour toward black by the given factor (0..1 kept). */
function shade(hex, keep) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.floor(((n >> 16) & 255) * keep);
  const g = Math.floor(((n >> 8) & 255) * keep);
  const b = Math.floor((n & 255) * keep);
  return `rgb(${r},${g},${b})`;
}
