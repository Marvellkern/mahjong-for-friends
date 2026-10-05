/** Home screen: pick a name, then play vs bots (online rooms come in phase 5). */
import { useState } from 'react';
import { S } from '../strings';
import { Tile } from './Tile';

export function loadName(): string {
  try {
    return localStorage.getItem('mj-name') ?? '';
  } catch {
    return '';
  }
}

function saveName(name: string) {
  try {
    localStorage.setItem('mj-name', name);
  } catch {
    /* ignore */
  }
}

export const inputCls =
  'min-h-12 w-full rounded-xl bg-white/95 px-3 text-base font-semibold text-[#1d1d1d] placeholder:text-black/40 focus:outline-2 focus:outline-gold';
export const primaryBtn =
  'min-h-12 w-full rounded-xl bg-gold px-4 text-lg font-extrabold text-[#1d1d1d] shadow-[0_3px_0_rgb(0_0_0/.3)] active:translate-y-px disabled:opacity-40';
export const secondaryBtn =
  'min-h-12 rounded-xl bg-black/30 px-4 font-bold text-white ring-1 ring-white/30 active:translate-y-px disabled:opacity-40';

export function Home({ onPlayBots }: { onPlayBots: (name: string) => void }) {
  const [name, setName] = useState(loadName);
  const clean = name.trim().slice(0, 16);
  const go = (fn: (n: string) => void) => {
    saveName(clean);
    fn(clean);
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4 py-8">
      <div className="text-center">
        <div className="mb-3 flex justify-center gap-1" aria-hidden>
          {[16, 52, 96, 108, 128, 132].map((t) => (
            <Tile key={t} tile={t} size="hand" static />
          ))}
        </div>
        <h1 className="text-3xl font-extrabold">{S.gameName}</h1>
        <p className="mt-1 text-white/80">{S.tagline}</p>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-white/85">{S.yourName}</span>
        <input className={inputCls} value={name} maxLength={16} placeholder={S.namePlaceholder} onChange={(e) => setName(e.target.value)} />
      </label>

      <button className={primaryBtn} onClick={() => go(onPlayBots)}>
        {S.playBots}
      </button>
    </div>
  );
}
