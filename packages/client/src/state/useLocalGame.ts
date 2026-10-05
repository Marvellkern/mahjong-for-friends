/**
 * Single player vs 3 bots, entirely in the browser (no server).
 *
 * Uses the same engine, the same per-player view and the same timing planner
 * as the server, so local and online games behave identically.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  RULES,
  applyAction,
  buildPlayerView,
  createGame,
  createRng,
  planNextStep,
  runStep,
  startRound,
  type Action,
  type GameEvent,
  type GameState,
  type Timing,
} from '@mahjong/engine';
import { S } from '../strings';
import type { GameController } from './types';
import { useBanner } from './useBanner';
import { usePersistentFlag } from './usePersistentFlag';

const ME = 0;
const isBot = (seat: number) => seat !== ME;

/** Local timings: snappy, since there's nobody to leak timing info to. */
const timing = (stepSince: number): Timing => ({
  stepSince,
  botTurnMs: 650,
  botClaimMs: 200,
  claimMinDelayMs: 450,
  claimWindowMs: RULES.claimWindowMs,
  turnTimerMs: null, // vs bots: you are only waiting on yourself, so never a turn timer
});

const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];

interface Store {
  game: GameState;
  /** When the current step (game.stepId) began, for timers. */
  stepSince: number;
}

export function useLocalGame(playerName: string, onLeave: () => void): GameController {
  const [store, setStore] = useState<Store>(() => ({
    game: startRound(createGame({ seed: randomSeed() })).state,
    stepSince: Date.now(),
  }));
  const storeRef = useRef(store);
  const botRng = useRef(createRng(randomSeed()));
  const [error, setError] = useState<string | null>(null);
  const [showWaits, setShowWaits] = usePersistentFlag('mj-hint', false);
  const { banner, onEvents } = useBanner();

  const commit = useCallback(
    (game: GameState, events: GameEvent[]) => {
      const prev = storeRef.current;
      const next = { game, stepSince: game.stepId !== prev.game.stepId ? Date.now() : prev.stepSince };
      storeRef.current = next;
      setStore(next);
      onEvents(events);
    },
    [onEvents],
  );

  // Drive bots and claim windows: one timer for the next automatic step.
  useEffect(() => {
    const step = planNextStep(store.game, isBot, timing(store.stepSince));
    if (!step) return;
    const id = setTimeout(() => {
      const res = runStep(storeRef.current.game, step, botRng.current);
      if (res) commit(res.state, res.events);
    }, Math.max(0, step.at - Date.now()));
    return () => clearTimeout(id);
  }, [store, commit]);

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 2500);
    return () => clearTimeout(id);
  }, [error]);

  const act = useCallback(
    (action: Action) => {
      const res = applyAction(storeRef.current.game, ME, action);
      if ('error' in res) setError(res.error);
      else commit(res.state, res.events);
    },
    [commit],
  );

  const view = useMemo(
    () =>
      buildPlayerView(store.game, ME, {
        roomCode: 'LOCAL',
        seats: [0, 1, 2, 3].map((i) => ({
          name: i === ME ? playerName || S.you : S.botName(i),
          isBot: isBot(i),
          connected: true,
        })),
        claimDeadline: store.stepSince + RULES.claimWindowMs,
        showWaits,
      }),
    [store, playerName, showWaits],
  );

  return { mode: 'local', view, act, error, banner, showWaits, setShowWaits, connection: 'connected', leave: onLeave };
}
