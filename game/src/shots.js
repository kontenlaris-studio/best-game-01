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

/**
 * A brawler pilot for the cover's final approach: it holds the central stage
 * and stands its ground (a much smaller dodge radius than the survival
 * pilot's), so the swarm piles in close around the wisp instead of being
 * kited apart — the crowd a cover frame wants.
 */
export function brawlerControl(world) {
  const player = world.player;
  let moveX = (VIEW.width / 2 - player.x) * 0.01;
  let moveY = (VIEW.height / 2 - player.y) * 0.01;
  const threats = [...world.enemies, ...world.orbs];
  for (const threat of threats) {
    const dx = player.x - threat.x;
    const dy = player.y - threat.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < 130 * 130 && d2 > 0.01) {
      const weight = (130 * 130 - d2) / (130 * 130);
      const d = Math.sqrt(d2);
      moveX += (dx / d) * weight * 1.8;
      moveY += (dy / d) * weight * 1.8;
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
  return {
    moveX: Math.max(-1, Math.min(1, moveX)),
    moveY: Math.max(-1, Math.min(1, moveY)),
    aimX: target ? target.x : player.x + 100,
    aimY: target ? target.y : player.y,
    firing: target !== null,
  };
}

/**
 * A gathering pilot for the cover's approach: the brawler's stance with its
 * finger off the trigger. A firing pilot kills shards at range and the crowd
 * never forms; a silent one lets the swarm converge and surround it, which
 * is the moment the cover freezes — the shooting starts only for the
 * final beats, once the pack is close.
 */
export function gatherControl(world) {
  const control = brawlerControl(world);
  return { ...control, firing: false };
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

/** The nearest living enemy that is not the brute: a burst, not a boss kill. */
function nearestOrdinaryEnemy(world) {
  let nearest = null;
  let nearestD2 = Infinity;
  for (const enemy of world.enemies) {
    if (enemy.kind === 'brute') continue;
    const d2 = (enemy.x - world.player.x) ** 2 + (enemy.y - world.player.y) ** 2;
    if (d2 < nearestD2) {
      nearestD2 = d2;
      nearest = enemy;
    }
  }
  return nearest;
}

/** Is the wisp inside the central stage box, where a portrait wants it? */
function playerCentred(world, halfWidth, halfHeight) {
  return (
    Math.abs(world.player.x - VIEW.width / 2) <= halfWidth &&
    Math.abs(world.player.y - VIEW.height / 2) <= halfHeight
  );
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

/**
 * A pilot making its last stand: it holds the centre of the arena and never
 * fires, so the swarm closes in from every side and the end, when it comes,
 * happens in the middle of the frame with the pack around the wisp.
 */
function lastStandControl(world) {
  const player = world.player;
  return {
    moveX: (VIEW.width / 2 - player.x) * 0.006,
    moveY: (VIEW.height / 2 - player.y) * 0.006,
    aimX: player.x + 80,
    aimY: player.y,
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
    // The cover poses in wave 5, the first wave with the full cast in real
    // numbers: set the run up at its edge and let it begin for real.
    world.wave = 4;
    world.phase = PHASE.INTERMISSION;
    world.phaseTimer = 0.01; // wave 5 begins on the first step
    // The brute is called in through the real spawn path, with a head start
    // (it is slow), while the wave's own trickle is still arriving.
    world.spawnEnemy('brute');
    // The approach is silent: the gathering pilot holds the centre and lets
    // the swarm surround it. Freeze once six or more shards are close.
    run(world, 14, gatherControl, (w) => crowdNearPlayer(w, 400) >= 6 && playerCentred(w, 360, 250));
    if (world.enemies.length < 6) {
      // The swarm thinned anyway: call a last rush in and let it arrive.
      world.spawnEnemy('shard');
      world.spawnEnemy('shard');
      world.spawnEnemy('darter');
      run(world, 1.1, gatherControl);
    }
    // Only now does the wisp open fire: a third of a second of real shooting
    // so the frame holds a live bullet stream and fresh bursts, then two
    // staged kills a heartbeat apart for the biggest bursts of all — every
    // burst, floater, shake and score the game's own.
    run(world, 0.35, brawlerControl);
    world.score = 21400;
    world.combo = 17;
    world.player.hull = 74;
    world.player.invulnerableUntil = -1; // fully lit for its portrait
    const first = nearestOrdinaryEnemy(world) ?? nearestEnemy(world);
    if (first) world.killEnemy(first);
    run(world, 0.06, brawlerControl);
    const second = nearestOrdinaryEnemy(world) ?? nearestEnemy(world);
    if (second) world.killEnemy(second);
    run(world, 0.12, brawlerControl);
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
    run(world, 9, pilotControl, (w) => crowdNearPlayer(w, 520) >= 5 && playerCentred(w, 300, 210));
    if (world.pickups.length === 0) world.dropPickup(world.player.x + 190, world.player.y - 130, false);
    world.player.hull = 62; // set late: the pilot may have healed on the way here
    world.player.invulnerableUntil = -1;
    run(world, 0.1, pilotControl);
    return SCREEN.PLAY;
  }
  if (name === 'over') {
    world.wave = 7;
    world.score = 9100;
    world.kills = 63;
    // The wisp reaches wave 8 already scarred: at 26 hull the end comes early
    // in the wave, while the swarm is still thick around it — left at full
    // hull, the pack would spend itself crashing against the mercy windows
    // and the last stand would end in an empty arena.
    world.player.hull = 26;
    world.phase = PHASE.INTERMISSION;
    world.phaseTimer = 0.01; // wave 8 begins on the first step
    run(world, 150, lastStandControl, (w) => w.over);
    run(world, 0.35, () => IDLE); // let the last burst hang in the air
    return SCREEN.OVER;
  }
  // title: the swarm drifts behind the name of the game
  world.player.invulnerableUntil = 1e9;
  run(world, 6.5, pilotControl);
  // The pilot may have thinned wave 1 by now; send a fresh drift in so the
  // arena behind the title is alive.
  while (world.enemies.length < 6) world.spawnEnemy(world.rng.chance(0.7) ? 'shard' : 'weaver');
  run(world, 1.1, pilotControl);
  return SCREEN.TITLE;
}
