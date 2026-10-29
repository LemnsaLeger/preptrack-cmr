import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** True only when real (non-placeholder) credentials were provided at build time. */
export const isCloudConfigured = Boolean(
  url && key && !url.includes('YOUR-PROJECT-REF') && !key.startsWith('YOUR-'),
);

// Browser client: publishable/anon key only. Row Level Security protects the data.
export const supabase = isCloudConfigured
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;
