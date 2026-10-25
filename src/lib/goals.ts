// Shared goals (Goals tab): types, the server API and a sample version for the demo space.
export type GoalKind = 'steps' | 'water' | 'pushups' | 'workout' | 'read' | 'custom';
export type GoalTrack = 'auto' | 'count' | 'check';
export type GoalSpan = 'month' | 'ongoing' | 'weekdays';
export type Goal = {
  id: string; name: string; kind: GoalKind; track: GoalTrack; target: number; unit: string; inc: number;
  span: GoalSpan; remind: boolean; owner: 'me' | 'both' | 'them';
  pending: boolean; invited: boolean; me: number | null; them: number | null; cheered: boolean; cheeredMe: boolean; mine: boolean;
};
export type GoalsToday = { day: string; partner: { id: string; name: string } | null; goals: Goal[] };
export type MonthDay = { d: number; future?: boolean; me?: number | null; them?: number | null; rows?: { goalId: string; name: string; w: 'me' | 'them'; ok: boolean }[] };
export type GoalsMonth = { month: string; partner: { id: string; name: string } | null; days: MonthDay[]; rates: { name: string; w: 'me' | 'them'; pct: number }[] };
export type GoalDraft = { kind: GoalKind; name: string; target: number; unit: string; track: GoalTrack; inc: number; owner: 'me' | 'both'; span: GoalSpan; remind: boolean };

export const TEMPLATES: { kind: GoalKind; label: string; name: string; target: number; unit: string; track: GoalTrack; inc: number; how: (health: string) => string }[] = [
  { kind: 'steps', label: 'Steps', name: 'Walk 10,000 steps', target: 10000, unit: 'steps', track: 'auto', inc: 1000, how: h => `Counts automatically from ${h}. You can also add steps by hand` },
  { kind: 'water', label: 'Water', name: 'Drink 8 glasses of water', target: 8, unit: 'glasses', track: 'count', inc: 1, how: () => 'Tap + each time you finish a glass' },
  { kind: 'pushups', label: 'Push-ups', name: '30 push-ups', target: 30, unit: 'push-ups', track: 'count', inc: 10, how: () => 'Tap +10 after each set' },
  { kind: 'workout', label: 'Workout', name: 'Work out 30 minutes', target: 30, unit: 'minutes', track: 'count', inc: 10, how: () => 'Add minutes after each workout' },
  { kind: 'read', label: 'Read', name: 'Read 20 minutes', target: 1, unit: '', track: 'check', inc: 1, how: () => 'Tick it when it’s done' },
  { kind: 'custom', label: 'Your own', name: '', target: 1, unit: '', track: 'check', inc: 1, how: () => 'Tick it when it’s done — or set a number to count' },
];
export const newDraft = (): GoalDraft => { const t = TEMPLATES[1]; return { kind: t.kind, name: t.name, target: t.target, unit: t.unit, track: t.track, inc: t.inc, owner: 'me', span: 'month', remind: true }; };

const pad = (n: number) => String(n).padStart(2, '0');
/** This phone's local date as YYYY-MM-DD. */
export const localDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const monthKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
export const done = (g: Goal, who: 'me' | 'them') => (g[who] ?? 0) >= g.target;

export type GoalsApi = {
  today(day: string): Promise<GoalsToday>;
  month(month: string, today: string): Promise<GoalsMonth>;
  create(draft: GoalDraft, day: string): Promise<void>;
  progress(id: string, day: string, value: number): Promise<void>;
  join(id: string): Promise<void>;
  cheer(id: string, day: string): Promise<void>;
  remove(id: string, day: string): Promise<void>;
};
type Api = <T>(path: string, body?: unknown, method?: string) => Promise<T>;
export function liveGoals(api: Api, code: string): GoalsApi {
  const base = `/rooms/${code}/goals`;
  return {
    today: day => api<GoalsToday>(`${base}?day=${day}`),
    month: (month, today) => api<GoalsMonth>(`/rooms/${code}/goals-month?month=${month}&today=${today}`),
    create: async (draft, day) => { await api(base, { ...draft, target: draft.track === 'check' ? 1 : draft.target, inc: draft.kind === 'steps' ? 1000 : draft.inc, day }, 'POST'); },
    progress: async (id, day, value) => { await api(`${base}/${id}/progress`, { day, value }, 'POST'); },
    join: async id => { await api(`${base}/${id}/join`, {}, 'POST'); },
    cheer: async (id, day) => { await api(`${base}/${id}/cheer`, { day }, 'POST'); },
    remove: async (id, day) => { await api(`${base}/${id}?day=${day}`, { day }, 'DELETE'); },
  };
}

