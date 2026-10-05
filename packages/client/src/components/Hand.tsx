/**
 * My concealed hand. Auto-sorted by kind until I rearrange it; the just-drawn
 * tile sits a few px apart (until I drag it into the hand).
 *
 * Tap a tile to select it (it lifts 8px). Tap it again, or press Discard, to discard.
 * Drag a tile left/right to rearrange (a press only becomes a drag after ~8px of movement,
 * so taps still work). The order is purely local: the server never sees or needs it.
 *
 * Keyboard: Left/Right arrows move the selection, Enter selects / discards,
 * Shift+Left/Right moves the focused tile.
 */
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { kindName, kindOf, type Tile as TileId } from '@mahjong/engine';
import { S } from '../strings';
import { Tile } from './Tile';

interface HandProps {
  /** My concealed tiles (sorted by the server), without the drawn tile. */
  tiles: TileId[];
  drawn?: TileId;
  /** My own arrangement, or null for auto-sort. */
  order: TileId[] | null;
  onOrderChange: (order: TileId[]) => void;
  /** Tiles I may discard right now (empty when it's not my turn). */
  discardable: Set<TileId>;
  selected: TileId | null;
  onSelect: (tile: TileId | null) => void;
  onDiscard: (tile: TileId) => void;
}

/** How far (px) a press must move before it counts as a drag instead of a tap. */
const DRAG_THRESHOLD = 8;

function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const out = [...list];
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item);
  return out;
}

/**
 * Work out what to show: the tiles in the hand row (in my order), plus the drawn tile
 * if it is still sitting apart. Tiles I don't have an order for yet (new draws, tiles left
 * after a claim) join on the right, like picking up a tile at a real table.
 */
function layout(tiles: TileId[], drawn: TileId | undefined, order: TileId[] | null) {
  if (!order) return { row: tiles, loose: drawn };
  const have = new Set(drawn !== undefined ? [...tiles, drawn] : tiles);
  const kept = order.filter((t) => have.has(t));
  const keptSet = new Set(kept);
  const row = [...kept, ...tiles.filter((t) => !keptSet.has(t))];
  const loose = drawn !== undefined && !keptSet.has(drawn) ? drawn : undefined;
  return { row, loose };
}

interface DragState {
  tile: TileId;
  pointerId: number;
  startX: number;
  from: number;
  /** Centre x of every slot, measured when the press started. */
  centers: number[];
  active: boolean;
}

