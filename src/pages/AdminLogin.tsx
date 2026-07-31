import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Shield, 
  Mail, 
  Lock, 
  Users, 
  AlertTriangle, 
  MapPin, 
  UserCheck,
  CheckCircle,
  XCircle,
  Plus,
  Edit,
  Trash2,
  RefreshCw,
  Sparkles,
  Crown,
  Clock,
  Phone,
  AlertCircle,
  Navigation,
  Briefcase,
  Calendar,
  Building
} from 'lucide-react';
import { getSupabaseConfigError, isSupabaseConfigured, supabase } from '../supabase';
import { signIn } from '../auth';
import type { NodePoint, VolunteerApplication } from '../types';

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
  const [adminEmail, setAdminEmail] = useState('Bhilarevishwesh@gmail.com');
  const [adminPassword, setAdminPassword] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');

  const isAdmin = role === 'admin';
  const configError = getSupabaseConfigError();

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

  async function handleAdminLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError('');
    if (!adminEmail.trim() || !adminPassword.trim()) {
      setLoginError('Please enter admin email and password.');
      return;
    }
    setLoggingIn(true);
    try {
      await signIn(adminEmail.trim(), adminPassword);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Admin login failed.');
    } finally {
      setLoggingIn(false);
    }
  }

  async function approve(application: VolunteerApplication) {
    if (isSupabaseConfigured && userId && isAdmin) {
      const { error } = await supabase.rpc('approve_volunteer_application', { application_id: application.id });
      if (error) {
        setMessage(`Volunteer approval failed: ${error.message}`);
        return;
      }
    }
    setPending((rows) => rows.filter((row) => row.id !== application.id));
    onApproveVolunteer?.(application);
  }

  async function reject(application: VolunteerApplication) {
    if (isSupabaseConfigured && userId && isAdmin) {
      const reviewed = { status: 'rejected' as const, reviewed_by: userId, reviewed_at: new Date().toISOString() };
      const { error } = await supabase.from('volunteer_applications').update(reviewed).eq('id', application.id);
      if (error) {
        setMessage(`Volunteer rejection failed: ${error.message}`);
        return;
      }
    }
    setPending((rows) => rows.filter((row) => row.id !== application.id));
  }

  async function saveNode(event: React.FormEvent) {
    event.preventDefault();
    if (!isAdmin || !isSupabaseConfigured) return;
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
    if (!isAdmin || !isSupabaseConfigured) return;
    const { error } = await supabase.from('nodes').delete().eq('id', node.id);
    if (error) {
      setMessage(error.message);
      return;
    }
    onNodesChange?.(nodes.filter((row) => row.id !== node.id));
    setMessage('Route node removed.');
  }

  // ============================================
  // ADMIN LOGIN CARD (Not logged in)
  // ============================================
  if (!isAdmin) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md overflow-hidden rounded-organic-lg bg-cream shadow-warm-xl border border-gold-light/30"
        >
          {/* Header */}
          <div className="relative bg-gradient-to-br from-maroon via-maroon-dark to-text p-8 text-center text-white overflow-hidden">
            <div className="absolute inset-0 bg-grain opacity-10" />
            <div className="relative">
              <div className="mx-auto w-16 h-16 rounded-organic-sm bg-gold/20 backdrop-blur-sm flex items-center justify-center border border-gold/30 mb-4">
                <Crown className="w-8 h-8 text-gold" />
              </div>
              <h1 className="font-serif text-2xl font-bold tracking-tight">Admin Dashboard</h1>
              <p className="mt-2 text-sm text-gold-light/70 max-w-xs mx-auto leading-relaxed">
                Secure access for Wari administrators to manage volunteers, nodes, and system metrics.
              </p>
            </div>
          </div>

          {/* Form */}
          <div className="p-6 space-y-5">
            {(!isSupabaseConfigured || configError) && (
              <div className="rounded-organic-sm bg-maroon-light/10 border border-maroon/20 p-4">
                <p className="text-sm font-medium text-maroon-dark flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Supabase configuration missing. Please check .env file.
                </p>
              </div>
            )}

            <AnimatePresence>
              {loginError && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="rounded-organic-sm bg-maroon-light/10 border border-maroon/20 p-3"
                >
                  <p className="text-sm font-medium text-maroon-dark flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    {loginError}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={(e) => void handleAdminLogin(e)} className="space-y-4">
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-text-light mb-1.5">
                  <Mail className="w-4 h-4 text-saffron" />
                  Admin Email
                </label>
                <input
                  type="email"
                  required
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="admin@example.com"
                  className="w-full rounded-organic-sm border border-gold-light/30 bg-cream-darker px-4 py-2.5 text-text placeholder-text-light/50 focus:outline-none focus:ring-2 focus:ring-saffron/30 transition-shadow"
                  disabled={loggingIn}
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-text-light mb-1.5">
                  <Lock className="w-4 h-4 text-saffron" />
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-organic-sm border border-gold-light/30 bg-cream-darker px-4 py-2.5 text-text placeholder-text-light/50 focus:outline-none focus:ring-2 focus:ring-saffron/30 transition-shadow"
                  disabled={loggingIn}
                />
              </div>

              <motion.button
                type="submit"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                disabled={loggingIn}
                className="w-full py-3.5 rounded-organic-sm text-sm font-semibold bg-gradient-to-r from-maroon to-maroon-dark text-white shadow-warm hover:shadow-warm-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loggingIn ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Authenticating...
                  </>
                ) : (
                  <>
                    <Shield className="w-4 h-4" />
                    Log In as Admin
                  </>
                )}
              </motion.button>
            </form>

            <div className="flex items-center justify-center gap-1.5 text-xs text-text-light/50 pt-2">
              <Sparkles className="w-3 h-3" />
              <span>Authorized personnel only</span>
              <Sparkles className="w-3 h-3" />
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // ============================================
  // ADMIN DASHBOARD (Authenticated)
  // ============================================
  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-organic-lg bg-gradient-to-br from-maroon via-maroon-dark to-text p-6 sm:p-8 shadow-warm-lg border border-gold/20"
      >
        <div className="absolute inset-0 bg-grain opacity-5" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gold-light/70">
              <Shield className="w-3 h-3" />
              Control Center
            </span>
            <h1 className="mt-1 font-serif text-2xl sm:text-3xl font-bold text-white flex items-center gap-2">
              Admin Panel
              <span className="text-xs font-sans font-medium bg-gold/20 px-3 py-1 rounded-pill text-gold-light border border-gold/30">
                {role}
              </span>
            </h1>
            <p className="mt-1.5 text-sm text-gold-light/60 max-w-2xl">
              Manage volunteer approvals, route nodes, and monitor system metrics for Wari 2026.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-gold-light/50">
            <Clock className="w-4 h-4" />
            <span>Live Dashboard</span>
            <span className="w-1.5 h-1.5 rounded-full bg-tulsi animate-pulse ml-1" />
          </div>
        </div>
      </motion.div>

      {/* Message */}
      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-organic-sm bg-turmeric-light/20 border border-turmeric/30 p-4"
          >
            <p className="text-sm font-medium text-text-light flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-turmeric" />
              {message}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats Grid */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-2 gap-4 sm:grid-cols-4"
      >
        <Stat 
          icon={Users} 
          label="Pending Volunteers" 
          value={pending.length} 
          color="text-saffron" 
          bg="bg-saffron/5"
        />
        <Stat 
          icon={AlertTriangle} 
          label="Active SOS" 
          value={activeSosCount} 
          color="text-maroon" 
          bg="bg-maroon/5"
        />
        <Stat 
          icon={UserCheck} 
          label="Registered Devotees" 
          value={registeredProfileCount} 
          color="text-tulsi" 
          bg="bg-tulsi/5"
        />
        <Stat 
          icon={MapPin} 
          label="Route Stations" 
          value={routeStationCount} 
          color="text-gold" 
          bg="bg-gold/5"
        />
      </motion.div>

      {/* Pending Applications */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-organic-lg bg-cream p-6 shadow-warm-md border border-gold-light/20"
      >
        <h2 className="font-serif text-xl font-semibold text-text flex items-center gap-2 mb-4">
          <Users className="w-5 h-5 text-saffron" />
          Pending Applications
          <span className="ml-auto text-sm font-sans font-medium bg-saffron/10 text-saffron px-3 py-1 rounded-pill">
            {pending.length}
          </span>
        </h2>

        {pending.length === 0 ? (
          <div className="rounded-organic-sm bg-cream-darker p-12 text-center border border-gold-light/10">
            <CheckCircle className="w-12 h-12 text-tulsi/30 mx-auto mb-3" />
            <p className="text-text-light/60 font-medium">All clear! No pending applications.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {pending.map((application, index) => {
              const station = nodes.find((node) => node.id === application.preferred_station)?.name ?? 'Not provided';
              const emergency = application.emergency_contact?.trim() || 'Not provided';
              return (
                <motion.div
                  key={application.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="rounded-organic-sm bg-cream-darker p-5 border border-gold-light/15 hover:border-gold-light/30 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-serif text-lg font-semibold text-text">{application.full_name}</h3>
                      <p className="text-xs text-text-light/60 flex items-center gap-1 mt-0.5">
                        <Calendar className="w-3 h-3" />
                        Applied {new Date(application.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="text-xs font-medium px-2.5 py-1 rounded-pill bg-turmeric-light/20 text-turmeric-dark border border-turmeric/20">
                      Pending
                    </span>
                  </div>

                  <div className="space-y-1.5 text-sm">
                    <p className="flex items-center gap-2 text-text-light">
                      <Phone className="w-3.5 h-3.5 text-saffron/60" />
                      <span>{application.phone}</span>
                    </p>
                    <p className="flex items-center gap-2 text-text-light">
                      <AlertCircle className="w-3.5 h-3.5 text-maroon/60" />
                      <span className="text-xs">Emergency: {emergency}</span>
                    </p>
                    <p className="flex items-center gap-2 text-text-light">
                      <MapPin className="w-3.5 h-3.5 text-saffron/60" />
                      <span className="font-medium text-text">{station}</span>
                    </p>
                    <p className="flex items-center gap-2 text-text-light">
                      <Building className="w-3.5 h-3.5 text-saffron/60" />
                      <span>{application.city || 'Not provided'}</span>
                    </p>
                  </div>

                  {application.experience && (
                    <div className="mt-3 p-3 rounded-organic-sm bg-cream border border-gold-light/10">
                      <p className="text-xs text-text-light flex items-start gap-1.5">
                        <Briefcase className="w-3.5 h-3.5 text-saffron/60 mt-0.5 flex-shrink-0" />
                        <span className="line-clamp-2">{application.experience}</span>
                      </p>
                    </div>
                  )}

                  <div className="mt-4 flex gap-2">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => void approve(application)}
                      className="flex-1 py-2.5 rounded-organic-sm text-xs font-semibold bg-tulsi text-white hover:bg-tulsi-dark transition-all shadow-warm flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      Approve
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => void reject(application)}
                      className="px-4 py-2.5 rounded-organic-sm text-xs font-semibold bg-maroon/10 text-maroon hover:bg-maroon/20 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Reject
                    </motion.button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* Route Node Management */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="rounded-organic-lg bg-cream p-6 shadow-warm-md border border-gold-light/20"
      >
        <h2 className="font-serif text-xl font-semibold text-text flex items-center gap-2 mb-4">
          <Navigation className="w-5 h-5 text-saffron" />
          Route Nodes
        </h2>

        <form className="grid gap-3 md:grid-cols-5" onSubmit={(event) => void saveNode(event)}>
          <input
            className="rounded-organic-sm border border-gold-light/30 bg-cream-darker px-4 py-2.5 text-sm text-text placeholder-text-light/50 focus:outline-none focus:ring-2 focus:ring-saffron/30 transition-shadow"
            placeholder="Node name"
            value={nodeForm.name}
            onChange={(e) => setNodeForm({ ...nodeForm, name: e.target.value })}
          />
          <input
            className="rounded-organic-sm border border-gold-light/30 bg-cream-darker px-4 py-2.5 text-sm text-text placeholder-text-light/50 focus:outline-none focus:ring-2 focus:ring-saffron/30 transition-shadow"
            placeholder="Latitude"
            value={nodeForm.lat}
            onChange={(e) => setNodeForm({ ...nodeForm, lat: e.target.value })}
          />
          <input
            className="rounded-organic-sm border border-gold-light/30 bg-cream-darker px-4 py-2.5 text-sm text-text placeholder-text-light/50 focus:outline-none focus:ring-2 focus:ring-saffron/30 transition-shadow"
            placeholder="Longitude"
            value={nodeForm.lng}
            onChange={(e) => setNodeForm({ ...nodeForm, lng: e.target.value })}
          />
          <input
            className="rounded-organic-sm border border-gold-light/30 bg-cream-darker px-4 py-2.5 text-sm text-text placeholder-text-light/50 focus:outline-none focus:ring-2 focus:ring-saffron/30 transition-shadow"
            placeholder="Sequence"
            value={nodeForm.sequence_order}
            onChange={(e) => setNodeForm({ ...nodeForm, sequence_order: e.target.value })}
          />
          <motion.button
            type="submit"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="py-2.5 rounded-organic-sm text-sm font-semibold bg-saffron text-white hover:bg-saffron-dark transition-all shadow-warm flex items-center justify-center gap-1.5"
          >
            {nodeForm.id ? (
              <>
                <Edit className="w-4 h-4" />
                Update
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Add
              </>
            )}
          </motion.button>
        </form>

        <div className="mt-4 space-y-2">
          {nodes.map((node) => (
            <motion.div 
              key={node.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-wrap items-center justify-between gap-3 rounded-organic-sm border border-gold-light/10 bg-cream-darker p-3 hover:border-gold-light/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-saffron/10 text-saffron text-xs font-bold flex items-center justify-center">
                  {node.sequence_order}
                </span>
                <div>
                  <span className="font-medium text-text">{node.name}</span>
                  <span className="text-xs text-text-light/50 ml-2">
                    {node.lat}, {node.lng}
                  </span>
                </div>
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={() =>
                    setNodeForm({
                      id: node.id,
                      name: node.name,
                      lat: String(node.lat),
                      lng: String(node.lng),
                      sequence_order: String(node.sequence_order)
                    })
                  }
                  className="px-3 py-1.5 rounded-organic-sm text-xs font-medium bg-cream border border-gold-light/20 text-text-light hover:bg-cream-darker hover:border-gold-light/40 transition-colors flex items-center gap-1"
                >
                  <Edit className="w-3 h-3" />
                  Edit
                </button>
                <button
                  onClick={() => void removeNode(node)}
                  className="px-3 py-1.5 rounded-organic-sm text-xs font-medium bg-maroon/10 text-maroon hover:bg-maroon/20 transition-colors flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  Remove
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

// ============================================
// Stat Component
// ============================================
function Stat({ 
  icon: Icon, 
  label, 
  value, 
  color, 
  bg 
}: { 
  icon: React.ElementType; 
  label: string; 
  value: number; 
  color: string; 
  bg: string;
}) {
  return (
    <motion.div 
      whileHover={{ y: -2 }}
      className={`rounded-organic-sm ${bg} p-5 border border-gold-light/10 shadow-warm`}
    >
      <div className="flex items-center gap-2">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-[10px] font-bold uppercase tracking-wider text-text-light/60">{label}</span>
      </div>
      <div className={`mt-2 text-3xl font-black ${color}`}>{value}</div>
    </motion.div>
  );
}
