import React, { useState } from 'react';
import { cacheRows } from '../db';
import { isSupabaseConfigured, supabase } from '../supabase';
import type { NodePoint, VolunteerApplication as VolunteerApplicationRecord } from '../types';

type ApplicationForm = {
  full_name: string;
  phone: string;
  emergency_contact: string;
  preferred_station: string;
  age: string;
  city: string;
  experience: string;
  why_volunteer: string;
};

const emptyForm: ApplicationForm = {
  full_name: '',
  phone: '',
  emergency_contact: '',
  preferred_station: '',
  age: '25',
  city: '',
  experience: '',
  why_volunteer: ''
};

export function VolunteerApplication({
  userId,
  application,
  nodes = [],
  onRequireAuth
}: {
  userId?: string;
  application: VolunteerApplicationRecord | null;
  nodes?: NodePoint[];
  onRequireAuth?: () => void;
}) {
  const [form, setForm] = useState<ApplicationForm>(emptyForm);
  const [message, setMessage] = useState('');
  const [needsAuth, setNeedsAuth] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submitApplication(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    
    if (!form.full_name.trim()) {
      setMessage('Please enter your full name.');
      return;
    }
    
    if (!form.phone.trim()) {
      setMessage('Please enter your phone number.');
      return;
    }
    
    if (!form.emergency_contact.trim()) {
      setMessage('Please enter an emergency contact number.');
      return;
    }
    
    if (!form.preferred_station) {
      setMessage('Please select a preferred station.');
      return;
    }
    
    if (!form.age || Number(form.age) < 13) {
      setMessage('Please enter a valid age (minimum 13 years).');
      return;
    }
    
    if (!form.city.trim()) {
      setMessage('Please enter your city.');
      return;
    }

    if (!userId) {
      setNeedsAuth(true);
      setMessage('Please sign in to submit your volunteer application.');
      setSubmitting(false);
      return;
    }

    setSubmitting(true);
    setNeedsAuth(false);

    const appRecord: VolunteerApplicationRecord = {
      id: crypto.randomUUID(),
      user_id: userId,
      full_name: form.full_name.trim(),
      phone: form.phone.trim(),
      emergency_contact: form.emergency_contact.trim(),
      preferred_station: form.preferred_station || undefined,
      age: Number(form.age) || 25,
      city: form.city.trim() || 'Pune',
      experience: form.experience.trim() || 'Volunteer Seva',
      why_volunteer: form.why_volunteer.trim() || form.experience.trim() || 'Volunteer Seva',
      status: 'pending',
      created_at: new Date().toISOString()
    };

    try {
      if (isSupabaseConfigured) {
        if (form.emergency_contact.trim()) {
          await supabase
            .from('profiles')
            .update({ emergency_contact: form.emergency_contact.trim(), phone: form.phone.trim() })
            .eq('id', userId);
        }
        const payload = {
          user_id: userId,
          full_name: appRecord.full_name,
          phone: appRecord.phone,
          emergency_contact: appRecord.emergency_contact,
          preferred_station: form.preferred_station || null,
          age: appRecord.age,
          city: appRecord.city,
          experience: appRecord.experience,
          why_volunteer: appRecord.why_volunteer,
          status: 'pending' as const
        };
        let { error } = await supabase.from('volunteer_applications').insert(payload);
        if (error && error.code === '23503' && error.message?.includes('preferred_station')) {
          ({ error } = await supabase.from('volunteer_applications').insert({ ...payload, preferred_station: null }));
        }
        if (error) {
          setMessage(error.message);
          return;
        }
      }

      await cacheRows('volunteer_applications', [appRecord]);
      setMessage('Your volunteer application has been submitted for admin review.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  }

  const feedbackMessage = message || (
    application?.status === 'pending'
      ? 'Your volunteer application has been submitted for admin review.'
      : application?.status === 'approved'
        ? '✓ Your volunteer application has been approved. Thank you for serving Wari pilgrims!'
        : ''
  );

  const [step, setStep] = useState(1);
  const fieldClass = "w-full min-h-[44px] rounded-xl border border-cream-200 bg-saffron-50 px-3.5 py-3 text-sm text-stone-900 placeholder:text-stone-400 focus:border-saffron-600 focus:ring-2 focus:ring-saffron-600/20 focus:outline-none transition-colors";

  return (
    <form className="space-y-3 text-sm" onSubmit={(event) => void submitApplication(event)}>
      <div className="mb-5">
        <div className="flex items-center gap-2">
          {[1, 2].map((number) => <React.Fragment key={number}><span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${step >= number ? 'bg-saffron-600 text-white' : 'border border-cream-200 bg-cream-100 text-stone-400'} ${step === number ? 'ring-4 ring-saffron-600/20' : ''}`}>{number}</span>{number === 1 && <span className={`h-0.5 flex-1 transition-colors duration-300 ${step === 2 ? 'bg-saffron-600' : 'bg-cream-200'}`} />}</React.Fragment>)}
        </div>
        <div className="mt-1 flex justify-between text-xs font-semibold text-stone-500"><span>Personal details</span><span>Seva details</span></div>
      </div>
      {application?.status === 'rejected' && <p className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700">Your previous application was rejected. You may submit a new application with updated details.</p>}
      {step === 1 ? <>
        <div className="flex flex-col gap-0 mb-3"><label className="mb-1.5 block text-xs font-semibold text-stone-600">Full name</label><input className={fieldClass} required placeholder="e.g. Rahul Sharma" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
        <div className="grid gap-3 sm:grid-cols-2"><div className="flex flex-col gap-0 mb-3"><label className="mb-1.5 block text-xs font-semibold text-stone-600">Phone number</label><input className={fieldClass} required type="tel" placeholder="+91 98765 43210" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div><div className="flex flex-col gap-0 mb-3"><label className="mb-1.5 block text-xs font-semibold text-stone-600">Emergency contact</label><input className={fieldClass} required type="tel" placeholder="+91 91234 56789" value={form.emergency_contact} onChange={(e) => setForm({ ...form, emergency_contact: e.target.value })} /></div></div>
        <div className="grid grid-cols-2 gap-3"><div className="flex flex-col gap-0 mb-3"><label className="mb-1.5 block text-xs font-semibold text-stone-600">Age</label><input className={fieldClass} required type="number" min="13" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} /></div><div className="flex flex-col gap-0 mb-3"><label className="mb-1.5 block text-xs font-semibold text-stone-600">City</label><input className={fieldClass} required placeholder="Pune / Solapur" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div></div>
        <button type="button" onClick={() => setStep(2)} className="w-full min-h-[48px] rounded-xl bg-saffron-600 py-3 text-sm font-bold text-white shadow-sm hover:bg-saffron-500 active:scale-[0.98] transition-all">Next →</button>
      </> : <>
        <div className="flex flex-col gap-0 mb-3"><label className="mb-1.5 block text-xs font-semibold text-stone-600">Preferred station</label><select className={fieldClass} value={form.preferred_station} onChange={(e) => setForm({ ...form, preferred_station: e.target.value })}><option value="">Select a station</option>{nodes.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}</select></div>
        <div className="flex flex-col gap-0 mb-3"><label className="mb-1.5 block text-xs font-semibold text-stone-600">Experience & motivation</label><textarea className={fieldClass} rows={3} placeholder="Prior Seva or crowd management experience..." value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })} /></div>
        <div className="flex gap-3"><button type="button" onClick={() => setStep(1)} className="min-h-[48px] flex-1 rounded-xl border-2 border-saffron-600 py-3 text-sm font-bold text-saffron-600 hover:bg-saffron-50 active:scale-[0.98] transition-all">← Back</button><button type="submit" className="min-h-[48px] flex-1 rounded-xl bg-saffron-600 py-3 text-sm font-bold text-white shadow-sm hover:bg-saffron-500 active:scale-[0.98] transition-all disabled:opacity-60" disabled={submitting}>{submitting ? 'Submitting...' : 'Apply for Seva ⚡'}</button></div>
      </>}
      {feedbackMessage && <div className="space-y-2"><p className={`text-xs font-semibold ${needsAuth || feedbackMessage.includes('rejected') || feedbackMessage.includes('failed') ? 'text-red-700' : 'text-green-700'}`}>{feedbackMessage}</p>{needsAuth && onRequireAuth && <button type="button" onClick={onRequireAuth} className="w-full min-h-[48px] rounded-xl bg-stone-900 py-3 text-sm font-bold text-white">Sign in to submit application</button>}</div>}
    </form>
  );
}
