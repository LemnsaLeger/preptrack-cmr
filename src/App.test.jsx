// @vitest-environment jsdom
import { IDBFactory } from 'fake-indexeddb';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from './App.jsx';
import * as db from './lib/db.js';
import { toLocalInputValue } from './utils/deadlineUtils.js';

const inDays = (d, h = 14) => {
  const t = new Date();
  t.setDate(t.getDate() + d);
  t.setHours(h, 0, 0, 0);
  return toLocalInputValue(t);
};

async function fillAndSave(user, { title, due, course }) {
  await user.click(screen.getAllByRole('button', { name: /add (your first )?deadline/i })[0]);
  const dialog = await screen.findByRole('dialog', { name: /add deadline/i });
  if (title) await user.type(within(dialog).getByLabelText(/^title/i), title);
  if (due) {
    const el = within(dialog).getByLabelText(/due date/i);
    await user.clear(el);
    await user.type(el, due);
  }
  if (course) await user.type(within(dialog).getByLabelText(/course tag/i), course);
  await user.click(within(dialog).getByRole('button', { name: /save deadline/i }));
  return dialog;
}

beforeEach(async () => {
  await db.closeDb();
  globalThis.indexedDB = new IDBFactory();
});
afterEach(() => cleanup());

describe('PrepTrack dashboard (guest, local-only)', () => {
  it('opens without sign-in and shows the empty state', async () => {
    render(<App />);
    expect(await screen.findByText(/no deadlines yet/i)).toBeTruthy();
    expect(screen.getByText('PrepTrack CMR')).toBeTruthy();
    expect(screen.getByRole('button', { name: /account/i })).toBeTruthy();
  });

  it('shows validation errors below fields and keeps what was typed', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/no deadlines yet/i);

    const dialog = await fillAndSave(user, { title: '', due: '', course: '' });
    expect(within(dialog).getByText(/enter a title/i)).toBeTruthy();
    expect(within(dialog).getByText(/choose a due date/i)).toBeTruthy();

    // Past date + bad course, with the title preserved
    await user.type(within(dialog).getByLabelText(/^title/i), 'Keep me');
    await user.type(within(dialog).getByLabelText(/due date/i), '2020-01-01T10:00');
    await user.type(within(dialog).getByLabelText(/course tag/i), '<<>>');
    await user.click(within(dialog).getByRole('button', { name: /save deadline/i }));
    expect(within(dialog).getByText(/in the future/i)).toBeTruthy();
    expect(within(dialog).getByText(/use letters, numbers/i)).toBeTruthy();
    expect(within(dialog).getByLabelText(/^title/i).value).toBe('Keep me');
    expect(within(dialog).getByLabelText(/course tag/i).value).toBe('<<>>');
    expect(within(dialog).getByLabelText(/^title/i).getAttribute('aria-invalid')).toBeNull();
    expect(within(dialog).getByLabelText(/due date/i).getAttribute('aria-invalid')).toBe('true');
    expect(await db.listAll(db.GUEST)).toEqual([]); // nothing saved
  });

  it('saves to IndexedDB, shows the card and survives a re-mount ("refresh")', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    await screen.findByText(/no deadlines yet/i);
    await fillAndSave(user, { title: 'EE410 Report', due: inDays(1), course: 'EE410' });

    expect(await screen.findByText('EE410 Report')).toBeTruthy();
    expect(screen.getByText('EE410')).toBeTruthy();
    expect(screen.getByRole('heading', { name: /^urgent/i })).toBeTruthy(); // tomorrow => Urgent
    expect(screen.getByText(/deadline saved on this device/i)).toBeTruthy();
    expect((await db.listAll(db.GUEST)).length).toBe(1);

    unmount();
    await db.closeDb(); // fresh connection, like a page reload
    render(<App />);
    expect(await screen.findByText('EE410 Report')).toBeTruthy();
  });

  it('groups by urgency, then completes, reopens, edits and deletes (with confirmation)', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/no deadlines yet/i);
    await fillAndSave(user, { title: 'Later thing', due: inDays(20) });
    await screen.findByText('Later thing');
    await fillAndSave(user, { title: 'Soon thing', due: inDays(4) });
    await screen.findByText('Soon thing');

    expect(screen.getByRole('heading', { name: /^upcoming/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /^later/i })).toBeTruthy();

    // complete -> moves to collapsible Completed
    await user.click(screen.getByRole('checkbox', { name: /mark completed: soon thing/i }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: /^upcoming/i })).toBeNull());
    const completedToggle = screen.getByRole('button', { name: /completed/i });
    expect(completedToggle.getAttribute('aria-expanded')).toBe('false');
    await user.click(completedToggle);
    expect(await screen.findByRole('checkbox', { name: /reopen: soon thing/i })).toBeTruthy();

    // reopen
    await user.click(screen.getByRole('checkbox', { name: /reopen: soon thing/i }));
    expect(await screen.findByRole('heading', { name: /^upcoming/i })).toBeTruthy();

    // edit
    await user.click(screen.getByRole('button', { name: /edit later thing/i }));
    const dialog = await screen.findByRole('dialog', { name: /edit deadline/i });
    const title = within(dialog).getByLabelText(/^title/i);
    await user.clear(title);
    await user.type(title, 'Renamed thing');
    await user.click(within(dialog).getByRole('button', { name: /save changes/i }));
    expect(await screen.findByText('Renamed thing')).toBeTruthy();
    expect(screen.queryByText('Later thing')).toBeNull();

    // delete needs confirmation; cancel keeps it
    await user.click(screen.getByRole('button', { name: /delete renamed thing/i }));
    let confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: /cancel/i }));
    expect(screen.getByText('Renamed thing')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /delete renamed thing/i }));
    confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: /^delete$/i }));
    await waitFor(() => expect(screen.queryByText('Renamed thing')).toBeNull());
    expect((await db.listAll(db.GUEST)).map((r) => r.title)).toEqual(['Soon thing']);
  });

  it('does not report success when local persistence fails, and keeps the form values', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/no deadlines yet/i);

    const original = db.putRecord;
    // Force the next write to fail by closing the factory underneath it.
    const realPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function () {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError');
    };
    try {
      const dialog = await fillAndSave(user, { title: 'Will fail', due: inDays(2) });
      expect(await within(dialog).findByRole('alert')).toBeTruthy();
      expect(within(dialog).getByText(/couldn.t save on this device/i)).toBeTruthy();
      expect(within(dialog).getByLabelText(/^title/i).value).toBe('Will fail');
      expect(screen.queryByText(/deadline saved on this device/i)).toBeNull();
    } finally {
      IDBObjectStore.prototype.put = realPut;
    }
    expect(original).toBe(db.putRecord);
    expect(await db.listAll(db.GUEST)).toEqual([]);

    // Retry now succeeds with the preserved values.
    const retry = screen.getByRole('dialog', { name: /add deadline/i });
    await user.click(within(retry).getByRole('button', { name: /save deadline/i }));
    expect(await screen.findByText('Will fail')).toBeTruthy();
  });

  it('prevents duplicate submissions on a double tap', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/no deadlines yet/i);
    await user.click(screen.getAllByRole('button', { name: /add your first deadline/i })[0]);
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^title/i), 'Once only');
    await user.type(within(dialog).getByLabelText(/due date/i), inDays(3));
    const save = within(dialog).getByRole('button', { name: /save deadline/i });
    await Promise.all([user.click(save), user.click(save), user.dblClick(save)]);
    await screen.findByText('Once only');
    expect((await db.listAll(db.GUEST)).length).toBe(1);
  });

  it('closes dialogs with Escape and labels them for assistive tech', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/no deadlines yet/i);
    await user.click(screen.getAllByRole('button', { name: /add your first deadline/i })[0]);
    const dialog = await screen.findByRole('dialog', { name: /add deadline/i });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('explains honestly when cloud sync is not configured', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/no deadlines yet/i);
    await user.click(screen.getByRole('button', { name: /account/i }));
    const dialog = await screen.findByRole('dialog', { name: /account/i });
    expect(within(dialog).getByText(/isn.t set up/i)).toBeTruthy();
    expect(within(dialog).getByText(/VITE_SUPABASE_URL/)).toBeTruthy();
  });
});
