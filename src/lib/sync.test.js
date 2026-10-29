import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import * as db from './db.js';
import { migrateGuestRecords, syncOwner } from './sync.js';

// Minimal in-memory stand-in for the Supabase query builder used by sync.js.
function fakeClient() {
  const rows = new Map();
  const state = { fail: false, upserts: 0 };
  const boom = () => ({ data: null, error: new Error('network down') });
  const filterable = (run) => {
    const filters = [];
    const b = {
      eq: (c, v) => (filters.push((r) => r[c] === v), b),
      in: (c, vs) => (filters.push((r) => vs.includes(r[c])), b),
      then: (res, rej) => {
        if (state.fail) return Promise.resolve(boom()).then(res, rej);
        return Promise.resolve(run((r) => filters.every((f) => f(r)))).then(res, rej);
      },
    };
    return b;
  };
  return {
    rows,
    state,
    from: () => ({
      select: () =>
        filterable((match) => ({ data: [...rows.values()].filter(match).map((r) => ({ ...r })), error: null })),
      upsert: (list) => {
        state.upserts += 1;
        if (state.fail) return Promise.resolve(boom());
        list.forEach((r) => rows.set(r.id, { ...r }));
        return Promise.resolve({ error: null });
      },
      delete: () =>
        filterable((match) => {
          for (const r of [...rows.values()]) if (match(r)) rows.delete(r.id);
          return { error: null };
        }),
    }),
  };
}

const iso = (offsetMin = 0) => new Date(Date.UTC(2026, 9, 9, 12, offsetMin)).toISOString();
const rec = (id, owner, over = {}) => ({
  id,
  owner,
  title: `T-${id}`,
  course: '',
  due_at: iso(600),
  completed: false,
  created_at: iso(0),
  updated_at: iso(0),
  deleted: false,
  dirty: true,
  ...over,
});
const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';

beforeEach(async () => {
  await db.closeDb();
  globalThis.indexedDB = new IDBFactory();
});

describe('local persistence (IndexedDB)', () => {
  it('creates, reads, updates and deletes records, and survives a "reload"', async () => {
    await db.putRecord(rec('a', db.GUEST));
    await db.putRecord(rec('b', db.GUEST));
    await db.closeDb(); // simulates reopening the app: a fresh connection must see the same data
    expect((await db.listVisible(db.GUEST)).map((r) => r.id).sort()).toEqual(['a', 'b']);

    await db.putRecord({ ...(await db.getRecord('a')), title: 'Edited', completed: true });
    expect((await db.getRecord('a')).title).toBe('Edited');
    expect((await db.getRecord('a')).completed).toBe(true);

    await db.deleteRecord('b');
    expect((await db.listVisible(db.GUEST)).map((r) => r.id)).toEqual(['a']);
  });

  it('scopes records per owner', async () => {
    await db.putRecord(rec('a', db.GUEST));
    await db.putRecord(rec('b', U1));
    expect((await db.listVisible(U1)).map((r) => r.id)).toEqual(['b']);
    expect((await db.listVisible(U2))).toEqual([]);
  });

  it('purges one account without touching guest data, and purges other accounts on switch', async () => {
    await db.putRecord(rec('g', db.GUEST));
    await db.putRecord(rec('u1', U1));
    await db.putRecord(rec('u2', U2));
    await db.purgeOwnersExcept([db.GUEST, U2]);
    expect((await db.listAll(U1))).toEqual([]);
    expect((await db.listAll(U2)).length).toBe(1);
    await db.purgeOwner(U2);
    expect((await db.listAll(U2))).toEqual([]);
    expect((await db.listAll(db.GUEST)).length).toBe(1);
  });

  it('markSynced ignores a record that was edited after the upload started', async () => {
    await db.putRecord(rec('a', U1, { updated_at: iso(5) }));
    await db.markSynced('a', iso(1)); // stale timestamp
    expect((await db.getRecord('a')).dirty).toBe(true);
    await db.markSynced('a', iso(5));
    expect((await db.getRecord('a')).dirty).toBe(false);
  });
});

