import { useMemo, useRef, useState } from 'react';
import Dialog from './Dialog.jsx';
import {
  COURSE_MAX,
  TITLE_MAX,
  parseLocalInput,
  toLocalInputValue,
  validateDeadline,
} from '../utils/deadlineUtils.js';

/**
 * Quick-add / edit form. Bottom sheet on mobile, centered modal on desktop (see Dialog).
 * `onSave({ title, course, due_at })` must resolve only after the LOCAL save committed.
 */
export default function QuickAddDeadline({ initial = null, onSave, onClose }) {
  const editing = Boolean(initial);
  const initialDue = initial ? toLocalInputValue(initial.due_at) : '';
  const [values, setValues] = useState({
    title: initial?.title ?? '',
    course: initial?.course ?? '',
    due: initialDue,
  });
  const [touched, setTouched] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const submitting = useRef(false); // blocks double-taps before React re-renders
  const refs = { title: useRef(null), due: useRef(null), course: useRef(null) };

  // When editing, an already-overdue date is allowed to stay as-is; only a CHANGED date must be future.
  const requireFuture = !editing || values.due !== initialDue;
  const errors = useMemo(
    () => validateDeadline(values, { now: new Date(), requireFuture }),
    [values, requireFuture],
  );
  const shown = (f) => (touched[f] ? errors[f] : undefined);

  const set = (field) => (e) => {
    setSaveError('');
    setValues((v) => ({ ...v, [field]: e.target.value }));
  };
  const blur = (field) => () => setTouched((t) => ({ ...t, [field]: true }));

  const submit = async (e) => {
    e.preventDefault();
    if (submitting.current) return;
    setTouched({ title: true, due: true, course: true });
    const firstBad = ['title', 'due', 'course'].find((f) => errors[f]);
    if (firstBad) {
      refs[firstBad].current?.focus();
      return;
    }
    submitting.current = true;
    setSaving(true);
    setSaveError('');
    try {
      await onSave({
        title: values.title.trim(),
        course: values.course.trim(),
        due_at: parseLocalInput(values.due).toISOString(),
      });
      // Parent closes the dialog and shows the "saved" confirmation.
    } catch {
      setSaveError(
        "Couldn't save on this device. Your entries are still here — try again. If it keeps failing, free up phone storage or check that your browser allows site data.",
      );
      submitting.current = false;
      setSaving(false);
    }
  };

  const minNow = toLocalInputValue(new Date());
  const field = (f) => ({
    ref: refs[f],
    'aria-invalid': shown(f) ? 'true' : undefined,
    'aria-describedby': shown(f) ? `${f}-error` : undefined,
    className: `input ${shown(f) ? 'input-error' : ''}`,
    disabled: saving,
    onBlur: blur(f),
  });
  const err = (f) =>
    shown(f) ? (
      <p id={`${f}-error`} className="mt-1.5 text-body-sm text-urgent">
        {errors[f]}
      </p>
    ) : null;

  return (
    <Dialog title={editing ? 'Edit deadline' : 'Add deadline'} labelId="quick-add-title" onClose={onClose} dismissible={!saving}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="qa-title" className="label">
              Title
            </label>
            <span className="text-body-sm tabular-nums text-slate-400">
              {values.title.length}/{TITLE_MAX}
            </span>
          </div>
          <input
            id="qa-title"
            type="text"
            value={values.title}
            onChange={set('title')}
            placeholder="e.g. CC1 – Thermodynamics"
            maxLength={TITLE_MAX}
            autoComplete="off"
            required
            data-autofocus
            {...field('title')}
          />
          {err('title')}
        </div>

        <div>
          <label htmlFor="qa-due" className="label">
            Due date and time
          </label>
          <input
            id="qa-due"
            type="datetime-local"
            value={values.due}
            onChange={set('due')}
            min={requireFuture ? minNow : undefined}
            required
            {...field('due')}
          />
          {err('due')}
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="qa-course" className="label">
              Course tag <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <span className="text-body-sm tabular-nums text-slate-400">
              {values.course.length}/{COURSE_MAX}
            </span>
          </div>
          <input
            id="qa-course"
            type="text"
            value={values.course}
            onChange={set('course')}
            placeholder="e.g. EE410 or Math-101"
            maxLength={COURSE_MAX}
            autoComplete="off"
            {...field('course')}
          />
          {err('course')}
        </div>

        {saveError && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-body-md text-urgent">
            {saveError}
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={saving} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="btn-primary sm:min-w-[9rem]">
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Save deadline'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
