import { formatDue, severityOf, timeRemainingLabel } from '../utils/deadlineUtils.js';
import Icon from './Icon.jsx';

const STRIPE = { urgent: 'border-l-urgent', soon: 'border-l-upcoming', normal: 'border-l-line' };
const CHIP = {
  urgent: 'bg-red-50 text-urgent border-red-300',
  soon: 'bg-amber-50 text-upcoming border-amber-200',
  normal: 'bg-slate-50 text-slate-600 border-line',
  done: 'bg-emerald-50 text-success border-emerald-200',
};

export default function DeadlineCard({ item, now, showSyncMark, onToggle, onEdit, onDelete, onSchedule }) {
  const severity = severityOf(item.due_at, now);
  const done = item.completed;
  const chip = done ? CHIP.done : CHIP[severity];

  return (
    <li
      className={`flex items-start gap-1 rounded-2xl border border-l-4 border-line bg-white py-1 pl-1 pr-1 transition-shadow hover:shadow-lift ${
        done ? 'border-l-line' : STRIPE[severity]
      }`}
    >
      {/* 22px checkbox inside a 44px touch target */}
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={`${done ? 'Reopen' : 'Mark completed'}: ${item.title}`}
        onClick={() => onToggle(item)}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg focus-ring"
      >
        <span
          className={`flex h-[22px] w-[22px] items-center justify-center rounded-md border-2 ${
            done ? 'border-success bg-success text-white' : 'border-slate-300 bg-white'
          }`}
        >
          {done && <Icon name="check" size={14} strokeWidth={3} />}
        </span>
      </button>

      <div className="min-w-0 flex-1 py-2">
        <p className={`break-words text-body-lg font-semibold text-slate-900 ${done ? 'text-slate-500 line-through' : ''}`}>
          {item.title}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm text-slate-500">
          {item.course && (
            <span className="rounded-full bg-secondary-container px-2 py-0.5 text-label-sm text-on-secondary-fixed-variant">
              {item.course}
            </span>
          )}
          <time dateTime={item.due_at} className="tabular-nums">
            {formatDue(item.due_at, now)}
          </time>
          {showSyncMark && item.dirty && <span className="text-upcoming">• Not synced yet</span>}
        </div>
        <span className={`mt-2 inline-block rounded-full border px-2 py-0.5 text-label-sm tabular-nums ${chip}`}>
          {done ? 'Completed' : timeRemainingLabel(item.due_at, now)}
        </span>
      </div>

      <div className="flex shrink-0">
        <button type="button" onClick={() => onEdit(item)} aria-label={`Edit ${item.title}`} className="icon-btn">
          <Icon name="edit" size={18} />
        </button>
        <button type="button" onClick={() => onSchedule?.(item)} aria-label={`Schedule ${item.title}`} className="icon-btn">
          <Icon name="calendar" size={18} />
        </button>
        <button type="button" onClick={() => onDelete(item)} aria-label={`Delete ${item.title}`} className="icon-btn hover:text-urgent">
          <Icon name="trash" size={18} />
        </button>
      </div>
    </li>
  );
}
