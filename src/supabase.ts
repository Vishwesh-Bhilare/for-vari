import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';

function isValidSupabaseUrl(value: string) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.endsWith('.supabase.co');
  } catch {
    return false;
  }
}

function isPlaceholder(value: string) {
  return ['demo-key', 'anon-key', 'your-anon-key', 'your-project-url'].includes(value.toLowerCase())
    || value.includes('example.supabase.co');
}

const configError = !supabaseUrl || !supabaseAnonKey
  ? 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
  : !isValidSupabaseUrl(supabaseUrl)
    ? 'VITE_SUPABASE_URL must be a valid https://*.supabase.co URL.'
    : isPlaceholder(supabaseUrl) || isPlaceholder(supabaseAnonKey)
      ? 'Supabase environment variables are placeholders. Configure real project credentials.'
      : '';

export const isSupabaseConfigured = !configError;
export const getSupabaseConfigError = () => configError || null;

export const supabase = createClient(
  isSupabaseConfigured ? supabaseUrl : 'https://invalid-config.supabase.co',
  isSupabaseConfigured ? supabaseAnonKey : 'invalid-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce'
    },
    realtime: { params: { eventsPerSecond: 10 } }
  }
);
