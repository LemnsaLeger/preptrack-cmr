import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const resendApiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!supabaseUrl || !supabaseServiceRole || !resendApiKey) {
    res.status(500).json({ error: 'Missing server env vars' });
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRole, {
    auth: { persistSession: false },
  });

  const now = new Date();
  const cutoff = new Date(now.getTime() + 10 * 60 * 1000);

  const { data: rows, error } = await supabase
    .from('reminder_events')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_for', cutoff.toISOString())
    .order('scheduled_for', { ascending: true });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  let sent = 0;
  const failures = [];

  for (const row of rows || []) {
    try {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('username,email,reminder_opt_in')
        .eq('id', row.user_id)
        .single();

      if (profileError || !profile || !profile.reminder_opt_in) {
        await supabase
          .from('reminder_events')
          .update({ status: 'skipped', updated_at: new Date().toISOString() })
          .eq('id', row.id);
        continue;
      }

      const subject = row.reminder_type === 'deadline'
        ? `PrepTrack deadline reminder: ${row.deadline_title}`
        : `PrepTrack daily study reminder: ${row.deadline_title}`;

      const text = row.reminder_type === 'deadline'
        ? `Hi ${profile.username},\n\nThis is a reminder that "${row.deadline_title}" is due on ${new Date(row.due_at).toLocaleString()}.\n\nStay on track — you’ve got this.\n\nPrepTrack`
        : `Hi ${profile.username},\n\nToday’s reminder for "${row.deadline_title}": keep your study plan moving.\n\nPrepTrack`;

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [profile.email],
          subject,
          text,
        }),
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || 'Resend error');
      }

      await supabase
        .from('reminder_events')
        .update({ status: 'sent', updated_at: new Date().toISOString() })
        .eq('id', row.id);

      sent += 1;
    } catch (err) {
      failures.push({ id: row.id, error: String(err?.message || err) });
      await supabase
        .from('reminder_events')
        .update({ status: 'failed', updated_at: new Date().toISOString(), payload: { error: String(err?.message || err) } })
        .eq('id', row.id);
    }
  }

  res.status(200).json({ sent, failures, count: rows?.length || 0 });
}
