import { useCallback, useEffect, useState } from 'react';
import { supabase, isCloudConfigured } from '../lib/supabase.js';

export default function useAuth() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!isCloudConfigured);

  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setUser(data.session?.user ?? null);
        setReady(true);
      })
      .catch(() => active && setReady(true));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signUp = useCallback(async (email, password, username) => {
    const cleanUser = (username ?? '').trim();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: cleanUser || undefined,
        },
      },
    });
    if (error) throw error;
    // With email confirmation enabled, there is no session yet.
    return { needsConfirmation: !data.session };
  }, []);

  const signIn = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  return { user, ready, signUp, signIn, signOut, configured: isCloudConfigured };
}
