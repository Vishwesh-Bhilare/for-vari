import { useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../supabase';
import type { NodePoint, Profile, VolunteerApplication } from '../types';

type NodeForm = { id?: string; name: string; lat: string; lng: string; sequence_order: string };
const emptyNodeForm: NodeForm = { name: '', lat: '', lng: '', sequence_order: '' };

export function AdminLogin({
  userId,
  role,
  activeSosCount = 0,
  registeredProfileCount = 0,
  routeStationCount = 0,
  nodes = [],
  onNodesChange,
  onApproveVolunteer
}: {
  userId?: string;
  role: string;
  activeSosCount?: number;
  registeredProfileCount?: number;
  routeStationCount?: number;
  nodes?: NodePoint[];
  onNodesChange?: (nodes: NodePoint[]) => void;
  onApproveVolunteer?: (application: VolunteerApplication) => void;
}) {
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<VolunteerApplication[]>([]);
  const [nodeForm, setNodeForm] = useState<NodeForm>(emptyNodeForm);
  const isAdmin = role === 'admin';

  useEffect(() => {
    if (!isSupabaseConfigured || !isAdmin) return;

    async function loadPending() {
      const { data, error } = await supabase
        .from('volunteer_applications')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

      if (error) {
        setMessage(error.message);
        setPending([]);
        return;
      }
      setPending((data ?? []) as VolunteerApplication[]);
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
  }, [isAdmin]);

  async function approve(application: VolunteerApplication) {
    if (isSupabaseConfigured && userId && isAdmin) {
      const reviewed = { status: 'approved' as const, reviewed_by: userId, reviewed_at: new Date().toISOString() };
      const { error } = await supabase.from('volunteer_applications').update(reviewed).eq('id', application.id);
      if (!error) await supabase.from('profiles').update({ role: 'volunteer' satisfies Profile['role'], approved: true }).eq('id', application.user_id);
    }
    setPending((rows) => rows.filter((row) => row.id !== application.id));
    onApproveVolunteer?.(application);
  }

  async function reject(application: VolunteerApplication) {
    if (isSupabaseConfigured && userId && isAdmin) {
      const reviewed = { status: 'rejected' as const, reviewed_by: userId, reviewed_at: new Date().toISOString() };
      await supabase.from('volunteer_applications').update(reviewed).eq('id', application.id);
    }
    setPending((rows) => rows.filter((row) => row.id !== application.id));
  }

  async function saveNode(event: React.FormEvent) {
    event.preventDefault();
    if (!isSupabaseConfigured || !isAdmin) return;
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
    setMessage(nodeForm.id ? 'Route node updated.' : 'Route node added.');
  }

  async function removeNode(node: NodePoint) {
    if (!isSupabaseConfigured || !isAdmin) return;
    const { error } = await supabase.from('nodes').delete().eq('id', node.id);
    if (error) {
      setMessage(error.message);
      return;
    }
    onNodesChange?.(nodes.filter((row) => row.id !== node.id));
    setMessage('Route node removed.');
  }

  if (!isAdmin) {
    return (
      <section className="mx-auto max-w-md my-8 rounded-3xl bg-white p-8 shadow-xl border border-stone-200 text-stone-900">
        <div className="text-center mb-6">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500 text-2xl font-bold text-white shadow-md mb-3">🔒</div>
          <h1 className="text-2xl font-extrabold tracking-tight">Administrator Access Required</h1>
          <p className="text-sm text-stone-600 mt-2">You are signed in but do not have administrator privileges.</p>
          <p className="text-xs text-stone-500 mt-1">Only accounts with role = 'admin' may access this dashboard.</p>
        </div>
      </section>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 text-stone-900">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-stone-900 via-amber-950 to-stone-900 p-6 sm:p-8 text-white shadow-xl border border-amber-900/40">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><span className="text-[11px] font-extrabold uppercase tracking-widest text-amber-400">CONTROL CENTER</span><h1 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">⚡ Admin Control Panel</h1><p className="mt-1.5 text-xs sm:text-sm text-stone-300">Manage volunteer approvals, route nodes, user permissions, and system metrics.</p></div>
        </div>
      </div>
      {message && <p className="rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800 border border-amber-200">{message}</p>}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="PENDING VOLUNTEERS" value={pending.length} color="text-orange-500" />
        <Stat label="ACTIVE SOS EMERGENCIES" value={activeSosCount} color="text-red-500" />
        <Stat label="REGISTERED PROFILES" value={registeredProfileCount} color="text-stone-800" />
        <Stat label="ROUTE STATIONS" value={routeStationCount} color="text-teal-600" />
      </div>
      <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-stone-900 mb-4 flex items-center gap-2"><span>📝</span> Pending Volunteer Applications ({pending.length})</h2>
        {pending.length === 0 ? <div className="rounded-2xl bg-stone-50 p-8 text-center text-sm text-stone-500 border border-stone-200">No pending applications.</div> : (
          <div className="grid gap-4 sm:grid-cols-2">{pending.map((application) => {
            const station = nodes.find((node) => node.id === application.preferred_station)?.name ?? 'Not provided';
            const emergency = application.emergency_contact?.trim() || 'Not provided';
            return <div key={application.id} className="rounded-2xl border border-amber-200/80 bg-amber-50/30 p-5 shadow-sm flex flex-col justify-between"><div><h3 className="text-lg font-bold text-stone-900">{application.full_name}</h3><div className="mt-2 space-y-1 text-xs text-stone-600"><p>📞 <b>Phone:</b> {application.phone}</p><p>🚨 <b>Emergency Contact:</b> {emergency}</p><p>📍 <b>Preferred Station:</b> <span className="font-bold text-stone-800">{station}</span></p></div>{application.experience && <p className="mt-3 text-xs text-stone-700 bg-white/80 p-2.5 rounded-xl border border-amber-100"><b>Experience:</b> {application.experience}</p>}</div><div className="mt-4 flex gap-2"><button onClick={() => void approve(application)} className="w-full rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white shadow hover:bg-emerald-700 active:scale-95 transition-all flex items-center justify-center gap-1.5">✓ Approve as Volunteer</button><button onClick={() => void reject(application)} className="rounded-xl bg-stone-200 px-3 py-2.5 text-xs font-semibold text-stone-700 hover:bg-stone-300 transition-colors">Reject</button></div></div>;
          })}</div>
        )}
      </div>
      <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-stone-900 mb-4">Route Node Management</h2>
        <form className="grid gap-2 md:grid-cols-5" onSubmit={(event) => void saveNode(event)}>
          <input className="rounded border p-2 text-sm" placeholder="Node name" value={nodeForm.name} onChange={(e) => setNodeForm({ ...nodeForm, name: e.target.value })} />
          <input className="rounded border p-2 text-sm" placeholder="Latitude" value={nodeForm.lat} onChange={(e) => setNodeForm({ ...nodeForm, lat: e.target.value })} />
          <input className="rounded border p-2 text-sm" placeholder="Longitude" value={nodeForm.lng} onChange={(e) => setNodeForm({ ...nodeForm, lng: e.target.value })} />
          <input className="rounded border p-2 text-sm" placeholder="Sequence" value={nodeForm.sequence_order} onChange={(e) => setNodeForm({ ...nodeForm, sequence_order: e.target.value })} />
          <button className="rounded bg-orange-600 px-3 py-2 text-sm font-bold text-white">{nodeForm.id ? 'Update node' : 'Add node'}</button>
        </form>
        <div className="mt-4 space-y-2">{nodes.map((node) => <div key={node.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm"><span><b>{node.sequence_order}. {node.name}</b> · {node.lat}, {node.lng}</span><span className="flex gap-2"><button className="rounded bg-stone-100 px-2 py-1 text-xs font-semibold" onClick={() => setNodeForm({ id: node.id, name: node.name, lat: String(node.lat), lng: String(node.lng), sequence_order: String(node.sequence_order) })}>Edit</button><button className="rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-700" onClick={() => void removeNode(node)}>Remove</button></span></div>)}</div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"><span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">{label}</span><div className={`mt-2 text-3xl font-black ${color}`}>{value}</div></div>;
}
