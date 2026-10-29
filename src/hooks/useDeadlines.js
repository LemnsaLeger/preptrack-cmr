import { useCallback, useEffect, useRef, useState } from 'react';
import * as db from '../lib/db.js';
import { supabase } from '../lib/supabase.js';
import { syncOwner, migrateGuestRecords } from '../lib/sync.js';
import { newId } from '../utils/deadlineUtils.js';

const RETRY_MS = 30_000;

/**
 * Local-first deadline store.
 * Every write goes to IndexedDB first; the UI updates once that commit succeeds.
 * Cloud sync runs in the background and can never block or undo a local save.
 */
export default function useDeadlines(userId) {
  const owner = userId ?? db.GUEST;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [storageError, setStorageError] = useState(null);
  const [pending, setPending] = useState(0);
  const [guestCount, setGuestCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(null);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));

  const ownerRef = useRef(owner);
  ownerRef.current = owner;
  const inFlight = useRef(null);
  const rerun = useRef(false);

  const reload = useCallback(async () => {
    const o = ownerRef.current;
    const [visible, pend, guest] = await Promise.all([
      db.listVisible(o),
      db.countPending(o),
      userId ? db.listVisible(db.GUEST) : Promise.resolve([]),
    ]);
    if (ownerRef.current !== o) return; // account changed while reading
    setItems(visible);
    setPending(pend);
    setGuestCount(guest.length);
  }, [userId]);

  // Load when the owner changes.
  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      try {
        await db.checkStorage();
        // Privacy on shared devices: never keep another account's cached records.
        await db.purgeOwnersExcept([db.GUEST, owner]);
        await reload();
        if (active) setStorageError(null);
      } catch (err) {
        if (active) setStorageError(err);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [owner, reload]);

  // ---- background sync (single in-flight, re-run if asked during a run) ----
  const runSync = useCallback(async () => {
    if (!supabase || !userId || !navigator.onLine) return;
    if (inFlight.current) {
      rerun.current = true;
      return inFlight.current;
    }
    setSyncing(true);
    inFlight.current = (async () => {
      try {
        await syncOwner(supabase, userId);
        setSyncError(null);
        setLastSyncedAt(new Date());
      } catch (err) {
        setSyncError(err);
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

  // Foreground retry: on open, reconnect, tab focus, and a timer while changes are waiting.
  useEffect(() => {
    if (!userId) return undefined;
    runSync();
    const goOnline = () => {
      setOnline(true);
      runSync();
    };
    const goOffline = () => setOnline(false);
    const onVisible = () => document.visibilityState === 'visible' && runSync();
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId, runSync]);

  useEffect(() => {
    if (!userId || (pending === 0 && !syncError)) return undefined;
    const id = setInterval(runSync, RETRY_MS);
    return () => clearInterval(id);
  }, [userId, pending, syncError, runSync]);

  // ---- mutations: local commit first, then reload, then background sync ----
  const commit = useCallback(
    async (record) => {
      await db.putRecord(record); // throws if IndexedDB fails => caller shows the error
      await reload();
      runSync();
      return record;
    },
    [reload, runSync],
  );

  const add = useCallback(
    async ({ title, course, due_at }) => {
      const stamp = new Date().toISOString();
      return commit({
        id: newId(),
        owner: ownerRef.current,
        title: title.trim(),
        course: (course ?? '').trim(),
        due_at,
        completed: false,
        created_at: stamp,
        updated_at: stamp,
        deleted: false,
        dirty: true,
      });
    },
    [commit],
  );

  const update = useCallback(
    async (id, changes) => {
      const cur = await db.getRecord(id);
      if (!cur || cur.owner !== ownerRef.current) throw new Error('Deadline not found.');
      return commit({
        ...cur,
        ...changes,
        title: (changes.title ?? cur.title).trim(),
        course: (changes.course ?? cur.course ?? '').trim(),
        updated_at: new Date().toISOString(),
        dirty: true,
      });
    },
    [commit],
  );

  const toggleCompleted = useCallback(
    async (id) => {
      const cur = await db.getRecord(id);
      if (!cur) throw new Error('Deadline not found.');
      return update(id, { completed: !cur.completed });
    },
    [update],
  );

  const remove = useCallback(
    async (id) => {
      const cur = await db.getRecord(id);
      if (!cur) return;
      if (ownerRef.current === db.GUEST || !supabase) {
        // Guest records never reach the cloud: delete outright.
        await db.deleteRecord(id);
        await reload();
        return;
      }
      await commit({ ...cur, deleted: true, dirty: true, updated_at: new Date().toISOString() });
    },
    [commit, reload],
  );

  // ---- guest migration ----
  const migrateGuest = useCallback(async () => {
    if (!supabase || !userId) throw new Error('Sign in first.');
    if (!navigator.onLine) throw new Error('You are offline. Connect to the internet to upload.');
    const result = await migrateGuestRecords(supabase, userId);
    await reload();
    await runSync();
    return result;
  }, [userId, reload, runSync]);

  // Final flush before sign-out. Returns how many changes are still not in the cloud.
  const flushBeforeSignOut = useCallback(async () => {
    await runSync();
    return db.countPending(ownerRef.current);
  }, [runSync]);

  const purgeCurrentOwner = useCallback(() => db.purgeOwner(ownerRef.current), []);

  // Derive one status for the UI.
  let status;
  if (storageError) status = 'storage-error';
  else if (!supabase) status = 'local-only';
  else if (!userId) status = 'guest';
  else if (syncing) status = 'syncing';
  else if (!online) status = pending > 0 ? 'offline-pending' : 'offline';
  else if (syncError) status = 'error';
  else if (pending > 0) status = 'pending';
  else status = 'synced';

  return {
    items,
    loading,
    storageError,
    status,
    pending,
    guestCount,
    syncError,
    lastSyncedAt,
    add,
    update,
    toggleCompleted,
    remove,
    migrateGuest,
    syncNow: runSync,
    flushBeforeSignOut,
    purgeCurrentOwner,
  };
}
