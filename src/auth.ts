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
    async function getSession() {
      const { data } = await supabase.auth.getSession();
      if (mounted) {
        setSession(data.session);
        setLoading(false);
      }
    }

    void getSession();
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

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

export async function signUp(email: string, password: string, displayName?: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });
  if (error) throw error;
  
  if (data.user) {
    // Check if profile already exists
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', data.user.id)
      .maybeSingle();
    
    if (!existingProfile) {
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: data.user.id,
          display_name: displayName ?? null,
        });
      if (profileError) throw profileError;
    }
  }
  
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
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

      const { data } = await supabase
        .from('volunteer_applications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (mounted) {
        setApplication(data as VolunteerApplication | null);
        setLoading(false);
      }
    }

    void loadApplication();

    const channel = supabase
      .channel(`volunteer-application-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'volunteer_applications',
          filter: `user_id=eq.${userId}`,
        },
        () => void loadApplication()
      )
      .subscribe();

    return () => {
      mounted = false;
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  return { application, loading };
}
