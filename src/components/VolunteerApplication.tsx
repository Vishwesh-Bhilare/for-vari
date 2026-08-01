import { useState } from 'react';
import { cacheRows } from '../db';
import { isSupabaseConfigured, supabase } from '../supabase';
import type { NodePoint, VolunteerApplication as VolunteerApplicationRecord } from '../types';
import { useLang } from '../i18n';

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
  const { t } = useLang();
  const [form, setForm] = useState<ApplicationForm>(emptyForm);
  const [message, setMessage] = useState('');
  const [needsAuth, setNeedsAuth] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submitApplication(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    
    if (!form.full_name.trim()) {
      setMessage(t('Please enter your full name.'));
      return;
    }
    
    if (!form.phone.trim()) {
      setMessage(t('Please enter your phone number.'));
      return;
    }
    
    if (!form.emergency_contact.trim()) {
      setMessage(t('Please enter an emergency contact number.'));
      return;
    }
    
    if (!form.preferred_station) {
      setMessage(t('Please select a preferred station.'));
      return;
    }
    
    if (!form.age || Number(form.age) < 13) {
      setMessage(t('Please enter a valid age (minimum 13 years).'));
      return;
    }
    
    if (!form.city.trim()) {
      setMessage(t('Please enter your city.'));
      return;
    }

    setSubmitting(true);
    setNeedsAuth(false);

    const effectiveUserId = userId || crypto.randomUUID();
    const appRecord: VolunteerApplicationRecord = {
      id: crypto.randomUUID(),
      user_id: effectiveUserId,
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
      // 1. Cache locally FIRST so it is guaranteed to show up in Admin Dashboard immediately
      await cacheRows('volunteer_applications', [appRecord]);

      // 2. Try inserting into Supabase if connected
      if (isSupabaseConfigured && userId) {
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
          await supabase.from('volunteer_applications').insert({ ...payload, preferred_station: null });
        }
      }

      setMessage(t('Your volunteer application has been submitted for admin review.'));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('An unexpected error occurred.'));
    } finally {
      setSubmitting(false);
    }
  }

  const feedbackMessage = message || (
    application?.status === 'pending'
      ? t('Your volunteer application has been submitted for admin review.')
      : application?.status === 'approved'
        ? t('✓ Your volunteer application has been approved. Thank you for serving Wari pilgrims!')
        : ''
  );

  return (
    <form className="space-y-3 text-sm" onSubmit={(event) => void submitApplication(event)}>
      {application?.status === 'rejected' && (
        <p className="rounded-lg bg-red-50 p-2 text-[13px] text-red-700">
          {t('Your previous application was rejected. You may submit a new application with updated details.')}
        </p>
      )}

      <div>
        <label className="block text-xs font-semibold text-stone-700 mb-1">{t('Full Name')}</label>
        <input
          className="w-full rounded-xl border border-stone-300 p-2.5 text-stone-900 focus:border-orange-500 focus:outline-none"
          required
          placeholder={t('e.g. Rahul Sharma')}
          value={form.full_name}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">{t('Phone Number')}</label>
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
          <label className="block text-xs font-semibold text-stone-700 mb-1">{t('Emergency Contact')}</label>
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
        <label className="block text-xs font-semibold text-stone-700 mb-1">{t('Preferred Station')}</label>
        <select
          className="w-full rounded-xl border border-stone-300 p-2.5 text-stone-900 focus:border-orange-500 focus:outline-none"
          value={form.preferred_station}
          onChange={(e) => setForm({ ...form, preferred_station: e.target.value })}
        >
          {nodes.length > 0 ? (
            <>
              <option value="">{t('Select a station')}</option>
              {nodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.name}
                </option>
              ))}
            </>
          ) : (
            <option value="">{t('Route stations unavailable')}</option>
          )}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">{t('Age')}</label>
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
          <label className="block text-xs font-semibold text-stone-700 mb-1">{t('City')}</label>
          <input
            className="w-full rounded-xl border border-stone-300 p-2.5 text-stone-900 focus:border-orange-500 focus:outline-none"
            required
            placeholder={t('Pune / Solapur')}
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-stone-700 mb-1">{t('Experience & Motivation')}</label>
        <textarea
          className="w-full rounded-xl border border-stone-300 p-2.5 text-stone-900 focus:border-orange-500 focus:outline-none"
          rows={2}
          placeholder={t('Prior Seva or crowd management experience...')}
          value={form.experience}
          onChange={(e) => setForm({ ...form, experience: e.target.value })}
        />
      </div>

      <button
        type="submit"
        className="w-full rounded-xl bg-orange-600 py-3 font-bold text-white shadow hover:bg-orange-700 disabled:opacity-60 transition-all cursor-pointer"
        disabled={submitting}
      >
        {submitting ? t('Submitting Application...') : `⚡ ${t('Apply to Volunteer')}`}
      </button>

      {feedbackMessage && (
        <div className="space-y-2">
          <p className={`text-xs font-semibold ${needsAuth || feedbackMessage.includes('rejected') || feedbackMessage.includes('failed') || feedbackMessage.includes('नाकारला') || feedbackMessage.includes('अयशस्वी') ? 'text-red-700' : 'text-emerald-700'}`}>
            {feedbackMessage}
          </p>
          {needsAuth && onRequireAuth && (
            <button
              type="button"
              onClick={onRequireAuth}
              className="w-full rounded-xl bg-stone-900 py-2 text-xs font-bold text-white hover:bg-stone-800 transition-all"
            >
              {t('Sign In to Submit Application')}
            </button>
          )}
        </div>
      )}
    </form>
  );
}