export function Hand({ tiles, drawn, order, onOrderChange, discardable, selected, onSelect, onDiscard }: HandProps) {
  const refs = useRef(new Map<TileId, HTMLButtonElement>());
  const press = useRef<DragState | null>(null);
  const justDragged = useRef(false);
  // Live preview while dragging: which slot the tile would land in, and how far to shift it.
  const [preview, setPreview] = useState<{ from: number; to: number; offset: number } | null>(null);

  const { row, loose } = layout(tiles, drawn, order);
  const seq = loose !== undefined ? [...row, loose] : row;
  const display = preview ? moveItem(seq, preview.from, preview.to) : seq;
  const dragging = preview ? seq[preview.from] : null;

  /** Save a new arrangement. If the drawn tile is still last it stays apart; otherwise it joins the hand. */
  const commit = (next: TileId[]) => {
    const keepLoose = loose !== undefined && next[next.length - 1] === loose;
    onOrderChange(keepLoose ? next.filter((t) => t !== loose) : next);
  };

  const click = (t: TileId) => {
    if (justDragged.current) {
      justDragged.current = false;
      return;
    }
    if (!discardable.has(t)) return;
    if (selected === t) onDiscard(t);
    else onSelect(t);
  };

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>, t: TileId) => {
    if (e.button !== 0) return;
    justDragged.current = false;
    const centers = seq.map((s) => {
      const r = refs.current.get(s)?.getBoundingClientRect();
      return r ? r.left + r.width / 2 : 0;
    });
    press.current = { tile: t, pointerId: e.pointerId, startX: e.clientX, from: seq.indexOf(t), centers, active: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const p = press.current;
    if (!p || p.pointerId !== e.pointerId) return;
    if (!p.active && Math.abs(e.clientX - p.startX) < DRAG_THRESHOLD) return;
    p.active = true;
    // Land in the slot whose centre is nearest the pointer.
    let to = 0;
    p.centers.forEach((c, i) => {
      if (Math.abs(c - e.clientX) < Math.abs(p.centers[to] - e.clientX)) to = i;
    });
    setPreview({ from: p.from, to, offset: e.clientX - p.centers[to] });
  };

  const endPress = (e: PointerEvent<HTMLButtonElement>, cancelled: boolean) => {
    const p = press.current;
    if (!p || p.pointerId !== e.pointerId) return;
    press.current = null;
    if (p.active) {
      // Swallow the click the browser may fire right after the drag. Cleared on the next tick,
      // because touch screens don't always send that click and we must not eat a real tap later.
      justDragged.current = true;
      setTimeout(() => (justDragged.current = false), 0);
      if (!cancelled && preview) commit(moveItem(seq, preview.from, preview.to));
    }
    setPreview(null);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const step = e.key === 'ArrowRight' ? 1 : -1;

    if (e.shiftKey) {
      // Move the focused tile one place.
      const focused = seq.find((t) => refs.current.get(t) === document.activeElement);
      if (focused === undefined) return;
      const from = seq.indexOf(focused);
      const to = Math.min(seq.length - 1, Math.max(0, from + step));
      if (to !== from) commit(moveItem(seq, from, to));
      return;
    }

    const cur = selected !== null ? seq.indexOf(selected) : -1;
    const idx = cur < 0 ? (step > 0 ? 0 : seq.length - 1) : (cur + step + seq.length) % seq.length;
    const next = seq[idx];
    if (discardable.has(next)) onSelect(next);
    refs.current.get(next)?.focus();
  };

  return (
    <div
      role="group"
      aria-label="Your hand. Drag tiles, or use Shift and the arrow keys, to rearrange."
      className="flex items-end justify-center gap-px pt-2.5"
      onKeyDown={onKeyDown}
    >
      {display.map((t, i) => {
        const isDragged = t === dragging;
        // The drawn tile sits apart, with a gold bar under it, until it's discarded or dragged into the hand.
        const apart = !preview && t === loose && i === display.length - 1;
        // Every tile gets the same wrapper so a tile is never remounted when it stops being "apart"
        // (that would drop the pointer capture in the middle of a drag).
        return (
          <span key={t} className={`relative inline-flex ${apart ? 'ml-[10px]' : ''}`}>
          <Tile
            tile={t}
            size="hand"
            selected={selected === t}
            onClick={() => click(t)}
            onPointerDown={(e) => onPointerDown(e, t)}
            onPointerMove={onPointerMove}
            onPointerUp={(e) => endPress(e, false)}
            onPointerCancel={(e) => endPress(e, true)}
            // Only override the tile's own label for the drawn tile (passing undefined would erase it).
            {...(apart ? { 'aria-label': `${kindName(kindOf(t))} (${S.justDrawn})`, title: S.justDrawn } : {})}
            aria-disabled={!discardable.has(t)}
            tabIndex={selected === t || (selected === null && i === 0) ? 0 : -1}
            style={{
              touchAction: 'none',
              ...(isDragged && preview
                ? { transform: `translate(${preview.offset}px, -6px)`, zIndex: 10, transition: 'none', cursor: 'grabbing' }
                : {}),
            }}
            ref={(el: HTMLButtonElement | null) => {
              if (el) refs.current.set(t, el);
              else refs.current.delete(t);
            }}
          />
          {apart && (
            <span aria-hidden className="pointer-events-none absolute -bottom-2 left-1/2 h-1 w-3/5 -translate-x-1/2 rounded-full bg-gold shadow-[0_0_6px_rgb(224_179_58/.8)]" />
          )}
          </span>
        );
      })}
    </div>
  );
}
