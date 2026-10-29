import { describe, expect, it } from 'vitest';
import {
  groupDeadlines,
  groupOf,
  newId,
  severityOf,
  timeRemainingLabel,
  toLocalInputValue,
  validateDeadline,
} from './deadlineUtils.js';

// Fixed "now": Fri 9 Oct 2026, 10:00 local time.
const NOW = new Date(2026, 9, 9, 10, 0, 0);
const at = (days, h = 10, m = 0) => new Date(2026, 9, 9 + days, h, m).toISOString();
const future = toLocalInputValue(new Date(2026, 9, 12, 14, 30));

describe('validateDeadline', () => {
  const ok = { title: 'CC1 Thermo', due: future, course: 'EE410' };
  it('accepts valid input', () => expect(validateDeadline(ok, { now: NOW })).toEqual({}));
  it('requires a title (whitespace only counts as empty)', () => {
    expect(validateDeadline({ ...ok, title: '   ' }, { now: NOW }).title).toMatch(/title/i);
  });
  it('rejects titles over 100 characters, accepts exactly 100', () => {
    expect(validateDeadline({ ...ok, title: 'a'.repeat(101) }, { now: NOW }).title).toBeDefined();
    expect(validateDeadline({ ...ok, title: 'a'.repeat(100) }, { now: NOW }).title).toBeUndefined();
  });
  it('requires a date', () => expect(validateDeadline({ ...ok, due: '' }, { now: NOW }).due).toMatch(/choose/i));
  it('rejects garbage dates', () => expect(validateDeadline({ ...ok, due: 'nope' }, { now: NOW }).due).toMatch(/valid/i));
  it('rejects past dates', () => {
    expect(validateDeadline({ ...ok, due: toLocalInputValue(new Date(2026, 9, 8, 9, 0)) }, { now: NOW }).due).toMatch(/future/i);
  });
  it('skips the future check when asked (editing an unchanged overdue deadline)', () => {
    const past = toLocalInputValue(new Date(2026, 9, 8, 9, 0));
    expect(validateDeadline({ ...ok, due: past }, { now: NOW, requireFuture: false })).toEqual({});
  });
  it('course is optional', () => expect(validateDeadline({ ...ok, course: '' }, { now: NOW })).toEqual({}));
  it.each(['EE410', 'Math-101', 'PHY 201', 'CS_101/B', 'Électronique 2', 'L2 Info.', 'Chem & Lab'])(
    'accepts ordinary course label %s',
    (course) => expect(validateDeadline({ ...ok, course }, { now: NOW }).course).toBeUndefined(),
  );
  it.each(['<script>', '!!!', '-EE410', 'EE410;DROP', '😀'])('rejects invalid course tag %s', (course) =>
    expect(validateDeadline({ ...ok, course }, { now: NOW }).course).toBeDefined(),
  );
  it('rejects course tags over 20 characters', () => {
    expect(validateDeadline({ ...ok, course: 'a'.repeat(21) }, { now: NOW }).course).toMatch(/20/);
  });
});

describe('grouping and countdowns', () => {
  it('puts overdue, today and tomorrow in Urgent', () => {
    expect(groupOf(at(0, 8), NOW)).toBe('urgent'); // overdue (earlier today)
    expect(groupOf(at(0, 23), NOW)).toBe('urgent'); // later today
    expect(groupOf(at(1, 23, 59), NOW)).toBe('urgent'); // tomorrow
    expect(groupOf(at(-3), NOW)).toBe('urgent');
  });
  it('puts days 2–7 in Upcoming and beyond in Later', () => {
    expect(groupOf(at(2), NOW)).toBe('upcoming');
    expect(groupOf(at(7, 23), NOW)).toBe('upcoming');
    expect(groupOf(at(8), NOW)).toBe('later');
    expect(groupOf(at(60), NOW)).toBe('later');
  });
  it('keeps completed separate and sorts nearest first', () => {
    const items = [
      { id: 'a', due_at: at(5), completed: false },
      { id: 'b', due_at: at(0, 12), completed: false },
      { id: 'c', due_at: at(-1), completed: false },
      { id: 'd', due_at: at(1), completed: true, updated_at: at(0) },
      { id: 'e', due_at: at(20), completed: false },
    ];
    const g = groupDeadlines(items, NOW);
    expect(g.urgent.map((i) => i.id)).toEqual(['c', 'b']);
    expect(g.upcoming.map((i) => i.id)).toEqual(['a']);
    expect(g.later.map((i) => i.id)).toEqual(['e']);
    expect(g.completed.map((i) => i.id)).toEqual(['d']);
  });
  it('labels countdowns from the supplied clock', () => {
    expect(timeRemainingLabel(at(0, 10, 30), NOW)).toBe('Due in 30m');
    expect(timeRemainingLabel(at(0, 13, 15), NOW)).toBe('Due in 3h 15m');
    expect(timeRemainingLabel(at(1, 14), NOW)).toBe('Due in 1d 4h');
    expect(timeRemainingLabel(at(5), NOW)).toBe('Due in 5 days');
    expect(timeRemainingLabel(at(0, 8), NOW)).toBe('Overdue by 2h');
    expect(timeRemainingLabel(at(-2), NOW)).toBe('Overdue by 2 days');
  });
  it('changes as time passes', () => {
    const due = at(0, 12);
    expect(timeRemainingLabel(due, NOW)).toBe('Due in 2h');
    expect(timeRemainingLabel(due, new Date(2026, 9, 9, 11, 0))).toBe('Due in 1h');
    expect(timeRemainingLabel(due, new Date(2026, 9, 9, 12, 30))).toBe('Overdue by 30m');
  });
  it('maps accent severity per the design spec', () => {
    expect(severityOf(at(0, 12), NOW)).toBe('urgent');
    expect(severityOf(at(2), NOW)).toBe('soon');
    expect(severityOf(at(5), NOW)).toBe('normal');
  });
});

describe('newId', () => {
  it('generates unique UUID-shaped ids', () => {
    const a = newId();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(newId()).not.toBe(a);
  });
});
