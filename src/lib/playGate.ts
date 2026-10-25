// Opening a room (or starting a call) never starts the music by itself. If the room was already
// "playing" when you arrived, your player waits, paused, until you tap play. Anything that happens
// after you arrived (someone presses play, picks a new video) plays for you as usual.
import { useCallback, useSyncExternalStore } from 'react';
import type { Playback } from './model';
import { positionNow } from './model';

type Entry = { armed: boolean; revision: number; position: number; users: number; since: number };
// Right after opening, cached room data is replaced by fresh data; those updates are not someone pressing play.
const SETTLE_MS = 6000;
const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(fn => fn());
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

/** Call while a room is open; the gate resets once nobody in the app has the room open. */
export function enterRoom(code: string) {
  const entry = entries.get(code);
  if (entry) entry.users += 1; else entries.set(code, { armed: false, revision: -1, position: 0, users: 1, since: Date.now() });
  return () => {
    const current = entries.get(code); if (!current) return;
    current.users -= 1;
    if (current.users <= 0) { entries.delete(code); emit(); }
  };
}
function observe(code: string, playback: Playback | null | undefined) {
  if (!playback) return;
  let entry = entries.get(code);
  if (!entry) { entry = { armed: false, revision: -1, position: 0, users: 0, since: Date.now() }; entries.set(code, entry); }
  if (entry.revision === -1) { entry.revision = playback.revision; entry.position = positionNow(playback); if (!playback.playing) entry.armed = true; return; }
  if (entry.armed || playback.revision === entry.revision) return;
  if (Date.now() - entry.since < SETTLE_MS) {
    // Still settling: adopt the fresh state as what was already going on when we arrived.
    entry.revision = playback.revision; entry.position = positionNow(playback); if (!playback.playing) entry.armed = true;
    return;
  }
  entry.armed = true;
}
/** Marks that this person chose to listen (pressed play). */
export function arm(code: string) { const entry = entries.get(code); if (entry && !entry.armed) { entry.armed = true; emit(); } }

/** The playback this phone should follow, plus whether it is still waiting for a tap. */
export function useGatedPlayback(code: string, playback: Playback | null | undefined) {
  observe(code, playback);
  const armed = useSyncExternalStore(subscribe, () => entries.get(code)?.armed ?? true, () => true);
  const entry = entries.get(code);
  const waiting = !!playback?.playing && !armed;
  const gated: Playback | null = !playback ? null : waiting ? { ...playback, playing: false, position: entry?.position ?? playback.position, updatedAt: 0 } : playback;
  const join = useCallback(() => arm(code), [code]);
  return { playback: gated, waiting, join };
}
