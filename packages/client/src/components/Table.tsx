/**
 * The mahjong table. Me at the bottom; the next player in turn order on the RIGHT,
 * the opposite player on top, and the player before me on the LEFT (real-table order:
 * play passes counter-clockwise, so you chow from the player on your left).
 */
import { useMemo, useState } from 'react';
import { kindName, kindOf, type PlayerView, type Tile as TileId } from '@mahjong/engine';
import { S } from '../strings';
import { setSoundEnabled, soundEnabled } from '../sound';
import type { GameController } from '../state/types';
import { ActionBar } from './ActionBar';
import { Hand } from './Hand';
import { Melds } from './Melds';
import { RoundEnd } from './RoundEnd';
import { Tile } from './Tile';

export function Table({ ctrl }: { ctrl: GameController }) {
  const v = ctrl.view!;
  const me = v.mySeat;
  const right = (me + 1) % 4;
  const top = (me + 2) % 4;
  const left = (me + 3) % 4;

  const [picked, setPicked] = useState<TileId | null>(null);
  const discardable = useMemo(
    () => new Set(v.legalActions.flatMap((a) => (a.type === 'discard' ? [a.tileId] : []))),
    [v.legalActions],
  );
  // Forget the selection as soon as it isn't a legal discard any more.
  const selected = picked !== null && discardable.has(picked) ? picked : null;

  // My own hand arrangement (drag to sort). Local only; every new round starts auto-sorted.
  const [arranged, setArranged] = useState<{ round: number; order: TileId[] } | null>(null);
  const handOrder = arranged?.round === v.round ? arranged.order : null;

  const act: GameController['act'] = (a) => {
    setPicked(null);
    ctrl.act(a);
  };

  const name = (seat: number) => (seat === me ? S.you : v.seats[seat].name);
  const turnSeat = v.phase === 'AWAIT_DISCARD' ? v.currentTurn : -1;
  const status = statusLine(v, name);

  const panel = (seat: number, pos: 'top' | 'left' | 'right') => (
    <SeatPanel key={seat} view={v} seat={seat} pos={pos} isTurn={turnSeat === seat} />
  );

  return (
    <div className="mx-auto flex h-dvh max-w-4xl flex-col px-2 pb-[max(4px,env(safe-area-inset-bottom))]">
      <TopBar ctrl={ctrl} />

      <main className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pb-1">
        {panel(top, 'top')}
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-1.5">
          {panel(left, 'left')}
          <Center view={v} />
          {panel(right, 'right')}
        </div>
        {/* My discards */}
        <section aria-label={`${S.you}: discards`} className="flex justify-center">
          <Discards view={v} seat={me} />
        </section>
      </main>

      <footer className="shrink-0">
        <div className="flex min-h-6 flex-wrap items-end justify-between gap-2">
          <div className="flex items-end gap-2">
            <span className={`flex items-center gap-1 text-xs font-semibold ${turnSeat === me ? 'text-gold' : 'text-white/85'}`}>
              {v.seats[me].name}
              {v.seats[me].isDealer && (
                <span title={S.dealer} aria-label={S.dealer} className="rounded bg-gold px-1 text-[10px] font-extrabold text-black">
                  {S.dealerShort}
                </span>
              )}
              <span className="text-[10px] font-normal text-white/60">★{v.tally[me]}</span>
            </span>
            <Melds melds={v.seats[me].melds} size="small" />
          </div>
          <div className="ml-auto flex items-center gap-2">
            {ctrl.showWaits && v.waits && v.waits.length > 0 && (
              <div className="flex items-center gap-1 text-xs text-white/85">
                {S.waitingFor}
                {v.waits.map((k) => (
                  <Tile key={k} kind={k} size="tiny" static />
                ))}
              </div>
            )}
            {handOrder && (
              <button
                className="min-h-8 rounded-lg bg-black/30 px-2.5 text-xs font-bold ring-1 ring-white/25 active:translate-y-px"
                onClick={() => setArranged(null)}
                title={S.sortHandHint}
              >
                {S.sortHand}
              </button>
            )}
          </div>
        </div>
        <p
          aria-live="polite"
          className={`mt-1 rounded-lg px-2 py-1 text-center text-sm font-semibold ${turnSeat === me || v.claimDeadline ? 'bg-gold/20 text-gold' : 'text-white/85'}`}
        >
          {status}
        </p>
        <div className={`rounded-xl ${turnSeat === me ? 'anim-glow' : ''}`}>
          <Hand
            tiles={v.myHand}
            drawn={v.myDrawnTile}
            order={handOrder}
            onOrderChange={(order) => setArranged({ round: v.round, order })}
            discardable={discardable}
            selected={selected}
            onSelect={setPicked}
            onDiscard={(t) => act({ type: 'discard', tileId: t })}
          />
        </div>
        <ActionBar actions={v.legalActions} selected={selected} claimDeadline={v.claimDeadline} onAct={act} />
      </footer>

      {ctrl.banner && (
        <div
          key={ctrl.banner.id}
          role="status"
          className="anim-banner pointer-events-none fixed left-1/2 top-[40%] z-20 rounded-2xl bg-black/70 px-6 py-3 text-center shadow-2xl ring-2 ring-gold"
          style={{ transform: 'translate(-50%, -50%)' }}
        >
          <div className="text-3xl font-extrabold text-gold">{ctrl.banner.text}</div>
          <div className="text-sm text-white/90">{name(ctrl.banner.seat)}</div>
        </div>
      )}

      {ctrl.error && (
        <div role="alert" className="fixed inset-x-0 bottom-36 z-20 mx-auto w-max max-w-[90vw] rounded-lg bg-man px-3 py-2 text-sm font-semibold shadow-lg">
          {ctrl.error}
        </div>
      )}

      {v.phase === 'ROUND_END' && v.roundResult && <RoundEnd view={v} onNext={() => act({ type: 'next_round' })} />}
    </div>
  );
}

