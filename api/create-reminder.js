import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!supabaseUrl || !supabaseServiceRole) {
    res.status(500).json({ error: 'Missing Supabase server config' });
    return;
  }

  const { userId, deadlineId, deadlineTitle, dueAt, reminderType = 'daily', scheduledFor } = req.body || {};

  if (!userId || !deadlineId || !deadlineTitle || !dueAt || !scheduledFor) {
    res.status(400).json({ error: 'Missing required reminder fields' });
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRole, {
    auth: { persistSession: false },
  });

  const { error } = await supabase.from('reminder_events').insert({
    user_id: userId,
    deadline_id: deadlineId,
    deadline_title: deadlineTitle,
    due_at: dueAt,
    reminder_type: reminderType,
    status: 'pending',
    scheduled_for: scheduledFor,
    payload: { created_via: 'app' },
  });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(200).json({ ok: true });
}
