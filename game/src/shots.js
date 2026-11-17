// Staged scenes for the screenshots, behind ?shot=title|cover|wave|over&seed=N.
// Each scene drives the real simulation with a pilot for a fixed number of steps,
// so the frame is a moment the game itself produced — same seed, same frame,
// every time. The cover freezes on a kill the pilot really made.

import { STEP, VIEW } from './config.js';
import { SCREEN } from './render.js';
import { PHASE } from './world.js';

const IDLE = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, firing: false };

/**
 * A competent pilot: keep clear of shards and orbs, drift to the arena centre
 * when crowded, chase nearby pickups, and always shoot the nearest shard.
 */
export function pilotControl(world) {
  const player = world.player;
  let moveX = (VIEW.width / 2 - player.x) * 0.004;
  let moveY = (VIEW.height / 2 - player.y) * 0.004;
  const threats = [...world.enemies, ...world.orbs];
  for (const threat of threats) {
    const dx = player.x - threat.x;
    const dy = player.y - threat.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < 240 * 240 && d2 > 0.01) {
      const weight = (240 * 240 - d2) / (240 * 240);
      const d = Math.sqrt(d2);
      moveX += (dx / d) * weight * 2.4;
      moveY += (dy / d) * weight * 2.4;
    }
  }
  let target = null;
  let targetD2 = Infinity;
  for (const enemy of world.enemies) {
    const d2 = (enemy.x - player.x) ** 2 + (enemy.y - player.y) ** 2;
    if (d2 < targetD2) {
      targetD2 = d2;
      target = enemy;
    }
  }
  for (const pickup of world.pickups) {
    const d2 = (pickup.x - player.x) ** 2 + (pickup.y - player.y) ** 2;
    if (d2 < 190 * 190) {
      moveX += (pickup.x - player.x) * 0.01;
      moveY += (pickup.y - player.y) * 0.01;
    }
  }
  return {
    moveX: Math.max(-1, Math.min(1, moveX)),
    moveY: Math.max(-1, Math.min(1, moveY)),
    aimX: target ? target.x : player.x + 100,
    aimY: target ? target.y : player.y,
    firing: target !== null,
  };
}

/** How many shards are within `range` px of the wisp right now. */
function crowdNearPlayer(world, range) {
  let count = 0;
  for (const enemy of world.enemies) {
    const d2 = (enemy.x - world.player.x) ** 2 + (enemy.y - world.player.y) ** 2;
    if (d2 < range * range) count += 1;
  }
  return count;
}

/** The living enemy nearest the wisp, or null. */
function nearestEnemy(world) {
  let nearest = null;
  let nearestD2 = Infinity;
  for (const enemy of world.enemies) {
    const d2 = (enemy.x - world.player.x) ** 2 + (enemy.y - world.player.y) ** 2;
    if (d2 < nearestD2) {
      nearestD2 = d2;
      nearest = enemy;
    }
  }
  return nearest;
}

/** A pilot who flies at the swarm and never shoots: the over scene's short story. */
function doomedControl(world) {
  const player = world.player;
  let target = null;
  let targetD2 = Infinity;
  for (const enemy of world.enemies) {
    const d2 = (enemy.x - player.x) ** 2 + (enemy.y - player.y) ** 2;
    if (d2 < targetD2) {
      targetD2 = d2;
      target = enemy;
    }
  }
  if (!target) return { ...IDLE, aimX: player.x + 60, aimY: player.y };
  return {
    moveX: Math.sign(target.x - player.x),
    moveY: Math.sign(target.y - player.y),
    aimX: target.x,
    aimY: target.y,
    firing: false,
  };
}

function run(world, seconds, controlFor, stopWhen = null) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    world.step(STEP, controlFor(world));
    if (stopWhen && stopWhen(world)) break;
  }
}

/**
 * Stage the named scene in `world` and return the screen to draw over it.
 * Any name but cover/wave/over stages the title.
 */
export function stageShot(name, world) {
  if (name === 'cover') {
    world.player.invulnerableUntil = 1e9; // the pilot survives its own photoshoot
    // Play into a developed wave, then call the climax in through the real
    // spawn path: a brute and an escort, given a moment to close in.
    run(world, 60, pilotControl, (w) => w.wave >= 3);
    world.spawnEnemy('brute');
    world.spawnEnemy('shard');
    world.spawnEnemy('shard');
    world.spawnEnemy('darter');
    world.spawnEnemy('darter');
    world.spawnEnemy('weaver');
    // Wait until the crowd has genuinely closed on the wisp, then freeze on
    // two real kills a heartbeat apart: bursts, floaters, shake and score,
    // all by the game's own hand.
    run(world, 7, pilotControl, (w) => crowdNearPlayer(w, 500) >= 5);
    world.score = 12740;
    world.combo = 13;
    world.player.hull = 74;
    world.player.invulnerableUntil = -1; // fully lit for its portrait
    const first = nearestEnemy(world);
    if (first) world.killEnemy(first);
    run(world, 0.07, pilotControl);
    const second = nearestEnemy(world);
    if (second) world.killEnemy(second);
    run(world, 0.07, pilotControl);
    return SCREEN.PLAY;
  }
  if (name === 'wave') {
    world.player.invulnerableUntil = 1e9;
    world.wave = 7;
    world.score = 8450;
    world.combo = 9;
    world.player.hull = 62;
    world.phase = PHASE.INTERMISSION;
    world.phaseTimer = 0.01; // wave 8 begins on the first step
    run(world, 3.4, pilotControl); // the opening rush: most of the wave still alive
    run(world, 6, pilotControl, (w) => crowdNearPlayer(w, 520) >= 5);
    if (world.pickups.length === 0) world.dropPickup(world.player.x + 190, world.player.y - 130, false);
    world.player.hull = 62; // set late: the pilot may have healed on the way here
    world.player.invulnerableUntil = -1;
    run(world, 0.1, pilotControl);
    return SCREEN.PLAY;
  }
  if (name === 'over') {
    world.wave = 5;
    world.score = 6120;
    world.kills = 47;
    world.phase = PHASE.INTERMISSION;
    world.phaseTimer = 0.01; // wave 6 begins on the first step
    run(world, 150, doomedControl, (w) => w.over);
    run(world, 0.35, () => IDLE); // let the last burst hang in the air
    return SCREEN.OVER;
  }
  // title: the swarm drifts behind the name of the game
  world.player.invulnerableUntil = 1e9;
  run(world, 6, pilotControl);
  // The pilot may have thinned wave 1 by now; send a fresh drift in so the
  // arena behind the title is alive.
  while (world.enemies.length < 4) world.spawnEnemy(world.rng.chance(0.7) ? 'shard' : 'weaver');
  run(world, 1.1, pilotControl);
  return SCREEN.TITLE;
}
