import React, { useEffect, useRef, useState } from 'react';
import { sendPasswordReset, signIn, signUp } from '../auth';
import { useLang } from '../i18n';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
}

type TabType = 'signin' | 'register' | 'reset';

export function AuthModal({ open, onClose }: AuthModalProps) {
  const { t } = useLang();
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
      setError(t('Please fill in all fields.'));
      return;
    }

    setLoading(true);
    try {
      await signIn(signInEmail.trim(), signInPassword);
      setSuccess(t('Signed in successfully!'));
      setTimeout(() => {
        onClose();
      }, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Sign in failed.'));
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!displayName.trim()) {
      setError(t('Please enter your display name.'));
      return;
    }
    if (!registerEmail.trim()) {
      setError(t('Please enter your email address.'));
      return;
    }
    if (registerPassword.length < 6) {
      setError(t('Password must be at least 6 characters.'));
      return;
    }
    if (registerPassword !== confirmPassword) {
      setError(t('Passwords do not match.'));
      return;
    }

    setLoading(true);
    try {
      await signUp(registerEmail.trim(), registerPassword, displayName.trim());
      setSuccess(t('Account created successfully. Please check your email if email confirmation is enabled.'));
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Registration failed.'));
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!resetEmail.trim()) {
      setError(t('Please enter your email address.'));
      return;
    }

    setLoading(true);
    try {
      await sendPasswordReset(resetEmail.trim());
      setSuccess(t('Password reset email sent. Check your inbox for the secure reset link.'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Password reset failed.'));
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-stone-900/60 backdrop-blur-sm p-4"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div
        ref={modalRef}
        className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full bg-stone-100 p-2 text-xs font-bold text-stone-500 hover:bg-stone-200 transition-colors"
          aria-label="Close modal"
        >
          ✕
        </button>

        {/* Title */}
        <h2 id="auth-modal-title" className="text-2xl font-extrabold text-stone-900 mb-6">
          {t('Welcome')}
        </h2>

        {/* Tabs */}
        <div className="flex rounded-xl bg-stone-100 p-1 mb-6">
          <button
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-bold transition-all ${
              activeTab === 'signin'
                ? 'bg-white text-orange-600 shadow-sm'
                : 'text-stone-600 hover:text-stone-900'
            }`}
            onClick={() => {
              setActiveTab('signin');
              setError('');
              setSuccess('');
            }}
          >
            {t('Sign In')}
          </button>
          <button
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-bold transition-all ${
              activeTab === 'register'
                ? 'bg-white text-orange-600 shadow-sm'
                : 'text-stone-600 hover:text-stone-900'
            }`}
            onClick={() => {
              setActiveTab('register');
              setError('');
              setSuccess('');
            }}
          >
            {t('Register')}
          </button>
          <button
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-bold transition-all ${
              activeTab === 'reset'
                ? 'bg-white text-orange-600 shadow-sm'
                : 'text-stone-600 hover:text-stone-900'
            }`}
            onClick={() => {
              setActiveTab('reset');
              setError('');
              setSuccess('');
            }}
          >
            {t('Reset')}
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
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {t('Email')}
              </label>
              <input
                ref={firstInputRef}
                type="email"
                className="w-full rounded-xl border border-stone-300 p-3 text-stone-900 focus:border-orange-500 focus:outline-none disabled:opacity-50"
                placeholder="you@example.com"
                value={signInEmail}
                onChange={(e) => setSignInEmail(e.target.value)}
                disabled={loading}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {t('Password')}
              </label>
              <input
                type="password"
                className="w-full rounded-xl border border-stone-300 p-3 text-stone-900 focus:border-orange-500 focus:outline-none disabled:opacity-50"
                placeholder="••••••••"
                value={signInPassword}
                onChange={(e) => setSignInPassword(e.target.value)}
                disabled={loading}
                required
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-xl bg-orange-600 py-3 font-bold text-white shadow hover:bg-orange-700 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={loading}
            >
              {loading ? t('Signing In...') : t('Sign In')}
            </button>
          </form>
        )}

        {/* Password Reset Tab */}
        {activeTab === 'reset' && (
          <form className="space-y-4" onSubmit={handlePasswordReset}>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {t('Account Email')}
              </label>
              <input
                ref={firstInputRef}
                type="email"
                className="w-full rounded-xl border border-stone-300 p-3 text-stone-900 focus:border-orange-500 focus:outline-none disabled:opacity-50"
                placeholder="you@example.com"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                disabled={loading}
                required
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-xl bg-orange-600 py-3 font-bold text-white shadow hover:bg-orange-700 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={loading}
            >
              {loading ? t('Sending Reset...') : t('Send Password Reset')}
            </button>
          </form>
        )}

        {/* Register Tab */}
        {activeTab === 'register' && (
          <form className="space-y-4" onSubmit={handleRegister}>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {t('Display Name')}
              </label>
              <input
                ref={firstInputRef}
                type="text"
                className="w-full rounded-xl border border-stone-300 p-3 text-stone-900 focus:border-orange-500 focus:outline-none disabled:opacity-50"
                placeholder={t('Your name')}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={loading}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {t('Email')}
              </label>
              <input
                type="email"
                className="w-full rounded-xl border border-stone-300 p-3 text-stone-900 focus:border-orange-500 focus:outline-none disabled:opacity-50"
                placeholder="you@example.com"
                value={registerEmail}
                onChange={(e) => setRegisterEmail(e.target.value)}
                disabled={loading}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {t('Password')}
              </label>
              <input
                type="password"
                className="w-full rounded-xl border border-stone-300 p-3 text-stone-900 focus:border-orange-500 focus:outline-none disabled:opacity-50"
                placeholder={t('Minimum 6 characters')}
                value={registerPassword}
                onChange={(e) => setRegisterPassword(e.target.value)}
                disabled={loading}
                required
                minLength={6}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {t('Confirm Password')}
              </label>
              <input
                type="password"
                className="w-full rounded-xl border border-stone-300 p-3 text-stone-900 focus:border-orange-500 focus:outline-none disabled:opacity-50"
                placeholder={t('Confirm your password')}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                required
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-xl bg-orange-600 py-3 font-bold text-white shadow hover:bg-orange-700 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={loading}
            >
              {loading ? t('Creating Account...') : t('Create Account')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
