/**
 * Big buttons for whatever I can do right now. The server/engine decides what is
 * legal (view.legalActions); this component only renders it.
 */
import { useEffect, useState } from 'react';
import type { Action, Tile as TileId } from '@mahjong/engine';
import { S } from '../strings';
import { Tile } from './Tile';

interface ActionBarProps {
  actions: Action[];
  selected: TileId | null;
  claimDeadline?: number;
  onAct: (a: Action) => void;
}

const btn =
  'min-h-11 rounded-xl px-4 py-2 text-base font-extrabold shadow-[0_3px_0_rgb(0_0_0/.3)] active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-40';
const gold = `${btn} bg-gold text-[#1d1d1d]`;
const light = `${btn} bg-tile text-[#1d1d1d]`;
const ghost = `${btn} bg-black/30 text-white ring-1 ring-white/30`;

export function ActionBar({ actions, selected, claimDeadline, onAct }: ActionBarProps) {
  const win = actions.find((a) => a.type === 'declare_win' || (a.type === 'claim' && a.claim === 'win'));
  const kongs = actions.filter(
    (a) => (a.type === 'claim' && a.claim === 'kong') || a.type === 'concealed_kong' || a.type === 'added_kong',
  );
  const pung = actions.find((a) => a.type === 'claim' && a.claim === 'pung');
  const chows = actions.filter((a): a is Extract<Action, { type: 'claim' }> => a.type === 'claim' && a.claim === 'chow');
  const pass = actions.find((a) => a.type === 'pass');
  const canDiscard = actions.some((a) => a.type === 'discard');
  const discardSelected = selected !== null && actions.some((a) => a.type === 'discard' && a.tileId === selected);

  return (
    <div className="flex min-h-14 flex-col items-center justify-center gap-1.5 py-1.5">
      {claimDeadline && pass && <Countdown key={claimDeadline} deadline={claimDeadline} />}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {win && (
          <button className={gold + ' px-6 text-lg'} onClick={() => onAct(win)}>
            {S.mahjong}
          </button>
        )}
        {kongs.map((a, i) => (
          <button key={'k' + i} className={light} onClick={() => onAct(a)}>
            {a.type === 'added_kong' ? S.addedKong : S.kong}
            {(a.type === 'concealed_kong' || a.type === 'added_kong') && (
              <span className="ml-1.5 inline-flex align-middle">
                <Tile kind={a.kind} size="tiny" static />
              </span>
            )}
          </button>
        ))}
        {pung && (
          <button className={light} onClick={() => onAct(pung)}>
            {S.pung}
          </button>
        )}
        {chows.map((a, i) => (
          <button key={'c' + i} className={light + ' flex items-center gap-1.5'} onClick={() => onAct(a)} aria-label={`${S.chow} ${i + 1}`}>
            {S.chow}
            <span className="inline-flex gap-px">
              {a.chowKinds!.map((k) => (
                <Tile key={k} kind={k} size="tiny" static />
              ))}
            </span>
          </button>
        ))}
        {pass && (
          <button className={ghost} onClick={() => onAct(pass)}>
            {S.pass}
          </button>
        )}
        {canDiscard && (
          <button
            className={ghost}
            disabled={!discardSelected}
            onClick={() => selected !== null && onAct({ type: 'discard', tileId: selected })}
          >
            {S.discard}
          </button>
        )}
      </div>
    </div>
  );
}

function Countdown({ deadline }: { deadline: number }) {
  const [now, setNow] = useState(() => Date.now());
  // Fixed when the bar mounts (it is keyed by deadline), so the CSS animation runs once smoothly.
  const [total] = useState(() => Math.max(1, deadline - Date.now()));
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const secs = Math.max(0, Math.ceil((deadline - now) / 1000));
  return (
    <div className="flex w-full max-w-xs items-center gap-2 text-xs text-white/80" aria-live="off">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/30">
        <div
          className="h-full origin-left rounded-full bg-gold"
          style={{ animation: `countdown ${total}ms linear forwards` }}
        />
      </div>
      <span className="w-6 tabular-nums">{S.secondsLeft(secs)}</span>
    </div>
  );
}
