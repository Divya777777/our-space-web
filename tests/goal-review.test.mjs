import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../src/lib/goalReview.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { monthReview } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const row = (id, value, target = 1, userId = '1') => ({ goalId: id, name: 'Same name', userId, value, target, ok: value >= target, progressPct: Math.min(100, (value || 0) / target * 100), status: value >= target ? 'complete' : value === null ? 'unlogged' : value > 0 ? 'partial' : 'incomplete' });
const month = days => ({ month: '2026-11', days });

test('task-weighted score excludes today and future days', () => {
  const m = month([{ d: 1, rows: [row('a', 1)] }, { d: 2, rows: ['a','b','c','d'].map(id => row(id, null)) }, { d: 3, rows: [row('a', 1)] }, { d: 4, future: true }]);
  const r = monthReview(m, '1', '2026-11-03');
  assert.equal(r.pct, 20); assert.equal(r.total, 5); assert.equal(r.completed, 1);
  assert.equal(r.perfectDays, 1); assert.equal(r.todayRows.length, 1);
});

test('partial quantity is separate from completion and overage cannot replace another day', () => {
  const r = monthReview(month([{ d: 1, rows: [row('a', 4, 8)] }, { d: 2, rows: [row('a', 16, 8)] }]), '1', '2026-11-03');
  assert.equal(r.pct, 50); assert.equal(r.goals[0].partial, 1); assert.equal(r.goals[0].progress / 2, .75);
  assert.equal(r.goals[0].total, 20);
});

test('no scheduled history is not misleadingly shown as zero percent', () => {
  const r = monthReview(month([{ d: 1, rows: [] }, { d: 2, rows: [row('new', null)] }]), '1', '2026-11-02');
  assert.equal(r.pct, null); assert.equal(r.goals[0].days, 0); assert.equal(r.todayRows.length, 1);
});

test('duplicate names use goal IDs, people are isolated, rest days preserve scheduled runs', () => {
  const r = monthReview(month([{ d: 1, rows: [row('a', 1),row('b', null),row('other', 1, 1, '2')] }, { d: 2, rows: [] }, { d: 3, rows: [row('a', 1)] }, { d: 4, rows: [row('a', 0)] }]), '1', '2026-11-05');
  assert.equal(r.goals.length, 2); assert.equal(r.goals[0].best, 2); assert.equal(r.goals[0].incomplete, 1); assert.equal(r.goals[1].unlogged, 1); assert.equal(r.activeDays, 3);
});
