/**
 * My concealed hand. Sorted by kind; the just-drawn tile sits a few px apart.
 *
 * Tap a tile to select it (it lifts 8px). Tap it again, or press Discard, to discard.
 * Keyboard: Left/Right arrows move the selection, Enter selects / discards.
 */
import { useRef, type KeyboardEvent } from 'react';
import type { Tile as TileId } from '@mahjong/engine';
import { Tile } from './Tile';

interface HandProps {
  tiles: TileId[];
  drawn?: TileId;
  /** Tiles I may discard right now (empty when it's not my turn). */
  discardable: Set<TileId>;
  selected: TileId | null;
  onSelect: (tile: TileId | null) => void;
  onDiscard: (tile: TileId) => void;
}

export function Hand({ tiles, drawn, discardable, selected, onSelect, onDiscard }: HandProps) {
  const order = drawn !== undefined ? [...tiles, drawn] : tiles;
  const refs = useRef(new Map<TileId, HTMLButtonElement>());

  const click = (t: TileId) => {
    if (!discardable.has(t)) return;
    if (selected === t) onDiscard(t);
    else onSelect(t);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const cur = selected !== null ? order.indexOf(selected) : -1;
    const step = e.key === 'ArrowRight' ? 1 : -1;
    const idx = cur < 0 ? (step > 0 ? 0 : order.length - 1) : (cur + step + order.length) % order.length;
    const next = order[idx];
    if (discardable.has(next)) onSelect(next);
    refs.current.get(next)?.focus();
  };

  const render = (t: TileId, extra?: string) => (
    <Tile
      key={t}
      tile={t}
      size="hand"
      selected={selected === t}
      onClick={() => click(t)}
      className={extra}
      aria-disabled={!discardable.has(t)}
      tabIndex={selected === t || (selected === null && t === order[0]) ? 0 : -1}
      ref={(el: HTMLButtonElement | null) => {
        if (el) refs.current.set(t, el);
        else refs.current.delete(t);
      }}
    />
  );

  return (
    <div role="group" aria-label="Your hand" className="flex items-end justify-center gap-px pt-2.5" onKeyDown={onKeyDown}>
      {tiles.map((t) => render(t))}
      {drawn !== undefined && render(drawn, 'ml-[5px]')}
    </div>
  );
}
