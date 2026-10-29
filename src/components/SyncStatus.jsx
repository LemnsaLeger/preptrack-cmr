const MAP = {
  synced: { text: 'Up to date', dot: 'bg-success' },
  syncing: { text: 'Syncing…', dot: 'bg-primary-container animate-pulse' },
  pending: { text: 'Pending sync', dot: 'bg-upcoming' },
  'offline-pending': { text: 'Saved offline • Pending sync', dot: 'bg-upcoming' },
  offline: { text: 'Offline • Saved on device', dot: 'bg-slate-400' },
  error: { text: 'Sync failed • Will retry', dot: 'bg-urgent' },
  guest: { text: 'Saved on this device', dot: 'bg-slate-400' },
  'local-only': { text: 'Saved on this device', dot: 'bg-slate-400' },
  'storage-error': { text: 'Storage unavailable', dot: 'bg-urgent' },
};

export default function SyncStatus({ status, onClick, short = false }) {
  const s = MAP[status] ?? MAP.guest;
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      role={onClick ? undefined : 'status'}
      aria-live={onClick ? undefined : 'polite'}
      className={`inline-flex min-h-[32px] max-w-[11.5rem] items-center gap-1.5 rounded-full bg-surface-container-low px-2.5 py-1 text-label-sm text-on-surface-variant sm:max-w-none ${
        onClick ? 'hover:bg-surface-container focus-ring' : ''
      }`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${s.dot}`} aria-hidden="true" />
      <span className={`truncate ${short ? 'hidden sm:inline' : ''}`}>{s.text}</span>
    </Tag>
  );
}
