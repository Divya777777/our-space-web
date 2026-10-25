// Report & block on the app side. The blocked list is kept in memory for the session and refreshed
// from the server; chat hides blocked people's messages, and People shows who is blocked.
import { useEffect, useState } from 'react';
type Api = <T>(path: string, body?: unknown, method?: string) => Promise<T>;
export type Blocked = { id: string; name: string };
export const REPORT_REASONS: { id: string; label: string }[] = [
  { id: 'harassment', label: 'Harassment or bullying' },
  { id: 'inappropriate', label: 'Sexual or inappropriate content' },
  { id: 'hate', label: 'Hate or threats' },
  { id: 'spam', label: 'Spam or scam' },
  { id: 'self-harm', label: 'Self-harm concern' },
  { id: 'other', label: 'Something else' },
];

let blocked: Blocked[] = [];
const listeners = new Set<(list: Blocked[]) => void>();
const set = (list: Blocked[]) => { blocked = list; listeners.forEach(fn => fn(list)); };

export function useBlocked(api: Api | null) {
  const [list, setList] = useState(blocked);
  useEffect(() => {
    listeners.add(setList);
    if (api) void api<{ blocked: Blocked[] }>('/blocks').then(r => set(r.blocked)).catch(() => {});
    return () => { listeners.delete(setList); };
  }, [api]);
  return list;
}
export const isBlockedId = (list: Blocked[], id: string) => list.some(b => b.id === id);
export async function blockUser(api: Api, userId: string) { set((await api<{ blocked: Blocked[] }>('/blocks', { userId: Number(userId) }, 'POST')).blocked); }
export async function unblockUser(api: Api, userId: string) { set((await api<{ blocked: Blocked[] }>(`/blocks/${userId}`, undefined, 'DELETE')).blocked); }
export async function reportUser(api: Api, report: { userId: string; reason: string; details?: string; message?: string; roomCode?: string; block?: boolean }) {
  const r = await api<{ id: string; blocked: Blocked[] }>('/reports', { ...report, userId: Number(report.userId) }, 'POST');
  set(r.blocked);
  return r.id;
}
