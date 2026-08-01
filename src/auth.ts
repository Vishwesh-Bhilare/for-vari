import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabaseConfigError, isSupabaseConfigured, supabase } from './supabase';
import type { Profile, VolunteerApplication } from './types';

function toAuthMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function logAuthError(context: string, error: unknown) {
  console.error(`[auth] ${context}:`, error);
}

function assertSupabaseConfigured() {
  const configError = getSupabaseConfigError();
  if (configError) throw new Error(configError);
}

export async function ensureProfile(userId: string, displayName?: string) {
  assertSupabaseConfigured();

  const { data: existing } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (existing) {
    if (displayName?.trim() && existing.display_name !== displayName.trim()) {
      const { data: updated } = await supabase
        .from('profiles')
        .update({ display_name: displayName.trim() })
        .eq('id', userId)
        .select('*')
        .maybeSingle();
      if (updated) return updated as Profile;
    }
    return existing as Profile;
  }

  const profile = {
    id: userId,
    role: 'pilgrim',
    approved: false,
    ...(displayName?.trim() ? { display_name: displayName.trim() } : {})
  };
  const { data, error } = await supabase
    .from('profiles')
    .insert(profile)
    .select('*')
    .maybeSingle();
  if (error) {
    logAuthError('ensureProfile insert failed (attempting select fallback)', error);
    const { data: fallback } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (fallback) return fallback as Profile;
    return { id: userId, role: 'pilgrim', approved: false, display_name: displayName?.trim() } as Profile;
  }
  return data as Profile;
}

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError(getSupabaseConfigError() ?? 'Supabase is not configured.');
      setLoading(false);
      return;
    }

    let mounted = true;
    async function loadSession() {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (data.session) {
          const { error: userError } = await supabase.auth.getUser();
          if (userError) throw userError;
        }
        if (mounted) {
          setSession(data.session);
          setError('');
        }
      } catch (err) {
        logAuthError('loadSession failed', err);
        if (mounted) {
          setSession(null);
          setError(toAuthMessage(err, 'Unable to restore your session. Please sign in again.'));
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadSession();
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setError('');
      setLoading(false);
      if (event === 'SIGNED_IN' && nextSession?.user.id) {
        void ensureProfile(nextSession.user.id, nextSession.user.user_metadata?.display_name as string | undefined)
          .catch((err) => {
            logAuthError('profile sync after SIGNED_IN failed', err);
          });
      }
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return { session, userId: session?.user.id, loading, error };
}

export function useProfile(userId?: string) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isSupabaseConfigured || !userId) {
      setProfile(null);
      setError(isSupabaseConfigured ? '' : getSupabaseConfigError() ?? 'Supabase is not configured.');
      setLoading(false);
      return;
    }

    let mounted = true;
    const profileUserId = userId;
    async function loadProfile() {
      setLoading(true);
      try {
        const { data, error: profileError } = await supabase.from('profiles').select('*').eq('id', profileUserId).maybeSingle();
        if (profileError) throw profileError;
        if (!data) {
          const created = await ensureProfile(profileUserId);
          if (mounted) setProfile(created);
          return;
        }
        if (mounted) setProfile(data as Profile);
      } catch (err) {
        logAuthError('loadProfile failed', err);
        if (mounted) {
          setProfile(null);
          setError(toAuthMessage(err, 'Unable to load your profile.'));
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadProfile();
    const channelName = `profile-${userId}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase.channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` }, (payload) => {
        if (payload.eventType === 'DELETE') setProfile(null);
        else setProfile(payload.new as Profile);
      })
      .subscribe((status, err) => {
        if (err) {
          logAuthError('profile realtime subscription failed', err);
          setError(`Profile live updates failed: ${err.message}`);
        }
      });
    return () => {
      mounted = false;
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  return { profile, role: profile?.role ?? 'pilgrim', approved: Boolean(profile?.approved), loading, error };
}

export async function signIn(email: string, password: string) {
  assertSupabaseConfigured();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    logAuthError('signIn failed', error);
    throw error;
  }
  if (data.user) {
    try {
      await ensureProfile(data.user.id, data.user.user_metadata?.display_name as string | undefined);
    } catch (profileErr) {
      logAuthError('ensureProfile failed after signIn (handled gracefully)', profileErr);
    }
  }
  return data;
}

export async function signUp(email: string, password: string, displayName?: string) {
  assertSupabaseConfigured();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName?.trim() || null } }
  });
  if (error) {
    logAuthError('signUp failed', error);
    throw error;
  }
  if (data.user) {
    try {
      await ensureProfile(data.user.id, displayName);
    } catch (profileErr) {
      logAuthError('ensureProfile failed after signUp (handled gracefully)', profileErr);
    }
  }
  return data;
}

export async function sendPasswordReset(email: string) {
  assertSupabaseConfigured();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}${window.location.pathname}`
  });
  if (error) {
    logAuthError('sendPasswordReset failed', error);
    throw error;
  }
}

export async function updatePassword(password: string) {
  assertSupabaseConfigured();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    logAuthError('updatePassword failed', error);
    throw error;
  }
}

export async function signOut() {
  assertSupabaseConfigured();
  const { error } = await supabase.auth.signOut();
  if (error) {
    logAuthError('signOut failed', error);
    throw error;
  }
}

export const isPermanentSession = (session: Session | null) => Boolean(session?.user.email);

export function useVolunteerApplication(userId?: string) {
  const [application, setApplication] = useState<VolunteerApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isSupabaseConfigured || !userId) {
      setApplication(null);
      setError(isSupabaseConfigured ? '' : getSupabaseConfigError() ?? 'Supabase is not configured.');
      setLoading(false);
      return;
    }

    let mounted = true;

    async function loadApplication() {
      setLoading(true);
      try {
        const { data, error: appError } = await supabase
          .from('volunteer_applications')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (appError) throw appError;
        if (mounted) setApplication(data as VolunteerApplication | null);
      } catch (err) {
        logAuthError('loadVolunteerApplication failed', err);
        if (mounted) {
          setApplication(null);
          setError(toAuthMessage(err, 'Unable to load your volunteer application.'));
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadApplication();

    const channel = supabase
      .channel(`volunteer-application-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'volunteer_applications', filter: `user_id=eq.${userId}` },
        () => void loadApplication()
      )
      .subscribe((status, err) => {
        if (err) {
          logAuthError('volunteer application realtime subscription failed', err);
          setError(`Volunteer application live updates failed: ${err.message}`);
        }
      });

    return () => {
      mounted = false;
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  return { application, loading, error };
}
