import 'leaflet/dist/leaflet.css';
import './style.css';
import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import L from 'leaflet';
import { cacheRows, drainOutbox, getRows, queueWrite } from './db';
import { isSupabaseConfigured, supabase } from './supabase';
import type { CrowdReport, Density, ItemRequest, NodePoint, Sighting, SosAlert } from './types';

const seedNodes: NodePoint[] = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Dehu', lat: 18.7187, lng: 73.7661, sequence_order: 1 },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Pune Halt', lat: 18.5204, lng: 73.8567, sequence_order: 2 },
  { id: '33333333-3333-4333-8333-333333333333', name: 'Saswad', lat: 18.3435, lng: 74.0315, sequence_order: 3 },
  { id: '44444444-4444-4444-8444-444444444444', name: 'Lonand', lat: 18.0402, lng: 74.1883, sequence_order: 4 },
  { id: '55555555-5555-4555-8555-555555555555', name: 'Mukkam - Wakhri', lat: 17.7242, lng: 75.3309, sequence_order: 5 },
  { id: '66666666-6666-4666-8666-666666666666', name: 'Pandharpur', lat: 17.6746, lng: 75.3237, sequence_order: 6 }
];

const densityClass: Record<Density, string> = { low: '#16a34a', medium: '#f59e0b', high: '#dc2626' };
const demoMember = '00000000-0000-4000-8000-000000000001';

function usePosition() {
  const [position, setPosition] = useState<GeolocationPosition>();
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(setPosition, console.warn, { enableHighAccuracy: true });
  }, []);
  return position;
}

