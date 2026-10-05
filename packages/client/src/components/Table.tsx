/**
 * The mahjong table, laid out like a real one:
 *
 *                 [ top player's card ]
 *   [left card]   [ top player's river ]   [right card]
 *   [left river]  [      centre        ]   [right river]
 *                 [    my river        ]
 *   [ my rack: name, melds, status, hand, buttons ]
 *
 * Each player's discards sit in front of them, around the centre (wall count, round,
 * dealer, and a glowing edge pointing at whoever's turn it is).
 *
 * Seats: the next player in turn order sits on my RIGHT, the opposite player on top,
 * and the player before me on my LEFT (play passes counter-clockwise, so you chow
 * from the player on your left, like a real table).
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { kindName, kindOf, type PlayerView, type Tile as TileId } from '@mahjong/engine';
import { S } from '../strings';
import { setSoundEnabled, soundEnabled } from '../sound';
import type { GameController } from '../state/types';
import { SEAT_COLORS } from '../theme';
import { ActionBar } from './ActionBar';
import { Hand } from './Hand';
import { Melds } from './Melds';
import { RoundEnd } from './RoundEnd';
import { Tile } from './Tile';


const BOARD_STYLE: CSSProperties = {
  // Wide enough for the river grid plus some room for the side seat cards, never wider than the screen.
  width: 'min(100%, calc(var(--rv6w) + 2 * var(--rv-side-w) + 220px))',
  gridTemplateColumns: 'minmax(var(--rv-side-w), 1fr) var(--rv6w) minmax(var(--rv-side-w), 1fr)',
  // The board stretches to the full height between the top bar and my rack. On phones (where width
  // limits tile size) the spare height goes to the river rows above/below the centre, so the
  // seat cards sit up top instead of leaving empty felt.
  gridTemplateRows: 'auto minmax(var(--rv3h), 1fr) var(--rv-side-h) minmax(var(--rv3h), 1fr)',
  gridTemplateAreas: '"tchip tchip tchip" "lchip top rchip" "left center right" ". bottom ."',
};

type Side = 'top' | 'left' | 'right' | 'bottom';

export function Table({ ctrl }: { ctrl: GameController }) {
  const v = ctrl.view!;
  const me = v.mySeat;
  const seatAt: Record<Side, number> = { bottom: me, right: (me + 1) % 4, top: (me + 2) % 4, left: (me + 3) % 4 };

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
  const myTurn = turnSeat === me;
  const canClaim = !!v.claimDeadline && v.legalActions.length > 0;

  return (
    <div className="mx-auto flex h-dvh max-w-4xl flex-col px-2">
      <TopBar ctrl={ctrl} />

      {/* The table */}
      <main className="board-area flex min-h-0 flex-1 justify-center overflow-y-auto py-1">
        <div className="board table-surface grid gap-1.5 rounded-[28px] p-2 sm:gap-2 sm:p-4" style={BOARD_STYLE}>
          <div style={{ gridArea: 'tchip' }} className="flex justify-center">
            <SeatCard view={v} seat={seatAt.top} isTurn={turnSeat === seatAt.top} className="w-full max-w-[260px]" />
          </div>
          <div style={{ gridArea: 'lchip' }} className="flex items-start justify-end">
            <SeatCard view={v} seat={seatAt.left} isTurn={turnSeat === seatAt.left} className="w-full max-w-[210px]" />
          </div>
          <div style={{ gridArea: 'rchip' }} className="flex items-start justify-start">
            <SeatCard view={v} seat={seatAt.right} isTurn={turnSeat === seatAt.right} className="w-full max-w-[210px]" />
          </div>

          <River view={v} seat={seatAt.top} side="top" />
          <River view={v} seat={seatAt.left} side="left" />
          <River view={v} seat={seatAt.right} side="right" />
          <River view={v} seat={seatAt.bottom} side="bottom" />
          <Center view={v} seatAt={seatAt} turnSeat={turnSeat} />
        </div>
      </main>

      {/* My rack */}
      <footer className="card -mx-2 shrink-0 rounded-t-3xl px-2 pt-2 pb-[max(6px,env(safe-area-inset-bottom))] sm:mx-0">
        <div className="flex min-h-7 flex-wrap items-center gap-x-3 gap-y-1 px-1">
          <MyBadge view={v} isTurn={myTurn} />
          <Melds melds={v.seats[me].melds} size="small" />
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
                className="min-h-8 rounded-lg bg-white/10 px-2.5 text-xs font-bold ring-1 ring-white/20 hover:bg-white/15 active:translate-y-px"
                onClick={() => setArranged(null)}
                title={S.sortHandHint}
              >
                ↺ {S.sortHand}
              </button>
            )}
          </div>
        </div>

        <p
          aria-live="polite"
          className={`mx-auto mt-1.5 w-fit max-w-full rounded-full px-3 py-1 text-center text-[13px] font-semibold sm:text-sm ${
            myTurn || canClaim ? 'bg-gold text-[#1d1d1d] shadow-[0_0_14px_rgb(224_179_58/.45)]' : 'bg-black/25 text-white/85'
          }`}
        >
          {statusLine(v, name)}
        </p>

        <div className={`mt-0.5 rounded-xl ${myTurn ? 'anim-glow' : ''}`}>
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
          className="anim-banner pointer-events-none fixed left-1/2 top-[40%] z-20 rounded-2xl bg-black/75 px-7 py-3 text-center shadow-2xl ring-2 ring-gold"
          style={{ transform: 'translate(-50%, -50%)' }}
        >
          <div className="text-3xl font-extrabold text-gold drop-shadow">{ctrl.banner.text}</div>
          <div className="text-sm text-white/90">{name(ctrl.banner.seat)}</div>
        </div>
      )}

      {ctrl.error && (
        <div role="alert" className="fixed inset-x-0 bottom-40 z-20 mx-auto w-max max-w-[90vw] rounded-xl bg-man px-3 py-2 text-sm font-semibold shadow-lg">
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
    <header className="relative flex h-10 shrink-0 items-center justify-between gap-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="font-extrabold tracking-tight text-white/90">{S.gameName}</span>
        {ctrl.mode === 'remote' && (
          <span className="rounded-md bg-black/30 px-1.5 py-0.5 font-mono font-semibold tracking-widest text-gold">{v.roomCode}</span>
        )}
      </div>
      {ctrl.connection !== 'connected' && (
        <span className="rounded-full bg-man px-2.5 py-0.5 font-semibold text-white">{S.reconnecting}</span>
      )}
      <button
        className="grid h-9 w-9 place-items-center rounded-xl text-lg text-white/85 hover:bg-white/10"
        aria-label="Settings"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        ⚙
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-40 w-64 space-y-3 rounded-2xl bg-felt-edge p-3 text-sm shadow-2xl ring-1 ring-white/15">
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
          <button className="w-full rounded-xl bg-black/30 py-2 font-semibold ring-1 ring-white/15 hover:bg-black/40" onClick={ctrl.leave}>
            {S.leave}
          </button>
        </div>
      )}
    </header>
  );
}