function statusLine(v: PlayerView, name: (s: number) => string): string {
  const me = v.mySeat;
  switch (v.phase) {
    case 'AWAIT_DISCARD':
      if (v.currentTurn !== me) return S.statusTheirTurn(name(v.currentTurn));
      if (v.legalActions.some((a) => a.type === 'declare_win')) return S.statusYourTurnWin;
      return v.myDrawnTile === undefined ? S.statusYourTurnAfterCall : S.statusYourTurn;
    case 'CLAIM_WINDOW':
      if (v.legalActions.length > 0 && v.lastDiscard) {
        return S.statusClaim(name(v.lastDiscard.seat), kindName(kindOf(v.lastDiscard.tile)));
      }
      return S.statusWaitingClaims;
    case 'ROUND_END':
      return S.statusRoundOver;
    default:
      return '';
  }
}

function TopBar({ ctrl }: { ctrl: GameController }) {
  const v = ctrl.view!;
  const [open, setOpen] = useState(false);
  const [sound, setSound] = useState(soundEnabled());
  return (
    <header className="relative flex h-9 shrink-0 items-center justify-between text-xs text-white/85">
      <span className="font-semibold">
        {S.round(v.round)}
        {ctrl.mode === 'remote' && <span className="ml-2 rounded bg-black/30 px-1.5 py-0.5 font-mono tracking-widest">{v.roomCode}</span>}
      </span>
      {ctrl.connection !== 'connected' && (
        <span className="rounded bg-man px-2 py-0.5 font-semibold text-white">{S.reconnecting}</span>
      )}
      <button
        className="grid h-8 w-8 place-items-center rounded-lg text-lg hover:bg-white/10"
        aria-label="Settings"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        ⚙
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-40 w-64 space-y-2 rounded-xl bg-felt-edge p-3 text-sm shadow-2xl ring-1 ring-white/20">
          <label className="flex items-center justify-between gap-2">
            {S.hintToggle}
            <input type="checkbox" className="h-5 w-5 accent-gold" checked={ctrl.showWaits} onChange={(e) => ctrl.setShowWaits(e.target.checked)} />
          </label>
          <label className="flex items-center justify-between gap-2">
            {S.soundToggle}
            <input
              type="checkbox"
              className="h-5 w-5 accent-gold"
              checked={sound}
              onChange={(e) => {
                setSoundEnabled(e.target.checked);
                setSound(e.target.checked);
              }}
            />
          </label>
          <button className="w-full rounded-lg bg-black/30 py-2 font-semibold ring-1 ring-white/20" onClick={ctrl.leave}>
            {S.leave}
          </button>
        </div>
      )}
    </header>
  );
}

function Center({ view }: { view: PlayerView }) {
  return (
    <div className="flex w-14 flex-col items-center justify-center self-center rounded-xl bg-black/25 py-2 text-center sm:w-20" aria-label={S.tilesLeft(view.wallCount)}>
      <span className="text-[10px] uppercase tracking-wider text-white/70">{S.wall}</span>
      <span className="text-xl font-extrabold tabular-nums sm:text-2xl">{view.wallCount}</span>
    </div>
  );
}

function SeatPanel({ view, seat, pos, isTurn }: { view: PlayerView; seat: number; pos: 'top' | 'left' | 'right'; isTurn: boolean }) {
  const s = view.seats[seat];
  return (
    <section
      aria-label={s.name}
      className={`min-w-0 rounded-xl bg-black/20 p-1.5 ${isTurn ? 'anim-glow' : 'ring-1 ring-white/10'} ${pos === 'top' ? 'mx-auto w-full max-w-md' : ''}`}
    >
      <div className="flex min-w-0 items-center gap-1 text-xs font-semibold">
        <span className="truncate">{s.name}</span>
        {s.isDealer && (
          <span title={S.dealer} aria-label={S.dealer} className="rounded bg-gold px-1 text-[10px] font-extrabold text-black">
            {S.dealerShort}
          </span>
        )}
        {s.isBot && <span className="text-[10px] font-normal text-white/60">{S.bot}</span>}
        {!s.connected && <span className="rounded bg-man px-1 text-[10px]">{S.disconnected}</span>}
        <span className="ml-auto shrink-0 text-[10px] font-normal text-white/60">★{view.tally[seat]}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-end gap-1.5">
        <span className="flex items-center gap-0.5 text-xs text-white/80" aria-label={`${s.handCount} tiles in hand`}>
          <Tile size="tiny" faceDown static />×{s.handCount}
        </span>
        <Melds melds={s.melds} size="tiny" />
      </div>
      <div className={`mt-1 ${pos === 'top' ? 'flex justify-center' : ''}`}>
        <Discards view={view} seat={seat} />
      </div>
    </section>
  );
}

/** A discard river in rows of 6. The most recent discard on the table glows gold. */
function Discards({ view, seat }: { view: PlayerView; seat: number }) {
  const tiles = view.seats[seat].discards;
  const last = view.lastDiscard?.seat === seat ? view.lastDiscard.tile : undefined;
  if (tiles.length === 0) return <div className="h-[var(--small-h)]" />;
  return (
    <div className="grid w-max grid-cols-6 gap-px" aria-label={`${view.seats[seat].name}: discards`}>
      {tiles.map((t) => (
        <Tile key={t} tile={t} size="small" static highlight={t === last} animate={t === last} />
      ))}
    </div>
  );
}
