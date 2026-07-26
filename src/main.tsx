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
  const { session, userId: currentMemberId, loading: authLoading } = useSession();
  const { profile, role, approved, loading: profileLoading } = useProfile(currentMemberId);
  const { application, loading: applicationLoading } = useVolunteerApplication(currentMemberId);
  
  const [view, setView] = useState<'pilgrim' | 'admin'>(() => location.pathname === '/admin' || location.hash === '#/admin' ? 'admin' : 'pilgrim');
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [nodes, setNodes] = useState<NodePoint[]>(seedNodes);
  const [reports, setReports] = useState<CrowdReport[]>([]);
  const [items, setItems] = useState<ItemRequest[]>([]);
  const [sightings, setSightings] = useState<Sighting[]>([]);
  const [sosAlerts, setSosAlerts] = useState<SosAlert[]>([]);
  const [selectedNode, setSelectedNode] = useState('55555555-5555-4555-8555-555555555555');
  const [itemName, setItemName] = useState('');
  const [groupCode, setGroupCode] = useState('WARI-7F2K');
  const [registration, setRegistration] = useState<Registration>({ name: '', phone: '', emergency: '', groupCode: makeGroupCode() });
  const [registeredGroup, setRegisteredGroup] = useState('');
  const [familyCode, setFamilyCode] = useState('WARI-7F2K');

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
    void supabase.from('nodes').select('*').order('sequence_order').then(({ data }) => data && cacheRows('nodes', data).then(() => setNodes(data)));
    const channel = supabase.channel('vari-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'crowd_reports' }, (p) => setReports((r) => [p.new as CrowdReport, ...r.filter((i) => i.id !== p.new.id && !(i.pending && i.node_id === p.new.node_id && i.density === p.new.density && i.reported_by === p.new.reported_by))]))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'item_requests' }, (p) => { const row = p.new as ItemRequest; setItems((r) => [row, ...r.filter((i) => i.id !== row.id && !(i.pending && i.item_name === row.item_name && i.requester_id === row.requester_id))]); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sightings' }, (p) => setSightings((r) => [p.new as Sighting, ...r.filter((i) => i.id !== p.new.id && !(i.pending && i.member_id === p.new.member_id && i.node_id === p.new.node_id && i.note === p.new.note))]))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sos_alerts' }, (p) => setSosAlerts((r) => [p.new as SosAlert, ...r.filter((i) => i.id !== p.new.id && !(i.pending && i.member_id === p.new.member_id && i.node_id === p.new.node_id && i.status === p.new.status))]))
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
  const familySightings = useMemo(() => sightings.filter((s) => s.group_code === familyCode || (s.note ?? '').includes(familyCode)), [sightings, familyCode]);

  async function reportDensity(density: Density) {
    if (density === 'unknown' || !currentMemberId) return;
    const result = await queueWrite<CrowdReport>('crowd_reports', { node_id: selectedNode, density, reported_by: currentMemberId });
    setReports((r) => [result.serverRecord ?? result.localRecord, ...r.filter((i) => i.id !== result.localRecord.id)]);
  }
  async function requestItem() {
    if (!itemName.trim() || !currentMemberId) return;
    const result = await queueWrite<ItemRequest>('item_requests', { requester_id: currentMemberId, item_name: itemName, lat: position?.coords.latitude, lng: position?.coords.longitude, status: 'open' });
    setItemName(''); setItems((r) => [result.serverRecord ?? result.localRecord, ...r.filter((i) => i.id !== result.localRecord.id)]);
  }
  async function acceptItem(item: ItemRequest) {
    if (!item.id || !currentMemberId || item.requester_id === currentMemberId || !isSupabaseConfigured) return;
    const patch = { status: 'accepted' as const, accepted_by: currentMemberId, accepted_at: new Date().toISOString(), accepter_lat: position?.coords.latitude, accepter_lng: position?.coords.longitude };
    const { data, error } = await supabase.from('item_requests').update(patch).eq('id', item.id).select().single();
    if (!error) setItems((r) => r.map((i) => i.id === item.id ? (data as ItemRequest) : i));
  }
  async function registerGroup() {
    if (!registration.name.trim() || !currentMemberId || !isSupabaseConfigured) return;
    const groupId = crypto.randomUUID();
    let photo_url: string | undefined;
    if (registration.photo) {
      const path = `${groupId}/${currentMemberId}-${registration.photo.name}`;
      const { data } = await supabase.storage.from('member-photos').upload(path, registration.photo, { upsert: true });
      if (data) photo_url = supabase.storage.from('member-photos').getPublicUrl(data.path).data.publicUrl;
    }
    await supabase.from('groups').insert({ id: groupId, group_code: registration.groupCode });
    await supabase.from('profiles').update({ group_id: groupId, display_name: registration.name, phone: registration.phone, emergency_contact: registration.emergency }).eq('id', currentMemberId);
    if (photo_url) console.info('Uploaded profile photo', photo_url);
    setGroupCode(registration.groupCode); setFamilyCode(registration.groupCode); setRegisteredGroup(registration.groupCode);
  }
  async function checkIn() {
    if (!currentMemberId) return;
    const result = await queueWrite<Sighting>('sightings', { member_id: currentMemberId, node_id: selectedNode, reported_by: currentMemberId, group_code: groupCode, note: `Self check-in for ${groupCode}` });
    setSightings((r) => [result.serverRecord ?? result.localRecord, ...r.filter((i) => i.id !== result.localRecord.id)]);
  }
  async function sendSos() {
    if (!currentMemberId) return;
    const result = await queueWrite<SosAlert>('sos_alerts', { member_id: currentMemberId, node_id: selectedNode, lat: position?.coords.latitude, lng: position?.coords.longitude, status: 'active' }, 'sos');
    setSosAlerts((r) => [result.serverRecord ?? result.localRecord, ...r.filter((i) => i.id !== result.localRecord.id)]);
  }

  const activeSosCount = sosAlerts.filter((s) => s.status === 'active').length;

  return (
    <main className="min-h-screen bg-stone-100 text-stone-900">
      <header className="bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 p-4 sm:p-5 text-white shadow-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-500/90 text-2xl font-bold shadow border border-orange-400/40">
              🚩
            </div>
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-widest text-orange-200">
                PANDHARPUR VARI
              </p>
              <h1 className="text-2xl font-extrabold tracking-tight text-white">
                Wari Companion
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-950/40 px-3 py-1 text-xs font-semibold text-emerald-200 border border-emerald-500/30">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /> Live Sync
            </span>
            <span className="rounded-full bg-orange-700/40 px-3 py-1 text-xs font-semibold text-orange-100 border border-orange-400/30">
              👤 Anonymous ID: {currentMemberId ? `${currentMemberId.slice(0, 8)}...` : 'Initializing'}
            </span>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setView('pilgrim')}
                className={`rounded-full px-4 py-2 text-xs font-bold transition-all shadow ${
                  view === 'pilgrim'
                    ? 'bg-white text-orange-600 shadow-md scale-105'
                    : 'bg-orange-700/50 text-white hover:bg-orange-700/80'
                }`}
              >
                ⚡ Pilgrim Companion
              </button>
              <button
                onClick={() => setView('admin')}
                className={`rounded-full px-4 py-2 text-xs font-bold transition-all shadow ${
                  view === 'admin'
                    ? 'bg-white text-orange-600 shadow-md scale-105'
                    : 'bg-orange-700/50 text-white hover:bg-orange-700/80'
                }`}
              >
                ⚡ Admin Dashboard
              </button>
            </div>
          </div>
        </div>
      </header>

      {view === 'admin' ? (
        <div className="p-4 sm:p-6">
          <AdminLogin
            userId={currentMemberId}
            role="admin"
            activeSosCount={activeSosCount}
            registeredProfileCount={4}
            routeStationCount={nodes.length}
          />
        </div>
      ) : (
        <div className="p-4 space-y-4 max-w-7xl mx-auto">
          <div className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 p-4 text-white shadow-md">
            <div>
              <h2 className="text-lg font-bold">Want to serve as a Wari Sevak?</h2>
              <p className="text-xs text-orange-100">
                Join our volunteer team to help manage crowd density, verify lost-and-found check-ins, and respond to SOS calls.
              </p>
            </div>
            <button
              onClick={() => setShowApplyModal(true)}
              className="rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-orange-600 shadow hover:bg-orange-50 active:scale-95 transition-all whitespace-nowrap"
            >
              ⚡ Apply for Volunteer in Vari
            </button>
          </div>

          {showApplyModal && (
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

          <button onClick={sendSos} className="fixed bottom-5 right-5 z-[1000] rounded-full bg-red-600 px-6 py-4 font-bold text-white shadow-xl hover:bg-red-700 transition-all">
            🚨 SOS
          </button>

          <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <div id="map" className="h-[520px] rounded-3xl border-4 border-white shadow" />
            <aside className="space-y-4 rounded-3xl bg-white p-4 shadow">
              <h2 className="text-xl font-bold">Report crowd density</h2>
              <select className="w-full rounded-xl border p-3 text-sm font-semibold" value={selectedNode} onChange={(e) => setSelectedNode(e.target.value)}>
                {nodes.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}
              </select>
              <div className="grid grid-cols-3 gap-2">
                {(['low','medium','high'] as Density[]).map((d) => (
                  <button className="rounded-xl p-3 font-semibold text-white capitalize shadow active:scale-95 transition-all" style={{ background: densityClass[d] }} onClick={() => void reportDensity(d)} key={d}>
                    {d}
                  </button>
                ))}
              </div>
              <ul className="divide-y divide-stone-100">
                {latestReports.map(({ node, density }) => (
                  <li className="flex justify-between py-2 text-sm" key={node.id}>
                    <span className="font-semibold text-stone-800">{node.name}</span>
                    <b className={density === 'unknown' ? 'text-slate-400' : 'capitalize'}>{density === 'unknown' ? 'no data yet' : density}</b>
                  </li>
                ))}
              </ul>
            </aside>
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            <Panel title="Become a Volunteer">
              {applicationLoading ? (
                <p className="text-sm text-stone-500">Loading application...</p>
              ) : (
                <VolunteerApplication userId={currentMemberId} application={application} nodes={nodes} />
              )}
            </Panel>

            <Panel title="Peer item lending">
              <div className="flex gap-2">
                <input className="min-w-0 flex-1 rounded-xl border p-2 text-sm" value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="Need: blanket, water..."/>
                <button className="rounded-xl bg-orange-600 px-4 py-2 font-bold text-white text-sm shadow hover:bg-orange-700" onClick={() => void requestItem()}>Request</button>
              </div>
              {items.slice(0, 5).map((i, idx) => (
                <div className="border-b py-2 text-sm" key={i.id ?? idx}>
                  <p className="font-semibold">{i.item_name} · <span className="capitalize text-orange-600">{i.status ?? 'open'}</span> {i.pending && '· pending'}</p>
                  {i.status === 'open' && i.requester_id !== currentMemberId && (
                    <button className="mt-1 rounded-lg bg-green-600 px-3 py-1 text-xs font-bold text-white shadow" onClick={() => void acceptItem(i)}>Accept</button>
                  )}
                  {i.status === 'accepted' && (i.requester_id === currentMemberId || i.accepted_by === currentMemberId) && (
                    <p className="mt-1 rounded-xl bg-stone-100 p-2 text-xs">
                      Requester: {i.lat?.toFixed(5) ?? 'n/a'}, {i.lng?.toFixed(5) ?? 'n/a'}<br/>
                      Accepter: {i.accepter_lat?.toFixed(5) ?? 'n/a'}, {i.accepter_lng?.toFixed(5) ?? 'n/a'}
                    </p>
                  )}
                </div>
              ))}
            </Panel>

            <Panel title="Lost & found">
              <div className="mb-3 space-y-2 text-sm">
                <input className="w-full rounded-xl border p-2" placeholder="Name" value={registration.name} onChange={(e) => setRegistration({ ...registration, name: e.target.value })}/>
                <input className="w-full rounded-xl border p-2" placeholder="Phone" value={registration.phone} onChange={(e) => setRegistration({ ...registration, phone: e.target.value })}/>
                <input className="w-full rounded-xl border p-2" placeholder="Emergency contact" value={registration.emergency} onChange={(e) => setRegistration({ ...registration, emergency: e.target.value })}/>
                <input className="w-full rounded-xl border p-2" value={registration.groupCode} onChange={(e) => setRegistration({ ...registration, groupCode: e.target.value })}/>
                <input className="w-full rounded-xl border p-2" type="file" accept="image/*" onChange={(e) => setRegistration({ ...registration, photo: e.target.files?.[0] })}/>
                <button className="w-full rounded-xl bg-orange-600 py-2 font-bold text-white shadow" onClick={() => void registerGroup()}>Register group</button>
                {registeredGroup && <p className="text-sm font-semibold text-green-700">Share code: {registeredGroup}</p>}
              </div>
              <input className="mb-2 w-full rounded-xl border p-2 text-sm" value={groupCode} onChange={(e) => setGroupCode(e.target.value)} />
              <button className="w-full rounded-xl bg-amber-600 py-2 font-bold text-white text-sm shadow" onClick={() => void checkIn()}>Check in at selected node</button>
              <input className="mt-3 w-full rounded-xl border p-2 text-sm" value={familyCode} onChange={(e) => setFamilyCode(e.target.value)} placeholder="Family view group code" />
              {familySightings.slice(0, 5).map((s, idx) => <p className="border-b py-2 text-sm" key={s.id ?? idx}>{s.note ?? 'Sighting'} {s.pending && '· pending'}</p>)}
            </Panel>
          </section>

          <section className="grid gap-4">
            <Panel title="Volunteer dashboard">
              <VolunteerDashboard session={session} profile={profile} role={role} approved={approved} loading={authLoading || profileLoading} nodes={nodes} sosAlerts={sosAlerts} sightings={sightings} setSosAlerts={setSosAlerts} setSightings={setSightings} />
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
