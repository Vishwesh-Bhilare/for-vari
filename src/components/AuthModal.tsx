import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Mail, 
  Lock, 
  User, 
  X, 
  CheckCircle, 
  AlertCircle,
  ArrowRight,
  Sparkles,
  Shield,
  Eye,
  EyeOff,
  Key,
  UserPlus,
  LogIn,
  RefreshCw
} from 'lucide-react';
import { sendPasswordReset, signIn, signUp } from '../auth';

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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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
      setShowPassword(false);
      setShowConfirmPassword(false);
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
      await signIn(signInEmail.trim(), signInPassword);
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
      setSuccess('Account created successfully! Welcome to the Wari community.');
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

  const tabs = [
    { id: 'signin', label: 'Sign In', icon: LogIn },
    { id: 'register', label: 'Register', icon: UserPlus },
    { id: 'reset', label: 'Reset', icon: Key },
  ] as const;

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-text/60 backdrop-blur-sm p-4"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <motion.div
        ref={modalRef}
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="relative w-full max-w-md rounded-organic-lg bg-cream shadow-warm-xl border border-gold-light/20 overflow-hidden"
      >
        {/* Decorative header */}
        <div className="relative bg-gradient-to-r from-saffron to-saffron-dark px-6 py-5 text-white">
          <div className="absolute inset-0 bg-grain opacity-10" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-organic-sm bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 id="auth-modal-title" className="font-serif text-xl font-bold leading-tight">
                  Wari Companion
                </h2>
                <p className="text-xs text-white/70 font-medium">
                  {activeTab === 'signin' && 'Welcome back, devotee'}
                  {activeTab === 'register' && 'Join the sacred journey'}
                  {activeTab === 'reset' && 'Reset your password'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-organic-sm hover:bg-white/10 transition-colors"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6">
          {/* Tabs */}
          <div className="flex rounded-organic-sm bg-cream-darker border border-gold-light/10 p-1 mb-6">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  className={`flex-1 flex items-center justify-center gap-1.5 rounded-organic-sm px-3 py-2 text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-cream text-saffron shadow-warm'
                      : 'text-text-light/60 hover:text-text-light'
                  }`}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setError('');
                    setSuccess('');
                  }}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Error/Success messages */}
          <AnimatePresence>
            {(error || success) && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={`mb-4 rounded-organic-sm p-3 text-sm font-medium flex items-start gap-2 ${
                  error
                    ? 'bg-maroon-light/10 border border-maroon/20 text-maroon-dark'
                    : 'bg-tulsi-light/10 border border-tulsi/20 text-tulsi-dark'
                }`}
              >
                {error ? (
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                )}
                <span>{error || success}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Sign In Tab */}
          {activeTab === 'signin' && (
            <motion.form
              key="signin"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-4"
              onSubmit={handleSignIn}
            >
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-text-light mb-1.5">
                  <Mail className="w-4 h-4 text-saffron" />
                  Email Address
                </label>
                <input
                  ref={firstInputRef}
                  type="email"
                  className="w-full rounded-organic-sm border border-gold-light/30 bg-cream-darker px-4 py-2.5 text-text placeholder-text-light/50 focus:outline-none focus:ring-2 focus:ring-saffron/30 transition-shadow disabled:opacity-50"
                  placeholder="you@example.com"
                  value={signInEmail}
                  onChange={(e) => setSignInEmail(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-text-light mb-1.5">
                  <Lock className="w-4 h-4 text-saffron" />
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="w-full rounded-organic-sm border border-gold-light/30 bg-cream-darker px-4 py-2.5 text-text placeholder-text-light/50 focus:outline-none focus:ring-2 focus:ring-saffron/30 transition-shadow disabled:opacity-50 pr-11"
                    placeholder="••••••••"
                    value={signInPassword}
                    onChange={(e) => setSignInPassword(e.target.value)}
                    disabled={loading}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-light/50 hover:text-text-light transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <motion.button
                type="submit"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                disabled={loading}
                className="w-full py-3 rounded-organic-sm text-sm font-semibold bg-gradient-to-r from-saffron to-saffron-dark text-white shadow-warm hover:shadow-warm-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Signing In...
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    Sign In
                  </>
                )}
              </motion.button>

              <div className="flex items-center justify-center gap-1.5 text-xs text-text-light/50 pt-2">
                <Sparkles className="w-3 h-3" />
                <span>Welcome back to the Wari</span>
                <Sparkles className="w-3 h-3" />
              </div>
            </motion.form>
          )}

          {/* Register Tab */}
          {activeTab === 'register' && (
            <motion.form
              key="register"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-3"
              onSubmit={handleRegister}
            >
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-text-light mb-1.5">
                  <User className="w-4 h-4 text-saffron" />
                  Display Name
                </label>
                <input
                  ref={firstInputRef}
                  type="text"
                  className="w-full rounded-organic-sm border border-gold-light/30 bg-cream-darker px-4 py-2.5 text-text placeholder-text-light/50 focus:outline-none focus:ring-2 focus:ring-saffron/30 transition-shadow disabled:opacity-50"
                  placeholder="Your name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-text-light mb-1.5">
                  <Mail className="w-4 h-4 text-saffron" />
                  Email Address
                </label>
                <input
                  type="email"
                  className="w-full rounded-organic-sm border border-gold-light/30 bg-cream-darker px-4 py-2.5 text-text placeholder-text-light/50 focus:outline-none focus:ring-2 focus:ring-saffron/30 transition-shadow disabled:opacity-50"
                  placeholder="you@example.com"
                  value={registerEmail}
                  onChange={(e) => setRegisterEmail(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-text-light mb-1.5">
                  <Lock className="w-4 h-4 text-saffron" />
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="w-full rounded-organic-sm border border-gold-light/30 bg-cream-darker px-4 py-2.5 text-text placeholder-text-light/50 focus:outline-none focus:ring-2 focus:ring-saffron/30 transition-shadow disabled:opacity-50 pr-11"
                    placeholder="Minimum 6 characters"
                    value={registerPassword}
                    onChange={(e) => setRegisterPassword(e.target.value)}
                    disabled={loading}
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-light/50 hover:text-text-light transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-text-light mb-1.5">
                  <Lock className="w-4 h-4 text-saffron" />
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    className="w-full rounded-organic-sm border border-gold-light/30 bg-cream-darker px-4 py-2.5 text-text placeholder-text-light/50 focus:outline-none focus:ring-2 focus:ring-saffron/30 transition-shadow disabled:opacity-50 pr-11"
                    placeholder="Confirm your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={loading}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-light/50 hover:text-text-light transition-colors"
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <motion.button
                type="submit"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                disabled={loading}
                className="w-full py-3 rounded-organic-sm text-sm font-semibold bg-gradient-to-r from-saffron to-saffron-dark text-white shadow-warm hover:shadow-warm-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Creating Account...
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    Create Account
                  </>
                )}
              </motion.button>

              <div className="flex items-center justify-center gap-1.5 text-xs text-text-light/50 pt-2">
                <Sparkles className="w-3 h-3" />
                <span>Join the sacred journey to Pandharpur</span>
                <Sparkles className="w-3 h-3" />
              </div>
            </motion.form>
          )}

          {/* Password Reset Tab */}
          {activeTab === 'reset' && (
            <motion.form
              key="reset"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-4"
              onSubmit={handlePasswordReset}
            >
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-text-light mb-1.5">
                  <Mail className="w-4 h-4 text-saffron" />
                  Account Email
                </label>
                <input
                  ref={firstInputRef}
                  type="email"
                  className="w-full rounded-organic-sm border border-gold-light/30 bg-cream-darker px-4 py-2.5 text-text placeholder-text-light/50 focus:outline-none focus:ring-2 focus:ring-saffron/30 transition-shadow disabled:opacity-50"
                  placeholder="you@example.com"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>

              <motion.button
                type="submit"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                disabled={loading}
                className="w-full py-3 rounded-organic-sm text-sm font-semibold bg-gradient-to-r from-maroon to-maroon-dark text-white shadow-warm hover:shadow-warm-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Sending Reset...
                  </>
                ) : (
                  <>
                    <Key className="w-4 h-4" />
                    Send Password Reset
                  </>
                )}
              </motion.button>

              <div className="flex items-center justify-center gap-1.5 text-xs text-text-light/50 pt-2">
                <Sparkles className="w-3 h-3" />
                <span>We'll send you a secure reset link</span>
                <Sparkles className="w-3 h-3" />
              </div>
            </motion.form>
          )}
        </div>
      </motion.div>
    </div>
  );
}
