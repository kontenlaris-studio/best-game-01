// Synthesised sound: every effect is an oscillator or a noise burst shaped by an
// envelope, so the game ships no audio files at all. The context is created lazily
// on the first user gesture (browsers refuse sound before one) and every call is
// safe to make when sound is unavailable — it simply stays silent.

export class SoundBank {
  constructor() {
    this.context = null;
    this.master = null;
    this.musicTimer = null;
  }

  /** Create the context if needed and resume it; call from a click or key handler. */
  unlock() {
    try {
      if (!this.context) {
        const AudioCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtor) return;
        this.context = new AudioCtor();
        this.master = this.context.createGain();
        this.master.gain.value = 0.35;
        this.master.connect(this.context.destination);
      }
      if (this.context.state === 'suspended') void this.context.resume();
    } catch {
      this.context = null;
    }
  }

  tone({ frequency = 440, endFrequency = null, type = 'square', seconds = 0.12, volume = 0.5, delay = 0 }) {
    if (!this.context || !this.master) return;
    try {
      const start = this.context.currentTime + delay;
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, start);
      if (endFrequency !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + seconds);
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + seconds);
      osc.connect(gain).connect(this.master);
      osc.start(start);
      osc.stop(start + seconds + 0.02);
    } catch {
      /* a failed effect must never break the game */
    }
  }

  noise({ seconds = 0.25, volume = 0.6, delay = 0, lowpass = 1200 }) {
    if (!this.context || !this.master) return;
    try {
      const start = this.context.currentTime + delay;
      const frames = Math.max(1, Math.floor(this.context.sampleRate * seconds));
      const buffer = this.context.createBuffer(1, frames, this.context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < frames; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      const filter = this.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass;
      const gain = this.context.createGain();
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + seconds);
      source.connect(filter).connect(gain).connect(this.master);
      source.start(start);
    } catch {
      /* silent on failure */
    }
  }

  shoot() {
    this.tone({ frequency: 880, endFrequency: 320, type: 'square', seconds: 0.07, volume: 0.16 });
  }

  enemyHit() {
    this.tone({ frequency: 220, endFrequency: 140, type: 'sawtooth', seconds: 0.06, volume: 0.14 });
  }

  explosion(big = false) {
    this.noise({ seconds: big ? 0.5 : 0.28, volume: big ? 0.8 : 0.5, lowpass: big ? 700 : 1000 });
    this.tone({ frequency: big ? 120 : 160, endFrequency: 40, type: 'triangle', seconds: big ? 0.45 : 0.25, volume: 0.5 });
  }

  playerHurt() {
    this.tone({ frequency: 300, endFrequency: 70, type: 'sawtooth', seconds: 0.3, volume: 0.55 });
    this.noise({ seconds: 0.2, volume: 0.4, lowpass: 900 });
  }

  pickup() {
    this.tone({ frequency: 660, type: 'sine', seconds: 0.09, volume: 0.3 });
    this.tone({ frequency: 990, type: 'sine', seconds: 0.12, volume: 0.3, delay: 0.07 });
  }

  waveStart() {
    this.tone({ frequency: 392, type: 'triangle', seconds: 0.14, volume: 0.35 });
    this.tone({ frequency: 587, type: 'triangle', seconds: 0.2, volume: 0.35, delay: 0.11 });
  }

  gameOver() {
    this.tone({ frequency: 392, endFrequency: 98, type: 'triangle', seconds: 0.9, volume: 0.5 });
  }

  victory() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((frequency, index) => {
      this.tone({ frequency, type: 'triangle', seconds: 0.22, volume: 0.35, delay: index * 0.12 });
    });
  }

  /** A slow two-note pulse under the action; cheap and easy to ignore. */
  startMusic() {
    if (!this.context || this.musicTimer !== null) return;
    const bassline = [55, 55, 82.4, 55, 65.4, 55, 73.4, 98];
    let step = 0;
    const tick = () => {
      if (!this.context) return;
      this.tone({ frequency: bassline[step % bassline.length], type: 'sine', seconds: 0.42, volume: 0.16 });
      step += 1;
    };
    tick();
    this.musicTimer = window.setInterval(tick, 430);
  }

  stopMusic() {
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }
}
