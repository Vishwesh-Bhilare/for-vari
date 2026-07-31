import 'leaflet/dist/leaflet.css';
import './style.css';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import L from 'leaflet';
import { cacheRows, drainOutbox, getRows, queueWrite } from './db';
import { isSupabaseConfigured, supabase } from './supabase';
import { signOut, useProfile, useSession, useVolunteerApplication } from './auth';
import type { CrowdReport, Density, ItemRequest, NodePoint, Profile, Sighting, SosAlert, VolunteerApplication as VolunteerAppRecord } from './types';
import { VolunteerApplication } from './components/VolunteerApplication';
import { AdminLogin } from './pages/AdminLogin';
import { AuthModal } from './components/AuthModal';
import Layout from './components/Layout';
import { 
  MapPin, 
  Users, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  User, 
  Phone, 
  Shield, 
  Heart, 
  Sparkles,
  ArrowRight,
  Navigation,
  Camera,
  Circle,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const seedNodes: NodePoint[] = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Dehu', lat: 18.7187, lng: 73.7661, sequence_order: 1 },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Pune Halt', lat: 18.5204, lng: 73.8567, sequence_order: 2 },
  { id: '33333333-3333-4333-8333-333333333333', name: 'Saswad', lat: 18.3435, lng: 74.0315, sequence_order: 3 },
  { id: '44444444-4444-4444-8444-444444444444', name: 'Lonand', lat: 18.0402, lng: 74.1883, sequence_order: 4 },
  { id: '55555555-5555-4555-8555-555555555555', name: 'Mukkam - Wakhri', lat: 17.7242, lng: 75.3309, sequence_order: 5 },
  { id: '66666666-6666-4666-8666-666666666666', name: 'Pandharpur', lat: 17.6746, lng: 75.3237, sequence_order: 6 }
];

const densityClass: Record<Density, string> = { 
  unknown: '#94a3b8', 
  low: '#4A7C59', 
  medium: '#E8B931', 
  high: '#7B2D26' 
};

const densityLabel: Record<Density, string> = {
  unknown: 'No Data',
  low: 'Low',
  medium: 'Medium',
  high: 'High'
};

const REQUEST_EXPIRY_MS = 2 * 60 * 60 * 1000;
const COMMON_ITEM_CHIPS = ['Water', 'Torch/Flashlight', 'Phone charger', 'Medicine', 'Blanket'];

function getDistanceMeters(from: GeolocationPosition['coords'] | undefined, lat?: number, lng?: number) {
  if (!from || lat === undefined || lng === undefined) return undefined;
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const earthRadiusMeters = 6_371_000;
  const deltaLat = toRadians(lat - from.latitude);
  const deltaLng = toRadians(lng - from.longitude);
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(lat)) * Math.sin(deltaLng / 2) ** 2;
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(meters?: number) {
  if (meters === undefined) return 'distance unknown';
  if (meters < 1_000) return `~${Math.max(10, Math.round(meters / 10) * 10)}m away`;
  return `~${(meters / 1_000).toFixed(meters < 10_000 ? 1 : 0)}km away`;
}

function isExpiredOpenRequest(item: ItemRequest) {
  if ((item.status ?? 'open') !== 'open' || !item.created_at) return false;
  return Date.now() - new Date(item.created_at).getTime() > REQUEST_EXPIRY_MS;
}

