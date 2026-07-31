import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  User, 
  Phone, 
  AlertCircle, 
  MapPin, 
  Calendar, 
  Building, 
  Briefcase, 
  Heart, 
  CheckCircle, 
  XCircle,
  Clock,
  Shield,
  Sparkles,
  Send
} from 'lucide-react';
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

  // Get status display info
  const getStatusInfo = () => {
    if (!application) return null;
    switch (application.status) {
      case 'pending':
        return {
          icon: Clock,
          label: 'Pending Review',
          color: 'text-turmeric-dark',
          bg: 'bg-turmeric-light/20',
          border: 'border-turmeric/30',
          message: 'Your application is being reviewed by the admin team.'
        };
      case 'approved':
        return {
          icon: CheckCircle,
          label: 'Approved ✓',
          color: 'text-tulsi',
          bg: 'bg-tulsi-light/20',
          border: 'border-tulsi/30',
          message: 'Congratulations! You are now a verified volunteer for Wari 2026.'
        };
      case 'rejected':
        return {
          icon: XCircle,
          label: 'Not Approved',
          color: 'text-maroon',
          bg: 'bg-maroon-light/20',
          border: 'border-maroon/30',
          message: 'You can submit a new application with updated details.'
        };
      default:
        return null;
    }
  };

  const statusInfo = getStatusInfo();

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
      setMessage('Please sign in to submit your volunteer application.');
      setNeedsAuth(true);
      return;
    }
    
    setSubmitting(true);
    setNeedsAuth(false);

    const payload = {
      user_id: userId,
      full_name: form.full_name.trim(),
      phone: form.phone.trim(),
      emergency_contact: form.emergency_contact.trim(),
      preferred_station: form.preferred_station || null,
      age: Number(form.age) || 25,
      city: form.city.trim() || 'Pune',
      experience: form.experience.trim() || 'Volunteer Seva',
      why_volunteer: form.why_volunteer.trim() || form.experience.trim() || 'Volunteer Seva',
      status: 'pending' as const
    };

    try {
      if (isSupabaseConfigured) {
        if (form.emergency_contact.trim()) {
          await supabase
            .from('profiles')
            .update({ emergency_contact: form.emergency_contact.trim(), phone: form.phone.trim() })
            .eq('id', userId);
        }
        let { error } = await supabase.from('volunteer_applications').insert(payload);
        if (error && error.code === '23503' && error.message?.includes('preferred_station')) {
          const fallback = await supabase.from('volunteer_applications').insert({ ...payload, preferred_station: null });
          error = fallback.error;
        }
        if (error) {
          const duplicatePending = error.code === '23505';
          const rlsViolation = error.message?.includes('row-level security');
          if (rlsViolation) {
            setMessage('Please sign in to submit your volunteer application.');
            setNeedsAuth(true);
          } else if (duplicatePending) {
            setMessage('You already have a pending volunteer application.');
          } else {
            setMessage(`Volunteer application failed: ${error.message}`);
          }
          setSubmitting(false);
          return;
        }
      }

      setMessage('Your volunteer application has been submitted for admin review.');
      setForm(emptyForm);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={(event) => void submitApplication(event)}>
      {/* Status Banner */}
      <AnimatePresence>
        {statusInfo && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`rounded-organic-sm border ${statusInfo.bg} ${statusInfo.border} p-4`}
          >
            <div className="flex items-start gap-3">
              <statusInfo.icon className={`w-5 h-5 ${statusInfo.color} mt-0.5 flex-shrink-0`} />
              <div>
                <p className={`font-semibold ${statusInfo.color}`}>{statusInfo.label}</p>
                <p className="text-sm text-text-light">{statusInfo.message}</p>
                {application?.status === 'rejected' && (
                  <p className="text-sm text-text-light mt-1">
                    You may submit a new application with updated details.
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Form Fields */}
      <div className="space-y-4">
        {/* Full Name */}
        <div>
          <label className="flex items-center gap-2 text-sm font-semibold text-text-light mb-1.5">
            <User className="w-4 h-4 text-saffron" />
            Full Name
            <span className="text-maroon text-xs">*</span>
          </label>
          <input
            className="w-full rounded-organic-sm border border-gold-light/30 bg-cream-darker px-4 py-2.5 text-text placeholder-text-light/50 focus:outline-none focus:ring-2 focus:ring-saffron/30 transition-shadow"
            required
            placeholder="e.g. Rahul Sharma"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            disabled={submitting}
          />
        </div>

        {/* Phone & Emergency */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-text-light mb-1.5">
              <Phone className="w-4 h-4 text-saffron" />
              Phone Number
              <span className="text-maroon text-xs">*</span>
            </label>
            <input
              className="w-full rounded-organic-sm border border-gold-light/30 bg-cream-darker px-4 py-2.5 text-text placeholder-text-light/50 focus:outline-none focus:ring-2 focus:ring-saffron/30 transition-shadow"
              required
              type="tel"
              placeholder="+91 98765 43210"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              disabled={submitting}
            />
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-text-light mb-1.5">
              <AlertCircle className="w-4 h-4 text-saffron" />
              Emergency Contact
              <span className="text-maroon text-xs">*</span>
            </label>
            <input
              className="w-full rounded-organic-sm border border-gold-light/30 bg-cream-darker px-4 py-2.5 text-text placeholder-text-light/50 focus:outline-none focus:ring-2 focus:ring-saffron/30 transition-shadow"
              required
              type="tel"
              placeholder="+91 91234 56789"
              value={form.emergency_contact}
              onChange={(e) => setForm({ ...form, emergency_contact: e.target.value })}
              disabled={submitting}
            />
          </div>
        </div>

        {/* Preferred Station */}
        <div>
          <label className="flex items-center gap-2 text-sm font-semibold text-text-light mb-1.5">
            <MapPin className="w-4 h-4 text-saffron" />
            Preferred Station
            <span className="text-maroon text-xs">*</span>
          </label>
          <select
            className="w-full rounded-organic-sm border border-gold-light/30 bg-cream-darker px-4 py-2.5 text-text focus:outline-none focus:ring-2 focus:ring-saffron/30 transition-shadow appearance-none"
            value={form.preferred_station}
            onChange={(e) => setForm({ ...form, preferred_station: e.target.value })}
            disabled={submitting}
          >
            <option value="">Select a station</option>
            {nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.name}
              </option>
            ))}
          </select>
        </div>

        {/* Age & City */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-text-light mb-1.5">
              <Calendar className="w-4 h-4 text-saffron" />
              Age
              <span className="text-maroon text-xs">*</span>
            </label>
            <input
              className="w-full rounded-organic-sm border border-gold-light/30 bg-cream-darker px-4 py-2.5 text-text placeholder-text-light/50 focus:outline-none focus:ring-2 focus:ring-saffron/30 transition-shadow"
              required
              type="number"
              min="13"
              max="100"
              placeholder="25"
              value={form.age}
              onChange={(e) => setForm({ ...form, age: e.target.value })}
              disabled={submitting}
            />
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-text-light mb-1.5">
              <Building className="w-4 h-4 text-saffron" />
              City
              <span className="text-maroon text-xs">*</span>
            </label>
            <input
              className="w-full rounded-organic-sm border border-gold-light/30 bg-cream-darker px-4 py-2.5 text-text placeholder-text-light/50 focus:outline-none focus:ring-2 focus:ring-saffron/30 transition-shadow"
              required
              placeholder="Pune / Solapur"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              disabled={submitting}
            />
          </div>
        </div>

        {/* Experience */}
        <div>
          <label className="flex items-center gap-2 text-sm font-semibold text-text-light mb-1.5">
            <Briefcase className="w-4 h-4 text-saffron" />
            Experience & Skills
          </label>
          <textarea
            className="w-full rounded-organic-sm border border-gold-light/30 bg-cream-darker px-4 py-2.5 text-text placeholder-text-light/50 focus:outline-none focus:ring-2 focus:ring-saffron/30 transition-shadow resize-y min-h-[80px]"
            rows={3}
            placeholder="Share any prior volunteer experience, skills, or seva work..."
            value={form.experience}
            onChange={(e) => setForm({ ...form, experience: e.target.value })}
            disabled={submitting}
          />
        </div>

        {/* Why Volunteer */}
        <div>
          <label className="flex items-center gap-2 text-sm font-semibold text-text-light mb-1.5">
            <Heart className="w-4 h-4 text-saffron" />
            Why do you want to volunteer?
          </label>
          <textarea
            className="w-full rounded-organic-sm border border-gold-light/30 bg-cream-darker px-4 py-2.5 text-text placeholder-text-light/50 focus:outline-none focus:ring-2 focus:ring-saffron/30 transition-shadow resize-y min-h-[80px]"
            rows={3}
            placeholder="Tell us about your motivation to serve during the Wari..."
            value={form.why_volunteer}
            onChange={(e) => setForm({ ...form, why_volunteer: e.target.value })}
            disabled={submitting}
          />
        </div>
      </div>

      {/* Submit Button */}
      <motion.button
        type="submit"
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.98 }}
        className="w-full py-3.5 rounded-organic-sm text-sm font-semibold bg-gradient-to-r from-saffron to-saffron-dark text-white hover:shadow-warm-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        disabled={submitting || application?.status === 'pending'}
      >
        {submitting ? (
          <>
            <span className="animate-spin">⟳</span>
            Submitting...
          </>
        ) : application?.status === 'pending' ? (
          <>
            <Clock className="w-4 h-4" />
            Application Pending
          </>
        ) : (
          <>
            <Send className="w-4 h-4" />
            Submit Application
          </>
        )}
      </motion.button>

      {/* Message Display */}
      <AnimatePresence>
        {(message || (application?.status === 'pending' && !message)) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="space-y-3"
          >
            <div className={`rounded-organic-sm p-4 text-sm ${
              needsAuth || message?.includes('failed') || message?.includes('rejected')
                ? 'bg-maroon-light/10 border border-maroon/20 text-maroon-dark'
                : 'bg-tulsi-light/10 border border-tulsi/20 text-tulsi-dark'
            }`}>
              <p className="flex items-start gap-2">
                <span className="mt-0.5">
                  {needsAuth || message?.includes('failed') || message?.includes('rejected') 
                    ? <AlertCircle className="w-4 h-4" />
                    : <CheckCircle className="w-4 h-4" />
                  }
                </span>
                <span>
                  {message || 'Your volunteer application has been submitted for admin review.'}
                </span>
              </p>
            </div>

            {needsAuth && onRequireAuth && (
              <button
                type="button"
                onClick={onRequireAuth}
                className="w-full py-3 rounded-organic-sm text-sm font-semibold bg-text text-cream hover:bg-text/80 transition-all flex items-center justify-center gap-2"
              >
                <Shield className="w-4 h-4" />
                Sign In to Submit Application
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer Note */}
      <div className="flex items-center justify-center gap-1.5 text-xs text-text-light/60 pt-2">
        <Sparkles className="w-3 h-3" />
        <span>Your application helps serve the Wari pilgrims</span>
        <Sparkles className="w-3 h-3" />
      </div>
    </form>
  );
}
