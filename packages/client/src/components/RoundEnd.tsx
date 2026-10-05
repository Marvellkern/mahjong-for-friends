/** Round end: reveal every hand, show who won (and from whom), the tally, and "Next round". */
import type { PlayerView } from '@mahjong/engine';
import { S } from '../strings';
import { Melds } from './Melds';
import { Tile } from './Tile';

export function RoundEnd({ view, onNext }: { view: PlayerView; onNext: () => void }) {
  const r = view.roundResult!;
  const name = (seat: number) => (seat === view.mySeat ? S.you : view.seats[seat].name);
  const canNext = view.legalActions.some((a) => a.type === 'next_round');
  const title =
    r.type === 'draw' ? S.wallEmpty : r.winner === view.mySeat ? S.youWon : S.someoneWon(view.seats[r.winner!].name);
  const subtitle =
    r.type === 'win' ? (r.winType === 'self-draw' ? S.wonBySelfDraw : S.wonByDiscard(name(r.from!))) : undefined;
  // List the winner first, then the rest in seat order.
  const order = [0, 1, 2, 3].sort((a, b) => Number(b === r.winner) - Number(a === r.winner));

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/55 p-2 sm:items-center" role="dialog" aria-modal aria-labelledby="round-end-title">
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-felt-edge p-4 shadow-2xl ring-1 ring-white/15">
        <h2 id="round-end-title" className="text-center text-2xl font-extrabold text-gold">
          {title}
        </h2>
        {subtitle && <p className="mt-0.5 text-center text-sm text-white/80">{subtitle}</p>}

        <ul className="mt-4 space-y-3">
          {order.map((seat) => {
            const isWinner = r.winner === seat;
            const hand = r.hands?.[seat] ?? [];
            return (
              <li key={seat} className={`rounded-xl p-2 ${isWinner ? 'bg-gold/15 ring-1 ring-gold' : 'bg-black/20'}`}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-semibold">
                    {name(seat)}
                    {view.seats[seat].isDealer && <span className="ml-1.5 rounded bg-gold px-1 text-[10px] font-extrabold text-black">{S.dealerShort}</span>}
                  </span>
                  <span className="text-white/70">{S.wins(view.tally[seat])}</span>
                </div>
                <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
                  <div className="flex flex-wrap gap-px">
                    {hand.map((t) => (
                      <Tile key={t} tile={t} size="small" static highlight={isWinner && t === r.winningTile} />
                    ))}
                  </div>
                  <Melds melds={view.seats[seat].melds} size="small" />
                </div>
              </li>
            );
          })}
        </ul>

        <button
          className="mt-4 min-h-12 w-full rounded-xl bg-gold text-lg font-extrabold text-[#1d1d1d] shadow-[0_3px_0_rgb(0_0_0/.3)] disabled:opacity-40"
          onClick={onNext}
          disabled={!canNext}
          autoFocus
        >
          {S.nextRound}
        </button>
      </div>
    </div>
  );
}
