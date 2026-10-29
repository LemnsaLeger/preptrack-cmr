import { useEffect } from 'react';
import * as db from '../lib/db.js';
import { supabase } from '../lib/supabase.js';
import { syncSchedulesOwner } from '../lib/sync.js';

// Runs in-page checks every minute to fire reminders for schedules stored locally.
export default function useScheduler(userId) {
  useEffect(() => {
    let mounted = true;
    async function checkAndAlert() {
      const owner = userId ?? db.GUEST;
      const schedules = await db.listVisibleSchedules(owner);
      const now = new Date();

      for (const s of schedules) {
        if (!s.active) continue;
        const start = new Date(s.start_date + 'T00:00:00');
        const daysPassed = Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / (24 * 3600 * 1000));
        if (daysPassed < 0) continue; // schedule not started
        if (daysPassed >= s.days) continue; // finished

        // today's scheduled alert time: 09:00 local time for simplicity
        const alertTime = new Date(start);
        alertTime.setDate(start.getDate() + daysPassed);
        alertTime.setHours(9, 0, 0, 0);

        const lastAlert = s.last_alert_at ? new Date(s.last_alert_at) : null;
        // If we are past alertTime and haven't recorded an alert for this day, trigger it
        if (now >= alertTime && (!lastAlert || lastAlert < alertTime)) {
          // compute suggestion if user missed previous days
          const totalMinutes = s.days * s.minutes_per_day;
          const minutesDone = Math.max(0, daysPassed) * s.minutes_per_day; // optimistic
          const remainingDays = Math.max(1, s.days - (daysPassed + 1));
          const remainingMinutes = Math.max(0, totalMinutes - minutesDone - s.minutes_per_day);
          const suggested = Math.ceil(remainingMinutes / remainingDays || s.minutes_per_day);

          // fire a notification event the UI can listen to
          const text = `Study reminder: ${s.minutes_per_day} min today for "${s.deadline_id}". If you missed days, try ${suggested} min/day for the remaining ${remainingDays} day(s).`;
          window.dispatchEvent(new CustomEvent('preptrack:notify', { detail: { text, kind: 'ok' } }));

          // Browser Notification if permitted
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification('PrepTrack reminder', { body: text });
          }

          // Mark last_alert_at locally and attempt a quick sync
          const nowIso = new Date().toISOString();
          const updated = { ...s, last_alert_at: nowIso, updated_at: nowIso, dirty: true };
          await db.putSchedule(updated);
          try {
            if (supabase && userId && navigator.onLine) await syncSchedulesOwner(supabase, userId);
          } catch (err) {
            // ignore sync errors; background sync will retry
          }
        }
      }
    }

    // initial run + interval
    checkAndAlert();
    const id = setInterval(() => { if (mounted) checkAndAlert(); }, 60_000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [userId]);
}
