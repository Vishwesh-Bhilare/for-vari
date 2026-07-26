import { useState } from 'react';
import { isSupabaseConfigured, supabase } from '../supabase';
import type { VolunteerApplication as VolunteerApplicationRecord } from '../types';

type ApplicationForm = {
  full_name: string;
  phone: string;
  age: string;
  city: string;
  experience: string;
  why_volunteer: string;
};

const emptyForm: ApplicationForm = { full_name: '', phone: '', age: '', city: '', experience: '', why_volunteer: '' };

export function VolunteerApplication({ userId, application }: { userId?: string; application: VolunteerApplicationRecord | null }) {
  const [form, setForm] = useState<ApplicationForm>(emptyForm);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submitApplication(event: React.FormEvent) {
    event.preventDefault();
    if (!isSupabaseConfigured || !userId || submitting) return;
    setSubmitting(true);
    const { error } = await supabase.from('volunteer_applications').insert({
      user_id: userId,
      full_name: form.full_name.trim(),
      phone: form.phone.trim(),
      age: Number(form.age),
      city: form.city.trim(),
      experience: form.experience.trim(),
      why_volunteer: form.why_volunteer.trim(),
      status: 'pending'
    });
    setSubmitting(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setForm(emptyForm);
    setMessage('Your volunteer application has been submitted for admin review.');
  }

  if (application?.status === 'pending') return <p className="text-sm text-amber-700">Your volunteer application is pending admin review.</p>;
  if (application?.status === 'approved') return <p className="text-sm text-green-700">Your volunteer application has been approved. Thank you for helping the Wari community.</p>;

  return <form className="space-y-2 text-sm" onSubmit={(event) => void submitApplication(event)}>
    {application?.status === 'rejected' && <p className="rounded bg-red-50 p-2 text-red-700">Your previous application was rejected. You may submit a new application with updated details.</p>}
    <input className="w-full rounded border p-2" required placeholder="Full name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
    <input className="w-full rounded border p-2" required placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
    <input className="w-full rounded border p-2" required type="number" min="13" placeholder="Age" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} />
    <input className="w-full rounded border p-2" required placeholder="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
    <textarea className="w-full rounded border p-2" rows={3} required placeholder="Prior volunteer or crowd-support experience" value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })} />
    <textarea className="w-full rounded border p-2" rows={3} required placeholder="Why do you want to volunteer?" value={form.why_volunteer} onChange={(e) => setForm({ ...form, why_volunteer: e.target.value })} />
    <button className="rounded bg-orange-600 px-3 py-2 text-white disabled:opacity-60" disabled={submitting || !userId}>{submitting ? 'Submitting...' : 'Submit application'}</button>
    {message && <p className="text-green-700">{message}</p>}
  </form>;
}
