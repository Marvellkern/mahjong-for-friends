/**
 * Tiny synthesized sounds (Web Audio, no audio files -> no licensing questions).
 * Off by default; toggled from the settings menu and remembered in localStorage.
 */
type SoundName = 'discard' | 'call' | 'win';

let ctx: AudioContext | null = null;
let enabled = readEnabled();

function readEnabled(): boolean {
  try {
    return localStorage.getItem('mj-sound') === '1';
  } catch {
    return false;
  }
}

export function soundEnabled() {
  return enabled;
}

export function setSoundEnabled(on: boolean) {
  enabled = on;
  try {
    localStorage.setItem('mj-sound', on ? '1' : '0');
  } catch {
    /* private mode: ignore */
  }
}

function blip(freq: number, start: number, dur: number, type: OscillatorType, gain: number) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(gain, ctx.currentTime + start);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + start);
  o.stop(ctx.currentTime + start + dur + 0.02);
}

export function playSound(name: SoundName) {
  if (!enabled) return;
  try {
    ctx ??= new AudioContext();
    if (name === 'discard') blip(900, 0, 0.06, 'triangle', 0.25);
    if (name === 'call') {
      blip(520, 0, 0.12, 'square', 0.08);
      blip(780, 0.08, 0.14, 'square', 0.08);
    }
    if (name === 'win') [523, 659, 784, 1047].forEach((f, i) => blip(f, i * 0.09, 0.22, 'triangle', 0.18));
  } catch {
    /* audio not available */
  }
}
