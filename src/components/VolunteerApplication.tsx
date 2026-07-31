import { useState } from 'react';
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
  nodes = []
}: {
  userId?: string;
  application: VolunteerApplicationRecord | null;
  nodes?: NodePoint[];
}) {
  const [form, setForm] = useState<ApplicationForm>(emptyForm);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submitApplication(event: React.FormEvent) {
    event.preventDefault();
    
    // Explicit validation instead of silent return
    if (!userId) {
      setMessage('Please sign in to apply as a volunteer.');
      return;
    }
    
    if (submitting) return;
    
    // Validate required fields
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
    
    setSubmitting(true);

    const payload = {
      user_id: userId,
      full_name: form.full_name.trim(),
      phone: form.phone.trim(),
      emergency_contact: form.emergency_contact.trim(),
      preferred_station: form.preferred_station || null,
      age: Number(form.age) || 25,
      city: form.city.trim() || 'Pune',
      experience: form.experience.trim() || 'Volunteer Seva',
      why_volunteer: form.why_volunteer.trim(),
      status: 'pending' as const
    };

    try {
      if (isSupabaseConfigured) {
        if (form.emergency_contact.trim()) {
          void supabase.from('profiles').update({ emergency_contact: form.emergency_contact.trim() }).eq('id', userId);
        }
        const { error } = await supabase.from('volunteer_applications').insert(payload);
        if (error) {
          setMessage(error.message);
          setSubmitting(false);
          return;
        }
      }

      setForm(emptyForm);
      setMessage('Your volunteer application has been submitted for admin review.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  }

  // Show application status if it exists
  if (application?.status === 'pending') {
    return (
      <div className="rounded-xl bg-amber-50 p-3 border border-amber-200 text-amber-800 text-sm">
        ⏳ Your volunteer application is currently pending admin review.
      </div>
    );
  }

  if (application?.status === 'approved') {
    return (
      <div className="rounded-xl bg-emerald-50 p-3 border border-emerald-200 text-emerald-800 text-sm">
        ✓ Your volunteer application has been approved. Thank you for serving Wari pilgrims!
      </div>
    );
  }

  // Show sign-in required for guests
  if (!userId) {
    return (
      <div className="rounded-2xl bg-white p-6 text-center border border-stone-200 shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-orange-100 text-2xl mb-3">
          🔒
        </div>
        <h3 className="text-base font-bold text-stone-900">Volunteer Application</h3>
        <p className="mt-2 text-sm text-stone-600">Sign in to apply as a volunteer.</p>
        <p className="text-xs text-stone-500 mt-1">Applications are available only for registered users.</p>
        <button
          className="mt-4 rounded-xl bg-orange-600 px-6 py-2.5 text-sm font-bold text-white shadow hover:bg-orange-700 transition-all cursor-default opacity-70"
          disabled
        >
          Sign In
        </button>
      </div>
    );
  }

  // Show rejected status
  if (application?.status === 'rejected') {
    return (
      <div className="space-y-3 text-sm">
        <p className="rounded-lg bg-red-50 p-2 text-[13px] text-red-700">
          Your previous application was rejected. You may submit a new application with updated details.
        </p>
        <form className="space-y-3 text-sm" onSubmit={(event) => void submitApplication(event)}>
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">Full Name</label>
            <input
              className="w-full rounded-xl border border-stone-300 p-2.5 text-stone-900 focus:border-orange-500 focus:outline-none"
              required
              placeholder="e.g. Rahul Sharma"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Phone Number</label>
              <input
                className="w-full rounded-xl border border-stone-300 p-2.5 text-stone-900 focus:border-orange-500 focus:outline-none"
                required
                type="tel"
                placeholder="+91 98765 43210"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Emergency Contact</label>
              <input
                className="w-full rounded-xl border border-stone-300 p-2.5 text-stone-900 focus:border-orange-500 focus:outline-none"
                required
                type="tel"
                placeholder="+91 91234 56789"
                value={form.emergency_contact}
                onChange={(e) => setForm({ ...form, emergency_contact: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">Preferred Station</label>
            <select
              className="w-full rounded-xl border border-stone-300 p-2.5 text-stone-900 focus:border-orange-500 focus:outline-none"
              value={form.preferred_station}
              onChange={(e) => setForm({ ...form, preferred_station: e.target.value })}
            >
              {nodes.length > 0 ? (
                <>
                  <option value="">Select a station</option>
                  {nodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.name}
                  </option>
                ))}
                </>
              ) : (
                <option value="">Route stations unavailable</option>
              )}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Age</label>
              <input
                className="w-full rounded-xl border border-stone-300 p-2.5 text-stone-900 focus:border-orange-500 focus:outline-none"
                required
                type="number"
                min="13"
                placeholder="25"
                value={form.age}
                onChange={(e) => setForm({ ...form, age: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">City</label>
              <input
                className="w-full rounded-xl border border-stone-300 p-2.5 text-stone-900 focus:border-orange-500 focus:outline-none"
                required
                placeholder="Pune / Solapur"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">Experience & Motivation</label>
            <textarea
              className="w-full rounded-xl border border-stone-300 p-2.5 text-stone-900 focus:border-orange-500 focus:outline-none"
              rows={2}
              placeholder="Prior Seva or crowd management experience..."
              value={form.experience}
              onChange={(e) => setForm({ ...form, experience: e.target.value })}
            />
          </div>

          <button
            className="w-full rounded-xl bg-orange-600 py-3 font-bold text-white shadow hover:bg-orange-700 disabled:opacity-60 transition-all"
            disabled={submitting || !userId}
          >
            {submitting ? 'Submitting Application...' : '⚡ Apply to Volunteer'}
          </button>

          {message && <p className={`text-xs font-semibold ${message.includes('submitted') ? 'text-emerald-700' : 'text-red-700'}`}>{message}</p>}
        </form>
      </div>
    );
  }

  // Default: show the application form for authenticated users without an application
  return (
    <form className="space-y-3 text-sm" onSubmit={(event) => void submitApplication(event)}>
      <div>
        <label className="block text-xs font-semibold text-stone-700 mb-1">Full Name</label>
        <input
          className="w-full rounded-xl border border-stone-300 p-2.5 text-stone-900 focus:border-orange-500 focus:outline-none"
          required
          placeholder="e.g. Rahul Sharma"
          value={form.full_name}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">Phone Number</label>
          <input
            className="w-full rounded-xl border border-stone-300 p-2.5 text-stone-900 focus:border-orange-500 focus:outline-none"
            required
            type="tel"
            placeholder="+91 98765 43210"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">Emergency Contact</label>
          <input
            className="w-full rounded-xl border border-stone-300 p-2.5 text-stone-900 focus:border-orange-500 focus:outline-none"
            required
            type="tel"
            placeholder="+91 91234 56789"
            value={form.emergency_contact}
            onChange={(e) => setForm({ ...form, emergency_contact: e.target.value })}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-stone-700 mb-1">Preferred Station</label>
        <select
          className="w-full rounded-xl border border-stone-300 p-2.5 text-stone-900 focus:border-orange-500 focus:outline-none"
          value={form.preferred_station}
          onChange={(e) => setForm({ ...form, preferred_station: e.target.value })}
        >
          {nodes.length > 0 ? (
            <>
              <option value="">Select a station</option>
              {nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.name}
              </option>
            ))}
            </>
          ) : (
            <option value="">Route stations unavailable</option>
          )}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">Age</label>
          <input
            className="w-full rounded-xl border border-stone-300 p-2.5 text-stone-900 focus:border-orange-500 focus:outline-none"
            required
            type="number"
            min="13"
            placeholder="25"
            value={form.age}
            onChange={(e) => setForm({ ...form, age: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">City</label>
          <input
            className="w-full rounded-xl border border-stone-300 p-2.5 text-stone-900 focus:border-orange-500 focus:outline-none"
            required
            placeholder="Pune / Solapur"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-stone-700 mb-1">Experience & Motivation</label>
        <textarea
          className="w-full rounded-xl border border-stone-300 p-2.5 text-stone-900 focus:border-orange-500 focus:outline-none"
          rows={2}
          placeholder="Prior Seva or crowd management experience..."
          value={form.experience}
          onChange={(e) => setForm({ ...form, experience: e.target.value })}
        />
      </div>

      <button
        className="w-full rounded-xl bg-orange-600 py-3 font-bold text-white shadow hover:bg-orange-700 disabled:opacity-60 transition-all"
        disabled={submitting || !userId}
      >
        {submitting ? 'Submitting Application...' : '⚡ Apply to Volunteer'}
      </button>

      {message && <p className={`text-xs font-semibold ${message.includes('submitted') ? 'text-emerald-700' : 'text-red-700'}`}>{message}</p>}
    </form>
  );
}
