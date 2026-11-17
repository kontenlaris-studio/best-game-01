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

  /** The static deep-space backdrop, painted once: gradient, nebulae, vignette. */
  paintBackground() {
    const canvas = document.createElement('canvas');
    canvas.width = VIEW.width;
    canvas.height = VIEW.height;
    const ctx = canvas.getContext('2d');
    const wash = ctx.createLinearGradient(0, 0, 0, VIEW.height);
    wash.addColorStop(0, '#0a0a22');
    wash.addColorStop(0.55, COLORS.void);
    wash.addColorStop(1, '#05050f');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    const nebula = (x, y, radius, color) => {
      const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
      glow.addColorStop(0, color);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    };
    nebula(240, 150, 420, 'rgba(58,32,120,0.62)');
    nebula(1080, 620, 460, 'rgba(16,70,110,0.58)');
    nebula(880, 120, 300, 'rgba(90,20,70,0.42)');
    nebula(300, 700, 320, 'rgba(14,50,90,0.48)');
    nebula(660, 420, 380, 'rgba(30,40,90,0.30)');
    const vignette = ctx.createRadialGradient(640, 400, 320, 640, 400, 780);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    return canvas;
  }

  /** Three star layers; nearer layers drift further against the player's motion. */
  makeStars() {
    const rng = createRandom(20240);
    const layers = [];
    const specs = [
      { count: 90, size: 1.1, depth: 0.012, alpha: 0.5 },
      { count: 60, size: 1.7, depth: 0.03, alpha: 0.7 },
      { count: 28, size: 2.4, depth: 0.055, alpha: 0.95 },
    ];
    for (const spec of specs) {
      const stars = [];
      for (let i = 0; i < spec.count; i += 1) {
        stars.push({ x: rng.range(0, VIEW.width), y: rng.range(0, VIEW.height), phase: rng.range(0, 6.28), speed: rng.range(0.6, 2.2) });
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
      ctx.fillStyle = '#cfe8ff';
      for (const star of layer.stars) {
        const twinkle = 0.55 + 0.45 * Math.sin(world.time * star.speed + star.phase);
        ctx.globalAlpha = layer.alpha * twinkle;
        let x = (star.x - cx * layer.depth) % VIEW.width;
        let y = (star.y - cy * layer.depth) % VIEW.height;
        if (x < 0) x += VIEW.width;
        if (y < 0) y += VIEW.height;
        ctx.fillRect(x, y, layer.size, layer.size);
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
    this.glowCircle(ctx, player.x, player.y, 72, 'rgba(80,200,255,0.45)');
    ctx.restore();
    if (world.time < player.shieldUntil) {
      ctx.strokeStyle = COLORS.pickupShield;
      ctx.globalAlpha = 0.75 + 0.25 * Math.sin(world.time * 6);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(player.x, player.y, PLAYER.radius + 10, 0, Math.PI * 2);
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
    ctx.arc(player.x, player.y, PLAYER.radius * 0.48, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  drawBullets(ctx, world) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const bullet of world.bullets) {
      const angle = Math.atan2(bullet.vy, bullet.vx);
      ctx.strokeStyle = COLORS.bullet;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(bullet.x - Math.cos(angle) * 11, bullet.y - Math.sin(angle) * 11);
      ctx.lineTo(bullet.x, bullet.y);
      ctx.stroke();
      this.glowCircle(ctx, bullet.x, bullet.y, 13, 'rgba(255,214,80,0.35)');
    }
    ctx.restore();
  }

  drawOrbs(ctx, world) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const orb of world.orbs) {
      const pulse = 6.5 + Math.sin(world.time * 9 + orb.x) * 1.6;
      this.glowCircle(ctx, orb.x, orb.y, 24, 'rgba(255,77,140,0.4)');
      ctx.fillStyle = '#ff7ab0';
      ctx.beginPath();
      ctx.arc(orb.x, orb.y, pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffe3f0';
      ctx.beginPath();
      ctx.arc(orb.x, orb.y, pulse * 0.42, 0, Math.PI * 2);
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
      this.glowCircle(ctx, 0, 0, enemy.radius * 2.1, 'rgba(255,80,120,0.20)');
      ctx.restore();
      ctx.fillStyle = shade(color, 0.48);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
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
      // Bright core, and for the brute a hull ring that empties as it breaks.
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, enemy.radius * 0.34, 0, Math.PI * 2);
      ctx.fill();
      if (enemy.kind === 'brute') {
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, enemy.radius + 8, -Math.PI / 2, -Math.PI / 2 + (enemy.hull / enemy.maxHull) * Math.PI * 2);
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
      this.glowCircle(ctx, 0, 0, 30, 'rgba(120,255,170,0.25)');
      ctx.restore();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.stroke();
      if (pickup.kind === 'heal') {
        ctx.fillRect(-2.5, -8, 5, 16);
        ctx.fillRect(-8, -2.5, 16, 5);
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
        this.polygon(ctx, 0, 0, 7.5, 6, Math.PI / 6);
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
      ctx.globalAlpha = fade;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size * fade + 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  drawFloaters(ctx, world) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `700 19px ${FONT}`;
    for (const floater of world.floaters) {
      ctx.globalAlpha = Math.min(1, floater.life * 1.6);
      ctx.fillStyle = floater.color;
      ctx.fillText(floater.text, floater.x, floater.y);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  drawHud(ctx, world) {
    ctx.save();
    // Score and combo, top left.
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.textDim;
    ctx.font = `600 15px ${FONT}`;
    ctx.fillText('SCORE', 28, 36);
    ctx.fillStyle = COLORS.text;
    ctx.font = `800 34px ${FONT}`;
    ctx.fillText(String(world.score).padStart(6, '0'), 28, 72);
    if (world.combo >= 4) {
      ctx.fillStyle = COLORS.bullet;
      ctx.font = `800 21px ${FONT}`;
      ctx.fillText(`${world.combo} CHAIN  ×${world.multiplier}`, 28, 102);
    }
    // Wave, top centre.
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.textDim;
    ctx.font = `600 15px ${FONT}`;
    ctx.fillText('WAVE', VIEW.width / 2, 36);
    ctx.fillStyle = COLORS.text;
    ctx.font = `800 30px ${FONT}`;
    ctx.fillText(`${Math.max(1, world.wave)} / ${WAVES_TOTAL}`, VIEW.width / 2, 70);
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
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(barX, 48, barWidth, 16);
    ctx.fillStyle = hull > 0.5 ? COLORS.pickupHeal : hull > 0.25 ? COLORS.pickupRapid : COLORS.danger;
    ctx.fillRect(barX, 48, barWidth * hull, 16);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, 48, barWidth, 16);
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
    ctx.shadowBlur = 34;
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 96px ${FONT}`;
    ctx.fillText(title, VIEW.width / 2, 268);
    ctx.shadowBlur = 0;
    ctx.fillStyle = color;
    ctx.font = `600 25px ${FONT}`;
    ctx.fillText(subtitle, VIEW.width / 2, 316);
    ctx.restore();
  }

  drawTitle(ctx, world, bestScore) {
    ctx.save();
    ctx.fillStyle = 'rgba(4,4,16,0.45)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    this.bannerTitle(ctx, 'VOIDLIGHT', 'ONE WISP AGAINST THE SHARD SWARM', 'rgba(110,210,255,0.9)');
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.text;
    ctx.font = `500 21px ${FONT}`;
    ctx.fillText('Survive all 12 waves. Shatter shards, chain combos, catch the light they drop.', VIEW.width / 2, 392);
    ctx.fillStyle = COLORS.textDim;
    ctx.font = `500 19px ${FONT}`;
    ctx.fillText('MOVE  WASD or arrow keys        AIM  mouse        FIRE  hold mouse or Space', VIEW.width / 2, 448);
    ctx.fillText('Green cross repairs hull · gold bolt is rapid fire · blue ring is a shield', VIEW.width / 2, 480);
    const pulse = 0.72 + 0.28 * Math.sin(world.time * 4);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = COLORS.bullet;
    ctx.font = `800 27px ${FONT}`;
    ctx.fillText('CLICK OR PRESS ENTER TO BEGIN', VIEW.width / 2, 566);
    ctx.globalAlpha = 1;
    if (bestScore > 0) {
      ctx.fillStyle = COLORS.textDim;
      ctx.font = `600 18px ${FONT}`;
      ctx.fillText(`BEST SCORE  ${bestScore}`, VIEW.width / 2, 616);
    }
    ctx.restore();
  }

  drawGameOver(ctx, world) {
    ctx.save();
    ctx.fillStyle = 'rgba(20,2,8,0.62)';
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
    ctx.fillStyle = 'rgba(10,14,2,0.55)';
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
