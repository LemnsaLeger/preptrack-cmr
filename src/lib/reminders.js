export async function enqueueDeadlineReminder(supabase, userId, deadline) {
  if (!supabase || !userId || !deadline?.id || !deadline?.due_at) return [];

  const due = new Date(deadline.due_at);
  const now = new Date();
  const createdAt = new Date(now.getTime() + 5 * 60 * 1000);
  const dueSoon = new Date(due.getTime() - 24 * 60 * 60 * 1000);

  const rows = [
    {
      user_id: userId,
      deadline_id: deadline.id,
      deadline_title: deadline.title,
      due_at: due.toISOString(),
      reminder_type: 'created',
      status: 'pending',
      scheduled_for: createdAt.toISOString(),
      payload: { kind: 'created' },
    },
  ];

  const dueReminderAt = dueSoon > now ? dueSoon : new Date(now.getTime() + 10 * 60 * 1000);
  rows.push({
    user_id: userId,
    deadline_id: deadline.id,
    deadline_title: deadline.title,
    due_at: due.toISOString(),
    reminder_type: 'deadline',
    status: 'pending',
    scheduled_for: dueReminderAt.toISOString(),
    payload: { kind: 'deadline' },
  });

  const { error } = await supabase.from('reminder_events').insert(rows);
  if (error) throw error;
  return rows;
}

export async function enqueueStudyScheduleReminders(supabase, userId, deadline, schedule) {
  if (!supabase || !userId || !deadline?.id || !schedule?.days) return [];

  const start = new Date(`${schedule.start_date}T00:00:00`);
  const rows = [];

  for (let day = 0; day < Number(schedule.days); day += 1) {
    const at = new Date(start);
    at.setDate(start.getDate() + day);
    at.setHours(9, 0, 0, 0);

    rows.push({
      user_id: userId,
      deadline_id: deadline.id,
      deadline_title: deadline.title,
      due_at: deadline.due_at,
      reminder_type: 'daily',
      status: 'pending',
      scheduled_for: at.toISOString(),
      payload: {
        kind: 'daily',
        minutes_per_day: Number(schedule.minutes_per_day),
        day_index: day + 1,
      },
    });
  }

  if (!rows.length) return [];
  const { error } = await supabase.from('reminder_events').insert(rows);
  if (error) throw error;
  return rows;
}
