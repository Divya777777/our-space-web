import type { GoalsMonth, MonthRow } from './goals';

export const reviewDate = (month: string, day: number) => `${month}-${String(day).padStart(2, '0')}`;
export const completion = (rows: MonthRow[]) => rows.length ? Math.round(rows.filter(r => r.ok).length / rows.length * 100) : null;
export function monthReview(data: GoalsMonth, userId: string, today: string) {
  const days = data.days.map(day => ({ ...day, date: reviewDate(data.month, day.d), rows: (day.rows || []).filter(r => r.userId === userId) }));
  const past = days.filter(d => !d.future && d.date < today);
  const rows = past.flatMap(d => d.rows);
  const active = past.filter(d => d.rows.length);
  const goals = new Map<string, { row: MonthRow; days: number; completed: number; partial: number; unlogged: number; incomplete: number; progress: number; total: number; best: number; run: number; values: { d: number; value: number | null; pct: number }[] }>();
  // Today may introduce a new goal, but it never lowers the finished-day score.
  for (const day of days.filter(d => !d.future && d.date <= today)) for (const row of day.rows) {
    let g = goals.get(row.goalId);
    if (!g) { g = { row, days: 0, completed: 0, partial: 0, unlogged: 0, incomplete: 0, progress: 0, total: 0, best: 0, run: 0, values: [] }; goals.set(row.goalId, g); }
    g.row = row;
    if (day.date >= today) continue;
    g.days++; g.completed += Number(row.ok); g.partial += Number(row.status === 'partial');
    g.unlogged += Number(row.status === 'unlogged'); g.incomplete += Number(row.status === 'incomplete');
    g.progress += Math.min(1, Math.max(0, (row.value ?? 0) / row.target)); g.total += row.value ?? 0;
    g.run = row.ok ? g.run + 1 : 0; g.best = Math.max(g.best, g.run);
    g.values.push({ d: day.d, value: row.value, pct: row.progressPct });
  }
  const weeks = Array.from({ length: Math.ceil(days.length / 7) }, (_, i) => {
    const list = past.filter(d => d.d >= i * 7 + 1 && d.d <= i * 7 + 7).flatMap(d => d.rows);
    return { start: i * 7 + 1, end: Math.min(days.length, i * 7 + 7), pct: completion(list), done: list.filter(r => r.ok).length, total: list.length };
  });
  return { days, goals: [...goals.values()], weeks, total: rows.length, completed: rows.filter(r => r.ok).length,
    pct: completion(rows), activeDays: active.length, perfectDays: active.filter(d => d.rows.every(r => r.ok)).length,
    through: past.at(-1)?.date ?? null, todayRows: days.find(d => d.date === today)?.rows || [],
    historyEstimated: rows.some(r => r.historyEstimated) };
}
