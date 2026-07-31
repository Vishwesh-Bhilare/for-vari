import 'leaflet/dist/leaflet.css';
import './style.css';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import L from 'leaflet';
import { cacheRows, drainOutbox, getRows, queueWrite } from './db';
import { isSupabaseConfigured, supabase } from './supabase';
import { useProfile, useSession, useVolunteerApplication } from './auth';
import type { CrowdReport, Density, ItemRequest, NodePoint, Profile, Sighting, SosAlert, VolunteerApplication as VolunteerAppRecord } from './types';
import { VolunteerApplication } from './components/VolunteerApplication';
import { AdminLogin } from './pages/AdminLogin';

const seedNodes: NodePoint[] = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Dehu', lat: 18.7187, lng: 73.7661, sequence_order: 1 },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Pune Halt', lat: 18.5204, lng: 73.8567, sequence_order: 2 },
  { id: '33333333-3333-4333-8333-333333333333', name: 'Saswad', lat: 18.3435, lng: 74.0315, sequence_order: 3 },
  { id: '44444444-4444-4444-8444-444444444444', name: 'Lonand', lat: 18.0402, lng: 74.1883, sequence_order: 4 },
  { id: '55555555-5555-4555-8555-555555555555', name: 'Mukkam - Wakhri', lat: 17.7242, lng: 75.3309, sequence_order: 5 },
  { id: '66666666-6666-4666-8666-666666666666', name: 'Pandharpur', lat: 17.6746, lng: 75.3237, sequence_order: 6 }
];