/** The middle of the table: wall count, round, dealer marker, and a gold edge toward whoever's turn it is. */
function Center({ view, seatAt, turnSeat }: { view: PlayerView; seatAt: Record<Side, number>; turnSeat: number }) {
  const dealer = view.seats.findIndex((s) => s.isDealer);
  const edge: Record<Side, string> = {
    top: 'inset-x-3 top-1 h-1',
    bottom: 'inset-x-3 bottom-1 h-1',
    left: 'inset-y-3 left-1 w-1',
    right: 'inset-y-3 right-1 w-1',
  };
  const dealerSpot: Record<Side, string> = {
    top: 'top-3 left-1/2 -translate-x-1/2',
    bottom: 'bottom-3 left-1/2 -translate-x-1/2',
    left: 'left-3 top-1/2 -translate-y-1/2',
    right: 'right-3 top-1/2 -translate-y-1/2',
  };
  const sides = Object.keys(seatAt) as Side[];
  const dealerSide = sides.find((s) => seatAt[s] === dealer);

  return (
    <div
      style={{ gridArea: 'center' }}
      className="relative flex flex-col items-center justify-center rounded-2xl bg-black/30 text-center shadow-[inset_0_2px_10px_rgb(0_0_0/.35)] ring-1 ring-white/10"
      aria-label={`${S.round(view.round)}, ${S.tilesLeft(view.wallCount)}`}
    >
      {sides.map((side) => (
        <span
          key={side}
          aria-hidden
          className={`absolute rounded-full transition-colors duration-300 ${edge[side]} ${
            turnSeat === seatAt[side] ? 'bg-gold shadow-[0_0_12px_2px_rgb(224_179_58/.7)]' : 'bg-white/10'
          }`}
        />
      ))}
      {dealerSide && (
        <span
          title={S.dealer}
          className={`absolute grid h-5 w-5 place-items-center rounded-full bg-gold text-[10px] font-extrabold text-black shadow ${dealerSpot[dealerSide]}`}
        >
          {S.dealerShort}
        </span>
      )}
      <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-white/65 sm:text-[10px]">{S.wall}</span>
      <span className="text-2xl font-extrabold leading-none tabular-nums sm:text-4xl">{view.wallCount}</span>
      <span className="mt-1 text-[10px] font-semibold text-white/65 sm:text-xs">{S.round(view.round)}</span>
    </div>
  );
}

