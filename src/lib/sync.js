// Minimal, idempotent sync between IndexedDB and Supabase.
//
// Rules (kept deliberately simple):
//  * Every record has a client-generated UUID, so re-uploading is an UPSERT and never duplicates.
//  * Conflicts: last write wins, compared by `updated_at`.
//  * Local changes are only marked clean after the cloud confirmed them.
//  * Deletes are tombstones until the cloud delete succeeds.
import * as db from './db.js';

const COLUMNS = 'id,user_id,title,course,due_at,completed,created_at,updated_at';
const ms = (iso) => new Date(iso).getTime();

function fromRemote(row, owner) {
  return {
    id: row.id,
    owner,
    title: row.title,
    course: row.course ?? '',
    due_at: row.due_at,
    completed: row.completed,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted: false,
    dirty: false,
  };
}

export function toRemote(rec, userId) {
  return {
    id: rec.id,
    user_id: userId,
    title: rec.title,
    course: rec.course || null,
    due_at: rec.due_at,
    completed: rec.completed,
    created_at: rec.created_at,
    updated_at: rec.updated_at,
  };
}

// --- schedules sync -----------------------------------------------------
const S_COLUMNS = 'id,user_id,deadline_id,start_date,days,minutes_per_day,active,last_alert_at,created_at,updated_at';

function fromRemoteSchedule(row, owner) {
  return {
    id: row.id,
    owner,
    deadline_id: row.deadline_id,
    start_date: row.start_date,
    days: row.days,
    minutes_per_day: row.minutes_per_day,
    active: row.active,
    last_alert_at: row.last_alert_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted: false,
    dirty: false,
  };
}

export function toRemoteSchedule(rec, userId) {
  return {
    id: rec.id,
    user_id: userId,
    deadline_id: rec.deadline_id,
    start_date: rec.start_date,
    days: rec.days,
    minutes_per_day: rec.minutes_per_day,
    active: rec.active,
    last_alert_at: rec.last_alert_at || null,
    created_at: rec.created_at,
    updated_at: rec.updated_at,
  };
}

/**
 * Two-way sync for one signed-in user. Throws on any network/permission error;
 * local data is never touched destructively when that happens.
 */
export async function syncOwner(client, userId) {
  const { data: remoteRows, error: pullError } = await client
    .from('deadlines')
    .select(COLUMNS)
    .eq('user_id', userId);
  if (pullError) throw pullError;

  const local = await db.listAll(userId);
  const localById = new Map(local.map((r) => [r.id, r]));
  const remoteById = new Map(remoteRows.map((r) => [r.id, r]));

  const toWrite = []; // local writes coming from the cloud
  const toPush = []; // local records to upload
  const toCloudDelete = [];

  for (const r of remoteRows) {
    const l = localById.get(r.id);
    if (!l) {
      toWrite.push(fromRemote(r, userId));
    } else if (l.deleted) {
      // Local delete vs. remote copy: newer side wins.
      if (ms(r.updated_at) > ms(l.updated_at)) toWrite.push(fromRemote(r, userId));
      else toCloudDelete.push(l);
    } else if (!l.dirty) {
      if (ms(r.updated_at) > ms(l.updated_at)) toWrite.push(fromRemote(r, userId));
    } else if (ms(r.updated_at) > ms(l.updated_at)) {
      toWrite.push(fromRemote(r, userId)); // cloud is newer than our pending edit
    } else {
      toPush.push(l);
    }
  }

  for (const l of local) {
    if (remoteById.has(l.id)) continue;
    if (l.deleted) {
      await db.purgeTombstone(l.id, l.updated_at); // never reached the cloud, nothing to delete
    } else if (l.dirty) {
      toPush.push(l); // new local record
    } else {
      await db.deleteRecord(l.id); // was synced before, now gone from the cloud (deleted elsewhere)
    }
  }

  if (toWrite.length) await db.putMany(toWrite);

  if (toPush.length) {
    const { error } = await client
      .from('deadlines')
      .upsert(toPush.map((r) => toRemote(r, userId)), { onConflict: 'id' });
    if (error) throw error;
    for (const r of toPush) await db.markSynced(r.id, r.updated_at);
  }

  if (toCloudDelete.length) {
    const { error } = await client
      .from('deadlines')
      .delete()
      .in('id', toCloudDelete.map((r) => r.id))
      .eq('user_id', userId);
    if (error) throw error;
    for (const r of toCloudDelete) await db.purgeTombstone(r.id, r.updated_at);
  }

  return { pushed: toPush.length, pulled: toWrite.length, deleted: toCloudDelete.length };
}

