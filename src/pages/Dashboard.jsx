import { useCallback, useEffect, useRef, useState } from 'react';
import AccountModal from '../components/AccountModal.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import DeadlineCard from '../components/DeadlineCard.jsx';
import Icon from '../components/Icon.jsx';
import Logo from '../components/Logo.jsx';
import QuickAddDeadline from '../components/QuickAddDeadline.jsx';
import SyncStatus from '../components/SyncStatus.jsx';
import useNow from '../hooks/useNow.js';
import useScheduler from '../hooks/useScheduler.js';
import { groupDeadlines } from '../utils/deadlineUtils.js';
import useSchedules from '../hooks/useSchedules.js';
import ScheduleModal from '../components/ScheduleModal.jsx';
import { supabase } from '../lib/supabase.js';
import { enqueueDeadlineReminder, enqueueStudyScheduleReminders } from '../lib/reminders.js';

const SECTIONS = [
  { key: 'urgent', title: 'Urgent', hint: 'Overdue, today or tomorrow', dot: 'bg-urgent' },
  { key: 'upcoming', title: 'Upcoming', hint: 'Next 7 days', dot: 'bg-upcoming' },
  { key: 'later', title: 'Later', hint: 'More than a week away', dot: 'bg-slate-400' },
];

export default function Dashboard({ auth, store }) {
  const now = useNow();
  const [form, setForm] = useState(null); // null | { initial }
  const [accountOpen, setAccountOpen] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [toast, setToast] = useState(null);
  const [scheduleFor, setScheduleFor] = useState(null);
  const toastTimer = useRef(null);

  const notify = useCallback((text, kind = 'ok') => {
    clearTimeout(toastTimer.current);
    setToast({ text, kind });
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // Listen for scheduler notifications and show in-app toast
  useEffect(() => {
    const onNotify = (e) => notify(e.detail.text, e.detail.kind);
    window.addEventListener('preptrack:notify', onNotify);
    return () => window.removeEventListener('preptrack:notify', onNotify);
  }, [notify]);

  useScheduler(auth.user?.id);

  const groups = groupDeadlines(store.items, now);
  const sched = useSchedules(auth.user?.id);
  const cloudOn = Boolean(auth.user);
  const total = store.items.length;
  const blocked = Boolean(store.storageError);

  const save = async (fields) => {
    if (form?.initial) await store.update(form.initial.id, fields);
    else {
      const saved = await store.add(fields);
      if (auth.user?.id && auth.configured && supabase) {
        try {
          await enqueueDeadlineReminder(supabase, auth.user.id, {
            id: saved.id,
            title: fields.title,
            due_at: fields.due_at,
          });
        } catch {
          // reminder queue failure should not block deadline creation
        }
      }
    }
    const editing = Boolean(form?.initial);
    setForm(null);
    notify(
      `${editing ? 'Changes saved' : 'Deadline saved'} on this device${cloudOn ? ' — syncing in the background' : ''}.`,
    );
  };

  const toggle = async (item) => {
    try {
      await store.toggleCompleted(item.id);
    } catch {
      notify('Couldn’t update that deadline on this device. Try again.', 'err');
    }
  };

  const confirmDelete = async () => {
    await store.remove(toDelete.id); // throws -> ConfirmDialog shows the error and stays open
    setToDelete(null);
    notify('Deadline deleted.');
  };

  const mockReminder = useCallback(() => {
    const text = 'Mock reminder: 25 min today for "Essay draft". You’ve got this.';
    window.dispatchEvent(new CustomEvent('preptrack:notify', { detail: { text, kind: 'ok' } }));
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification('PrepTrack reminder', { body: text });
    }
  }, []);

  return (
    <div className="min-h-dvh bg-surface text-on-surface">
      <header className="sticky top-0 z-30 border-b border-line bg-white/95 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-3 px-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Logo size={32} />
            <div className="flex min-w-0 flex-col">
              <h1 className="truncate text-headline-sm leading-none tracking-tight">PrepTrack</h1>
              <span className="hidden text-label-sm font-semibold text-slate-500 sm:block">Academic Pace &amp; Deadlines</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={mockReminder}
              className="rounded-full border border-primary/20 bg-primary/5 px-3 py-2 text-label-sm font-semibold text-primary focus-ring"
            >
              Mock reminder
            </button>
            <SyncStatus status={store.status} onClick={() => setAccountOpen(true)} />
            <button
              type="button"
              onClick={() => setAccountOpen(true)}
              aria-label={cloudOn ? `Account: ${auth.user.email}` : 'Account (guest)'}
              className={`flex h-11 w-11 items-center justify-center rounded-full focus-ring ${
                cloudOn ? 'bg-primary-container text-white' : 'bg-primary text-white'
              }`}
            >
              <Icon name="person" size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-32 pt-5 sm:px-8">
        {blocked && (
          <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-body-md text-urgent">
            <p className="font-semibold">This browser is blocking local storage.</p>
            <p className="mt-1">
              PrepTrack can't save deadlines right now. Private browsing or strict site-data settings are the usual cause.
              Open the app in a normal tab or allow site data, then reload.
            </p>
          </div>
        )}

        {cloudOn && store.guestCount > 0 && (
          <button
            type="button"
            onClick={() => setAccountOpen(true)}
            className="mb-4 flex w-full items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-left focus-ring"
          >
            <span className="text-body-md text-slate-800">
              <strong>{store.guestCount}</strong> guest deadline{store.guestCount === 1 ? '' : 's'} on this device aren't in your account yet.
            </span>
            <span className="shrink-0 text-label-md text-primary-container">Review</span>
          </button>
        )}

        {store.loading ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading deadlines">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl border border-line bg-white" />
            ))}
          </div>
        ) : total === 0 ? (
          <div className="mt-6 flex flex-col items-center rounded-2xl border border-dashed border-outline-variant bg-white px-6 py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary-container text-primary">
              <Icon name="calendar" size={28} />
            </div>
            <h2 className="mt-4 text-headline-lg">No deadlines yet</h2>
            <p className="mt-1 max-w-xs text-body-md text-slate-600">
              Add your next CC, assignment, project or exam date and see exactly how much time you have left.
            </p>
            <button type="button" onClick={() => setForm({ initial: null })} disabled={blocked} className="btn-primary mt-6">
              <Icon name="plus" size={18} /> Add your first deadline
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-7">
            {SECTIONS.map(({ key, title, hint, dot }) =>
              groups[key].length ? (
                <section key={key} aria-labelledby={`h-${key}`}>
                  <div className="mb-2 flex items-baseline gap-2">
                    <span className={`h-2.5 w-2.5 self-center rounded-full ${dot}`} aria-hidden="true" />
                    <h2 id={`h-${key}`} className="text-headline-sm">
                      {title}
                    </h2>
                    <span className="text-body-sm tabular-nums text-slate-500">{groups[key].length}</span>
                    <span className="ml-auto hidden text-body-sm text-slate-400 sm:block">{hint}</span>
                  </div>
                  <ul className="flex flex-col gap-2.5">
                    {groups[key].map((item) => (
                      <DeadlineCard
                        key={item.id}
                        item={item}
                        now={now}
                        showSyncMark={cloudOn}
                        onToggle={toggle}
                        onEdit={(it) => setForm({ initial: it })}
                        onDelete={setToDelete}
                        onSchedule={(it) => setScheduleFor(it)}
                      />
                    ))}
                  </ul>
                </section>
              ) : null,
            )}

            {groups.urgent.length + groups.upcoming.length + groups.later.length === 0 && (
              <p className="rounded-2xl border border-line bg-white p-4 text-body-md text-slate-600">
                Nothing left to do. Add another deadline when you’re ready.
              </p>
            )}

            {groups.completed.length > 0 && (
              <section aria-labelledby="h-completed">
                <h2 id="h-completed" className="mb-2">
                  <button
                    type="button"
                    aria-expanded={showCompleted}
                    aria-controls="completed-list"
                    onClick={() => setShowCompleted((v) => !v)}
                    className="flex min-h-[44px] w-full items-center gap-2 rounded-lg text-left text-headline-sm focus-ring"
                  >
                    <span className="h-2.5 w-2.5 rounded-full bg-success" aria-hidden="true" />
                    Completed
                    <span className="text-body-sm font-normal tabular-nums text-slate-500">{groups.completed.length}</span>
                    <Icon name="chevron" className={`ml-auto text-slate-500 transition-transform ${showCompleted ? 'rotate-180' : ''}`} />
                  </button>
                </h2>
                {showCompleted && (
                  <ul id="completed-list" className="flex flex-col gap-2.5">
                    {groups.completed.map((item) => (
                      <DeadlineCard
                        key={item.id}
                        item={item}
                        now={now}
                        showSyncMark={cloudOn}
                        onToggle={toggle}
                        onEdit={(it) => setForm({ initial: it })}
                        onDelete={setToDelete}
                      />
                    ))}
                  </ul>
                )}
              </section>
            )}
          </div>
        )}
      </main>

      {total > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => setForm({ initial: null })}
            disabled={blocked}
            className="btn-primary pointer-events-auto !rounded-full px-6 shadow-modal"
          >
            <Icon name="plus" size={20} /> Add deadline
          </button>
        </div>
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed inset-x-4 bottom-24 z-40 mx-auto max-w-sm rounded-xl px-4 py-3 text-body-md text-white shadow-modal ${
            toast.kind === 'err' ? 'bg-urgent' : 'bg-slate-900'
          }`}
        >
          {toast.text}
        </div>
      )}

      {form && <QuickAddDeadline initial={form.initial} onSave={save} onClose={() => setForm(null)} />}
      {toDelete && (
        <ConfirmDialog
          title="Delete this deadline?"
          message={`“${toDelete.title}” will be removed${cloudOn ? ' from this device and your account' : ' from this device'}. This can’t be undone.`}
          onConfirm={confirmDelete}
          onCancel={() => setToDelete(null)}
        />
      )}
      {accountOpen && <AccountModal auth={auth} store={store} onClose={() => setAccountOpen(false)} />}
      {scheduleFor && (
        <ScheduleModal
          deadline={scheduleFor}
          onClose={() => setScheduleFor(null)}
          onSave={async (opts) => {
            try {
              await sched.add(opts);
              if (auth.user?.id && auth.configured && supabase) {
                try {
                  const deadline = store.items.find((item) => item.id === opts.deadline_id) || scheduleFor;
                  await enqueueStudyScheduleReminders(supabase, auth.user.id, deadline, {
                    ...opts,
                    start_date: opts.start_date,
                    days: Number(opts.days),
                    minutes_per_day: Number(opts.minutes_per_day),
                  });
                } catch {
                  // reminder queue failure should not block schedule creation
                }
              }
              setScheduleFor(null);
              notify('Study schedule created. You will get daily reminders.');
            } catch (err) {
              notify('Couldn’t create schedule. Try again.', 'err');
            }
          }}
        />
      )}
    </div>
  );
}