const densityClass: Record<Density, string> = { unknown: '#94a3b8', low: '#16a34a', medium: '#f59e0b', high: '#dc2626' };

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
  const [showApplyModal, setShowApplyModal] = useState(false);
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
    if (!isSupabaseConfigured) return;
    void supabase.from('nodes').select('*').order('sequence_order').then(({ data }) => { if (data && data.length > 0) void cacheRows('nodes', data).then(() => setNodes(data)); });
    void supabase.from('profiles').select('*', { count: 'exact', head: true }).then(({ count }) => setRegisteredProfileCount(count ?? 0));
    const channel = supabase.channel('vari-live')
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
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 18, crossOrigin: true }).addTo(mapRef.current);
      markerLayerRef.current = L.layerGroup().addTo(mapRef.current);
    }
    const latest = new Map<string, Density>();
    reports.forEach((r) => !latest.has(r.node_id) && latest.set(r.node_id, r.density));
    markerLayerRef.current?.clearLayers();
    nodes.forEach((node) => L.circleMarker([node.lat, node.lng], { radius: 11, color: '#7c2d12', fillColor: densityClass[latest.get(node.id) ?? 'unknown'], fillOpacity: 0.9 })
      .bindPopup(`${node.name}: ${latest.get(node.id) ?? 'no data'} crowd`).addTo(markerLayerRef.current!));
    routeRef.current?.remove();
    routeRef.current = L.polyline(nodes.map((n) => [n.lat, n.lng] as L.LatLngTuple), { color: '#ea580c', weight: 4 }).addTo(mapRef.current);
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

  return (
    <main className="min-h-screen bg-orange-50 text-stone-900">
      <header className="bg-gradient-to-r from-orange-600 to-amber-500 p-5 text-white shadow">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-widest text-orange-100">Pandharpur Vari</p>
            <h1 className="text-3xl font-bold">Offline-first Wari Companion</h1>
            <p className="text-sm text-orange-100 mt-1">
              Crowd density, lending, lost & found, and SOS updates sync live with Supabase when online.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setView('pilgrim')}
              className={`rounded-full px-4 py-1.5 text-xs font-bold transition-all ${
                view === 'pilgrim'
                  ? 'bg-white text-orange-600 shadow'
                  : 'bg-orange-700/40 text-white hover:bg-orange-700/60'
              }`}
            >
              Pilgrim Companion
            </button>
            <button
              onClick={() => setView('admin')}
              className={`rounded-full px-4 py-1.5 text-xs font-bold transition-all ${
                view === 'admin'
                  ? 'bg-white text-orange-600 shadow'
                  : 'bg-orange-700/40 text-white hover:bg-orange-700/60'
              }`}
            >
              Admin Dashboard
            </button>
          </div>
        </div>
      </header>

      {(notice || authError || profileError || applicationError) && (
        <div className={`mx-4 mt-4 rounded-xl border p-3 text-sm font-semibold ${notice?.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
          {notice?.text ?? authError ?? profileError ?? applicationError}
        </div>
      )}

      {view === 'admin' ? (
        <div className="p-4 sm:p-6">
          {!session ? (
            <div className="flex min-h-[60vh] items-center justify-center">
              <div className="rounded-2xl bg-white p-8 shadow-xl text-center max-w-md">
                <p className="text-xl font-semibold text-stone-800">Please sign in as an administrator.</p>
              </div>
            </div>
          ) : (
            <AdminLogin
              userId={currentMemberId}
              role={role}
              activeSosCount={activeSosCount}
              registeredProfileCount={registeredProfileCount}
              routeStationCount={nodes.length}
              nodes={nodes}
              onNodesChange={setNodes}
            />
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Volunteer Application Modal */}
          {showApplyModal && session && (
            <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-stone-900/60 backdrop-blur-sm p-4">
              <div className="relative w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b pb-3">
                  <h3 className="text-lg font-bold text-stone-900 flex items-center gap-2">
                    <span>🙋‍♂️</span> Volunteer Application for Wari
                  </h3>
                  <button
                    onClick={() => setShowApplyModal(false)}
                    className="rounded-full bg-stone-100 p-2 text-xs font-bold text-stone-500 hover:bg-stone-200"
                  >
                    ✕
                  </button>
                </div>
                <VolunteerApplication userId={currentMemberId} application={application} nodes={nodes} />
              </div>
            </div>
          )}

          {/* Fixed SOS Button */}
          <button
            onClick={sendSos}
            className="fixed bottom-5 right-5 z-[1000] rounded-full bg-red-600 px-6 py-4 font-bold text-white shadow-xl hover:bg-red-700 active:scale-95 transition-all"
          >
            SOS
          </button>

          {/* Map & Crowd Density Section */}
          <section className="grid gap-4 p-4 lg:grid-cols-[2fr_1fr]">
            <div id="map" className="h-[520px] rounded-3xl border-4 border-white shadow" />
            <aside className="space-y-4 rounded-3xl bg-white p-4 shadow">
              <h2 className="text-xl font-bold">Report crowd density</h2>
              <select
                className="w-full rounded border p-3"
                value={selectedNode}
                onChange={(e) => setSelectedNode(e.target.value)}
              >
                {nodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.name}
                  </option>
                ))}
              </select>

              <div className="grid grid-cols-3 gap-2">
                {(['low', 'medium', 'high'] as Density[]).map((d) => (
                  <button
                    className="rounded p-3 font-semibold text-white capitalize shadow active:scale-95 transition-all"
                    style={{ background: densityClass[d] }}
                    onClick={() => void reportDensity(d)}
                    key={d}
                  >
                    {d}
                  </button>
                ))}
              </div>

              <ul>
                {latestReports.map(({ node, density }) => (
                  <li className="flex justify-between border-b py-2 text-sm" key={node.id}>
                    <span>{node.name}</span>
                    <b className={density === 'unknown' ? 'text-slate-500' : 'capitalize'}>
                      {density === 'unknown' ? 'no data yet' : density}
                    </b>
                  </li>
                ))}
              </ul>
            </aside>
          </section>

          {/* 3-Column Bottom Panels matching screenshot */}
          <section className="grid gap-4 p-4 md:grid-cols-3">
            {/* Column 1: Peer item lending */}
            <Panel title="Peer item lending">
              <div className="mb-2 flex flex-wrap gap-2">
                {COMMON_ITEM_CHIPS.map((chip) => (
                  <button key={chip} type="button" className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700 hover:bg-orange-100" onClick={() => setItemName(chip)}>
                    {chip}
                  </button>
                ))}
              </div>
              {myActiveRequest && (
                <p className="mb-2 rounded bg-amber-50 p-2 text-xs font-semibold text-amber-800">
                  You already have an active request for {myActiveRequest.item_name}. Complete or cancel it before creating another.
                </p>
              )}
              <div className="flex gap-2">
                <input
                  className="min-w-0 flex-1 rounded border p-2 text-sm"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  placeholder="Need: blanket, water..."
                />
                <button
                  className="rounded bg-orange-600 px-3 text-white text-sm font-semibold hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-stone-300"
                  disabled={Boolean(myActiveRequest)}
                  onClick={() => void requestItem()}
                >
                  Request
                </button>
              </div>
              {sortedPrimaryItems.slice(0, 5).map(({ item: i, distance }, idx) => {
                const requesterMapUrl = directionsUrl(i.lat, i.lng);
                const accepterMapUrl = directionsUrl(i.accepter_lat, i.accepter_lng);
                return (
                <div className="border-b py-2 text-sm text-stone-700" key={i.id ?? idx}>
                  <p>
                    {i.item_name} · <span className="capitalize">{i.status ?? 'open'}</span> · {formatDistance(distance)}{' '}
                    {i.pending && '· pending'}
                  </p>
                  {(i.status ?? 'open') === 'open' && i.requester_id === currentMemberId && (
                    <button className="mt-1 rounded bg-stone-600 px-2 py-1 text-xs text-white font-semibold shadow" onClick={() => void cancelItem(i)}>Cancel</button>
                  )}
                  {(i.status ?? 'open') === 'open' && i.requester_id !== currentMemberId && (
                    <button className="mt-1 rounded bg-green-600 px-2 py-1 text-xs text-white font-semibold shadow" onClick={() => void acceptItem(i)}>Accept</button>
                  )}
                  {i.status === 'accepted' && (i.requester_id === currentMemberId || i.accepted_by === currentMemberId) && (
                    <div className="mt-1 space-y-1 rounded bg-slate-100 p-2 text-xs">
                      <p>{requesterMapUrl ? <a className="font-semibold text-blue-700 underline" href={requesterMapUrl} target="_blank" rel="noreferrer">Navigate to requester</a> : 'Requester location unavailable'}</p>
                      <p>{accepterMapUrl ? <a className="font-semibold text-blue-700 underline" href={accepterMapUrl} target="_blank" rel="noreferrer">Navigate to accepter</a> : 'Accepter location unavailable'}</p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button className="rounded bg-green-700 px-2 py-1 text-white font-semibold shadow" onClick={() => void completeItem(i)}>Mark completed</button>
                        {i.accepted_by === currentMemberId && <button className="rounded bg-amber-600 px-2 py-1 text-white font-semibold shadow" onClick={() => void unacceptItem(i)}>Can't make it</button>}
                      </div>
                    </div>
                  )}
                </div>
              );})}
              {recentActivityItems.length > 0 && (
                <details className="mt-3 text-sm text-stone-600">
                  <summary className="cursor-pointer font-semibold">Recent completed, cancelled, or expired activity</summary>
                  {recentActivityItems.slice(0, 5).map((i, idx) => (
                    <p className="border-b py-2 text-xs" key={i.id ?? idx}>{i.item_name} · {isExpiredOpenRequest(i) ? 'expired' : i.status}</p>
                  ))}
                </details>
              )}
            </Panel>

            {/* Column 2: Lost & found */}
            <Panel title="Lost & found">
              <div className="mb-3 space-y-2 text-sm">
                <input
                  className="w-full rounded border p-2"
                  placeholder="Name"
                  value={registration.name}
                  onChange={(e) => setRegistration({ ...registration, name: e.target.value })}
                />
                <input
                  className="w-full rounded border p-2"
                  placeholder="Phone"
                  value={registration.phone}
                  onChange={(e) => setRegistration({ ...registration, phone: e.target.value })}
                />
                <input
                  className="w-full rounded border p-2"
                  placeholder="Emergency contact"
                  value={registration.emergency}
                  onChange={(e) => setRegistration({ ...registration, emergency: e.target.value })}
                />
                <input
                  className="w-full rounded border p-2"
                  value={registration.groupCode}
                  placeholder="Enter or generate a family group code"
                  onChange={(e) => setRegistration({ ...registration, groupCode: e.target.value })}
                />
                <button type="button" className="w-full rounded bg-stone-100 px-3 py-2 text-stone-700 text-sm font-semibold shadow" onClick={() => setRegistration({ ...registration, groupCode: makeGroupCode() })}>Generate group code</button>
                <input
                  className="w-full rounded border p-2"
                  type="file"
                  accept="image/*"
                  onChange={(e) => setRegistration({ ...registration, photo: e.target.files?.[0] })}
                />
                <button
                  className="w-full rounded bg-orange-600 px-3 py-2 text-white text-sm font-semibold shadow"
                  onClick={() => void registerGroup()}
                >
                  Register group
                </button>
                {registeredGroup && (
                  <p className="text-sm font-semibold text-green-700">Share code: {registeredGroup}</p>
                )}
              </div>
              <input
                className="mb-2 w-full rounded border p-2 text-sm"
                value={groupCode}
                onChange={(e) => setGroupCode(e.target.value)}
                placeholder="Enter your family's group code"
              />
              <label className="mb-2 block text-xs font-semibold text-stone-700">Check-in location
                <select className="mt-1 w-full rounded border p-2 text-sm" value={checkInNode} onChange={(e) => setCheckInNode(e.target.value)}>
                  {nodes.map((node) => <option key={node.id} value={node.id}>{node.id === nearestNodeId ? `${node.name} (nearest)` : node.name}</option>)}
                </select>
              </label>
              <button
                className="w-full rounded bg-amber-600 px-3 py-2 text-white text-sm font-semibold shadow"
                onClick={() => void checkIn()}
              >
                Check in at check-in location
              </button>
              <input
                className="mt-3 w-full rounded border p-2 text-sm"
                value={familyCode}
                onChange={(e) => setFamilyCode(e.target.value)}
                placeholder="Family view group code"
              />
              {familyProfiles.length > 0 && (
                <div className="mt-3 space-y-2 rounded-xl bg-stone-50 p-3">
                  {familyProfiles.map((member) => (
                    <div key={member.id} className="flex items-center gap-2 text-sm">
                      {member.photo_url ? <img src={member.photo_url} alt="" className="h-8 w-8 rounded-full object-cover" /> : <span className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-700">{(member.display_name ?? '?').slice(0, 1)}</span>}
                      <span>{member.display_name ?? 'Unnamed family member'}</span>
                    </div>
                  ))}
                </div>
              )}
              {familySightings.slice(0, 5).map((s, idx) => (
                <p className="border-b py-2 text-sm" key={s.id ?? idx}>
                  {s.note ?? 'Sighting'} {s.pending && '· pending'}
                </p>
              ))}
            </Panel>

            {/* Column 3: Volunteer dashboard & Apply for Volunteer */}
            <Panel title="Volunteer dashboard">
              <div className="space-y-3 text-sm">
                <p className="text-xs text-stone-500">
                  Auth-gated in production; demo shows live active alerts, sightings, and requests.
                </p>

                {/* Apply for Volunteer Button */}
                {session ? (
                  <button
                    onClick={() => setShowApplyModal(true)}
                    className="w-full rounded-xl bg-orange-600 py-2.5 px-3 text-xs font-bold text-white shadow hover:bg-orange-700 transition-all flex items-center justify-center gap-1.5"
                  >
                    ⚡ Apply for Volunteer in Vari
                  </button>
                ) : (
                  <button
                    onClick={() => setNotice({ type: 'error', text: 'Please sign in to use this feature.' })}
                    className="w-full rounded-xl bg-orange-600 py-2.5 px-3 text-xs font-bold text-white shadow hover:bg-orange-700 transition-all flex items-center justify-center gap-1.5"
                  >
                    🔒 Sign in to apply as a volunteer
                  </button>
                )}

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
                  <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 p-4 text-center">
                    <p className="font-medium text-amber-800">Sign in to access volunteer features.</p>
                  </div>
                )}
              </div>
            </Panel>
          </section>
        </div>
      )}
    </main>
  );
}

function VolunteerDashboard({ session, profile, role, approved, loading, nodes, sosAlerts, sightings, setSosAlerts, setSightings }: { session: ReturnType<typeof useSession>['session']; profile: Profile | null; role: string; approved: boolean; loading: boolean; nodes: NodePoint[]; sosAlerts: SosAlert[]; sightings: Sighting[]; setSosAlerts: React.Dispatch<React.SetStateAction<SosAlert[]>>; setSightings: React.Dispatch<React.SetStateAction<Sighting[]>> }) {
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

  if (loading) return <p className="text-sm text-stone-500">Loading access...</p>;
  if (!permitted) return <p className="text-sm text-stone-500">Approved volunteer or admin access is required.</p>;

  return (
    <div className="space-y-3 text-sm">
      <label className="block font-semibold">Node filter
        <select className="mt-1 w-full rounded-xl border p-2 text-sm font-semibold" value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="all">All nodes</option>
          {nodes.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}
        </select>
      </label>
      <div>
        <h3 className="font-bold">SOS alerts</h3>
        {scopedAlerts.slice(0, 5).map((s, idx) => (
          <div className="border-b py-2 text-red-700" key={s.id ?? idx}>
            {s.status} SOS near {nodes.find((n) => n.id === s.node_id)?.name ?? s.node_id}{' '}
            {s.status === 'active' && <button className="ml-2 rounded-lg bg-red-600 px-3 py-1 text-white text-xs font-bold shadow" onClick={() => void resolveSos(s)}>Resolve</button>}
          </div>
        ))}
      </div>
      <div>
        <h3 className="font-bold">Sightings</h3>
        {scopedSightings.slice(0, 5).map((s, idx) => (
          <div className="border-b py-2" key={s.id ?? idx}>
            {s.note ?? 'Sighting'} {s.verified ? '· verified' : <button className="ml-2 rounded-lg bg-green-600 px-3 py-1 text-white text-xs font-bold shadow" onClick={() => void verifySighting(s)}>Verify</button>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Panel({ title, children }: React.PropsWithChildren<{ title: string }>) {
  return (
    <section className="rounded-3xl bg-white p-5 shadow border border-stone-200">
      <h2 className="mb-3 text-xl font-bold text-stone-900">{title}</h2>
      {children}
    </section>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
