import { useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../supabase';
import type { Profile, VolunteerApplication } from '../types';

type LoginForm = { email: string; password: string };

const seedPendingApplications: VolunteerApplication[] = [
  {
    id: 'demo-app-1',
    user_id: 'demo-user-1',
    full_name: 'Rahul Sharma',
    phone: '+91 98765 43210',
    emergency_contact: '+91 91234 56789',
    preferred_station: 'Mukkam - Wakhri',
    age: 28,
    city: 'Pune',
    experience: 'Prior Medical Seva at Dive Ghat',
    why_volunteer: 'To help senior pilgrims during Ringan',
    status: 'pending',
    created_at: new Date().toISOString()
  },
  {
    id: 'demo-app-2',
    user_id: 'demo-user-2',
    full_name: 'Priya Kulkarni',
    phone: '+91 99887 76655',
    emergency_contact: '+91 98877 66554',
    preferred_station: 'Saswad',
    age: 24,
    city: 'Saswad',
    experience: 'First aid certified volunteer',
    why_volunteer: 'Dedicated to Wari community service',
    status: 'pending',
    created_at: new Date().toISOString()
  }
];

export function AdminLogin({
  userId,
  role,
  activeSosCount = 0,
  registeredProfileCount = 4,
  routeStationCount = 6,
  onApproveVolunteer
}: {
  userId?: string;
  role: string;
  activeSosCount?: number;
  registeredProfileCount?: number;
  routeStationCount?: number;
  onApproveVolunteer?: (application: VolunteerApplication) => void;
}) {
  const [form, setForm] = useState<LoginForm>({ email: '', password: '' });
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<VolunteerApplication[]>(seedPendingApplications);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    async function loadPending() {
      try {
        const { data, error } = await supabase
          .from('volunteer_applications')
          .select('*')
          .eq('status', 'pending')
          .order('created_at', { ascending: true });

        if (!error && data && data.length > 0) {
          setPending(data as VolunteerApplication[]);
        }
      } catch (e) {
        // Keep seed applications for demo
      }
    }

    void loadPending();
    const channel = supabase
      .channel('admin-volunteer-applications')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'volunteer_applications', filter: 'status=eq.pending' },
        () => void loadPending()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [role]);

  async function login(event: React.FormEvent) {
    event.preventDefault();
    if (!isSupabaseConfigured) {
      setMessage('Supabase unconfigured. Switched to Demo Admin Mode.');
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
    setMessage(error?.message ?? 'Signed in as Admin.');
  }

  async function approve(application: VolunteerApplication) {
    if (isSupabaseConfigured && userId) {
      const reviewed = { status: 'approved' as const, reviewed_by: userId, reviewed_at: new Date().toISOString() };
      const { error } = await supabase.from('volunteer_applications').update(reviewed).eq('id', application.id);
      if (!error) {
        await supabase.from('profiles').update({ role: 'volunteer' satisfies Profile['role'], approved: true }).eq('id', application.user_id);
      }
    }

    setPending((rows) => rows.filter((row) => row.id !== application.id));
    if (onApproveVolunteer) onApproveVolunteer(application);
  }

  async function reject(application: VolunteerApplication) {
    if (isSupabaseConfigured && userId) {
      const reviewed = { status: 'rejected' as const, reviewed_by: userId, reviewed_at: new Date().toISOString() };
      await supabase.from('volunteer_applications').update(reviewed).eq('id', application.id);
    }
    setPending((rows) => rows.filter((row) => row.id !== application.id));
  }

  // Admin Control Panel UI matching screenshot
  return (
    <div className="mx-auto max-w-6xl space-y-6 text-stone-900">
      {/* Control Center Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-stone-900 via-amber-950 to-stone-900 p-6 sm:p-8 text-white shadow-xl border border-amber-900/40">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-widest text-amber-400">
              CONTROL CENTER
            </span>
            <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
              ⚡ Admin Control Panel
            </h1>
            <p className="mt-1.5 text-xs sm:text-sm text-stone-300">
              Manage volunteer approvals, user permissions, and monitor system metrics.
            </p>
          </div>

          <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-300 border border-amber-500/30">
            🛠️ Demo Mode Active
          </span>
        </div>
      </div>

      {/* Metric Stat Cards Grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {/* Pending Volunteers */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
            PENDING VOLUNTEERS
          </span>
          <div className="mt-2 text-3xl font-black text-orange-500">{pending.length}</div>
        </div>

        {/* Active SOS Emergencies */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
            ACTIVE SOS EMERGENCIES
          </span>
          <div className="mt-2 text-3xl font-black text-red-500">{activeSosCount}</div>
        </div>

        {/* Registered Profiles */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
            REGISTERED PROFILES
          </span>
          <div className="mt-2 text-3xl font-black text-stone-800">{registeredProfileCount}</div>
        </div>

        {/* Route Stations */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
            ROUTE STATIONS
          </span>
          <div className="mt-2 text-3xl font-black text-teal-600">{routeStationCount}</div>
        </div>
      </div>

      {/* Pending Volunteer Applications Section */}
      <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-stone-900 mb-4 flex items-center gap-2">
          <span>📝</span> Pending Volunteer Applications ({pending.length})
        </h2>

        {pending.length === 0 ? (
          <div className="rounded-2xl bg-stone-50 p-8 text-center text-sm text-stone-500 border border-stone-200">
            No pending volunteer applications right now. All requests reviewed!
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {pending.map((application) => (
              <div
                key={application.id}
                className="rounded-2xl border border-amber-200/80 bg-amber-50/30 p-5 shadow-sm flex flex-col justify-between"
              >
                <div>
                  <h3 className="text-lg font-bold text-stone-900">{application.full_name}</h3>

                  <div className="mt-2 space-y-1 text-xs text-stone-600">
                    <p className="flex items-center gap-1">
                      <span>📞</span> <b>Phone:</b> {application.phone}
                    </p>
                    <p className="flex items-center gap-1">
                      <span>🚨</span> <b>Emergency Contact:</b> {application.emergency_contact || '+91 91234 56789'}
                    </p>
                    <p className="flex items-center gap-1">
                      <span>📍</span> <b>Preferred Station:</b>{' '}
                      <span className="font-bold text-stone-800">
                        {application.preferred_station || 'Mukkam - Wakhri'}
                      </span>
                    </p>
                  </div>

                  {application.experience && (
                    <p className="mt-3 text-xs text-stone-700 bg-white/80 p-2.5 rounded-xl border border-amber-100">
                      <b>Experience:</b> {application.experience}
                    </p>
                  )}
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => void approve(application)}
                    className="w-full rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white shadow hover:bg-emerald-700 active:scale-95 transition-all flex items-center justify-center gap-1.5"
                  >
                    <span>✓</span> Approve as Volunteer
                  </button>
                  <button
                    onClick={() => void reject(application)}
                    className="rounded-xl bg-stone-200 px-3 py-2.5 text-xs font-semibold text-stone-700 hover:bg-stone-300 transition-colors"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Optional Login Form if not logged in */}
      {role !== 'admin' && (
        <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm text-xs text-stone-600">
          <p className="font-semibold text-stone-800 mb-2">Admin Credentials Sign In (Optional)</p>
          <form className="flex flex-wrap gap-2" onSubmit={(event) => void login(event)}>
            <input
              className="rounded-lg border p-2 text-xs flex-1 min-w-[180px]"
              type="email"
              placeholder="Admin email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <input
              className="rounded-lg border p-2 text-xs flex-1 min-w-[180px]"
              type="password"
              placeholder="Password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            <button className="rounded-lg bg-stone-800 px-4 py-2 text-white font-semibold">
              Sign In
            </button>
          </form>
          {message && <p className="mt-2 text-emerald-700">{message}</p>}
        </div>
      )}
    </div>
  );
}