function directionsUrl(lat?: number, lng?: number) {
  if (lat === undefined || lng === undefined) return undefined;
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

type Registration = { name: string; phone: string; emergency: string; groupCode: string; photo?: File };
const makeGroupCode = () => `WARI-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;

function usePosition() {
  const [position, setPosition] = useState<GeolocationPosition>();
  useEffect(() => {
    const watchId = navigator.geolocation?.watchPosition(setPosition, console.warn, { enableHighAccuracy: true, maximumAge: 10_000 });
    return () => { if (watchId !== undefined) navigator.geolocation?.clearWatch(watchId); };
  }, []);
  return position;
}

function App() {
  const { session, userId: currentMemberId, loading: authLoading, error: authError } = useSession();
  const { profile, role, approved, loading: profileLoading, error: profileError } = useProfile(currentMemberId);
  const { application, loading: applicationLoading, error: applicationError } = useVolunteerApplication(currentMemberId);
  
  const [view, setView] = useState<'pilgrim' | 'admin'>(() => location.pathname === '/admin' || location.hash === '#/admin' ? 'admin' : 'pilgrim');

  useEffect(() => {
    const handleHashChange = () => {
      setView(location.pathname === '/admin' || location.hash === '#/admin' ? 'admin' : 'pilgrim');
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const changeView = (nextView: 'pilgrim' | 'admin') => {
    setView(nextView);
    if (nextView === 'admin') {
      window.location.hash = '#/admin';
    } else {
      if (window.location.hash === '#/admin') {
        window.location.hash = '#/';
      }
    }
  };
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [nodes, setNodes] = useState<NodePoint[]>(seedNodes);
  const [reports, setReports] = useState<CrowdReport[]>([]);
  const [items, setItems] = useState<ItemRequest[]>([]);
  const [sightings, setSightings] = useState<Sighting[]>([]);
  const [sosAlerts, setSosAlerts] = useState<SosAlert[]>([]);
  const [selectedNode, setSelectedNode] = useState('');
  const [checkInNode, setCheckInNode] = useState('');
  const [itemName, setItemName] = useState('');
  const [groupCode, setGroupCode] = useState('');
  const [registration, setRegistration] = useState<Registration>({ name: '', phone: '', emergency: '', groupCode: '' });
  const [registeredGroup, setRegisteredGroup] = useState('');
  const [familyCode, setFamilyCode] = useState('');
  const [registeredProfileCount, setRegisteredProfileCount] = useState(0);
  const [familyProfiles, setFamilyProfiles] = useState<Profile[]>([]);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string }>();

  const position = usePosition();
  const mapRef = useRef<L.Map | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const routeRef = useRef<L.Polyline | null>(null);

  useEffect(() => {
    void cacheRows('nodes', seedNodes);
    void Promise.all([
      getRows<CrowdReport>('crowd_reports').then(setReports), getRows<ItemRequest>('item_requests').then(setItems),
      getRows<Sighting>('sightings').then(setSightings), getRows<SosAlert>('sos_alerts').then(setSosAlerts),
      getRows<NodePoint>('nodes').then((rows) => rows.length && setNodes(rows))
    ]);
    void drainOutbox();
  }, []);

  useEffect(() => {
    void supabase.from('nodes').select('*').order('sequence_order').then(({ data }) => {
      if (data && data.length > 0) {
        void cacheRows('nodes', data).then(() => setNodes(data));
      } else {
        void supabase.from('nodes').upsert(seedNodes).then(() => setNodes(seedNodes));
      }
    });
    void supabase.from('profiles').select('*', { count: 'exact', head: true }).then(({ count }) => setRegisteredProfileCount(count ?? 0));
    const channel = supabase.channel(`vari-live-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'crowd_reports' }, (p) => setReports((r) => [p.new as CrowdReport, ...r.filter((i) => i.id !== p.new.id && !(i.pending && i.node_id === p.new.node_id && i.density === p.new.density && i.reported_by === p.new.reported_by))]))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'item_requests' }, (p) => { const row = p.new as ItemRequest; setItems((r) => [row, ...r.filter((i) => i.id !== row.id && !(i.pending && i.item_name === row.item_name && i.requester_id === row.requester_id))]); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sightings' }, (p) => setSightings((r) => [p.new as Sighting, ...r.filter((i) => i.id !== p.new.id && !(i.pending && i.member_id === p.new.member_id && i.node_id === p.new.node_id && i.note === p.new.note))]))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sos_alerts' }, (p) => setSosAlerts((r) => [p.new as SosAlert, ...r.filter((i) => i.id !== p.new.id && !(i.pending && i.member_id === p.new.member_id && i.node_id === p.new.node_id && i.status === p.new.status))]))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'profiles' }, () => setRegisteredProfileCount((count) => count + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nodes' }, () => void supabase.from('nodes').select('*').order('sequence_order').then(({ data }) => data && setNodes(data as NodePoint[])))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (view !== 'pilgrim') return;
    const mapElement = document.getElementById('map');
    if (!mapElement) return;

    if (!mapRef.current) {
      mapRef.current = L.map('map', { zoomControl: false, attributionControl: true }).setView([17.95, 74.7], 8);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { 
        attribution: '&copy; OpenStreetMap contributors', 
        maxZoom: 18, 
        crossOrigin: true 
      }).addTo(mapRef.current);
      markerLayerRef.current = L.layerGroup().addTo(mapRef.current);
    }
    const latest = new Map<string, Density>();
    reports.forEach((r) => !latest.has(r.node_id) && latest.set(r.node_id, r.density));
    markerLayerRef.current?.clearLayers();
    nodes.forEach((node) => {
      const density = latest.get(node.id) ?? 'unknown';
      const color = densityClass[density];
      const marker = L.circleMarker([node.lat, node.lng], { 
        radius: 12, 
        color: '#7B2D26', 
        weight: 2,
        fillColor: color, 
        fillOpacity: 0.85
      });
      marker.bindPopup(`
        <div style="font-family: 'Inter', sans-serif; padding: 4px;">
          <strong style="font-family: 'Fraunces', serif; font-size: 16px;">${node.name}</strong>
          <br/>
          <span style="color: ${color}; font-weight: 600;">${densityLabel[density]}</span>
          <span style="color: #5A4036; font-size: 12px;">crowd density</span>
        </div>
      `);
      marker.addTo(markerLayerRef.current!);
    });
    routeRef.current?.remove();
    routeRef.current = L.polyline(nodes.map((n) => [n.lat, n.lng] as L.LatLngTuple), { 
      color: '#E8832D', 
      weight: 3,
      opacity: 0.5,
      dashArray: '8, 6'
    }).addTo(mapRef.current);
  }, [view, nodes, reports]);

  const latestReports = useMemo(() => nodes.map((node) => ({ node, density: reports.find((r) => r.node_id === node.id)?.density ?? 'unknown' as Density })), [nodes, reports]);
  const nearestNodeId = useMemo(() => nodes.map((node) => ({ node, distance: getDistanceMeters(position?.coords, node.lat, node.lng) })).sort((a, b) => (a.distance ?? Number.POSITIVE_INFINITY) - (b.distance ?? Number.POSITIVE_INFINITY))[0]?.node.id ?? nodes[0]?.id ?? '', [nodes, position?.coords]);
  useEffect(() => { if (nearestNodeId && !selectedNode) setSelectedNode(nearestNodeId); }, [nearestNodeId, selectedNode]);
  useEffect(() => { if (nearestNodeId && !checkInNode) setCheckInNode(nearestNodeId); }, [nearestNodeId, checkInNode]);
  const familySightings = useMemo(() => sightings.filter((s) => familyCode && s.group_code === familyCode), [sightings, familyCode]);
  const myActiveRequest = useMemo(
    () => items.find((item) => item.requester_id === currentMemberId && ['open', 'accepted'].includes(item.status ?? 'open') && !isExpiredOpenRequest(item)),
    [items, currentMemberId]
  );
  const sortedPrimaryItems = useMemo(() => items
    .filter((item) => ['open', 'accepted'].includes(item.status ?? 'open') && !isExpiredOpenRequest(item))
    .map((item) => ({ item, distance: getDistanceMeters(position?.coords, item.lat, item.lng) }))
    .sort((a, b) => (a.distance ?? Number.POSITIVE_INFINITY) - (b.distance ?? Number.POSITIVE_INFINITY)), [items, position?.coords]);
  const recentActivityItems = useMemo(() => items.filter((item) => !['open', 'accepted'].includes(item.status ?? 'open') || isExpiredOpenRequest(item)), [items]);

  useEffect(() => {
    if (!isSupabaseConfigured || !familyCode.trim()) { setFamilyProfiles([]); return; }
    void supabase.from('groups').select('id').eq('group_code', familyCode.trim()).maybeSingle().then(async ({ data }) => {
      if (!data?.id) { setFamilyProfiles([]); return; }
      const { data: profiles } = await supabase.from('profiles').select('*').eq('group_id', data.id);
      setFamilyProfiles((profiles ?? []) as Profile[]);
    });
  }, [familyCode]);

  async function reportDensity(density: Density) {
    if (!session) {
      setNotice({ type: 'error', text: 'Please sign in to use this feature.' });
      return;
    }
    if (density === 'unknown' || !currentMemberId || !selectedNode) {
      setNotice({ type: 'error', text: 'Choose a route node before reporting crowd density.' });
      return;
    }
    const result = await queueWrite<CrowdReport>('crowd_reports', { node_id: selectedNode, density, reported_by: currentMemberId });
    setReports((r) => [result.serverRecord ?? result.localRecord, ...r.filter((i) => i.id !== result.localRecord.id)]);
    setNotice({ type: 'success', text: 'Crowd density report saved.' });
  }
  async function requestItem() {
    if (!session) {
      setNotice({ type: 'error', text: 'Please sign in to use this feature.' });
      return;
    }
    if (!itemName.trim() || !currentMemberId || myActiveRequest) return;
    const result = await queueWrite<ItemRequest>('item_requests', { requester_id: currentMemberId, item_name: itemName, lat: position?.coords.latitude, lng: position?.coords.longitude, status: 'open' });
    setItemName(''); setItems((r) => [result.serverRecord ?? result.localRecord, ...r.filter((i) => i.id !== result.localRecord.id)]);
  }
  async function updateItemRequest(item: ItemRequest, patch: Record<string, unknown>) {
    if (!item.id || !currentMemberId || !isSupabaseConfigured) return;
    const { data, error } = await supabase.from('item_requests').update(patch).eq('id', item.id).select().single();
    if (!error) setItems((r) => r.map((i) => i.id === item.id ? (data as ItemRequest) : i));
  }
  async function acceptItem(item: ItemRequest) {
    if (!session) {
      setNotice({ type: 'error', text: 'Please sign in to use this feature.' });
      return;
    }
    if (item.requester_id === currentMemberId) return;
    await updateItemRequest(item, { status: 'accepted', accepted_by: currentMemberId, accepted_at: new Date().toISOString(), accepter_lat: position?.coords.latitude, accepter_lng: position?.coords.longitude });
  }
  async function completeItem(item: ItemRequest) {
    if (!session) {
      setNotice({ type: 'error', text: 'Please sign in to use this feature.' });
      return;
    }
    await updateItemRequest(item, { status: 'completed' });
  }
  async function cancelItem(item: ItemRequest) {
    if (!session) {
      setNotice({ type: 'error', text: 'Please sign in to use this feature.' });
      return;
    }
    await updateItemRequest(item, { status: 'cancelled' });
  }
  async function unacceptItem(item: ItemRequest) {
    if (!session) {
      setNotice({ type: 'error', text: 'Please sign in to use this feature.' });
      return;
    }
    await updateItemRequest(item, { status: 'open', accepted_by: null, accepted_at: null, accepter_lat: null, accepter_lng: null });
  }
  async function registerGroup() {
    if (!session) {
      setNotice({ type: 'error', text: 'Please sign in to use this feature.' });
      return;
    }
    if (!registration.name.trim() || !currentMemberId || !isSupabaseConfigured) {
      setNotice({ type: 'error', text: 'Please sign in and enter a name before registering a group.' });
      return;
    }
    const normalizedGroupCode = registration.groupCode.trim();
    if (!normalizedGroupCode) {
      setNotice({ type: 'error', text: 'Enter or generate a family group code.' });
      return;
    }

    let groupId: string;
    const existing = await supabase.from('groups').select('id').eq('group_code', normalizedGroupCode).maybeSingle();
    if (existing.error) {
      setNotice({ type: 'error', text: existing.error.message });
      return;
    }
    if (existing.data?.id) {
      groupId = existing.data.id;
    } else {
      groupId = crypto.randomUUID();
      const { error } = await supabase.from('groups').insert({ id: groupId, group_code: normalizedGroupCode });
      if (error) {
        setNotice({ type: 'error', text: error.message });
        return;
      }
    }

    let photo_url: string | undefined;
    if (registration.photo) {
      const path = `${groupId}/${currentMemberId}-${registration.photo.name}`;
      const { data, error } = await supabase.storage.from('member-photos').upload(path, registration.photo, { upsert: true });
      if (error) {
        setNotice({ type: 'error', text: `Photo upload failed: ${error.message}` });
        return;
      }
      if (data) photo_url = supabase.storage.from('member-photos').getPublicUrl(data.path).data.publicUrl;
    }
    const profilePatch = { group_id: groupId, display_name: registration.name, phone: registration.phone, emergency_contact: registration.emergency, ...(photo_url ? { photo_url } : {}) };
    const { error } = await supabase.from('profiles').update(profilePatch).eq('id', currentMemberId);
    if (error) {
      setNotice({ type: 'error', text: error.message });
      return;
    }
    setGroupCode(normalizedGroupCode); setFamilyCode(normalizedGroupCode); setRegisteredGroup(normalizedGroupCode);
    setNotice({ type: 'success', text: existing.data?.id ? 'Joined existing group.' : 'Created new group.' });
  }
  async function checkIn() {
    if (!session) {
      setNotice({ type: 'error', text: 'Please sign in to use this feature.' });
      return;
    }
    if (!currentMemberId || !checkInNode || !groupCode.trim()) {
      setNotice({ type: 'error', text: 'Choose a check-in node and enter your family group code.' });
      return;
    }
    try {
      const result = await queueWrite<Sighting>('sightings', { member_id: currentMemberId, node_id: checkInNode, reported_by: currentMemberId, group_code: groupCode.trim(), note: `Self check-in for ${groupCode.trim()}` });
      setSightings((r) => [result.serverRecord ?? result.localRecord, ...r.filter((i) => i.id !== result.localRecord.id)]);
      setNotice({ type: 'success', text: 'Check-in saved.' });
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Check-in failed.' });
    }
  }
  async function sendSos() {
    if (!session) {
      setNotice({ type: 'error', text: 'Please sign in to use this feature.' });
      return;
    }
    if (!currentMemberId || !checkInNode) return;
    try {
      const result = await queueWrite<SosAlert>('sos_alerts', { member_id: currentMemberId, node_id: checkInNode, lat: position?.coords.latitude, lng: position?.coords.longitude, status: 'active' }, 'sos');
      setSosAlerts((r) => [result.serverRecord ?? result.localRecord, ...r.filter((i) => i.id !== result.localRecord.id)]);
      setNotice({ type: 'success', text: 'SOS sent.' });
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : 'SOS failed.' });
    }
  }

  const activeSosCount = sosAlerts.filter((s) => s.status === 'active').length;

  async function handleSignOut() {
    try {
      await signOut();
      setShowApplyModal(false);
      setNotice({ type: 'success', text: 'Signed out successfully.' });
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Sign out failed.' });
    }
  }

  // Render content based on view
  const renderContent = () => {
    if (view === 'admin') {
      return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <AdminLogin
            userId={currentMemberId}
            role={role}
            activeSosCount={activeSosCount}
            registeredProfileCount={registeredProfileCount}
            routeStationCount={nodes.length}
            nodes={nodes}
            onNodesChange={setNodes}
          />
        </div>
      );
    }

    return (
      <div className="space-y-8 pb-8">
        {/* Hero Section - Welcome */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-saffron-glow opacity-40" />
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-center max-w-3xl mx-auto"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gold-light/30 border border-gold/20 text-sm text-text-light mb-4">
                <Sparkles className="w-4 h-4 text-gold" />
                <span>Wari 2026 • Journey of Devotion</span>
              </div>
              <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-bold text-text leading-tight mb-4">
                Welcome to the 
                <span className="text-saffron"> Wari</span>
              </h1>
              <p className="text-text-light text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed">
                Connect with fellow devotees, track crowd density, and share resources 
                on the sacred journey to Pandharpur.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
                <span className="inline-flex items-center gap-2 px-4 py-2 rounded-organic-sm bg-cream/80 shadow-warm text-sm">
                  <MapPin className="w-4 h-4 text-saffron" />
                  <span>{nodes.length} Stations</span>
                </span>
                <span className="inline-flex items-center gap-2 px-4 py-2 rounded-organic-sm bg-cream/80 shadow-warm text-sm">
                  <Users className="w-4 h-4 text-tulsi" />
                  <span>{registeredProfileCount} Devotees</span>
                </span>
                <span className="inline-flex items-center gap-2 px-4 py-2 rounded-organic-sm bg-cream/80 shadow-warm text-sm">
                  <AlertTriangle className="w-4 h-4 text-maroon" />
                  <span>{activeSosCount} Active SOS</span>
                </span>
              </div>
            </motion.div>
          </div>
          <div className="divider-organic max-w-7xl mx-auto px-4">
            <span>⟡</span>
          </div>
        </section>

        {/* Notice */}
        {(notice || authError || profileError || applicationError) && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className={`rounded-organic-sm border p-4 text-sm font-medium flex items-center gap-3 ${
              notice?.type === 'success' 
                ? 'border-tulsi-light/30 bg-tulsi-lighter/30 text-tulsi-dark' 
                : 'border-maroon-light/30 bg-maroon-lighter/20 text-maroon-dark'
            }`}>
              <span>{notice?.type === 'success' ? '✓' : '⚠'}</span>
              <span>{notice?.text ?? authError ?? profileError ?? applicationError}</span>
            </div>
          </div>
        )}

        {/* Volunteer Application Modal */}
        <AnimatePresence>
          {showApplyModal && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[2000] flex items-center justify-center bg-text/60 backdrop-blur-sm p-4"
              onClick={() => setShowApplyModal(false)}
            >
              <motion.div 
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
                className="relative w-full max-w-lg rounded-organic-lg bg-cream p-6 shadow-warm-xl max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-gold-light/20 pb-4 mb-4">
                  <h3 className="font-serif text-xl font-bold text-text flex items-center gap-2">
                    <Shield className="w-5 h-5 text-saffron" />
                    Volunteer Application
                  </h3>
                  <button
                    onClick={() => setShowApplyModal(false)}
                    className="p-2 rounded-organic-sm text-text-light hover:text-text hover:bg-cream/80 transition-colors"
                  >
                    ✕
                  </button>
                </div>
                <VolunteerApplication
                  userId={currentMemberId}
                  application={application}
                  nodes={nodes}
                  onRequireAuth={() => setShowAuthModal(true)}
                />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Auth Modal */}
        <AuthModal open={showAuthModal} onClose={() => setShowAuthModal(false)} />

        {/* Fixed SOS Button */}
        <motion.button
          onClick={sendSos}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="fixed bottom-6 right-6 z-[1000] group flex items-center gap-3 px-6 py-4 rounded-pill bg-maroon text-white shadow-warm-lg hover:shadow-warm-xl transition-all duration-300"
        >
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-maroon-light animate-ping opacity-50" />
            <AlertTriangle className="w-5 h-5 relative z-10" />
          </div>
          <span className="font-bold text-sm">SOS</span>
        </motion.button>

        {/* Map & Crowd Density */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
            {/* Map */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="rounded-organic-lg overflow-hidden shadow-warm-md border border-gold-light/20"
            >
              <div id="map" className="h-[500px] w-full" />
            </motion.div>

            {/* Crowd Density Panel */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="rounded-organic-lg bg-cream p-6 shadow-warm-md border border-gold-light/20"
            >
              <h2 className="font-serif text-xl font-semibold text-text flex items-center gap-2 mb-4">
                <Users className="w-5 h-5 text-saffron" />
                Crowd Density
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text-light mb-1.5">
                    Select Station
                  </label>
                  <select
                    className="w-full rounded-organic-sm border border-gold-light/30 bg-cream-darker px-4 py-2.5 text-text focus:outline-none focus:ring-2 focus:ring-saffron/30 transition-shadow"
                    value={selectedNode}
                    onChange={(e) => setSelectedNode(e.target.value)}
                  >
                    {nodes.map((node) => (
                      <option key={node.id} value={node.id}>
                        {node.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-light mb-1.5">
                    Report Density
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['low', 'medium', 'high'] as Density[]).map((d) => (
                      <button
                        key={d}
                        onClick={() => void reportDensity(d)}
                        className="py-2.5 rounded-organic-sm text-sm font-semibold text-white capitalize transition-all hover:scale-105 active:scale-95 shadow-warm"
                        style={{ background: densityClass[d] }}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-gold-light/20 pt-4">
                  <h3 className="text-sm font-semibold text-text-light mb-2">All Stations</h3>
                  <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
                    {latestReports.map(({ node, density }) => (
                      <div key={node.id} className="flex items-center justify-between py-1.5 px-2 rounded-organic-sm hover:bg-cream-darker/50 transition-colors">
                        <span className="text-sm text-text">{node.name}</span>
                        <span 
                          className="text-xs font-semibold px-2 py-0.5 rounded-full"
                          style={{ 
                            color: density === 'unknown' ? '#94a3b8' : '#fff',
                            background: density === 'unknown' ? '#e2e8f0' : densityClass[density]
                          }}
                        >
                          {densityLabel[density]}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Three Column Panels */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 md:grid-cols-3">
            {/* Column 1: Peer Lending */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="rounded-organic-lg bg-cream p-6 shadow-warm-md border border-gold-light/20"
            >
              <h2 className="font-serif text-xl font-semibold text-text flex items-center gap-2 mb-4">
                <Heart className="w-5 h-5 text-saffron" />
                Peer Lending
              </h2>

              <div className="space-y-4">
                <div className="flex flex-wrap gap-1.5">
                  {COMMON_ITEM_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setItemName(chip)}
                      className="px-3 py-1 rounded-pill text-xs font-medium bg-gold-light/20 text-text-light hover:bg-gold-light/40 transition-colors"
                    >
                      {chip}
                    </button>
                  ))}
                </div>

                {myActiveRequest && (
                  <div className="rounded-organic-sm bg-turmeric-light/20 border border-turmeric/30 p-3 text-sm">
                    <p className="font-medium text-text-light">Active request: <span className="text-saffron font-semibold">{myActiveRequest.item_name}</span></p>
                    <p className="text-xs text-text-light/70">Complete or cancel before creating another</p>
                  </div>
                )}

                <div className="flex gap-2">
                  <input
                    className="flex-1 rounded-organic-sm border border-gold-light/30 px-4 py-2.5 text-sm text-text placeholder-text-light/50 focus:outline-none focus:ring-2 focus:ring-saffron/30 transition-shadow bg-cream-darker"
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    placeholder="Need: blanket, water..."
                    disabled={Boolean(myActiveRequest)}
                  />
                  <button
                    onClick={() => void requestItem()}
                    disabled={Boolean(myActiveRequest)}
                    className="px-5 py-2.5 rounded-organic-sm text-sm font-semibold bg-saffron text-white hover:bg-saffron-dark transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-warm"
                  >
                    Request
                  </button>
                </div>

                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {sortedPrimaryItems.slice(0, 5).map(({ item: i, distance }, idx) => {
                    const requesterMapUrl = directionsUrl(i.lat, i.lng);
                    const accepterMapUrl = directionsUrl(i.accepter_lat, i.accepter_lng);
                    return (
                      <div key={i.id ?? idx} className="rounded-organic-sm bg-cream-darker p-3 border border-gold-light/10">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-text">{i.item_name}</p>
                            <p className="text-xs text-text-light">
                              <span className={`capitalize ${i.status === 'open' ? 'text-tulsi' : 'text-gold'}`}>
                                {i.status ?? 'open'}
                              </span>
                              {' · '}{formatDistance(distance)}
                              {i.pending && ' · pending'}
                            </p>
                          </div>
                          <div className="flex gap-1.5 flex-wrap">
                            {(i.status ?? 'open') === 'open' && i.requester_id === currentMemberId && (
                              <button onClick={() => void cancelItem(i)} className="px-2.5 py-1 rounded-organic-sm text-xs font-medium bg-maroon/10 text-maroon hover:bg-maroon/20 transition-colors">
                                Cancel
                              </button>
                            )}
                            {(i.status ?? 'open') === 'open' && i.requester_id !== currentMemberId && (
                              <button onClick={() => void acceptItem(i)} className="px-2.5 py-1 rounded-organic-sm text-xs font-medium bg-tulsi/10 text-tulsi hover:bg-tulsi/20 transition-colors">
                                Accept
                              </button>
                            )}
                          </div>
                        </div>
                        {i.status === 'accepted' && (i.requester_id === currentMemberId || i.accepted_by === currentMemberId) && (
                          <div className="mt-2 pt-2 border-t border-gold-light/10 space-y-1.5">
                            {requesterMapUrl && (
                              <a href={requesterMapUrl} target="_blank" rel="noreferrer" className="text-xs text-saffron hover:underline flex items-center gap-1">
                                <Navigation className="w-3 h-3" /> Navigate to requester
                              </a>
                            )}
                            {accepterMapUrl && (
                              <a href={accepterMapUrl} target="_blank" rel="noreferrer" className="text-xs text-saffron hover:underline flex items-center gap-1">
                                <Navigation className="w-3 h-3" /> Navigate to accepter
                              </a>
                            )}
                            <div className="flex gap-1.5">
                              <button onClick={() => void completeItem(i)} className="px-2.5 py-1 rounded-organic-sm text-xs font-medium bg-tulsi text-white hover:bg-tulsi-dark transition-colors">
                                ✓ Complete
                              </button>
                              {i.accepted_by === currentMemberId && (
                                <button onClick={() => void unacceptItem(i)} className="px-2.5 py-1 rounded-organic-sm text-xs font-medium bg-turmeric/20 text-turmeric-dark hover:bg-turmeric/30 transition-colors">
                                  ↺ Unaccept
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {recentActivityItems.length > 0 && (
                  <details className="text-sm text-text-light">
                    <summary className="cursor-pointer font-medium hover:text-text transition-colors">
                      Recent activity ({recentActivityItems.length})
                    </summary>
                    <div className="mt-2 space-y-1">
                      {recentActivityItems.slice(0, 5).map((i, idx) => (
                        <p key={i.id ?? idx} className="text-xs text-text-light/70 border-b border-gold-light/10 py-1">
                          {i.item_name} · {isExpiredOpenRequest(i) ? 'expired' : i.status}
                        </p>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </motion.div>

            {/* Column 2: Lost & Found / Family */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="rounded-organic-lg bg-cream p-6 shadow-warm-md border border-gold-light/20"
            >
              <h2 className="font-serif text-xl font-semibold text-text flex items-center gap-2 mb-4">
                <User className="w-5 h-5 text-saffron" />
                Family & Check-in
              </h2>

              <div className="space-y-4">
                <div className="space-y-2">
                  <input
                    className="w-full rounded-organic-sm border border-gold-light/30 px-4 py-2.5 text-sm text-text placeholder-text-light/50 focus:outline-none focus:ring-2 focus:ring-saffron/30 transition-shadow bg-cream-darker"
                    placeholder="Your Name"
                    value={registration.name}
                    onChange={(e) => setRegistration({ ...registration, name: e.target.value })}
                  />
                  <input
                    className="w-full rounded-organic-sm border border-gold-light/30 px-4 py-2.5 text-sm text-text placeholder-text-light/50 focus:outline-none focus:ring-2 focus:ring-saffron/30 transition-shadow bg-cream-darker"
                    placeholder="Phone Number"
                    value={registration.phone}
                    onChange={(e) => setRegistration({ ...registration, phone: e.target.value })}
                  />
                  <input
                    className="w-full rounded-organic-sm border border-gold-light/30 px-4 py-2.5 text-sm text-text placeholder-text-light/50 focus:outline-none focus:ring-2 focus:ring-saffron/30 transition-shadow bg-cream-darker"
                    placeholder="Emergency Contact"
                    value={registration.emergency}
                    onChange={(e) => setRegistration({ ...registration, emergency: e.target.value })}
                  />
                  <div className="flex gap-2">
                    <input
                      className="flex-1 rounded-organic-sm border border-gold-light/30 px-4 py-2.5 text-sm text-text placeholder-text-light/50 focus:outline-none focus:ring-2 focus:ring-saffron/30 transition-shadow bg-cream-darker"
                      value={registration.groupCode}
                      placeholder="Group Code"
                      onChange={(e) => setRegistration({ ...registration, groupCode: e.target.value })}
                    />
                    <button 
                      type="button"
                      onClick={() => setRegistration({ ...registration, groupCode: makeGroupCode() })}
                      className="px-3 py-2.5 rounded-organic-sm text-sm font-medium bg-cream-darker border border-gold-light/30 text-text-light hover:bg-cream-darker/80 transition-colors whitespace-nowrap"
                    >
                      Generate
                    </button>
                  </div>
                  <input
                    className="w-full rounded-organic-sm border border-gold-light/30 px-4 py-2.5 text-sm text-text placeholder-text-light/50 focus:outline-none focus:ring-2 focus:ring-saffron/30 transition-shadow bg-cream-darker"
                    type="file"
                    accept="image/*"
                    onChange={(e) => setRegistration({ ...registration, photo: e.target.files?.[0] })}
                  />
                  <button
                    onClick={() => void registerGroup()}
                    className="w-full py-2.5 rounded-organic-sm text-sm font-semibold bg-saffron text-white hover:bg-saffron-dark transition-all shadow-warm"
                  >
                    {registeredGroup ? 'Update Group' : 'Register Group'}
                  </button>
                  {registeredGroup && (
                    <p className="text-sm font-medium text-tulsi text-center">✓ Code: {registeredGroup}</p>
                  )}
                </div>

                <div className="border-t border-gold-light/20 pt-4">
                  <input
                    className="w-full rounded-organic-sm border border-gold-light/30 px-4 py-2.5 text-sm text-text placeholder-text-light/50 focus:outline-none focus:ring-2 focus:ring-saffron/30 transition-shadow bg-cream-darker"
                    value={groupCode}
                    onChange={(e) => setGroupCode(e.target.value)}
                    placeholder="Enter group code to check-in"
                  />
                  <select
                    className="w-full mt-2 rounded-organic-sm border border-gold-light/30 px-4 py-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-saffron/30 transition-shadow bg-cream-darker"
                    value={checkInNode}
                    onChange={(e) => setCheckInNode(e.target.value)}
                  >
                    {nodes.map((node) => (
                      <option key={node.id} value={node.id}>
                        {node.id === nearestNodeId ? `${node.name} (nearest)` : node.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => void checkIn()}
                    className="w-full mt-2 py-2.5 rounded-organic-sm text-sm font-semibold bg-gold text-white hover:bg-gold-dark transition-all shadow-warm"
                  >
                    Check In
                  </button>
                </div>

                {familyProfiles.length > 0 && (
                  <div className="border-t border-gold-light/20 pt-4">
                    <h3 className="text-sm font-semibold text-text-light mb-2">Family Members</h3>
                    <div className="space-y-1.5">
                      {familyProfiles.map((member) => (
                        <div key={member.id} className="flex items-center gap-2 text-sm">
                          {member.photo_url ? (
                            <img src={member.photo_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-saffron/10 flex items-center justify-center text-saffron font-bold text-xs">
                              {(member.display_name ?? '?').slice(0, 1)}
                            </div>
                          )}
                          <span className="text-text">{member.display_name ?? 'Unnamed'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Column 3: Volunteer Dashboard */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="rounded-organic-lg bg-cream p-6 shadow-warm-md border border-gold-light/20"
            >
              <h2 className="font-serif text-xl font-semibold text-text flex items-center gap-2 mb-4">
                <Shield className="w-5 h-5 text-saffron" />
                Volunteer
              </h2>

              <div className="space-y-4">
                <button
                  onClick={() => setShowApplyModal(true)}
                  className="w-full py-3 rounded-organic-sm text-sm font-semibold bg-saffron text-white hover:bg-saffron-dark transition-all shadow-warm flex items-center justify-center gap-2"
                >
                  <Shield className="w-4 h-4" />
                  Apply as Volunteer
                </button>

                {session ? (
                  <VolunteerDashboard
                    session={session}
                    profile={profile}
                    role={role}
                    approved={approved}
                    loading={authLoading || profileLoading}
                    nodes={nodes}
                    sosAlerts={sosAlerts}
                    sightings={sightings}
                    setSosAlerts={setSosAlerts}
                    setSightings={setSightings}
                  />
                ) : (
                  <div className="rounded-organic-sm bg-turmeric-light/20 border border-turmeric/30 p-4 text-center">
                    <p className="font-medium text-text-light">Sign in to access volunteer features</p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </section>
      </div>
    );
  };

  return (
    <Layout currentView={view} onViewChange={changeView}>
      {renderContent()}
    </Layout>
  );
}

// ============================================
// Volunteer Dashboard Component
// ============================================
function VolunteerDashboard({ 
  session, 
  profile, 
  role, 
  approved, 
  loading, 
  nodes, 
  sosAlerts, 
  sightings, 
  setSosAlerts, 
  setSightings 
}: { 
  session: any; 
  profile: Profile | null; 
  role: string; 
  approved: boolean; 
  loading: boolean; 
  nodes: NodePoint[]; 
  sosAlerts: SosAlert[]; 
  sightings: Sighting[]; 
  setSosAlerts: React.Dispatch<React.SetStateAction<SosAlert[]>>; 
  setSightings: React.Dispatch<React.SetStateAction<Sighting[]>>;
}) {
  const [scope, setScope] = useState(profile?.node_id ?? 'all');
  useEffect(() => setScope(profile?.node_id ?? 'all'), [profile?.node_id]);
  const permitted = (role === 'volunteer' || role === 'admin') && approved;
  const scopedAlerts = sosAlerts.filter((s) => scope === 'all' || s.node_id === scope);
  const scopedSightings = sightings.filter((s) => scope === 'all' || s.node_id === scope);

  async function resolveSos(alert: SosAlert) {
    if (!isSupabaseConfigured || !alert.id || !session?.user.id) return;
    const patch = { status: 'resolved' as const, resolved_by: session.user.id, resolved_at: new Date().toISOString() };
    const { data, error } = await supabase.from('sos_alerts').update(patch).eq('id', alert.id).select().single();
    if (!error) setSosAlerts((rows) => rows.map((row) => row.id === alert.id ? data as SosAlert : row));
  }

  async function verifySighting(sighting: Sighting) {
    if (!isSupabaseConfigured || !session?.user.id) return;
    const patch = { verified: true, verified_by: session.user.id, verified_at: new Date().toISOString() };
    if (sighting.id) {
      const { data, error } = await supabase.from('sightings').update(patch).eq('id', sighting.id).select().single();
      if (!error) setSightings((rows) => rows.map((row) => row.id === sighting.id ? data as Sighting : row));
    }
  }

  if (loading) return <p className="text-sm text-text-light">Loading access...</p>;
  if (!permitted) return <p className="text-sm text-text-light">Approved volunteer or admin access required.</p>;

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-text-light mb-1.5">Filter by Node</label>
        <select 
          className="w-full rounded-organic-sm border border-gold-light/30 px-4 py-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-saffron/30 transition-shadow bg-cream-darker"
          value={scope} 
          onChange={(e) => setScope(e.target.value)}
        >
          <option value="all">All nodes</option>
          {nodes.map((node) => (
            <option key={node.id} value={node.id}>{node.name}</option>
          ))}
        </select>
      </div>

      <div>
        <h3 className="font-semibold text-text flex items-center gap-2 mb-2">
          <AlertTriangle className="w-4 h-4 text-maroon" />
          SOS Alerts
        </h3>
        {scopedAlerts.length === 0 ? (
          <p className="text-sm text-text-light/60">No active alerts</p>
        ) : (
          <div className="space-y-1.5">
            {scopedAlerts.slice(0, 5).map((s, idx) => (
              <div key={s.id ?? idx} className="flex items-center justify-between py-1.5 px-2 rounded-organic-sm bg-maroon/5 border border-maroon/10">
                <span className="text-sm text-text">
                  <span className={`inline-block w-2 h-2 rounded-full ${s.status === 'active' ? 'bg-maroon animate-pulse' : 'bg-text-light/30'} mr-2`} />
                  {nodes.find((n) => n.id === s.node_id)?.name ?? s.node_id}
                </span>
                {s.status === 'active' && (
                  <button 
                    onClick={() => void resolveSos(s)} 
                    className="px-3 py-1 rounded-organic-sm text-xs font-medium bg-maroon text-white hover:bg-maroon-dark transition-colors"
                  >
                    Resolve
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="font-semibold text-text flex items-center gap-2 mb-2">
          <CheckCircle className="w-4 h-4 text-tulsi" />
          Sightings
        </h3>
        {scopedSightings.length === 0 ? (
          <p className="text-sm text-text-light/60">No sightings to verify</p>
        ) : (
          <div className="space-y-1.5">
            {scopedSightings.slice(0, 5).map((s, idx) => (
              <div key={s.id ?? idx} className="flex items-center justify-between py-1.5 px-2 rounded-organic-sm bg-cream-darker border border-gold-light/10">
                <span className="text-sm text-text">
                  {s.note ?? 'Sighting'}
                  {s.verified && <span className="ml-2 text-xs text-tulsi">✓ verified</span>}
                </span>
                {!s.verified && (
                  <button 
                    onClick={() => void verifySighting(s)} 
                    className="px-3 py-1 rounded-organic-sm text-xs font-medium bg-tulsi text-white hover:bg-tulsi-dark transition-colors"
                  >
                    Verify
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
