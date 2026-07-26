import { useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../supabase';
import type { Profile, VolunteerApplication } from '../types';

type LoginForm = { email: string; password: string };

export function AdminLogin({ userId, role }: { userId?: string; role: string }) {
  const [form, setForm] = useState<LoginForm>({ email: '', password: '' });
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<VolunteerApplication[]>([]);

  useEffect(() => {
    if (!isSupabaseConfigured || role !== 'admin') return;
    void loadPending();
    const channel = supabase.channel('admin-volunteer-applications')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'volunteer_applications', filter: 'status=eq.pending' }, () => void loadPending())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [role]);

  async function loadPending() {
    const { data } = await supabase.from('volunteer_applications').select('*').eq('status', 'pending').order('created_at', { ascending: true });
    setPending((data ?? []) as VolunteerApplication[]);
  }

  async function login(event: React.FormEvent) {
    event.preventDefault();
    if (!isSupabaseConfigured) return;
    const { error } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
    setMessage(error?.message ?? 'Signed in.');
  }

  async function approve(application: VolunteerApplication) {
    if (!isSupabaseConfigured || !userId) return;
    const reviewed = { status: 'approved' as const, reviewed_by: userId, reviewed_at: new Date().toISOString() };
    const { error } = await supabase.from('volunteer_applications').update(reviewed).eq('id', application.id);
    if (!error) {
      await supabase.from('profiles').update({ role: 'volunteer' satisfies Profile['role'], approved: true }).eq('id', application.user_id);
      setPending((rows) => rows.filter((row) => row.id !== application.id));
    }
  }

  async function reject(application: VolunteerApplication) {
    if (!isSupabaseConfigured || !userId) return;
    const reviewed = { status: 'rejected' as const, reviewed_by: userId, reviewed_at: new Date().toISOString() };
    const { error } = await supabase.from('volunteer_applications').update(reviewed).eq('id', application.id);
    if (!error) setPending((rows) => rows.filter((row) => row.id !== application.id));
  }

  if (role !== 'admin') return <section className="mx-auto max-w-md rounded-3xl bg-white p-6 shadow">
    <h1 className="mb-3 text-2xl font-bold">Admin login</h1>
    <form className="space-y-3" onSubmit={(event) => void login(event)}>
      <input className="w-full rounded border p-2" type="email" placeholder="Admin email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      <input className="w-full rounded border p-2" type="password" placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
      <button className="rounded bg-stone-800 px-3 py-2 text-white">Sign in</button>
      {message && <p className="text-sm text-stone-700">{message}</p>}
    </form>
  </section>;

  return <section className="mx-auto max-w-3xl rounded-3xl bg-white p-6 shadow">
    <h1 className="mb-3 text-2xl font-bold">Volunteer applications</h1>
    {pending.length === 0 && <p>No pending volunteer applications.</p>}
    <div className="space-y-3">{pending.map((application) => <article className="rounded border p-3" key={application.id}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-bold">{application.full_name}</h2><p className="text-sm text-stone-600">{application.city} · {application.phone} · age {application.age}</p></div><div className="flex gap-2"><button className="rounded bg-green-700 px-3 py-1 text-white" onClick={() => void approve(application)}>Approve</button><button className="rounded bg-red-700 px-3 py-1 text-white" onClick={() => void reject(application)}>Reject</button></div></div>
      <p className="mt-2 text-sm"><b>Experience:</b> {application.experience}</p><p className="text-sm"><b>Why volunteer:</b> {application.why_volunteer}</p>
    </article>)}</div>
  </section>;
}
