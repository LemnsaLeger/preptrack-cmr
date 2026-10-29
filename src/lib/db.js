// Local-first storage (IndexedDB via the tiny `idb` wrapper).
//
// Record shape:
//   { id, owner, title, course, due_at, completed, created_at, updated_at, deleted, dirty }
// - owner:   'guest' or a Supabase user id. Queries are always scoped to one owner.
// - dirty:   true while the change has not been confirmed by the cloud.
// - deleted: tombstone; the row stays until the cloud delete is confirmed.
import { openDB } from 'idb';

export const GUEST = 'guest';
const DB_NAME = 'preptrack-cmr';
const STORE = 'deadlines';
const SCHEDULE_STORE = 'schedules';

let dbPromise = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 2, {
      upgrade(db, oldVersion) {
        // Create the primary deadlines store if it doesn't exist (handles really old DBs).
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('owner', 'owner');
        }

        // Add the schedules store when upgrading from older DB versions.
        if (!db.objectStoreNames.contains(SCHEDULE_STORE)) {
          const s = db.createObjectStore(SCHEDULE_STORE, { keyPath: 'id' });
          s.createIndex('owner', 'owner');
        }
      },
    }).catch((err) => {
      dbPromise = null; // allow a retry on the next call
      throw err;
    });
  }
  return dbPromise;
}

/** Throws if IndexedDB is unavailable (e.g. blocked storage). Used for an honest startup check. */
export async function checkStorage() {
  await getDb();
}

export async function closeDb() {
  if (dbPromise) {
    const db = await dbPromise.catch(() => null);
    db?.close();
    dbPromise = null;
  }
}

export async function listAll(owner) {
  const db = await getDb();
  return db.getAllFromIndex(STORE, 'owner', owner);
}

export async function listAllSchedules(owner) {
  const db = await getDb();
  return db.getAllFromIndex(SCHEDULE_STORE, 'owner', owner);
}

/** Records to show in the UI (tombstones hidden). */
export async function listVisible(owner) {
  return (await listAll(owner)).filter((r) => !r.deleted);
}

export async function listVisibleSchedules(owner) {
  return (await listAllSchedules(owner)).filter((r) => !r.deleted);
}

export async function getRecord(id) {
  const db = await getDb();
  return db.get(STORE, id);
}

export async function getSchedule(id) {
  const db = await getDb();
  return db.get(SCHEDULE_STORE, id);
}

/** Resolves only after the transaction has committed. */
export async function putRecord(record) {
  const db = await getDb();
  await db.put(STORE, record);
  return record;
}

export async function putSchedule(record) {
  const db = await getDb();
  await db.put(SCHEDULE_STORE, record);
  return record;
}

export async function putMany(records) {
  const db = await getDb();
  const tx = db.transaction(STORE, 'readwrite');
  await Promise.all([...records.map((r) => tx.store.put(r)), tx.done]);
}

export async function putManySchedules(records) {
  const db = await getDb();
  const tx = db.transaction(SCHEDULE_STORE, 'readwrite');
  await Promise.all([...records.map((r) => tx.store.put(r)), tx.done]);
}

export async function deleteRecord(id) {
  const db = await getDb();
  await db.delete(STORE, id);
}

export async function deleteSchedule(id) {
  const db = await getDb();
  await db.delete(SCHEDULE_STORE, id);
}

export async function countPending(owner) {
  return (await listAll(owner)).filter((r) => r.dirty).length;
}

export async function countPendingSchedules(owner) {
  return (await listAllSchedules(owner)).filter((r) => r.dirty).length;
}

/**
 * Mark a record as synced ONLY if it has not been edited since we pushed it.
 * Prevents a slow upload from marking a newer local edit as "synced".
 */
export async function markSynced(id, pushedUpdatedAt) {
  const db = await getDb();
  const tx = db.transaction(STORE, 'readwrite');
  const cur = await tx.store.get(id);
  if (cur && cur.updated_at === pushedUpdatedAt) {
    await tx.store.put({ ...cur, dirty: false });
  }
  await tx.done;
}

/** Remove a tombstone only if it is still a tombstone with the same timestamp. */
export async function purgeTombstone(id, deletedUpdatedAt) {
  const db = await getDb();
  const tx = db.transaction(STORE, 'readwrite');
  const cur = await tx.store.get(id);
  if (cur && cur.deleted && cur.updated_at === deletedUpdatedAt) await tx.store.delete(id);
  await tx.done;
}

export async function markScheduleSynced(id, pushedUpdatedAt) {
  const db = await getDb();
  const tx = db.transaction(SCHEDULE_STORE, 'readwrite');
  const cur = await tx.store.get(id);
  if (cur && cur.updated_at === pushedUpdatedAt) {
    await tx.store.put({ ...cur, dirty: false });
  }
  await tx.done;
}

export async function purgeScheduleTombstone(id, deletedUpdatedAt) {
  const db = await getDb();
  const tx = db.transaction(SCHEDULE_STORE, 'readwrite');
  const cur = await tx.store.get(id);
  if (cur && cur.deleted && cur.updated_at === deletedUpdatedAt) await tx.store.delete(id);
  await tx.done;
}

/** Delete every local record belonging to one owner (used on sign-out). */
export async function purgeOwner(owner) {
  const db = await getDb();
  const tx = db.transaction(STORE, 'readwrite');
  const keys = await tx.store.index('owner').getAllKeys(owner);
  await Promise.all([...keys.map((k) => tx.store.delete(k)), tx.done]);
}

/** Delete records of every owner except the ones listed (account switch on a shared device). */
export async function purgeOwnersExcept(keep) {
  const db = await getDb();
  const tx = db.transaction(STORE, 'readwrite');
  const all = await tx.store.getAll();
  await Promise.all([
    ...all.filter((r) => !keep.includes(r.owner)).map((r) => tx.store.delete(r.id)),
    tx.done,
  ]);
}
