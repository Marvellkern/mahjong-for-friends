import type { Meld } from '@mahjong/engine';
import { Tile, type TileSize } from './Tile';

/** A row of declared melds. Concealed kongs show their two outer tiles face down. */
export function Melds({ melds, size = 'tiny', highlightTile }: { melds: Meld[]; size?: TileSize; highlightTile?: number }) {
  if (melds.length === 0) return null;
  return (
    <div className="flex flex-wrap items-end gap-1.5">
      {melds.map((m, i) => (
        <div key={i} className="flex gap-px" aria-label={`${m.type}${m.open ? '' : ' (concealed)'}`}>
          {m.tiles.map((t, j) => (
            <Tile
              key={t}
              tile={t}
              size={size}
              static
              faceDown={!m.open && (j === 0 || j === 3)}
              highlight={t === highlightTile}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
