/**
 * Home screen (name, play vs bots, create / join a room) and the room lobby
 * (share link, seats, add/remove bots, start).
 */
import { useState } from 'react';
import { S } from '../strings';
import type { RemoteRoom } from '../state/useRemoteGame';
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

interface HomeProps {
  /** Room code from the link (?room=ABCD), if any. */
  initialCode?: string;
  notice?: string | null;
  onPlayBots: (name: string) => void;
  onCreate: (name: string) => void;
  onJoin: (name: string, code: string) => void;
}

export function Home({ initialCode = '', notice, onPlayBots, onCreate, onJoin }: HomeProps) {
  const [name, setName] = useState(loadName);
  const [code, setCode] = useState(initialCode);
  const clean = name.trim().slice(0, 16);
  const cleanCode = code.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  const withName = <A extends unknown[]>(fn: (n: string, ...a: A) => void, ...a: A) => {
    saveName(clean);
    fn(clean, ...a);
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-5 px-4 py-8">
      <div className="text-center">
        <div className="mb-3 flex justify-center gap-1" aria-hidden>
          {[16, 52, 96, 108, 128, 132].map((t) => (
            <Tile key={t} tile={t} size="hand" static />
          ))}
        </div>
        <h1 className="text-3xl font-extrabold">{S.gameName}</h1>
        <p className="mt-1 text-white/80">{S.tagline}</p>
      </div>

      {notice && (
        <p role="alert" className="rounded-xl bg-man/90 px-3 py-2 text-center text-sm font-semibold">
          {notice}
        </p>
      )}

      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-white/85">{S.yourName}</span>
        <input
          className={inputCls}
          value={name}
          maxLength={16}
          autoFocus={!!initialCode}
          placeholder={S.namePlaceholder}
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      {initialCode ? (
        <button className={primaryBtn} onClick={() => withName(onJoin, cleanCode)} disabled={cleanCode.length !== 4}>
          {S.joinRoom} {cleanCode}
        </button>
      ) : (
        <>
          <button className={primaryBtn} onClick={() => withName(onPlayBots)}>
            {S.playBots}
          </button>
          <button className={secondaryBtn} onClick={() => withName(onCreate)}>
            {S.createRoom}
          </button>
          <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-white/60">
            <span className="h-px flex-1 bg-white/20" />
            {S.orJoin}
            <span className="h-px flex-1 bg-white/20" />
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (cleanCode.length === 4) withName(onJoin, cleanCode);
            }}
          >
            <input
              className={inputCls + ' text-center font-mono uppercase tracking-[0.3em]'}
              aria-label={S.roomCode}
              placeholder={S.roomCodePlaceholder}
              value={cleanCode}
              maxLength={4}
              autoCapitalize="characters"
              autoComplete="off"
              onChange={(e) => setCode(e.target.value)}
            />
            <button className={secondaryBtn} disabled={cleanCode.length !== 4}>
              {S.joinRoom}
            </button>
          </form>
        </>
      )}
    </div>
  );
}

/** The waiting room before a game starts. */
export function LobbyRoom({ room }: { room: RemoteRoom }) {
  const snap = room.snapshot!;
  const isHost = snap.mySeat === snap.hostSeat;
  const link = `${location.origin}/?room=${snap.code}`;
  const [copied, setCopied] = useState(false);
  const host = snap.seats[snap.hostSeat]?.name ?? '';

  const copy = async () => {
    try {
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
        await navigator.share({ title: S.gameName, url: link });
        return;
      }
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* user cancelled share, or clipboard blocked: the link is visible to copy by hand */
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col gap-4 px-4 py-6">
      <div className="flex items-center justify-between">
        <button className="text-sm font-semibold text-white/80 underline-offset-2 hover:underline" onClick={room.leave}>
          ← {S.leave}
        </button>
        {room.connection !== 'connected' && <span className="rounded bg-man px-2 py-0.5 text-xs font-semibold">{S.reconnecting}</span>}
      </div>

      <div className="text-center">
        <p className="text-sm text-white/70">{S.roomCode}</p>
        <h1 className="font-mono text-5xl font-extrabold tracking-[0.25em] text-gold">{snap.code}</h1>
      </div>

      <div className="rounded-xl bg-black/25 p-3">
        <p className="mb-2 text-sm text-white/85">{S.shareLink}</p>
        <div className="flex gap-2">
          <input readOnly value={link} aria-label="Room link" className="min-w-0 flex-1 rounded-lg bg-white/10 px-2 font-mono text-xs text-white" onFocus={(e) => e.target.select()} />
          <button className="min-h-10 rounded-lg bg-gold px-3 text-sm font-extrabold text-[#1d1d1d]" onClick={copy}>
            {copied ? S.copied : S.copyLink}
          </button>
        </div>
      </div>

      <ul className="space-y-2">
        {snap.seats.map((s, i) => (
          <li key={i} className="flex min-h-12 items-center gap-2 rounded-xl bg-black/20 px-3 ring-1 ring-white/10">
            <span className="w-5 text-sm text-white/50">{i + 1}</span>
            {s.empty ? (
              <span className="flex-1 text-white/55">{S.seatEmpty}</span>
            ) : (
              <span className="flex flex-1 items-center gap-1.5 font-semibold">
                {s.name}
                {i === snap.mySeat && <span className="rounded bg-white/15 px-1.5 text-[10px] uppercase">{S.youTag}</span>}
                {i === snap.hostSeat && <span className="rounded bg-gold px-1.5 text-[10px] uppercase text-black">{S.hostTag}</span>}
                {s.isBot && <span className="text-xs font-normal text-white/60">{S.bot}</span>}
                {!s.isBot && !s.connected && <span className="rounded bg-man px-1 text-[10px]">{S.disconnected}</span>}
              </span>
            )}
            {isHost && s.empty && (
              <button className="rounded-lg bg-white/10 px-2.5 py-1.5 text-sm font-semibold" onClick={() => room.addBot(i)}>
                + {S.addBot}
              </button>
            )}
            {isHost && s.isBot && (
              <button className="rounded-lg bg-white/10 px-2.5 py-1.5 text-sm font-semibold" onClick={() => room.removeBot(i)}>
                {S.removeBot}
              </button>
            )}
          </li>
        ))}
      </ul>

      {isHost ? (
        <>
          <button className={primaryBtn} onClick={room.start}>
            {S.startGame}
          </button>
          {snap.seats.some((s) => s.empty) && <p className="-mt-2 text-center text-xs text-white/60">{S.emptySeatsNote}</p>}
        </>
      ) : (
        <p className="text-center text-white/80">{S.waitingForHost(host)}</p>
      )}

      {room.error && (
        <p role="alert" className="rounded-lg bg-man px-3 py-2 text-center text-sm font-semibold">
          {room.error}
        </p>
      )}
    </div>
  );
}
