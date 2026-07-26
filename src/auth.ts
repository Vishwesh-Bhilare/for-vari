import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from './supabase';
import type { Profile, VolunteerApplication } from './types';

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    let mounted = true;
    async function ensureSession() {
      const { data } = await supabase.auth.getSession();
      let activeSession = data.session;
      if (!activeSession) {
        const { data: anonData } = await supabase.auth.signInAnonymously();
        activeSession = anonData.session;
      }
      if (mounted) {
        setSession(activeSession);
        setLoading(false);
      }
    }

    void ensureSession();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return { session, userId: session?.user.id, loading };
}

export function useProfile(userId?: string) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured || !userId) {
      setProfile(null);
      setLoading(false);
      return;
    }

    let mounted = true;
    async function loadProfile() {
      setLoading(true);
      const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
      if (mounted) {
        setProfile(data as Profile | null);
        setLoading(false);
      }
    }

    void loadProfile();
    const channel = supabase.channel(`profile-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` }, (payload) => setProfile(payload.new as Profile))
      .subscribe();
    return () => {
      mounted = false;
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  return { profile, role: profile?.role ?? 'pilgrim', approved: Boolean(profile?.approved), loading };
}

export const isPermanentSession = (session: Session | null) => Boolean(session?.user.email);


export function useVolunteerApplication(userId?: string) {
  const [application, setApplication] = useState<VolunteerApplication | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured || !userId) {
      setApplication(null);
      setLoading(false);
      return;
    }

    let mounted = true;
    async function loadApplication() {
      setLoading(true);
      const { data } = await supabase.from('volunteer_applications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (mounted) {
        setApplication(data as VolunteerApplication | null);
        setLoading(false);
      }
    }

    void loadApplication();
    const channel = supabase.channel(`volunteer-application-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'volunteer_applications', filter: `user_id=eq.${userId}` }, () => void loadApplication())
      .subscribe();
    return () => {
      mounted = false;
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  return { application, loading };
}
