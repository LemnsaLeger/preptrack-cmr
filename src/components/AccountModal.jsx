import { useState } from 'react';
import Dialog from './Dialog.jsx';
import Icon from './Icon.jsx';
import SyncStatus from './SyncStatus.jsx';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function friendlyAuthError(err) {
  const msg = String(err?.message ?? '');
  if (/invalid login/i.test(msg)) return 'Email or password is incorrect.';
  if (/already registered|already been registered/i.test(msg)) return 'An account with this email already exists. Try signing in.';
  if (/email not confirmed/i.test(msg)) return 'Confirm your email first — check your inbox for the link.';
  if (/rate limit|too many/i.test(msg)) return 'Too many attempts. Wait a few minutes and try again.';
  if (/fetch|network/i.test(msg)) return 'No connection. Check your internet and try again.';
  return msg || 'Something went wrong. Try again.';
}

function AuthForm({ auth }) {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const next = {};
    if (!EMAIL_RE.test(email.trim())) next.email = 'Enter a valid email address.';
    if (mode === 'signup') {
      const cleanName = username.trim();
      if (!cleanName) next.username = 'Choose a username.';
      else if (cleanName.length < 2 || cleanName.length > 24) next.username = 'Username must be 2–24 characters.';
      else if (!/^[a-zA-Z0-9_.-]+$/.test(cleanName)) next.username = 'Use letters, numbers, dot, dash, or underscore only.';
    }
    if (password.length < 6) next.password = 'Password must be at least 6 characters.';
    setErrors(next);
    setMessage('');
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      if (mode === 'signup') {
        const { needsConfirmation } = await auth.signUp(email.trim(), password, username.trim());
        if (needsConfirmation) setMessage('Account created. Check your email and confirm your address, then sign in.');
      } else {
        await auth.signIn(email.trim(), password);
      }
    } catch (err) {
      setErrors({ form: friendlyAuthError(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="inline-flex rounded-lg bg-surface-container p-1" role="tablist" aria-label="Account action">
        {[
          ['signin', 'Sign in'],
          ['signup', 'Create account'],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mode === key}
            onClick={() => {
              setMode(key);
              setErrors({});
              setMessage('');
            }}
            className={`min-h-[40px] flex-1 rounded-md px-3 text-label-md focus-ring ${
              mode === key ? 'bg-white text-primary-container shadow-sm' : 'text-slate-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'signup' && (
        <div>
          <label htmlFor="acc-username" className="label">
            Username
          </label>
          <input
            id="acc-username"
            type="text"
            inputMode="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            aria-invalid={errors.username ? 'true' : undefined}
            aria-describedby={errors.username ? 'acc-username-err' : undefined}
            className={`input ${errors.username ? 'input-error' : ''}`}
            disabled={busy}
          />
          {errors.username && (
            <p id="acc-username-err" className="mt-1.5 text-body-sm text-urgent">
              {errors.username}
            </p>
          )}
        </div>
      )}

      <div>
        <label htmlFor="acc-email" className="label">
          Email
        </label>
        <input
          id="acc-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={errors.email ? 'true' : undefined}
          aria-describedby={errors.email ? 'acc-email-err' : undefined}
          className={`input ${errors.email ? 'input-error' : ''}`}
          disabled={busy}
          data-autofocus
        />
        {errors.email && (
          <p id="acc-email-err" className="mt-1.5 text-body-sm text-urgent">
            {errors.email}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="acc-password" className="label">
          Password
        </label>
        <input
          id="acc-password"
          type="password"
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={errors.password ? 'true' : undefined}
          aria-describedby={errors.password ? 'acc-pw-err' : undefined}
          className={`input ${errors.password ? 'input-error' : ''}`}
          disabled={busy}
        />
        {errors.password && (
          <p id="acc-pw-err" className="mt-1.5 text-body-sm text-urgent">
            {errors.password}
          </p>
        )}
      </div>

      {errors.form && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-body-md text-urgent">
          {errors.form}
        </p>
      )}
      {message && (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-body-md text-success">
          {message}
        </p>
      )}

      <button type="submit" disabled={busy} className="btn-primary">
        <Icon name={mode === 'signup' ? 'person' : 'lock'} size={18} />
        {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
      </button>
    </form>
  );
}

export default function AccountModal({ auth, store, onClose }) {
  const { user } = auth;
  const [migrating, setMigrating] = useState(false);
  const [migrateMsg, setMigrateMsg] = useState(null); // { kind, text }
  const [signOutStep, setSignOutStep] = useState('idle'); // idle | working | confirm
  const [leftover, setLeftover] = useState(0);
  const [signOutError, setSignOutError] = useState('');

  const migrate = async () => {
    if (migrating) return;
    setMigrating(true);
    setMigrateMsg(null);
    try {
      const { migrated, expected } = await store.migrateGuest();
      setMigrateMsg(
        migrated === expected
          ? { kind: 'ok', text: `${migrated} deadline${migrated === 1 ? '' : 's'} uploaded to your account.` }
          : { kind: 'err', text: `Only ${migrated} of ${expected} could be confirmed. Your remaining deadlines are still safe on this device — try again.` },
      );
    } catch (err) {
      setMigrateMsg({
        kind: 'err',
        text: `Upload failed: ${err?.message || 'unknown error'}. Your deadlines are still safe on this device.`,
      });
    } finally {
      setMigrating(false);
    }
  };

  const doSignOut = async (force = false) => {
    setSignOutError('');
    setSignOutStep('working');
    try {
      if (!force) {
        const remaining = await store.flushBeforeSignOut();
        if (remaining > 0) {
          setLeftover(remaining);
          setSignOutStep('confirm');
          return;
        }
      }
      await store.purgeCurrentOwner(); // never leave this account's cache on a shared device
      await auth.signOut();
      onClose();
    } catch (err) {
      setSignOutError(err?.message || 'Could not sign out. Try again.');
      setSignOutStep('idle');
    }
  };

  let body;
  if (!auth.configured) {
    body = (
      <div className="flex flex-col gap-3 text-body-md text-slate-600">
        <p className="rounded-lg bg-surface-container-low p-3">
          Cloud sync isn't set up in this copy of the app. Your deadlines are saved on this device only.
        </p>
        {/* <p>
          To enable accounts, add <code className="rounded bg-slate-100 px-1">VITE_SUPABASE_URL</code> and{' '}
          <code className="rounded bg-slate-100 px-1">VITE_SUPABASE_ANON_KEY</code> to your <code className="rounded bg-slate-100 px-1">.env</code>{' '}
          file and rebuild. See the README.
        </p> */}
      </div>
    );
  } else if (!auth.ready) {
    body = <p className="text-body-md text-slate-600">Checking your account…</p>;
  } else if (!user) {
    body = (
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3 rounded-xl bg-surface-container-low p-3">
          <Icon name="shield" className="mt-0.5 text-slate-500" />
          <p className="text-body-md text-slate-600">
            You’re using PrepTrack as a guest. Deadlines stay on this device. Sign in to back them up and open them on
            another device.
          </p>
        </div>
        <AuthForm auth={auth} />
        <button type="button" onClick={onClose} className="btn-ghost">
          Continue as guest
        </button>
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-container text-white">
            <Icon name="person" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-body-lg font-semibold text-slate-900">{user.email}</p>
            <p className="text-body-sm text-slate-500">Signed in</p>
          </div>
        </div>

        <div className="rounded-xl border border-line p-3">
          <div className="flex items-center justify-between gap-3">
            <SyncStatus status={store.status} />
            <button
              type="button"
              onClick={() => store.syncNow()}
              disabled={store.status === 'syncing'}
              className="btn-secondary !min-h-[40px] !px-3"
            >
              <Icon name="refresh" size={16} /> Sync now
            </button>
          </div>
          <p className="mt-2 text-body-sm text-slate-500">
            {store.pending > 0
              ? `${store.pending} change${store.pending === 1 ? '' : 's'} waiting to sync.`
              : 'All changes are in your account.'}
            {store.lastSyncedAt && ` Last synced ${store.lastSyncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`}
          </p>
          {store.syncError && (
            <p role="alert" className="mt-2 text-body-sm text-urgent">
              Last attempt failed: {store.syncError.message || 'network error'}. Your deadlines are safe on this device and
              will retry automatically.
            </p>
          )}
        </div>

        {store.guestCount > 0 && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
            <p className="text-body-md font-semibold text-slate-900">
              {store.guestCount} guest deadline{store.guestCount === 1 ? '' : 's'} on this device
            </p>
            <p className="mt-1 text-body-sm text-slate-600">
              Upload them to your account. Nothing is removed from this device until the upload is confirmed.
            </p>
            <button type="button" onClick={migrate} disabled={migrating} className="btn-primary mt-3">
              {migrating ? 'Uploading…' : 'Upload to my account'}
            </button>
          </div>
        )}
        {migrateMsg && (
          <p
            role={migrateMsg.kind === 'err' ? 'alert' : 'status'}
            className={`rounded-lg border p-3 text-body-md ${
              migrateMsg.kind === 'err' ? 'border-red-200 bg-red-50 text-urgent' : 'border-emerald-200 bg-emerald-50 text-success'
            }`}
          >
            {migrateMsg.text}
          </p>
        )}

        {signOutStep === 'confirm' ? (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3">
            <p className="text-body-md text-slate-900">
              {leftover} change{leftover === 1 ? '' : 's'} couldn’t be synced yet. Signing out now removes them from this
              device for good.
            </p>
            <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row">
              <button type="button" className="btn-secondary" onClick={() => setSignOutStep('idle')}>
                Stay signed in
              </button>
              <button type="button" className="btn-destructive" onClick={() => doSignOut(true)}>
                Sign out anyway
              </button>
            </div>
          </div>
        ) : (
          <>
            {signOutError && (
              <p role="alert" className="text-body-sm text-urgent">
                {signOutError}
              </p>
            )}
            <button type="button" onClick={() => doSignOut(false)} disabled={signOutStep === 'working'} className="btn-secondary">
              {signOutStep === 'working' ? 'Signing out…' : 'Sign out'}
            </button>
            <p className="text-body-sm text-slate-500">
              Signing out removes your account’s deadlines from this device. They stay safe in your account.
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <Dialog title="Account & sync" labelId="account-title" onClose={onClose}>
      {body}
    </Dialog>
  );
}
