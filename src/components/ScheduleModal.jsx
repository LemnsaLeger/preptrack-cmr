import { useState } from 'react';
import Icon from './Icon.jsx';

export default function ScheduleModal({ deadline, onSave, onClose }) {
  const [days, setDays] = useState(10);
  const [minutes, setMinutes] = useState(20);

  const submit = (e) => {
    e.preventDefault();
    const start_date = new Date().toISOString().slice(0, 10);
    onSave({ deadline_id: deadline.id, start_date, days: Number(days), minutes_per_day: Number(minutes) });
    onClose();
  };

  return (
    <dialog open className="rounded-xl p-4">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-secondary-container flex items-center justify-center text-primary">
            <Icon name="calendar" size={18} />
          </div>
          <div>
            <div className="text-headline-sm">Schedule study for</div>
            <div className="text-body-md text-slate-600">{deadline.title}</div>
          </div>
        </div>

        <label className="flex flex-col">
          Days to prepare
          <input type="number" min="1" value={days} onChange={(e) => setDays(e.target.value)} className="input" />
        </label>

        <label className="flex flex-col">
          Minutes per day
          <input type="number" min="1" value={minutes} onChange={(e) => setMinutes(e.target.value)} className="input" />
        </label>

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button type="submit" className="btn-primary">Start schedule</button>
        </div>
      </form>
    </dialog>
  );
}