function App() {
  const [nodes, setNodes] = useState<NodePoint[]>(seedNodes);
  const [reports, setReports] = useState<CrowdReport[]>([]);
  const [items, setItems] = useState<ItemRequest[]>([]);
  const [sightings, setSightings] = useState<Sighting[]>([]);
  const [sosAlerts, setSosAlerts] = useState<SosAlert[]>([]);
  const [selectedNode, setSelectedNode] = useState('55555555-5555-4555-8555-555555555555');
  const [itemName, setItemName] = useState('');
  const [groupCode, setGroupCode] = useState('WARI-7F2K');
  const position = usePosition();

  useEffect(() => {
    void cacheRows('nodes', seedNodes);
    void Promise.all([
      getRows<CrowdReport>('crowd_reports').then(setReports),
      getRows<ItemRequest>('item_requests').then(setItems),
      getRows<Sighting>('sightings').then(setSightings),
      getRows<SosAlert>('sos_alerts').then(setSosAlerts),
      getRows<NodePoint>('nodes').then((rows) => rows.length && setNodes(rows))
    ]);
    void drainOutbox();
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    void supabase.from('nodes').select('*').order('sequence_order').then(({ data }) => data && cacheRows('nodes', data).then(() => setNodes(data)));
    const channel = supabase.channel('vari-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'crowd_reports' }, (payload) => setReports((r) => [payload.new as CrowdReport, ...r]))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'item_requests' }, (payload) => setItems((r) => [payload.new as ItemRequest, ...r.filter((i) => i.id !== payload.new.id)]))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sightings' }, (payload) => setSightings((r) => [payload.new as Sighting, ...r]))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sos_alerts' }, (payload) => setSosAlerts((r) => [payload.new as SosAlert, ...r]))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    const map = L.map('map', { zoomControl: false }).setView([17.95, 74.7], 8);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, crossOrigin: true }).addTo(map);
    const latest = new Map<string, Density>();
    reports.forEach((r) => !latest.has(r.node_id) && latest.set(r.node_id, r.density));
    nodes.forEach((node) => L.circleMarker([node.lat, node.lng], { radius: 11, color: '#7c2d12', fillColor: densityClass[latest.get(node.id) ?? 'medium'], fillOpacity: 0.9 })
      .bindPopup(`${node.name}: ${latest.get(node.id) ?? 'medium'} crowd`).addTo(map));
    L.polyline(nodes.map((n) => [n.lat, n.lng]), { color: '#ea580c', weight: 4 }).addTo(map);
    return () => map.remove();
  }, [nodes, reports]);

  const latestReports = useMemo(() => nodes.map((node) => ({ node, density: reports.find((r) => r.node_id === node.id)?.density ?? 'medium' as Density })), [nodes, reports]);

  async function reportDensity(density: Density) {
    const payload = { node_id: selectedNode, density, reported_by: demoMember };
    setReports((r) => [{ ...payload, pending: true }, ...r]);
    await queueWrite('crowd_reports', payload);
  }

  async function requestItem() {
    if (!itemName.trim()) return;
    const payload = { requester_id: demoMember, item_name: itemName, lat: position?.coords.latitude, lng: position?.coords.longitude, status: 'open' };
    setItems((r) => [{ ...payload, pending: true } as ItemRequest, ...r]);
    setItemName('');
    await queueWrite('item_requests', payload);
  }

  async function checkIn() {
    const payload = { member_id: demoMember, node_id: selectedNode, reported_by: demoMember, note: `Self check-in for ${groupCode}` };
    setSightings((r) => [{ ...payload, pending: true }, ...r]);
    await queueWrite('sightings', payload);
  }

  async function sendSos() {
    const payload = { member_id: demoMember, node_id: selectedNode, lat: position?.coords.latitude, lng: position?.coords.longitude, status: 'active' };
    setSosAlerts((r) => [{ ...payload, pending: true } as SosAlert, ...r]);
    await queueWrite('sos_alerts', payload, 'sos');
  }

  return <main className="min-h-screen bg-orange-50 text-stone-900">
    <header className="bg-gradient-to-r from-orange-600 to-amber-500 p-5 text-white shadow"><p className="text-sm uppercase tracking-widest">Pandharpur Vari</p><h1 className="text-3xl font-bold">Offline-first Wari Companion</h1><p>Crowd density, lending, lost & found, and SOS updates sync live with Supabase when online.</p></header>
    <button onClick={sendSos} className="fixed bottom-5 right-5 z-[1000] rounded-full bg-red-600 px-6 py-4 font-bold text-white shadow-xl">SOS</button>
    <section className="grid gap-4 p-4 lg:grid-cols-[2fr_1fr]"><div id="map" className="h-[520px] rounded-3xl border-4 border-white shadow" /><aside className="space-y-4 rounded-3xl bg-white p-4 shadow"><h2 className="text-xl font-bold">Report crowd density</h2><select className="w-full rounded border p-3" value={selectedNode} onChange={(e) => setSelectedNode(e.target.value)}>{nodes.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}</select><div className="grid grid-cols-3 gap-2">{(['low','medium','high'] as Density[]).map((d) => <button className="rounded p-3 font-semibold text-white" style={{ background: densityClass[d] }} onClick={() => void reportDensity(d)} key={d}>{d}</button>)}</div><ul>{latestReports.map(({ node, density }) => <li className="flex justify-between border-b py-2" key={node.id}><span>{node.name}</span><b>{density}</b></li>)}</ul></aside></section>
    <section className="grid gap-4 p-4 md:grid-cols-3"><Panel title="Peer item lending"><div className="flex gap-2"><input className="min-w-0 flex-1 rounded border p-2" value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="Need: blanket, water..."/><button className="rounded bg-orange-600 px-3 text-white" onClick={() => void requestItem()}>Request</button></div>{items.slice(0, 5).map((i, idx) => <p className="border-b py-2" key={i.id ?? idx}>{i.item_name} · {i.status ?? 'open'} {i.pending && '· pending'}</p>)}</Panel><Panel title="Lost & found"><input className="mb-2 w-full rounded border p-2" value={groupCode} onChange={(e) => setGroupCode(e.target.value)} /><button className="rounded bg-amber-600 px-3 py-2 text-white" onClick={() => void checkIn()}>Check in at selected node</button>{sightings.slice(0, 5).map((s, idx) => <p className="border-b py-2" key={s.id ?? idx}>{s.note ?? 'Sighting'} {s.pending && '· pending'}</p>)}</Panel><Panel title="Volunteer dashboard"><p className="text-sm">Auth-gated in production; demo shows live active alerts, sightings, and requests.</p>{sosAlerts.slice(0, 5).map((s, idx) => <p className="border-b py-2 text-red-700" key={s.id ?? idx}>Active SOS near {s.node_id} {s.pending && '· queued first'}</p>)}</Panel></section>
  </main>;
}

function Panel({ title, children }: React.PropsWithChildren<{ title: string }>) {
  return <section className="rounded-3xl bg-white p-4 shadow"><h2 className="mb-3 text-xl font-bold">{title}</h2>{children}</section>;
}

createRoot(document.getElementById('root')!).render(<App />);
