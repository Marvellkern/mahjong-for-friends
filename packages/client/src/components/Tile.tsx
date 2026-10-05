/**
 * A mahjong tile drawn with SVG (no emoji, no third-party art).
 *
 * Suits are told apart by SHAPE, not just colour (colourblind friendly):
 *   Characters = big numeral + 萬     Dots = circle layout     Bamboo = stick layout
 *   Winds = 東南西北 (+ tiny E/S/W/N)  Dragons = 中 / 發 / blank tile with a blue frame
 */
import { kindName, kindOf, rankOf, suitOf, type Kind, type Tile as TileId } from '@mahjong/engine';
import type { ButtonHTMLAttributes } from 'react';

export type TileSize = 'hand' | 'small' | 'tiny';

const SIZE_STYLE: Record<TileSize, React.CSSProperties> = {
  hand: { width: 'var(--hand-w)', height: 'var(--hand-h)' },
  small: { width: 'var(--small-w)', height: 'var(--small-h)' },
  tiny: { width: 'var(--tiny-w)', height: 'var(--tiny-h)' },
};

const C = {
  man: 'var(--color-man)',
  pin: 'var(--color-pin)',
  sou: 'var(--color-sou)',
  wind: 'var(--color-wind)',
};

// Pip layouts in a 60x84 box: [x, y] centres.
const DOTS: Record<number, [number, number][]> = {
  1: [[30, 42]],
  2: [[30, 22], [30, 62]],
  3: [[15, 17], [30, 42], [45, 67]],
  4: [[18, 24], [42, 24], [18, 60], [42, 60]],
  5: [[16, 18], [44, 18], [30, 42], [16, 66], [44, 66]],
  6: [[18, 17], [42, 17], [18, 42], [42, 42], [18, 67], [42, 67]],
  7: [[14, 13], [30, 23], [46, 33], [18, 54], [42, 54], [18, 73], [42, 73]],
  8: [[18, 13], [42, 13], [18, 32], [42, 32], [18, 52], [42, 52], [18, 71], [42, 71]],
  9: [[14, 17], [30, 17], [46, 17], [14, 42], [30, 42], [46, 42], [14, 67], [30, 67], [46, 67]],
};
const DOT_R: Record<number, number> = { 1: 17, 2: 12, 3: 10, 4: 11, 5: 9.5, 6: 9.5, 7: 8, 8: 8, 9: 8 };

// Bamboo sticks: [x, y] centres + stick height per count.
const STICKS: Record<number, { pos: [number, number][]; h: number; w: number }> = {
  1: { pos: [[30, 42]], h: 56, w: 12 },
  2: { pos: [[30, 24], [30, 60]], h: 28, w: 8 },
  3: { pos: [[30, 24], [18, 60], [42, 60]], h: 28, w: 8 },
  4: { pos: [[18, 24], [42, 24], [18, 60], [42, 60]], h: 28, w: 8 },
  5: { pos: [[14, 24], [46, 24], [30, 42], [14, 60], [46, 60]], h: 28, w: 8 },
  6: { pos: [[12, 24], [30, 24], [48, 24], [12, 60], [30, 60], [48, 60]], h: 28, w: 8 },
  7: { pos: [[30, 15], [12, 43], [30, 43], [48, 43], [12, 69], [30, 69], [48, 69]], h: 20, w: 8 },
  8: { pos: [[9, 24], [23, 24], [37, 24], [51, 24], [9, 60], [23, 60], [37, 60], [51, 60]], h: 28, w: 7 },
  9: { pos: [[12, 15], [30, 15], [48, 15], [12, 42], [30, 42], [48, 42], [12, 69], [30, 69], [48, 69]], h: 20, w: 8 },
};

const WIND_CHARS = ['東', '南', '西', '北'];
const WIND_LETTERS = ['E', 'S', 'W', 'N'];

