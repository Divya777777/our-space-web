// Planner: study dates, movie dates, playdates. Each phone schedules its own reminder 1 hour before
// and tells the server, which pushes the reminder to anyone whose phone hasn't (see backend services/planner.js).

export type PlanKind = 'study' | 'movie' | 'play' | 'other';
export type Plan = { id: string; code: string; roomName: string; kind: PlanKind; title: string; note: string; startsAt: number; by: { id: string; name: string }; mine: boolean };
export type PlanDraft = { kind: PlanKind; title: string; note: string; startsAt: number; code: string };
export type PlannerApi = {
  list: (code?: string) => Promise<Plan[]>;
  create: (d: PlanDraft) => Promise<Plan>;
  update: (id: string, d: PlanDraft) => Promise<Plan>;
  cancel: (p: Plan) => Promise<void>;
  arm: (ids: string[]) => Promise<void>;
};
type Api = <T>(path: string, body?: unknown, method?: string) => Promise<T>;

export const KINDS: Record<PlanKind, { label: string; icon: 'book' | 'film' | 'game' | 'sparkles'; color: string; hint: string }> = {
  study: { label: 'Study date', icon: 'book', color: '#B6DDCF', hint: 'Focus together' },
  movie: { label: 'Movie date', icon: 'film', color: '#C8B6FF', hint: 'Watch in sync' },
  play: { label: 'Playdate', icon: 'game', color: '#E6C994', hint: 'Games on a call' },
  other: { label: 'Something else', icon: 'sparkles', color: '#F2AAAA', hint: 'Anything you like' },
};
const HOUR = 3600 * 1000;
const zone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return undefined; } };

export function livePlanner(api: Api): PlannerApi {
  const body = (d: PlanDraft) => ({ kind: d.kind, title: d.title, note: d.note, startsAt: d.startsAt, timeZone: zone() });
  return {
    list: async code => (await api<{ plans: Plan[] }>(code ? `/rooms/${code}/planner` : '/planner')).plans,
    create: async d => (await api<{ plan: Plan }>(`/rooms/${d.code}/planner`, body(d), 'POST')).plan,
    update: async (id, d) => (await api<{ plan: Plan }>(`/rooms/${d.code}/planner/${id}`, body(d), 'PATCH')).plan,
    cancel: async p => { await api(`/rooms/${p.code}/planner/${p.id}`, undefined, 'DELETE'); },
    arm: async ids => { if (ids.length) await api('/planner/armed', { ids }, 'POST'); },
  };
}

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const startOfDay = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const clockText = (ms: number) => { const d = new Date(ms); const h = d.getHours(); return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
export function dayText(ms: number, now = Date.now()) {
  const diff = Math.round((startOfDay(ms) - startOfDay(now)) / (24 * HOUR));
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  const d = new Date(ms);
  return `${DAY[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;
}
export const whenText = (ms: number) => `${dayText(ms)} · ${clockText(ms)}`;
export function untilText(ms: number, now = Date.now()) {
  const left = ms - now;
  if (left <= 0) return left > -3 * HOUR ? 'Now' : 'Done';
  if (left < HOUR) return `in ${Math.max(1, Math.round(left / 60000))} min`;
  if (left < 24 * HOUR) return `in ${Math.round(left / HOUR)} h`;
  const days = Math.round((startOfDay(ms) - startOfDay(now)) / (24 * HOUR));
  return days === 1 ? 'tomorrow' : `in ${days} days`;
}
/** A sensible first suggestion: tonight at 8, or tomorrow at 8 if it's already evening. */
export function defaultStart(now = new Date()) {
  const d = new Date(now); d.setHours(20, 0, 0, 0);
  if (d.getTime() - now.getTime() < 2 * HOUR) d.setDate(d.getDate() + 1);
  return d.getTime();
}