/** Initial in a coloured circle (humans) or rounded square (bots), with the dealer's D on its corner. */
export function Avatar({ name, color, faded, isBot, isDealer }: { name: string; color: string; faded?: boolean; isBot?: boolean; isDealer?: boolean }) {
  return (
    <span className="relative shrink-0" title={[isBot ? S.bot : '', isDealer ? S.dealer : ''].filter(Boolean).join(', ') || undefined}>
      <span
        aria-hidden
        className={`grid h-6 w-6 place-items-center text-[11px] font-extrabold text-white shadow-[inset_0_-2px_0_rgb(0_0_0/.2)] ${isBot ? 'rounded-md' : 'rounded-full'} ${faded ? 'opacity-50' : ''}`}
        style={{ background: color }}
      >
        {(name.trim()[0] ?? '?').toUpperCase()}
      </span>
      {isDealer && (
        <span aria-label={S.dealer} className="absolute -right-1.5 -top-1.5 grid h-3.5 w-3.5 place-items-center rounded-full bg-gold text-[8px] font-extrabold text-black ring-2 ring-felt-edge">
          {S.dealerShort}
        </span>
      )}
    </span>
  );
}

/** An opponent: name, dealer/bot/disconnected badges, tile count, wins, called melds. Glows on their turn. */
function SeatCard({ view, seat, isTurn, className = '' }: { view: PlayerView; seat: number; isTurn: boolean; className?: string }) {
  const s = view.seats[seat];
  return (
    <section aria-label={s.name} className={`card min-w-0 rounded-2xl px-2 py-1.5 ${isTurn ? 'anim-glow' : ''} ${className}`}>
      <div className="flex min-w-0 items-center gap-1.5">
        <Avatar name={s.name} color={SEAT_COLORS[seat]} faded={!s.connected} isBot={s.isBot} isDealer={s.isDealer} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-bold leading-tight">{s.name}</div>
          <div className="flex items-center gap-1 text-[10px] leading-tight text-white/70">
            {!s.connected ? (
              <span className="rounded bg-man px-1 font-semibold text-white">{S.disconnected}</span>
            ) : isTurn ? (
              <span className="font-semibold text-gold">{s.isBot ? S.thinking : S.playing}</span>
            ) : (
              <span className="flex items-center gap-1" aria-label={`${s.handCount} tiles in hand`}>
                <span aria-hidden className="inline-block h-2.5 w-[7px] rounded-[2px] bg-tile-back ring-1 ring-tile-edge/70" />
                {s.handCount}
              </span>
            )}
            <span className="ml-auto shrink-0">★{view.tally[seat]}</span>
          </div>
        </div>
      </div>
      {s.melds.length > 0 && (
        <div className="mt-1">
          <Melds melds={s.melds} size="tiny" />
        </div>
      )}
    </section>
  );
}

function MyBadge({ view, isTurn }: { view: PlayerView; isTurn: boolean }) {
  const s = view.seats[view.mySeat];
  return (
    <span className="flex items-center gap-1.5 text-xs font-bold">
      <Avatar name={s.name} color={SEAT_COLORS[view.mySeat]} isDealer={s.isDealer} />
      <span className={isTurn ? 'text-gold' : 'text-white/90'}>{s.name}</span>
      <span className="text-[10px] font-normal text-white/65">★{view.tally[view.mySeat]}</span>
    </span>
  );
}

/**
 * A discard river, sitting in front of its player and growing away from the centre:
 *   top    rows of 6, new rows stack upward      left   columns (6 tall, 8 on phones), new columns grow leftward
 *   bottom rows of 6, new rows stack downward    right  columns (6 tall, 8 on phones), new columns grow rightward
 * The most recent discard on the table glows gold.
 */
function River({ view, seat, side }: { view: PlayerView; seat: number; side: Side }) {
  const tiles = view.seats[seat].discards;
  const last = view.lastDiscard?.seat === seat ? view.lastDiscard.tile : undefined;
  const vertical = side === 'left' || side === 'right';
  const style: CSSProperties = vertical
    ? {
        gridArea: side,
        display: 'grid',
        gridAutoFlow: 'column',
        gridTemplateRows: 'repeat(var(--side-rows), var(--rh))',
        gridAutoColumns: 'var(--rw)',
        gap: 1,
        justifySelf: side === 'left' ? 'end' : 'start',
        alignSelf: 'center',
        direction: side === 'left' ? 'rtl' : 'ltr', // left river fills from the centre outward
      }
    : side === 'top'
      ? { gridArea: side, display: 'flex', flexWrap: 'wrap-reverse', alignContent: 'flex-start', gap: 1, width: 'var(--rv6w)', alignSelf: 'end', justifySelf: 'center' }
      : { gridArea: side, display: 'grid', gridTemplateColumns: 'repeat(6, var(--rw))', gap: 1, alignSelf: 'start', justifySelf: 'center' };

  return (
    <div style={style} aria-label={`${view.seats[seat].name}: discards`}>
      {tiles.map((t) => (
        <Tile key={t} tile={t} size="river" static highlight={t === last} animate={t === last} />
      ))}
    </div>
  );
}