function Face({ kind }: { kind: Kind }) {
  const suit = suitOf(kind);
  const rank = rankOf(kind);
  const cjk = { fontFamily: 'var(--font-cjk)', fontWeight: 700 } as const;

  if (suit === 'man') {
    return (
      <>
        <text x="30" y="38" textAnchor="middle" fontSize="40" fontWeight="800" fill="#1d1d1d" fontFamily="var(--font-sans)">
          {rank}
        </text>
        <text x="30" y="78" textAnchor="middle" fontSize="37" fill={C.man} style={cjk}>
          萬
        </text>
      </>
    );
  }
  if (suit === 'pin') {
    const r = DOT_R[rank];
    return (
      <>
        {DOTS[rank].map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r={r} fill={C.pin} />
            <circle cx={x} cy={y} r={r * 0.55} fill="none" stroke="#f5f0e1" strokeWidth={Math.max(1.5, r * 0.18)} />
          </g>
        ))}
      </>
    );
  }
  if (suit === 'sou') {
    const { pos, h, w } = STICKS[rank];
    return (
      <>
        {pos.map(([x, y], i) => (
          <g key={i}>
            <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={w / 2} fill={C.sou} />
            {/* bamboo "node" in the middle of each stick */}
            <rect x={x - w / 2 - 1} y={y - 1.5} width={w + 2} height={3} rx={1.5} fill="#1b5e20" />
          </g>
        ))}
      </>
    );
  }
  if (suit === 'wind') {
    return (
      <>
        <text x="30" y="58" textAnchor="middle" fontSize="40" fill={C.wind} style={cjk}>
          {WIND_CHARS[rank - 1]}
        </text>
        <text x="7" y="15" fontSize="12" fontWeight="800" fill={C.wind} fontFamily="var(--font-sans)">
          {WIND_LETTERS[rank - 1]}
        </text>
      </>
    );
  }
  // Dragons: White (blank, blue frame), Green 發, Red 中
  if (rank === 1) {
    return <rect x="12" y="14" width="36" height="56" rx="4" fill="none" stroke={C.pin} strokeWidth="5" />;
  }
  return (
    <text x="30" y="58" textAnchor="middle" fontSize="42" fill={rank === 2 ? C.sou : C.man} style={cjk}>
      {rank === 2 ? '發' : '中'}
    </text>
  );
}

interface TileProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Physical tile id (or pass `kind` instead). */
  tile?: TileId;
  kind?: Kind;
  size?: TileSize;
  faceDown?: boolean;
  selected?: boolean;
  /** Gold ring: last discard / winning tile. */
  highlight?: boolean;
  /** Render as a plain element instead of a button (for display-only tiles). */
  static?: boolean;
  animate?: boolean;
  ref?: React.Ref<HTMLButtonElement>;
}

export function Tile({
  tile,
  kind: kindProp,
  size = 'hand',
  faceDown,
  selected,
  highlight,
  static: isStatic,
  animate,
  className = '',
  style,
  ref,
  ...rest
}: TileProps) {
  const kind = kindProp ?? (tile !== undefined ? kindOf(tile) : 0);
  const label = faceDown ? 'Hidden tile' : kindName(kind);
  const edge = size === 'hand' ? 3 : size === 'small' ? 2 : 1.5;
  const css: React.CSSProperties = {
    ...SIZE_STYLE[size],
    boxShadow: [
      `0 ${edge}px 0 ${faceDown ? '#1e6b4f' : 'var(--color-tile-edge)'}`,
      highlight ? '0 0 0 2px var(--color-gold), 0 0 10px 1px rgb(224 179 58 / .7)' : '',
      '0 1px 4px rgb(0 0 0 / .35)',
    ]
      .filter(Boolean)
      .join(','),
    transform: selected ? 'translateY(-8px)' : undefined,
    ...style,
  };
  const cls = [
    'relative inline-block shrink-0 rounded-[12%/9%] tile-lift select-none',
    faceDown ? 'bg-tile-back' : 'bg-tile',
    animate ? 'anim-discard' : '',
    className,
  ].join(' ');
  const svg = faceDown ? (
    <svg viewBox="0 0 60 84" className="absolute inset-0 h-full w-full" aria-hidden>
      <rect x="6" y="6" width="48" height="72" rx="6" fill="none" stroke="rgb(255 255 255 / .18)" strokeWidth="3" />
    </svg>
  ) : (
    <svg viewBox="0 0 60 84" className="absolute inset-0 h-full w-full" aria-hidden>
      <Face kind={kind} />
    </svg>
  );

  if (isStatic) {
    return (
      <span role="img" aria-label={label} className={cls} style={css}>
        {svg}
      </span>
    );
  }
  return (
    <button ref={ref} type="button" aria-label={label} aria-pressed={selected} className={cls + ' cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold'} style={css} {...rest}>
      {svg}
    </button>
  );
}
