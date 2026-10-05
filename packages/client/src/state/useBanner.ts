import { useCallback, useRef, useState } from 'react';
import type { GameEvent } from '@mahjong/engine';
import { S } from '../strings';
import type { Banner } from './types';
import { playSound } from '../sound';

/** Turn engine events into short-lived call banners (and optional sounds). */
export function useBanner() {
  const [banner, setBanner] = useState<Banner | null>(null);
  const counter = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const onEvents = useCallback((events: GameEvent[]) => {
    for (const e of events) {
      let next: Banner | null = null;
      if (e.type === 'discard') playSound('discard');
      if (e.type === 'call') {
        next = { id: ++counter.current, seat: e.seat, text: S.callBanner[e.call] };
        playSound('call');
      }
      if (e.type === 'win') {
        next = { id: ++counter.current, seat: e.seat, text: S.callBanner.win };
        playSound('win');
      }
      if (next) {
        setBanner(next);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setBanner(null), 850);
      }
    }
  }, []);

  return { banner, onEvents };
}