describe('cloud sync', () => {
  it('uploads pending records and is idempotent (no duplicates on repeat)', async () => {
    const c = fakeClient();
    await db.putRecord(rec('a', U1));
    await db.putRecord(rec('b', U1));
    await syncOwner(c, U1);
    await syncOwner(c, U1);
    await syncOwner(c, U1);
    expect(c.rows.size).toBe(2);
    expect([...c.rows.values()].every((r) => r.user_id === U1)).toBe(true);
    expect((await db.listAll(U1)).every((r) => !r.dirty)).toBe(true);
    expect(c.state.upserts).toBe(1); // later runs found nothing to push
  });

  it('keeps local data and marks it pending when the network fails, then recovers', async () => {
    const c = fakeClient();
    await db.putRecord(rec('a', U1));
    c.state.fail = true;
    await expect(syncOwner(c, U1)).rejects.toThrow('network down');
    const kept = await db.getRecord('a');
    expect(kept).toBeDefined();
    expect(kept.dirty).toBe(true);
    expect(await db.countPending(U1)).toBe(1);

    c.state.fail = false;
    await syncOwner(c, U1);
    expect(c.rows.size).toBe(1);
    expect(await db.countPending(U1)).toBe(0);
  });

  it('does not lose local data if the push (not the pull) fails', async () => {
    const c = fakeClient();
    await db.putRecord(rec('a', U1));
    const realFrom = c.from;
    c.from = () => ({ ...realFrom(), upsert: () => Promise.resolve({ error: new Error('write blocked') }) });
    await expect(syncOwner(c, U1)).rejects.toThrow('write blocked');
    expect((await db.getRecord('a')).dirty).toBe(true);
  });

  it('pulls records created on another device', async () => {
    const c = fakeClient();
    c.rows.set('r1', { id: 'r1', user_id: U1, title: 'From phone 2', course: null, due_at: iso(900), completed: false, created_at: iso(0), updated_at: iso(0) });
    await syncOwner(c, U1);
    const got = await db.getRecord('r1');
    expect(got.title).toBe('From phone 2');
    expect(got.course).toBe('');
    expect(got.dirty).toBe(false);
  });

  it('last write wins: newer cloud edit beats an older pending local edit, and vice versa', async () => {
    const c = fakeClient();
    c.rows.set('x', { id: 'x', user_id: U1, title: 'Cloud newer', course: null, due_at: iso(900), completed: false, created_at: iso(0), updated_at: iso(30) });
    c.rows.set('y', { id: 'y', user_id: U1, title: 'Cloud older', course: null, due_at: iso(900), completed: false, created_at: iso(0), updated_at: iso(1) });
    await db.putRecord(rec('x', U1, { title: 'Local older', updated_at: iso(10) }));
    await db.putRecord(rec('y', U1, { title: 'Local newer', updated_at: iso(20) }));
    await syncOwner(c, U1);
    expect((await db.getRecord('x')).title).toBe('Cloud newer');
    expect(c.rows.get('y').title).toBe('Local newer');
  });

  it('deletes in the cloud only via tombstones, then removes the tombstone', async () => {
    const c = fakeClient();
    await db.putRecord(rec('a', U1));
    await syncOwner(c, U1);
    expect(c.rows.size).toBe(1);

    await db.putRecord({ ...(await db.getRecord('a')), deleted: true, dirty: true, updated_at: iso(5) });
    expect(await db.listVisible(U1)).toEqual([]); // hidden immediately
    c.state.fail = true;
    await expect(syncOwner(c, U1)).rejects.toThrow();
    expect(await db.getRecord('a')).toBeDefined(); // tombstone kept while offline
    c.state.fail = false;
    await syncOwner(c, U1);
    expect(c.rows.size).toBe(0);
    expect(await db.getRecord('a')).toBeUndefined();
  });

  it('drops local copies of records deleted elsewhere', async () => {
    const c = fakeClient();
    await db.putRecord(rec('a', U1));
    await syncOwner(c, U1);
    c.rows.clear(); // deleted on another device
    await syncOwner(c, U1);
    expect(await db.listAll(U1)).toEqual([]);
  });

  it("never reads or writes another user's cloud rows", async () => {
    const c = fakeClient();
    c.rows.set('theirs', { id: 'theirs', user_id: U2, title: 'Private', course: null, due_at: iso(900), completed: false, created_at: iso(0), updated_at: iso(0) });
    await db.putRecord(rec('mine', U1));
    await syncOwner(c, U1);
    expect(await db.getRecord('theirs')).toBeUndefined();
    expect(c.rows.get('theirs').user_id).toBe(U2);
  });
});

describe('guest migration', () => {
  it('uploads guest records, then re-assigns them locally without duplicates', async () => {
    const c = fakeClient();
    await db.putRecord(rec('g1', db.GUEST));
    await db.putRecord(rec('g2', db.GUEST));
    const res = await migrateGuestRecords(c, U1);
    expect(res).toEqual({ migrated: 2, expected: 2 });
    expect(c.rows.size).toBe(2);
    expect((await db.listAll(db.GUEST))).toEqual([]);
    expect((await db.listAll(U1)).length).toBe(2);

    // Re-running (e.g. user taps twice, or retries) must not duplicate anything.
    await migrateGuestRecords(c, U1);
    await syncOwner(c, U1);
    expect(c.rows.size).toBe(2);
    expect((await db.listAll(U1)).length).toBe(2);
  });

  it('keeps ALL guest data when the upload fails', async () => {
    const c = fakeClient();
    await db.putRecord(rec('g1', db.GUEST));
    c.state.fail = true;
    await expect(migrateGuestRecords(c, U1)).rejects.toThrow('network down');
    expect((await db.listAll(db.GUEST)).map((r) => r.id)).toEqual(['g1']);
    expect(await db.listAll(U1)).toEqual([]);
  });

  it('keeps guest records the cloud did not confirm', async () => {
    const c = fakeClient();
    await db.putRecord(rec('g1', db.GUEST));
    await db.putRecord(rec('g2', db.GUEST));
    // Cloud accepts the write but "forgets" g2 when read back.
    const realFrom = c.from;
    c.from = () => {
      const base = realFrom();
      return {
        ...base,
        select: () => {
          const b = base.select();
          const origThen = b.then;
          b.then = (res, rej) => origThen((out) => ({ ...out, data: out.data.filter((r) => r.id !== 'g2') }), rej).then(res, rej);
          return b;
        },
      };
    };
    const res = await migrateGuestRecords(c, U1);
    expect(res).toEqual({ migrated: 1, expected: 2 });
    expect((await db.listAll(db.GUEST)).map((r) => r.id)).toEqual(['g2']);
  });

  it('does nothing when there is no guest data', async () => {
    expect(await migrateGuestRecords(fakeClient(), U1)).toEqual({ migrated: 0 });
  });
});