/** Two-way sync for schedules table for one user. */
export async function syncSchedulesOwner(client, userId) {
  const { data: remoteRows, error: pullError } = await client
    .from('schedules')
    .select(S_COLUMNS)
    .eq('user_id', userId);
  if (pullError) throw pullError;

  const local = await db.listAllSchedules(userId);
  const localById = new Map(local.map((r) => [r.id, r]));
  const remoteById = new Map(remoteRows.map((r) => [r.id, r]));

  const toWrite = [];
  const toPush = [];
  const toCloudDelete = [];

  for (const r of remoteRows) {
    const l = localById.get(r.id);
    if (!l) toWrite.push(fromRemoteSchedule(r, userId));
    else if (l.deleted) {
      if (ms(r.updated_at) > ms(l.updated_at)) toWrite.push(fromRemoteSchedule(r, userId));
      else toCloudDelete.push(l);
    } else if (!l.dirty) {
      if (ms(r.updated_at) > ms(l.updated_at)) toWrite.push(fromRemoteSchedule(r, userId));
    } else if (ms(r.updated_at) > ms(l.updated_at)) {
      toWrite.push(fromRemoteSchedule(r, userId));
    } else {
      toPush.push(l);
    }
  }

  for (const l of local) {
    if (remoteById.has(l.id)) continue;
    if (l.deleted) {
      await db.purgeScheduleTombstone(l.id, l.updated_at).catch(() => {});
    } else if (l.dirty) toPush.push(l);
    else await db.deleteSchedule(l.id).catch(() => {});
  }

  if (toWrite.length) await db.putManySchedules(toWrite);

  if (toPush.length) {
    const { error } = await client.from('schedules').upsert(toPush.map((r) => toRemoteSchedule(r, userId)), { onConflict: 'id' });
    if (error) throw error;
    for (const r of toPush) await db.markScheduleSynced(r.id, r.updated_at).catch(() => {});
  }

  if (toCloudDelete.length) {
    const { error } = await client.from('schedules').delete().in('id', toCloudDelete.map((r) => r.id)).eq('user_id', userId);
    if (error) throw error;
    for (const r of toCloudDelete) await db.purgeScheduleTombstone(r.id, r.updated_at).catch(() => {});
  }

  return { pushed: toPush.length, pulled: toWrite.length, deleted: toCloudDelete.length };
}

export async function migrateGuestSchedules(client, userId) {
  const guest = (await db.listAllSchedules(db.GUEST)).filter((r) => !r.deleted);
  if (!guest.length) return { migrated: 0 };
  const { error } = await client.from('schedules').upsert(guest.map((r) => toRemoteSchedule(r, userId)), { onConflict: 'id' });
  if (error) throw error;
  const { data: confirmed, error: readError } = await client.from('schedules').select('id').in('id', guest.map((r) => r.id));
  if (readError) throw readError;
  const ok = new Set(confirmed.map((r) => r.id));
  const adopted = guest.filter((r) => ok.has(r.id)).map((r) => ({ ...r, owner: userId, dirty: false }));
  await db.putManySchedules(adopted);
  return { migrated: adopted.length, expected: guest.length };
}

/**
 * Guest -> account migration. Uploads guest records first; a record is only re-assigned to the
 * account locally AFTER the cloud confirmed it. Nothing is deleted. Safe to re-run.
 */
export async function migrateGuestRecords(client, userId) {
  const guest = (await db.listAll(db.GUEST)).filter((r) => !r.deleted);
  if (!guest.length) return { migrated: 0 };

  const { error } = await client
    .from('deadlines')
    .upsert(guest.map((r) => toRemote(r, userId)), { onConflict: 'id' });
  if (error) throw error;

  // Confirm by reading back before touching local data.
  const { data: confirmed, error: readError } = await client
    .from('deadlines')
    .select('id')
    .in('id', guest.map((r) => r.id));
  if (readError) throw readError;
  const ok = new Set(confirmed.map((r) => r.id));

  const adopted = guest.filter((r) => ok.has(r.id)).map((r) => ({ ...r, owner: userId, dirty: false }));
  await db.putMany(adopted); // same id => replaces the guest copy in place; no duplicate possible
  return { migrated: adopted.length, expected: guest.length };
}
