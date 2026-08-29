import React, { useEffect, useRef, useState } from 'react';
import { sendPasswordReset, signIn, signUp } from '../auth';
import { supabase } from '../supabase';
import type { UserRole } from '../types';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
}

type TabType = 'signin' | 'register' | 'reset';

export function AuthModal({ open, onClose }: AuthModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('signin');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Sign In state
  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const [resetEmail, setResetEmail] = useState('');

  // Register state
  const [displayName, setDisplayName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [signInRole, setSignInRole] = useState<UserRole>('pilgrim');

  const modalRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Focus first input when modal opens
  useEffect(() => {
    if (open && firstInputRef.current) {
      setTimeout(() => firstInputRef.current?.focus(), 100);
    }
  }, [open]);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setError('');
      setSuccess('');
      setSignInEmail('');
      setSignInPassword('');
      setResetEmail('');
      setDisplayName('');
      setRegisterEmail('');
      setRegisterPassword('');
      setConfirmPassword('');
      setLoading(false);
    }
  }, [open]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!signInEmail.trim() || !signInPassword.trim()) {
      setError('Please fill in all fields.');
      return;
    }

    setLoading(true);
    try {
      const result = await signIn(signInEmail.trim(), signInPassword);
      if (result.user) {
        const { data: account } = await supabase.from('profiles').select('role').eq('id', result.user.id).maybeSingle();
        if (account?.role && account.role !== signInRole) {
          setError(`This account is registered as ${account.role}. Choose that sign-in option.`);
          return;
        }
      }
      setSuccess('Signed in successfully!');
      setTimeout(() => {
        onClose();
      }, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!displayName.trim()) {
      setError('Please enter your display name.');
      return;
    }
    if (!registerEmail.trim()) {
      setError('Please enter your email address.');
      return;
    }
    if (registerPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (registerPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await signUp(registerEmail.trim(), registerPassword, displayName.trim());
      setSuccess('Account created successfully. Please check your email if email confirmation is enabled.');
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!resetEmail.trim()) {
      setError('Please enter your email address.');
      return;
    }

    setLoading(true);
    try {
      await sendPasswordReset(resetEmail.trim());
      setSuccess('Password reset email sent. Check your inbox for the secure reset link.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed.');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-end justify-center bg-stone-900/60 backdrop-blur-sm sm:items-center"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div
        ref={modalRef}
        className="relative w-full translate-y-0 rounded-t-3xl bg-white px-5 pt-2 pb-8 shadow-2xl transition-transform duration-300 ease-out sm:max-w-md sm:rounded-3xl sm:p-7"
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-stone-400 hover:bg-stone-100 hover:text-stone-600 transition-colors"
          aria-label="Close modal"
        >
          ✕
        </button>

        <div className="mx-auto mb-5 h-1.5 w-12 rounded-full bg-stone-200 sm:hidden" />

        {/* Title */}
        <h2 id="auth-modal-title" className="mb-1 text-xl font-extrabold text-stone-900">
          Welcome
        </h2>
        <p className="mb-5 text-sm text-stone-500">Sign in to coordinate safely along the Wari route.</p>

        {/* Tabs */}
        <div className="mb-5 flex rounded-xl border border-cream-200 bg-saffron-50 p-1">
          <button
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-bold transition-colors duration-150 ${
              activeTab === 'signin'
                ? 'bg-white text-saffron-600 shadow-sm'
                : 'text-stone-500 hover:text-stone-800'
            }`}
            onClick={() => {
              setActiveTab('signin');
              setError('');
              setSuccess('');
            }}
          >
            Sign In
          </button>
          <button
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-bold transition-colors duration-150 ${
              activeTab === 'register'
                ? 'bg-white text-saffron-600 shadow-sm'
                : 'text-stone-500 hover:text-stone-800'
            }`}
            onClick={() => {
              setActiveTab('register');
              setError('');
              setSuccess('');
            }}
          >
            Register
          </button>
          <button
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-bold transition-colors duration-150 ${
              activeTab === 'reset'
                ? 'bg-white text-saffron-600 shadow-sm'
                : 'text-stone-500 hover:text-stone-800'
            }`}
            onClick={() => {
              setActiveTab('reset');
              setError('');
              setSuccess('');
            }}
          >
            Reset
          </button>
        </div>

        {/* Error/Success messages */}
        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
            {success}
          </div>
        )}

        {/* Sign In Tab */}
        {activeTab === 'signin' && (
          <form className="space-y-4" onSubmit={handleSignIn}>
            <fieldset>
              <legend className="mb-1.5 block text-xs font-semibold text-stone-600">Sign in as</legend>
              <div className="grid grid-cols-3 gap-2">
                {(['pilgrim', 'volunteer', 'admin'] as UserRole[]).map((role) => <button key={role} type="button" onClick={() => setSignInRole(role)} className={`rounded-xl border px-2 py-2 text-xs font-bold capitalize ${signInRole === role ? 'border-saffron-600 bg-saffron-600 text-white' : 'border-cream-200 bg-saffron-50 text-stone-600'}`}>{role}</button>)}
              </div>
            </fieldset>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-stone-600">
                Email
              </label>
              <input
                ref={firstInputRef}
                type="email"
                className="w-full min-h-[44px] rounded-xl border border-cream-200 bg-saffron-50 px-3.5 py-3 text-sm text-stone-900 placeholder:text-stone-400 focus:border-saffron-600 focus:ring-2 focus:ring-saffron-600/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                placeholder="you@example.com"
                value={signInEmail}
                onChange={(e) => setSignInEmail(e.target.value)}
                disabled={loading}
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-stone-600">
                Password
              </label>
              <input
                type="password"
                className="w-full min-h-[44px] rounded-xl border border-cream-200 bg-saffron-50 px-3.5 py-3 text-sm text-stone-900 placeholder:text-stone-400 focus:border-saffron-600 focus:ring-2 focus:ring-saffron-600/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                placeholder="••••••••"
                value={signInPassword}
                onChange={(e) => setSignInPassword(e.target.value)}
                disabled={loading}
                required
              />
            </div>
            <button
              type="submit"
              className="w-full min-h-[48px] rounded-xl bg-saffron-600 py-3 text-sm font-bold text-white shadow-sm hover:bg-saffron-500 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={loading}
            >
              {loading ? 'Signing In...' : 'Sign In'}
            </button>
          </form>
        )}

        {/* Password Reset Tab */}
        {activeTab === 'reset' && (
          <form className="space-y-4" onSubmit={handlePasswordReset}>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-stone-600">
                Account Email
              </label>
              <input
                ref={firstInputRef}
                type="email"
                className="w-full min-h-[44px] rounded-xl border border-cream-200 bg-saffron-50 px-3.5 py-3 text-sm text-stone-900 placeholder:text-stone-400 focus:border-saffron-600 focus:ring-2 focus:ring-saffron-600/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                placeholder="you@example.com"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                disabled={loading}
                required
              />
            </div>
            <button
              type="submit"
              className="w-full min-h-[48px] rounded-xl bg-saffron-600 py-3 text-sm font-bold text-white shadow-sm hover:bg-saffron-500 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={loading}
            >
              {loading ? 'Sending Reset...' : 'Send Password Reset'}
            </button>
          </form>
        )}

        {/* Register Tab */}
        {activeTab === 'register' && (
          <form className="space-y-4" onSubmit={handleRegister}>
            <p className="rounded-xl bg-saffron-50 p-3 text-xs font-semibold text-stone-600">Create a pilgrim account. Volunteer access is granted after your Seva application is approved, and administrator accounts are managed separately.</p>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-stone-600">
                Display Name
              </label>
              <input
                ref={firstInputRef}
                type="text"
                className="w-full min-h-[44px] rounded-xl border border-cream-200 bg-saffron-50 px-3.5 py-3 text-sm text-stone-900 placeholder:text-stone-400 focus:border-saffron-600 focus:ring-2 focus:ring-saffron-600/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                placeholder="Your name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={loading}
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-stone-600">
                Email
              </label>
              <input
                type="email"
                className="w-full min-h-[44px] rounded-xl border border-cream-200 bg-saffron-50 px-3.5 py-3 text-sm text-stone-900 placeholder:text-stone-400 focus:border-saffron-600 focus:ring-2 focus:ring-saffron-600/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                placeholder="you@example.com"
                value={registerEmail}
                onChange={(e) => setRegisterEmail(e.target.value)}
                disabled={loading}
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-stone-600">
                Password
              </label>
              <input
                type="password"
                className="w-full min-h-[44px] rounded-xl border border-cream-200 bg-saffron-50 px-3.5 py-3 text-sm text-stone-900 placeholder:text-stone-400 focus:border-saffron-600 focus:ring-2 focus:ring-saffron-600/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                placeholder="Minimum 6 characters"
                value={registerPassword}
                onChange={(e) => setRegisterPassword(e.target.value)}
                disabled={loading}
                required
                minLength={6}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-stone-600">
                Confirm Password
              </label>
              <input
                type="password"
                className="w-full min-h-[44px] rounded-xl border border-cream-200 bg-saffron-50 px-3.5 py-3 text-sm text-stone-900 placeholder:text-stone-400 focus:border-saffron-600 focus:ring-2 focus:ring-saffron-600/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                required
              />
            </div>
            <button
              type="submit"
              className="w-full min-h-[48px] rounded-xl bg-saffron-600 py-3 text-sm font-bold text-white shadow-sm hover:bg-saffron-500 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={loading}
            >
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
