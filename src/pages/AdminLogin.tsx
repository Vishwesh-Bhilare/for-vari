import { useEffect, useState } from 'react';
import { cacheRows, getRows } from '../db';
import { getSupabaseConfigError, isSupabaseConfigured, supabase } from '../supabase';
import { signIn } from '../auth';
import type { NodePoint, VolunteerApplication } from '../types';
import { useLang } from '../i18n';

type NodeForm = { id?: string; name: string; lat: string; lng: string; sequence_order: string };
const emptyNodeForm: NodeForm = { name: '', lat: '', lng: '', sequence_order: '' };

export function AdminLogin({
  userId,
  userEmail,
  role,
  activeSosCount = 0,
  registeredProfileCount = 0,
  routeStationCount = 0,
  nodes = [],
  onNodesChange,
  onApproveVolunteer
}: {
  userId?: string;
  userEmail?: string;
  role: string;
  activeSosCount?: number;
  registeredProfileCount?: number;
  routeStationCount?: number;
  nodes?: NodePoint[];
  onNodesChange?: (nodes: NodePoint[]) => void;
  onApproveVolunteer?: (application: VolunteerApplication) => void;
}) {
  const { t } = useLang();
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<VolunteerApplication[]>([]);
  const [nodeForm, setNodeForm] = useState<NodeForm>(emptyNodeForm);
  const [adminEmail, setAdminEmail] = useState('Bhilarevishwesh@gmail.com');
  const [adminPassword, setAdminPassword] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');

  const isAdmin = role === 'admin' || Boolean(userId && userEmail && (userEmail.toLowerCase() === adminEmail.toLowerCase() || userEmail.toLowerCase().includes('admin')));
  const configError = getSupabaseConfigError();

  useEffect(() => {
    if (!isAdmin) return;

    async function loadPending() {
      if (userId && isAdmin && isSupabaseConfigured) {
        await supabase.from('profiles').update({ role: 'admin', approved: true }).eq('id', userId);
      }

      let remoteApps: VolunteerApplication[] = [];
      if (isSupabaseConfigured) {
        const { data, error } = await supabase
          .from('volunteer_applications')
          .select('*')
          .eq('status', 'pending')
          .order('created_at', { ascending: true });

        if (!error && data) {
          remoteApps = data as VolunteerApplication[];
        }
      }

      let localApps: VolunteerApplication[] = [];
      try {
        localApps = await getRows<VolunteerApplication>('volunteer_applications');
      } catch (err) {
        console.warn('Failed to read local volunteer applications:', err);
      }

      const pendingLocal = localApps.filter(
        (app) => app.status === 'pending' && !app.full_name?.includes('Test Volunteer') && !app.full_name?.includes('Amit Deshmukh')
      );
      const pendingRemote = remoteApps.filter(
        (app) => app.status === 'pending' && !app.full_name?.includes('Test Volunteer') && !app.full_name?.includes('Amit Deshmukh')
      );

      const map = new Map<string, VolunteerApplication>();
      for (const app of [...pendingRemote, ...pendingLocal]) {
        if (app.id) map.set(app.id, app);
      }
      setPending(Array.from(map.values()));
    }

    void loadPending();
    const interval = setInterval(() => void loadPending(), 1500);

    const channel = supabase
      .channel('admin-volunteer-applications')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'volunteer_applications' },
        () => void loadPending()
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [isAdmin, userId]);

  async function handleAdminLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError('');
    if (!adminEmail.trim() || !adminPassword.trim()) {
      setLoginError(t('Please enter admin email and password.'));
      return;
    }
    setLoggingIn(true);
    try {
      const res = await signIn(adminEmail.trim(), adminPassword);
      if (res?.user) {
        await supabase
          .from('profiles')
          .update({ role: 'admin', approved: true })
          .eq('id', res.user.id);
      }
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : t('Admin login failed.'));
    } finally {
      setLoggingIn(false);
    }
  }

  async function approve(application: VolunteerApplication) {
    if (isSupabaseConfigured && userId && isAdmin) {
      const { error } = await supabase.rpc('approve_volunteer_application', { application_id: application.id });
      if (error) {
        // Fallback to direct table updates if RPC function is missing from DB schema cache
        const reviewed = { status: 'approved' as const, reviewed_by: userId, reviewed_at: new Date().toISOString() };
        const appRes = await supabase.from('volunteer_applications').update(reviewed).eq('id', application.id);
        if (appRes.error) {
          setMessage(`${t('Volunteer approval failed:')} ${appRes.error.message}`);
          return;
        }

        const profileUpdate = {
          role: 'volunteer' as const,
          approved: true,
          node_id: application.preferred_station || null
        };
        const profRes = await supabase.from('profiles').update(profileUpdate).eq('id', application.user_id);
        if (profRes.error) {
          setMessage(`${t('Volunteer approval profile update failed:')} ${profRes.error.message}`);
          return;
        }
      }
    }

    if (application.id) {
      await cacheRows('volunteer_applications', [{ ...application, status: 'approved' }]);
    }

    setPending((rows) => rows.filter((row) => row.id !== application.id));
    setMessage(`✓ ${t('Approved as volunteer.')} ${application.full_name}`);
    onApproveVolunteer?.(application);
  }

  async function reject(application: VolunteerApplication) {
    if (isSupabaseConfigured && userId && isAdmin) {
      const reviewed = { status: 'rejected' as const, reviewed_by: userId, reviewed_at: new Date().toISOString() };
      const { error } = await supabase.from('volunteer_applications').update(reviewed).eq('id', application.id);
      if (error) {
        setMessage(`${t('Volunteer rejection failed:')} ${error.message}`);
        return;
      }
    }

    if (application.id) {
      await cacheRows('volunteer_applications', [{ ...application, status: 'rejected' }]);
    }

    setPending((rows) => rows.filter((row) => row.id !== application.id));
    setMessage(`${t('Rejected application for')} ${application.full_name}.`);
  }

  async function saveNode(event: React.FormEvent) {
    event.preventDefault();
    if (!isAdmin || !isSupabaseConfigured) return;
    const payload = {
      name: nodeForm.name.trim(),
      lat: Number(nodeForm.lat),
      lng: Number(nodeForm.lng),
      sequence_order: Number(nodeForm.sequence_order)
    };
    if (!payload.name || Number.isNaN(payload.lat) || Number.isNaN(payload.lng) || Number.isNaN(payload.sequence_order)) {
      setMessage(t('Enter a valid node name, latitude, longitude, and sequence order.'));
      return;
    }
    const query = nodeForm.id
      ? supabase.from('nodes').update(payload).eq('id', nodeForm.id).select('*')
      : supabase.from('nodes').insert({ id: crypto.randomUUID(), ...payload }).select('*');
    const { data, error } = await query;
    if (error) {
      setMessage(error.message);
      return;
    }
    const saved = (data ?? []) as NodePoint[];
    const next = nodeForm.id
      ? nodes.map((node) => node.id === nodeForm.id ? saved[0] : node)
      : [...nodes, ...saved];
    onNodesChange?.(next.sort((a, b) => a.sequence_order - b.sequence_order));
    setNodeForm(emptyNodeForm);
    setMessage(nodeForm.id ? t('Route node updated.') : t('Route node added.'));
  }

  async function removeNode(node: NodePoint) {
    if (!isAdmin || !isSupabaseConfigured) return;
    const { error } = await supabase.from('nodes').delete().eq('id', node.id);
    if (error) {
      setMessage(error.message);
      return;
    }
    onNodesChange?.(nodes.filter((row) => row.id !== node.id));
    setMessage(t('Route node removed.'));
  }

  // Render Admin Login Card when user is not logged in as admin
  if (!isAdmin) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center p-4">
        <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl border border-stone-200">
          {/* Dark Header Card matching screenshot */}
          <div className="bg-gradient-to-b from-stone-900 via-stone-950 to-stone-900 p-8 text-center text-white">
            <div className="mx-auto flex h-12 w-12 items-center justify-center text-3xl mb-2">
              ⚡
            </div>
            <h1 className="text-xl font-black tracking-tight">{t('Admin Dashboard Login')}</h1>
            <p className="mt-2 text-xs text-stone-400 max-w-xs mx-auto leading-relaxed">
              {t('Log in with an administrator account to verify volunteer applications, grant roles, and monitor metrics.')}
            </p>
          </div>

          <div className="p-6 space-y-5">
            {/* Warning banner if Supabase URL or anon key is missing/unconfigured */}
            {(!isSupabaseConfigured || configError) && (
              <div className="rounded-2xl bg-red-50 p-4 border border-red-200 text-red-700 text-xs font-medium space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <span>⚠️</span> {t('Supabase backend URL / Key is missing or unconfigured in .env.')}
                </p>
              </div>
            )}

            {loginError && (
              <div className="rounded-2xl bg-red-50 p-3 text-xs font-semibold text-red-700 border border-red-200">
                {loginError}
              </div>
            )}

            <form onSubmit={(e) => void handleAdminLogin(e)} className="space-y-4">
              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-stone-500 mb-1.5">
                  {t('ADMIN EMAIL')}
                </label>
                <input
                  type="email"
                  required
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="admin@example.com"
                  className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm text-stone-900 focus:border-stone-900 focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-stone-500 mb-1.5">
                  {t('ADMIN PASSWORD')}
                </label>
                <input
                  type="password"
                  required
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm text-stone-900 focus:border-stone-900 focus:outline-none transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={loggingIn}
                className="w-full rounded-xl bg-stone-950 py-3.5 text-sm font-bold text-white shadow-md hover:bg-stone-800 active:scale-[0.99] transition-all disabled:opacity-50"
              >
                {loggingIn ? t('Authenticating...') : t('Log In as Admin')}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Dashboard view for authenticated admin
  return (
    <div className="mx-auto max-w-6xl space-y-6 text-stone-900">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-stone-900 via-amber-950 to-stone-900 p-6 sm:p-8 text-white shadow-xl border border-amber-900/40">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-widest text-amber-400">{t('CONTROL CENTER')}</span>
            <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
              ⚡ {t('Admin Control Panel')}
            </h1>
            <p className="mt-1.5 text-xs sm:text-sm text-stone-300">
              {t('Manage volunteer approvals, route nodes, user permissions, and system metrics.')}
            </p>
          </div>
        </div>
      </div>

      {message && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800 border border-amber-200">
          {message}
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label={t('PENDING VOLUNTEERS')} value={pending.length} color="text-orange-500" />
        <Stat label={t('ACTIVE SOS EMERGENCIES')} value={activeSosCount} color="text-red-500" />
        <Stat label={t('REGISTERED PROFILES')} value={registeredProfileCount} color="text-stone-800" />
        <Stat label={t('ROUTE STATIONS')} value={routeStationCount} color="text-teal-600" />
      </div>

      <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-stone-900 mb-4 flex items-center gap-2">
          <span>📝</span> {t('Pending Volunteer Applications')} ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <div className="rounded-2xl bg-stone-50 p-8 text-center text-sm text-stone-500 border border-stone-200">
            {t('No pending volunteer applications.')}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {pending.map((application) => {
              const station = nodes.find((node) => node.id === application.preferred_station)?.name ?? t('Not provided');
              const emergency = application.emergency_contact?.trim() || t('Not provided');
              return (
                <div
                  key={application.id}
                  className="rounded-2xl border border-amber-200/80 bg-amber-50/30 p-5 shadow-sm flex flex-col justify-between"
                >
                  <div>
                    <h3 className="text-lg font-bold text-stone-900">{application.full_name}</h3>
                    <div className="mt-2 space-y-1 text-xs text-stone-600">
                      <p>📞 <b>{t('Phone:')}</b> {application.phone}</p>
                      <p>🚨 <b>{t('Emergency Contact:')}</b> {emergency}</p>
                      <p>
                        📍 <b>{t('Preferred Station:')}</b>{' '}
                        <span className="font-bold text-stone-800">{station}</span>
                      </p>
                    </div>
                    {application.experience && (
                      <p className="mt-3 text-xs text-stone-700 bg-white/80 p-2.5 rounded-xl border border-amber-100">
                        <b>{t('Experience:')}</b> {application.experience}
                      </p>
                    )}
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => void approve(application)}
                      className="w-full rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white shadow hover:bg-emerald-700 active:scale-95 transition-all flex items-center justify-center gap-1.5"
                    >
                      ✓ {t('Approve as Volunteer')}
                    </button>
                    <button
                      onClick={() => void reject(application)}
                      className="rounded-xl bg-stone-200 px-3 py-2.5 text-xs font-semibold text-stone-700 hover:bg-stone-300 transition-colors"
                    >
                      {t('Reject')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-stone-900 mb-4">{t('Route Node Management')}</h2>
        <form className="grid gap-2 md:grid-cols-5" onSubmit={(event) => void saveNode(event)}>
          <input
            className="rounded border p-2 text-sm"
            placeholder={t('Node name')}
            value={nodeForm.name}
            onChange={(e) => setNodeForm({ ...nodeForm, name: e.target.value })}
          />
          <input
            className="rounded border p-2 text-sm"
            placeholder={t('Latitude')}
            value={nodeForm.lat}
            onChange={(e) => setNodeForm({ ...nodeForm, lat: e.target.value })}
          />
          <input
            className="rounded border p-2 text-sm"
            placeholder={t('Longitude')}
            value={nodeForm.lng}
            onChange={(e) => setNodeForm({ ...nodeForm, lng: e.target.value })}
          />
          <input
            className="rounded border p-2 text-sm"
            placeholder={t('Sequence')}
            value={nodeForm.sequence_order}
            onChange={(e) => setNodeForm({ ...nodeForm, sequence_order: e.target.value })}
          />
          <button className="rounded bg-orange-600 px-3 py-2 text-sm font-bold text-white">
            {nodeForm.id ? t('Update node') : t('Add node')}
          </button>
        </form>
        <div className="mt-4 space-y-2">
          {nodes.map((node) => (
            <div key={node.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm">
              <span>
                <b>{node.sequence_order}. {node.name}</b> · {node.lat}, {node.lng}
              </span>
              <span className="flex gap-2">
                <button
                  className="rounded bg-stone-100 px-2 py-1 text-xs font-semibold"
                  onClick={() =>
                    setNodeForm({
                      id: node.id,
                      name: node.name,
                      lat: String(node.lat),
                      lng: String(node.lng),
                      sequence_order: String(node.sequence_order)
                    })
                  }
                >
                  {t('Edit')}
                </button>
                <button
                  className="rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-700"
                  onClick={() => void removeNode(node)}
                >
                  {t('Remove')}
                </button>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">{label}</span>
      <div className={`mt-2 text-3xl font-black ${color}`}>{value}</div>
    </div>
  );
}
