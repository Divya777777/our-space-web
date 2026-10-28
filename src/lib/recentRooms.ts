// When each room was last opened in this browser, so Home can lead with the room you were just in.
import { useEffect, useMemo, useState } from 'react';
import type { Room } from './model';

const KEY = 'ourspace.roomVisits.v1';
const EVENT = 'ourspace:room-visits';
function read(): Record<string, number> {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}

/** Call when a room page opens. */
export function markRoomVisited(code: string) {
  if (!code) return;
  try { localStorage.setItem(KEY, JSON.stringify({ ...read(), [code]: Date.now() })); } catch { /* private mode: order just isn't remembered */ }
  window.dispatchEvent(new Event(EVENT));
}
export function lastVisitOf(code: string) { return read()[code] || 0; }

/** Rooms ordered by last visit in this browser (newest first); rooms never opened here keep their usual order after them. */
export function useRoomsByVisit(rooms: Room[]) {
  const [seen, setSeen] = useState(read);
  useEffect(() => {
    const update = () => setSeen(read());
    window.addEventListener(EVENT, update); window.addEventListener('storage', update);
    return () => { window.removeEventListener(EVENT, update); window.removeEventListener('storage', update); };
  }, []);
  return useMemo(() => {
    const order = new Map(rooms.map((r, i) => [r.code, i]));
    return [...rooms].sort((a, b) => (seen[b.code] || 0) - (seen[a.code] || 0) || order.get(a.code)! - order.get(b.code)!);
  }, [rooms, seen]);
}
