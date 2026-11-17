// The shell: owns the canvas, the clock and the screens. The world simulates in
// fixed steps; this file feeds it the player's intent, plays the sounds the world
// asks for, and hands each frame to the renderer. With ?shot=<scene>&seed=<n> in
// the address it instead stages one deterministic scene from shots.js and draws
// a single frame — that is how the screenshots in the entry were taken.

import { SoundBank } from './audio.js';
import { STEP, VIEW } from './config.js';
import { Input } from './input.js';
import { Renderer, SCREEN } from './render.js';
import { pilotControl, stageShot } from './shots.js';
import { World } from './world.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const renderer = new Renderer();
const sound = new SoundBank();

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const shotSeed = Number(params.get('seed') ?? 7) || 7;

let bestScore = 0;
try {
  bestScore = Number(window.localStorage.getItem('voidlight-best') ?? 0) || 0;
} catch {
  bestScore = 0;
}

function rememberBest(score) {
  if (score <= bestScore) return;
  bestScore = score;
  try {
    window.localStorage.setItem('voidlight-best', String(score));
  } catch {
    /* private mode: the best score just lives for the session */
  }
}

const EVENT_SOUNDS = {
  shoot: () => sound.shoot(),
  hit: () => sound.enemyHit(),
  boom: () => sound.explosion(false),
  bigboom: () => sound.explosion(true),
  hurt: () => sound.playerHurt(),
  pickup: () => sound.pickup(),
  wave: () => sound.waveStart(),
  shieldhit: () => sound.enemyHit(),
  gameover: () => {
    sound.stopMusic();
    sound.gameOver();
  },
  victory: () => {
    sound.stopMusic();
    sound.victory();
  },
};

function playEvents(world) {
  const played = new Set();
  for (const event of world.events) {
    if (played.has(event)) continue; // one of each cue per frame is plenty
    played.add(event);
    EVENT_SOUNDS[event]?.();
  }
  world.events.length = 0;
}

if (shotName !== null) {
  // Screenshot mode: stage the scene, draw it once, and say so on the page.
  const world = new World(shotSeed);
  const screen = stageShot(shotName, world);
  renderer.draw(ctx, world, screen, 23180);
  document.body.dataset.shotReady = shotName;
} else {
  const input = new Input(canvas);
  let screen = SCREEN.TITLE;
  let world = new World((Date.now() % 2147483647) + 1);
  world.player.invulnerableUntil = 1e9; // the title demo cannot die
  let accumulator = 0;
  let lastTime = performance.now();

  const startRun = () => {
    sound.unlock();
    world = new World((Date.now() % 2147483647) + 1);
    screen = SCREEN.PLAY;
    sound.startMusic();
  };

  const frame = (now) => {
    accumulator += Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;
    while (accumulator >= STEP) {
      accumulator -= STEP;
      if (screen === SCREEN.TITLE) {
        world.step(STEP, pilotControl(world));
        if (world.won) world.reset((Date.now() % 2147483647) + 1);
        if (world.player.invulnerableUntil === -1) world.player.invulnerableUntil = 1e9;
      } else if (screen === SCREEN.PLAY) {
        const axis = input.axis();
        world.step(STEP, {
          moveX: axis.x,
          moveY: axis.y,
          aimX: input.mouseX,
          aimY: input.mouseY,
          firing: input.firing(),
        });
        if (world.over) {
          screen = SCREEN.OVER;
          rememberBest(world.score);
        } else if (world.won) {
          screen = SCREEN.WON;
          rememberBest(world.score);
        }
      } else {
        world.step(STEP, { moveX: 0, moveY: 0, aimX: 0, aimY: 0, firing: false });
      }
    }
    playEvents(world);
    renderer.draw(ctx, world, screen, bestScore);

    if (screen === SCREEN.TITLE && (input.takeClick() || input.wasPressed('Enter'))) startRun();
    else if ((screen === SCREEN.OVER || screen === SCREEN.WON) && (input.takeClick() || input.wasPressed('KeyR'))) startRun();

    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

export { VIEW };
