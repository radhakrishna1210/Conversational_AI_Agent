import { useEffect, useMemo, useRef, useState } from 'react';
import type { VoiceStateId } from '@/lib/voiceStates';
import { SCENARIOS, type Turn } from './content';

/**
 * Replays a scripted conversation turn by turn.
 *
 * The design drives this with a flat list of ~40 `setTimeout`s built up in a
 * loop, and never clears them on teardown — fine for a mock that lives until
 * the tab closes, not fine in a router where the page unmounts. Here every
 * timer is collected and the effect's cleanup cancels the lot, so switching
 * scenario or navigating away stops the replay immediately rather than leaving
 * it writing into a dead component.
 *
 * The shape of the schedule is kept exactly:
 *
 *   agent turn:  +0ms   show "thinking", set the state early
 *                +650ms commit the turn
 *   caller turn: +0ms   commit the turn
 *   then         +1150ms before the next turn either way
 *
 * The early state change on an agent turn is what makes the telemetry panel
 * lead the transcript — you see it decide, then you see what it said.
 */

export interface ReplayTurn extends Turn {
  /** Stable across re-renders; the transcript keys on it. */
  key: string;
  tag: string;
}

export interface ReplayState {
  turns: ReplayTurn[];
  state: VoiceStateId;
  playing: boolean;
  /** True while an agent turn is composed but not yet shown. */
  typing: boolean;
  latency: string;
  turnCount: number;
  interrupts: number;
  toolsFired: number;
  /** Index into the six-state order, for the progress dots. */
  stateIndex: number;
}

const ORDER: VoiceStateId[] = ['idle', 'listening', 'understanding', 'thinking', 'speaking', 'acting'];

const INITIAL: ReplayState = {
  turns: [],
  state: 'listening',
  playing: false,
  typing: false,
  latency: '318',
  turnCount: 0,
  interrupts: 0,
  toolsFired: 0,
  stateIndex: 1,
};

export function useConversationReplay(scenarioKey: string) {
  const [replay, setReplay] = useState<ReplayState>(INITIAL);

  // Bumping this re-runs the effect with the same scenario, which is what
  // "Replay" does. A plain function call could not restart an effect.
  const [nonce, setNonce] = useState(0);

  const scenario = SCENARIOS[scenarioKey] ?? SCENARIOS.reception;

  // Read inside the effect without making it a dependency.
  const turnsRef = useRef(scenario.turns);
  turnsRef.current = scenario.turns;

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const turns = turnsRef.current;

    setReplay({ ...INITIAL, playing: true, state: turns[0]?.s ?? 'listening' });

    let interrupts = 0;
    let toolsFired = 0;
    let turnCount = 0;
    let delay = 300;

    turns.forEach((t, idx) => {
      if (t.who === 'agent') {
        timers.push(
          setTimeout(() => {
            setReplay((r) => ({
              ...r,
              state: t.s,
              stateIndex: ORDER.indexOf(t.s),
              typing: true,
            }));
          }, delay),
        );
        delay += 650;
      }

      timers.push(
        setTimeout(() => {
          turnCount++;
          // A caller speaking after the conversation has started is a barge-in
          // — the first turn cannot be an interruption of anything.
          if (t.who === 'caller' && idx > 0) interrupts++;
          if (t.tool) toolsFired++;

          setReplay((r) => ({
            ...r,
            state: t.s,
            stateIndex: ORDER.indexOf(t.s),
            typing: false,
            turnCount,
            interrupts,
            toolsFired,
            latency: t.lat ? String(t.lat) : r.latency,
            turns: [
              ...r.turns,
              {
                ...t,
                key: `${scenarioKey}-${nonce}-${idx}`,
                tag: t.who === 'agent' ? `SPANDAN AGENT · ${t.s.toUpperCase()}` : 'CALLER',
              },
            ],
            playing: idx < turns.length - 1,
          }));
        }, delay),
      );

      delay += 1150;
    });

    return () => timers.forEach(clearTimeout);
  }, [scenarioKey, nonce]);

  const replayAgain = useMemo(() => () => setNonce((n) => n + 1), []);

  return { replay, scenario, replayAgain };
}
