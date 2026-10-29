import { useCallback, useEffect, useRef, useState } from 'react';
import * as db from '../lib/db.js';
import { supabase } from '../lib/supabase.js';
import { syncSchedulesOwner, migrateGuestSchedules } from '../lib/sync.js';
import { newId } from '../utils/deadlineUtils.js';

const RETRY_MS = 30_000;

export default function useSchedules(userId) {
  const owner = userId ?? db.GUEST;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const inFlight = useRef(null);
  const rerun = useRef(false);

  const reload = useCallback(async () => {
    const o = owner;
    const visible = await db.listVisibleSchedules(o);
    setItems(visible);
  }, [owner]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      try {
        await db.checkStorage();
        await db.purgeOwnersExcept([db.GUEST, owner]);
        await reload();
      } catch (err) {
        // swallow; UI can handle absence
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [owner, reload]);

  const runSync = useCallback(async () => {
    if (!supabase || !userId || !navigator.onLine) return;
    if (inFlight.current) {
      rerun.current = true;
      return inFlight.current;
    }
    setSyncing(true);
    inFlight.current = (async () => {
      try {
        await syncSchedulesOwner(supabase, userId);
      } catch (err) {
        // ignore sync errors for now
      } finally {
        inFlight.current = null;
        setSyncing(false);
        await reload().catch(() => {});
        if (rerun.current) {
          rerun.current = false;
          runSync();
        }
      }
    })();
    return inFlight.current;
  }, [userId, reload]);

  useEffect(() => {
    if (!userId) return undefined;
    runSync();
    const goOnline = () => runSync();
    window.addEventListener('online', goOnline);
    return () => window.removeEventListener('online', goOnline);
  }, [userId, runSync]);

  useEffect(() => {
    if (!userId) return undefined;
    const id = setInterval(runSync, RETRY_MS);
    return () => clearInterval(id);
  }, [userId, runSync]);

  const commit = useCallback(
    async (record) => {
      await db.putSchedule(record);
      await reload();
      runSync();
      return record;
    },
    [reload, runSync],
  );

  const add = useCallback(
    async ({ deadline_id, start_date, days, minutes_per_day }) => {
      const stamp = new Date().toISOString();
      return commit({
        id: newId(),
        owner: owner,
        deadline_id,
        start_date,
        days,
        minutes_per_day,
        active: true,
        last_alert_at: null,
        created_at: stamp,
        updated_at: stamp,
        deleted: false,
        dirty: true,
      });
    },
    [commit, owner],
  );

  const update = useCallback(
    async (id, changes) => {
      const cur = await db.getSchedule(id);
      if (!cur || cur.owner !== owner) throw new Error('Schedule not found.');
      return commit({ ...cur, ...changes, updated_at: new Date().toISOString(), dirty: true });
    },
    [commit, owner],
  );

  const remove = useCallback(
    async (id) => {
      const cur = await db.getSchedule(id);
      if (!cur) return;
      if (owner === db.GUEST || !supabase) {
        await db.deleteSchedule(id);
        await reload();
        return;
      }
      await commit({ ...cur, deleted: true, dirty: true, updated_at: new Date().toISOString() });
    },
    [commit, owner, reload],
  );

  const migrateGuest = useCallback(async () => {
    if (!supabase || !userId) throw new Error('Sign in first.');
    if (!navigator.onLine) throw new Error('You are offline.');
    const result = await migrateGuestSchedules(supabase, userId);
    await reload();
    await runSync();
    return result;
  }, [userId, reload, runSync]);

  return { items, loading, syncing, add, update, remove, migrateGuest, syncNow: runSync };
}
