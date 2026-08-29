import { useEffect, useState } from 'react';
import { cacheRows, deleteEmergencyContact, getEmergencyContacts, getRows, saveEmergencyContact } from '../db';
import { getSupabaseConfigError, isSupabaseConfigured, supabase } from '../supabase';
import { signIn } from '../auth';
import type { BroadcastMessage, EmergencyContact, NodePoint, VolunteerApplication } from '../types';

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
  onApproveVolunteer,
  onBroadcastCreated
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
  onBroadcastCreated?: (broadcast: BroadcastMessage) => void;
}) {
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<VolunteerApplication[]>([]);
  const [nodeForm, setNodeForm] = useState<NodeForm>(emptyNodeForm);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [broadcastText, setBroadcastText] = useState('');
  const [broadcastExpiresAt, setBroadcastExpiresAt] = useState('');
  const [broadcasting, setBroadcasting] = useState(false);

  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([]);
  const [contactTitle, setContactTitle] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactCategory, setContactCategory] = useState<'ambulance' | 'police' | 'control_room' | 'medical' | 'other'>('ambulance');
  const [contactIcon, setContactIcon] = useState('🚑');

  useEffect(() => {
    getEmergencyContacts().then(setEmergencyContacts);
  }, []);

  const handleAddEmergencyContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactTitle.trim() || !contactPhone.trim()) return;

    const newContact: EmergencyContact = {
      id: `contact-${Date.now()}`,
      title: contactTitle.trim(),
      phone: contactPhone.trim(),
      category: contactCategory,
      icon: contactIcon || '📞'
    };

    await saveEmergencyContact(newContact);
    setEmergencyContacts((prev) => [...prev, newContact]);
    setContactTitle('');
    setContactPhone('');
    setMessage('Emergency contact added successfully.');
  };

  const handleDeleteEmergencyContact = async (id: string) => {
    await deleteEmergencyContact(id);
    setEmergencyContacts((prev) => prev.filter((c) => c.id !== id));
    setMessage('Emergency contact removed.');
  };

  const isAdmin = role === 'admin';
  const configError = getSupabaseConfigError();

  useEffect(() => {
    if (!isAdmin) return;

    async function loadPending() {
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

      const pendingLocal = localApps.filter((app) => app.status === 'pending');
      const pendingRemote = remoteApps.filter((app) => app.status === 'pending');

      const map = new Map<string, VolunteerApplication>();
      for (const app of [...pendingRemote, ...pendingLocal]) {
        if (app.id) map.set(app.id, app);
      }
      setPending(Array.from(map.values()));
    }

    void loadPending();
    const interval = setInterval(() => void loadPending(), 1500);

    const channelName = `admin-volunteer-apps-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
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
      setLoginError('Please enter admin email and password.');
      return;
    }
    setLoggingIn(true);
    try {
      const res = await signIn(adminEmail.trim(), adminPassword);
      if (!res?.user) throw new Error('Unable to sign in.');
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Admin login failed.');
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
          setMessage(`Volunteer approval failed: ${appRes.error.message}`);
          return;
        }

        const profileUpdate = {
          role: 'volunteer' as const,
          approved: true,
          node_id: application.preferred_station || null
        };
        const profRes = await supabase.from('profiles').update(profileUpdate).eq('id', application.user_id);
        if (profRes.error) {
          setMessage(`Volunteer approval profile update failed: ${profRes.error.message}`);
          return;
        }
      }
    }

    if (application.id) {
      await cacheRows('volunteer_applications', [{ ...application, status: 'approved' }]);
    }

    setPending((rows) => rows.filter((row) => row.id !== application.id));
    setMessage(`✓ Approved ${application.full_name} as volunteer.`);
    onApproveVolunteer?.(application);
  }

  async function reject(application: VolunteerApplication) {
    if (isSupabaseConfigured && userId && isAdmin) {
      const reviewed = { status: 'rejected' as const, reviewed_by: userId, reviewed_at: new Date().toISOString() };
      const { error } = await supabase.from('volunteer_applications').update(reviewed).eq('id', application.id);
      if (error) {
        setMessage(`Volunteer rejection failed: ${error.message}`);
        return;
      }
    }

    if (application.id) {
      await cacheRows('volunteer_applications', [{ ...application, status: 'rejected' }]);
    }

    setPending((rows) => rows.filter((row) => row.id !== application.id));
    setMessage(`Rejected application for ${application.full_name}.`);
  }

  async function sendBroadcast(event: React.FormEvent) {
    event.preventDefault();
    if (!isAdmin || !userId || !isSupabaseConfigured) return;
    const text = broadcastText.trim();
    if (!text) {
      setMessage('Enter a broadcast message before publishing.');
      return;
    }
    setBroadcasting(true);
    const payload = {
      message: text,
      created_by: userId,
      expires_at: broadcastExpiresAt ? new Date(broadcastExpiresAt).toISOString() : null,
      active: true
    };
    const { data, error } = await supabase
      .from('broadcast_messages')
      .insert(payload)
      .select('*')
      .single();
    setBroadcasting(false);
    if (error) {
      setMessage(`Broadcast failed: ${error.message}`);
      return;
    }
    setBroadcastText('');
    setBroadcastExpiresAt('');
    setMessage('Broadcast published to all pilgrims.');
    if (data) onBroadcastCreated?.(data as BroadcastMessage);
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
      setMessage('Enter a valid node name, latitude, longitude, and sequence order.');
      return;
    }
    const safeId = nodeForm.id || (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
    const query = nodeForm.id
      ? supabase.from('nodes').update(payload).eq('id', nodeForm.id).select('*')
      : supabase.from('nodes').insert({ id: safeId, ...payload }).select('*');
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
    setMessage(nodeForm.id ? 'Route node updated.' : 'Route node added.');
  }

  async function removeNode(node: NodePoint) {
    if (!isAdmin || !isSupabaseConfigured) return;
    const { error } = await supabase.from('nodes').delete().eq('id', node.id);
    if (error) {
      setMessage(error.message);
      return;
    }
    onNodesChange?.(nodes.filter((row) => row.id !== node.id));
    setMessage('Route node removed.');
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
            <h1 className="text-xl font-black tracking-tight">Admin Dashboard Login</h1>
            <p className="mt-2 text-xs text-stone-400 max-w-xs mx-auto leading-relaxed">
              Log in with an administrator account to verify volunteer applications, grant roles, and monitor metrics.
            </p>
          </div>

          <div className="p-6 space-y-5">
            {/* Warning banner if Supabase URL or anon key is missing/unconfigured */}
            {(!isSupabaseConfigured || configError) && (
              <div className="rounded-2xl bg-red-50 p-4 border border-red-200 text-red-700 text-xs font-medium space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <span>⚠️</span> Supabase backend URL / Key is missing or unconfigured in .env.
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
                  ADMIN EMAIL
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
                  ADMIN PASSWORD
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
                {loggingIn ? 'Authenticating...' : 'Log In as Admin'}
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
            <span className="text-[11px] font-extrabold uppercase tracking-widest text-amber-400">CONTROL CENTER</span>
            <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
              ⚡ Admin Control Panel
            </h1>
            <p className="mt-1.5 text-xs sm:text-sm text-stone-300">
              Manage volunteer approvals, route nodes, user permissions, and system metrics.
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
        <Stat label="PENDING VOLUNTEERS" value={pending.length} color="text-orange-500" />
        <Stat label="ACTIVE SOS EMERGENCIES" value={activeSosCount} color="text-red-500" />
        <Stat label="REGISTERED PROFILES" value={registeredProfileCount} color="text-stone-800" />
        <Stat label="ROUTE STATIONS" value={routeStationCount} color="text-teal-600" />
      </div>


      <div className="rounded-3xl border border-amber-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-stone-900 mb-2 flex items-center gap-2">
          <span>📢</span> Broadcast Message
        </h2>
        <p className="mb-4 text-sm text-stone-500">Publish a short text alert that scrolls across the top of the app for signed-in and guest pilgrims.</p>
        <form className="grid gap-3 md:grid-cols-[1fr_220px_auto]" onSubmit={(event) => void sendBroadcast(event)}>
          <input
            className="rounded-xl border border-stone-300 p-3 text-sm"
            maxLength={220}
            placeholder="e.g. Heavy rain near Wakhri. Please follow volunteer instructions."
            value={broadcastText}
            onChange={(e) => setBroadcastText(e.target.value)}
          />
          <input
            className="rounded-xl border border-stone-300 p-3 text-sm"
            type="datetime-local"
            value={broadcastExpiresAt}
            onChange={(e) => setBroadcastExpiresAt(e.target.value)}
            aria-label="Optional broadcast expiry"
          />
          <button disabled={broadcasting || !broadcastText.trim()} className="rounded-xl bg-amber-600 px-4 py-3 text-sm font-bold text-white shadow disabled:opacity-50">
            {broadcasting ? 'Publishing…' : 'Broadcast'}
          </button>
        </form>
      </div>

      <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-stone-900 mb-4 flex items-center gap-2">
          <span>📝</span> Pending Volunteer Applications ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <div className="rounded-2xl bg-stone-50 p-8 text-center text-sm text-stone-500 border border-stone-200">
            No pending volunteer applications.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {pending.map((application) => {
              const station = nodes.find((node) => node.id === application.preferred_station)?.name ?? 'Not provided';
              const emergency = application.emergency_contact?.trim() || 'Not provided';
              return (
                <div
                  key={application.id}
                  className="rounded-2xl border border-amber-200/80 bg-amber-50/30 p-5 shadow-sm flex flex-col justify-between"
                >
                  <div>
                    <h3 className="text-lg font-bold text-stone-900">{application.full_name}</h3>
                    <div className="mt-2 space-y-1 text-xs text-stone-600">
                      <p>📞 <b>Phone:</b> {application.phone}</p>
                      <p>🚨 <b>Emergency Contact:</b> {emergency}</p>
                      <p>
                        📍 <b>Preferred Station:</b>{' '}
                        <span className="font-bold text-stone-800">{station}</span>
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
                      ✓ Approve as Volunteer
                    </button>
                    <button
                      onClick={() => void reject(application)}
                      className="rounded-xl bg-stone-200 px-3 py-2.5 text-xs font-semibold text-stone-700 hover:bg-stone-300 transition-colors"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-stone-900 mb-4">Route Node Management</h2>
        <form className="grid gap-2 md:grid-cols-5" onSubmit={(event) => void saveNode(event)}>
          <input
            className="rounded border p-2 text-sm"
            placeholder="Node name"
            value={nodeForm.name}
            onChange={(e) => setNodeForm({ ...nodeForm, name: e.target.value })}
          />
          <input
            className="rounded border p-2 text-sm"
            placeholder="Latitude"
            value={nodeForm.lat}
            onChange={(e) => setNodeForm({ ...nodeForm, lat: e.target.value })}
          />
          <input
            className="rounded border p-2 text-sm"
            placeholder="Longitude"
            value={nodeForm.lng}
            onChange={(e) => setNodeForm({ ...nodeForm, lng: e.target.value })}
          />
          <input
            className="rounded border p-2 text-sm"
            placeholder="Sequence"
            value={nodeForm.sequence_order}
            onChange={(e) => setNodeForm({ ...nodeForm, sequence_order: e.target.value })}
          />
          <button className="rounded bg-orange-600 px-3 py-2 text-sm font-bold text-white">
            {nodeForm.id ? 'Update node' : 'Add node'}
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
                  Edit
                </button>
                <button
                  className="rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-700"
                  onClick={() => void removeNode(node)}
                >
                  Remove
                </button>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Emergency Helplines Manager */}
      <div className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
        <h3 className="font-bold text-stone-900 flex items-center gap-2">
          <span>📞</span> Emergency Contact Helplines Manager
        </h3>
        <form onSubmit={(e) => void handleAddEmergencyContact(e)} className="grid grid-cols-1 sm:grid-cols-5 gap-2">
          <input
            placeholder="Title (e.g. Ambulance)"
            className="rounded border p-2 text-xs font-semibold"
            value={contactTitle}
            onChange={(e) => setContactTitle(e.target.value)}
            required
          />
          <input
            placeholder="Phone Number (e.g. 108)"
            className="rounded border p-2 text-xs font-semibold"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            required
          />
          <select
            className="rounded border p-2 text-xs font-semibold"
            value={contactCategory}
            onChange={(e) => setContactCategory(e.target.value as any)}
          >
            <option value="ambulance">🚑 Ambulance</option>
            <option value="police">👮 Police</option>
            <option value="control_room">🛡️ Control Room</option>
            <option value="medical">🏥 Medical Booth</option>
            <option value="other">📞 Other Helpline</option>
          </select>
          <input
            placeholder="Icon (e.g. 🚑)"
            className="rounded border p-2 text-xs font-semibold"
            value={contactIcon}
            onChange={(e) => setContactIcon(e.target.value)}
          />
          <button className="rounded bg-orange-600 hover:bg-orange-700 px-3 py-2 text-xs font-bold text-white shadow">
            + Add Helpline
          </button>
        </form>

        <div className="space-y-2 pt-1">
          {emergencyContacts.map((contact) => (
            <div key={contact.id} className="flex items-center justify-between p-3 rounded-xl border bg-stone-50 text-xs">
              <span className="font-bold flex items-center gap-2">
                <span>{contact.icon || '📞'}</span>
                <span>{contact.title} ({contact.phone})</span>
                <span className="uppercase text-[10px] bg-stone-200 px-2 py-0.5 rounded font-black text-stone-700">{contact.category}</span>
              </span>
              <button
                type="button"
                onClick={() => void handleDeleteEmergencyContact(contact.id)}
                className="px-2.5 py-1 rounded bg-red-100 text-red-700 font-bold hover:bg-red-200 transition"
              >
                Delete
              </button>
            </div>
          ))}
          {emergencyContacts.length === 0 && (
            <p className="text-xs text-stone-400 italic">No emergency helpline numbers added yet. Add numbers above to display on mobile devices.</p>
          )}
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
