// Pure helpers: validation, countdown labels, grouping. No I/O so they are easy to test.

export const TITLE_MAX = 100;
export const COURSE_MAX = 20;

// Letters (incl. accented, e.g. "Électronique"), digits, spaces and common course-code
// separators. Must start with a letter or digit.
const COURSE_RE = /^[\p{L}\p{N}][\p{L}\p{N} \-_/.&+():']*$/u;

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0'));
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10).join('')}`;
}

/** Parse a <input type="datetime-local"> value ("YYYY-MM-DDTHH:mm") as LOCAL time. */
export function parseLocalInput(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const pad = (n) => String(n).padStart(2, '0');

/** ISO string -> value for <input type="datetime-local"> in the user's local zone. */
export function toLocalInputValue(input) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Validate the quick-add form. Returns an object of field -> message (empty = valid).
 * `requireFuture` can be turned off when editing a deadline whose date was not changed.
 */
export function validateDeadline({ title, due, course }, { now = new Date(), requireFuture = true } = {}) {
  const errors = {};
  const t = (title ?? '').trim();
  if (!t) errors.title = 'Enter a title for this deadline.';
  else if (t.length > TITLE_MAX) errors.title = `Title must be ${TITLE_MAX} characters or fewer.`;

  if (!due) {
    errors.due = 'Choose a due date and time.';
  } else {
    const d = parseLocalInput(due);
    if (!d) errors.due = 'Enter a valid date and time.';
    else if (requireFuture && d.getTime() <= now.getTime()) errors.due = 'Choose a date and time in the future.';
  }

  const c = (course ?? '').trim();
  if (c) {
    if (c.length > COURSE_MAX) errors.course = `Course tag must be ${COURSE_MAX} characters or fewer.`;
    else if (!COURSE_RE.test(c)) {
      errors.course = 'Use letters, numbers, spaces, and separators like - / . only (e.g. EE410 or Math-101).';
    }
  }
  return errors;
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Whole calendar days from `now` to `due` (0 = today, 1 = tomorrow, negative = past days). */
export function calendarDayDiff(due, now = new Date()) {
  return Math.round((startOfDay(due) - startOfDay(now)) / DAY);
}

/** Group an INCOMPLETE deadline: 'urgent' | 'upcoming' | 'later'. */
export function groupOf(dueIso, now = new Date()) {
  const due = new Date(dueIso);
  if (due.getTime() < now.getTime()) return 'urgent'; // overdue
  const days = calendarDayDiff(due, now);
  if (days <= 1) return 'urgent'; // today or tomorrow
  if (days <= 7) return 'upcoming';
  return 'later';
}

/** Left-accent severity from the Stitch spec: red <24h/overdue, amber <3d, slate otherwise. */
export function severityOf(dueIso, now = new Date()) {
  const diff = new Date(dueIso).getTime() - now.getTime();
  if (diff < DAY) return 'urgent';
  if (diff < 3 * DAY) return 'soon';
  return 'normal';
}

function span(ms) {
  if (ms < HOUR) return `${Math.max(1, Math.floor(ms / MIN))}m`;
  if (ms < DAY) {
    const h = Math.floor(ms / HOUR);
    const m = Math.floor((ms % HOUR) / MIN);
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(ms / DAY);
  const h = Math.floor((ms % DAY) / HOUR);
  return d < 3 && h ? `${d}d ${h}h` : `${d} ${d === 1 ? 'day' : 'days'}`;
}

/** Human countdown, computed from the real clock. */
export function timeRemainingLabel(dueIso, now = new Date()) {
  const diff = new Date(dueIso).getTime() - now.getTime();
  if (diff < 0) return `Overdue by ${span(-diff)}`;
  if (diff < MIN) return 'Due now';
  return `Due in ${span(diff)}`;
}

export function formatDue(dueIso, now = new Date()) {
  const d = new Date(dueIso);
  const opts = { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' };
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  return new Intl.DateTimeFormat(undefined, opts).format(d);
}

/** Split deadlines into the dashboard sections. Incomplete: soonest first. Completed: most recent first. */
export function groupDeadlines(items, now = new Date()) {
  const out = { urgent: [], upcoming: [], later: [], completed: [] };
  for (const item of items) {
    if (item.completed) out.completed.push(item);
    else out[groupOf(item.due_at, now)].push(item);
  }
  const byDue = (a, b) => new Date(a.due_at) - new Date(b.due_at);
  out.urgent.sort(byDue);
  out.upcoming.sort(byDue);
  out.later.sort(byDue);
  out.completed.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  return out;
}
