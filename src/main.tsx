import 'leaflet/dist/leaflet.css';
import './style.css';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import L from 'leaflet';
import { cacheRows, drainOutbox, getRows, queueWrite } from './db';
import { isSupabaseConfigured, supabase } from './supabase';
import { signOut, useProfile, useSession, useVolunteerApplication } from './auth';
import type { CrowdReport, Density, Group, GroupNode, ItemRequest, LiveLocation, NodePoint, Profile, Sighting, SosAlert, TrafficReport, TrafficStatus, VolunteerApplication as VolunteerAppRecord } from './types';
import { VolunteerApplication } from './components/VolunteerApplication';
import { AdminLogin } from './pages/AdminLogin';
import { AuthModal } from './components/AuthModal';
import { VarkariSosMesh } from './components/VarkariSosMesh';
import { LiveNews } from './components/LiveNews';

const seedNodes: NodePoint[] = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Dehu', lat: 18.7187, lng: 73.7661, sequence_order: 1 },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Pune Halt', lat: 18.5204, lng: 73.8567, sequence_order: 2 },
  { id: '33333333-3333-4333-8333-333333333333', name: 'Saswad', lat: 18.3435, lng: 74.0315, sequence_order: 3 },
  { id: '44444444-4444-4444-8444-444444444444', name: 'Lonand', lat: 18.0402, lng: 74.1883, sequence_order: 4 },
  { id: '55555555-5555-4555-8555-555555555555', name: 'Mukkam - Wakhri', lat: 17.7242, lng: 75.3309, sequence_order: 5 },
  { id: '66666666-6666-4666-8666-666666666666', name: 'Pandharpur', lat: 17.6746, lng: 75.3237, sequence_order: 6 }
];

const densityClass: Record<Density, string> = { unknown: '#94a3b8', low: '#16a34a', medium: '#f59e0b', high: '#dc2626' };
// Severity order lets us pick the worse status when coloring the route between two nodes.
const trafficSeverity: Record<TrafficStatus, number> = { unknown: -1, clear: 0, moderate: 1, heavy: 2, jam: 3 };
const trafficClass: Record<TrafficStatus, string> = { unknown: '#94a3b8', clear: '#16a34a', moderate: '#f59e0b', heavy: '#f97316', jam: '#dc2626' };
const trafficLabel: Record<TrafficStatus, string> = { unknown: 'No data', clear: 'Moving freely', moderate: 'Slow moving', heavy: 'Heavy traffic', jam: 'Jammed' };

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
const makeGroupCode = () => `WARI-${crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`;

function usePosition() {
  const [position, setPosition] = useState<GeolocationPosition>();
  const [geoError, setGeoError] = useState<string | null>(null);
  const watchIdRef = useRef<number | undefined>(undefined);

  useEffect(() => () => {
    if (watchIdRef.current !== undefined) navigator.geolocation?.clearWatch(watchIdRef.current);
  }, []);

  const setManualLocation = (lat: number, lng: number, name = 'Manual Location') => {
    const mockPosition = {
      coords: {
        latitude: lat,
        longitude: lng,
        accuracy: 10,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null
      },
      timestamp: Date.now()
    } as GeolocationPosition;
    setPosition(mockPosition);
    setGeoError(null);
  };

  const requestLocation = useCallback(() => {
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError('Geolocation API is not supported in this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition(pos);
        setGeoError(null);
        if (watchIdRef.current === undefined) {
          watchIdRef.current = navigator.geolocation.watchPosition(
            (nextPosition) => { setPosition(nextPosition); setGeoError(null); },
            (nextError) => setGeoError(nextError.message),
            { enableHighAccuracy: true, maximumAge: 10_000 }
          );
        }
      },
      (err) => {
        console.warn('Geolocation error:', err);
        if (err.code === 1) {
          setGeoError('Location permission denied in browser settings. Please enable location permission or select your route station manually below.');
        } else if (location.protocol === 'http:' && location.hostname !== 'localhost') {
          setGeoError('Mobile browsers require HTTPS for GPS. Open via HTTPS or select route station manually below.');
        } else {
          setGeoError(`GPS error (${err.message}). Select route location manually below.`);
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  }, []);

  return { position, requestLocation, geoError, setManualLocation };
}

type AppView = 'pilgrim' | 'news' | 'sos_mesh' | 'admin';

function App() {
  const { session, userId: currentMemberId, loading: authLoading, error: authError } = useSession();
  const { profile, role, approved, loading: profileLoading, error: profileError } = useProfile(currentMemberId);
  const { application, loading: applicationLoading, error: applicationError } = useVolunteerApplication(currentMemberId);
  
  const [view, setView] = useState<AppView>(() => {
    if (location.hash === '#/news') return 'news';
    if (location.hash === '#/sos' || location.hash === '#/sos-mesh') return 'sos_mesh';
    if (location.pathname === '/admin' || location.hash === '#/admin') return 'admin';
    return 'pilgrim';
  });

  useEffect(() => {
    const handleHashChange = () => {
      if (location.hash === '#/news') setView('news');
      else if (location.hash === '#/sos' || location.hash === '#/sos-mesh') setView('sos_mesh');
      else if (location.pathname === '/admin' || location.hash === '#/admin') setView('admin');
      else setView('pilgrim');
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const changeView = (nextView: AppView) => {
    setView(nextView);
    if (nextView === 'admin') window.location.hash = '#/admin';
    else if (nextView === 'sos_mesh') window.location.hash = '#/sos';
    else if (nextView === 'news') window.location.hash = '#/news';
    else window.location.hash = '#/';
  };
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [nodes, setNodes] = useState<NodePoint[]>(seedNodes);
  const [reports, setReports] = useState<CrowdReport[]>([]);
  const [trafficReports, setTrafficReports] = useState<TrafficReport[]>([]);
  const [groupNodes, setGroupNodes] = useState<GroupNode[]>([]);
  const [items, setItems] = useState<ItemRequest[]>([]);
  const [sightings, setSightings] = useState<Sighting[]>([]);
  const [sosAlerts, setSosAlerts] = useState<SosAlert[]>([]);
  const [selectedNode, setSelectedNode] = useState('');
  const [checkInNode, setCheckInNode] = useState('');
  const [itemName, setItemName] = useState('');
  const [groupCode, setGroupCode] = useState('');
  const [registration, setRegistration] = useState<Registration>(() => ({ name: '', phone: '', emergency: '', groupCode: makeGroupCode() }));
  const [registeredGroup, setRegisteredGroup] = useState('');
  const [familyCode, setFamilyCode] = useState('');
  const [registeredProfileCount, setRegisteredProfileCount] = useState(0);
  const [familyProfiles, setFamilyProfiles] = useState<Profile[]>([]);
  const [liveLocations, setLiveLocations] = useState<LiveLocation[]>([]);
  const [locationError, setLocationError] = useState('');
  const [groupAction, setGroupAction] = useState<'create' | 'join'>('create');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string }>();
  const [activePanel, setActivePanel] = useState<'lending' | 'lost' | 'volunteer'>('lending');
  const [showDensitySheet, setShowDensitySheet] = useState(false);
  const [showTrafficSheet, setShowTrafficSheet] = useState(false);
  const [showAddNodeSheet, setShowAddNodeSheet] = useState(false);
  const [newNodeName, setNewNodeName] = useState('');
  const [lostTab, setLostTab] = useState<'register' | 'find'>('register');
  const [guestLanguage, setGuestLanguage] = useState<'en' | 'mr'>('en');
  const guestCopy = guestLanguage === 'mr'
    ? {
      title: 'सुरक्षित वारी प्रवासाची योजना करा',
      description: 'मार्ग आणि गर्दीची माहिती पाहा, स्वयंसेवक अर्ज करा, किंवा आपल्या वारकरी गटाशी समन्वय साधण्यासाठी साइन इन करा.',
      authRequired: 'Peer lending, group coordination, live location sharing आणि इतर वैयक्तिक सुविधा वापरण्यासाठी साइन इन आवश्यक आहे.',
      signIn: 'वारकरी साइन इन / साइन अप',
      news: '📰 थेट वारी बातम्या',
      volunteer: 'स्वयंसेवक अर्ज',
    }
    : {
      title: 'Plan a safer Wari journey',
      description: 'View the route and crowd density, apply to volunteer, or sign in to coordinate with your pilgrim group.',
      authRequired: 'Sign in is required for peer lending, group coordination, live location sharing, and other personalized features.',
      signIn: 'Pilgrim sign in / sign up',
      news: '📰 Live Wari News',
      volunteer: 'Volunteer application',
    };

  const { position, requestLocation, geoError, setManualLocation } = usePosition();
  const mapRef = useRef<L.Map | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const routeRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!session && activePanel === 'lending') setActivePanel('lost');
  }, [session, activePanel]);

  useEffect(() => {
    void cacheRows('nodes', seedNodes);
    void Promise.all([
      getRows<CrowdReport>('crowd_reports').then(setReports), getRows<ItemRequest>('item_requests').then(setItems),
      getRows<TrafficReport>('traffic_reports').then(setTrafficReports), getRows<GroupNode>('group_nodes').then(setGroupNodes),
      getRows<Sighting>('sightings').then(setSightings), getRows<SosAlert>('sos_alerts').then(setSosAlerts),
      getRows<NodePoint>('nodes').then((rows) => rows.length && setNodes(rows))
    ]);
    void drainOutbox();
  }, []);

  useEffect(() => {
    if (!profile?.group_id || !isSupabaseConfigured) return;
    void supabase.from('groups').select('group_code').eq('id', profile.group_id).maybeSingle()
      .then(({ data }) => {
        if (data?.group_code) {
          setGroupCode(data.group_code);
          setFamilyCode(data.group_code);
          setRegisteredGroup(data.group_code);
        }
      });
  }, [profile?.group_id]);

  // Permission is granted per browser origin, not per group. Start tracking as
  // soon as a signed-in pilgrim opens the dashboard so a previously granted
  // permission is actually used (rather than only being checked by the UI).
  useEffect(() => {
    if (!session || position || geoError || !navigator.geolocation) return;
    requestLocation();
  }, [session, position, geoError, requestLocation]);

  useEffect(() => {
    if (!session || !currentMemberId || !position || !isSupabaseConfigured) return;
    const publish = async () => {
      const { error } = await supabase.from('live_locations').upsert({
        user_id: currentMemberId,
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });
      if (error) {
        setLocationError(`Could not publish your location: ${error.message}`);
        return;
      }
      setLocationError('');
      // Reflect this device immediately. Realtime can be disabled or delayed
      // in a local Supabase project, so it must not be required for the
      // dashboard to show the current pilgrim as sharing.
      setLiveLocations((locations) => {
        const mine: LiveLocation = {
          user_id: currentMemberId,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          updated_at: new Date().toISOString()
        };
        return [mine, ...locations.filter((location) => location.user_id !== currentMemberId)];
      });
    };
    publish();
    const interval = window.setInterval(publish, 30_000);
    return () => window.clearInterval(interval);
  }, [session, currentMemberId, position]);

  useEffect(() => {
    if (!session || !isSupabaseConfigured) { setLiveLocations([]); setLocationError(''); return; }
    let active = true;
    const loadLocations = async () => {
      const { data, error } = await supabase.from('live_locations').select('user_id, lat, lng, accuracy, updated_at');
      if (!active) return;
      if (error) {
        setLocationError(error.message);
        return;
      }
      setLocationError('');
      setLiveLocations((data ?? []) as LiveLocation[]);
    };
    loadLocations();
    const channel = supabase.channel(`live-locations-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_locations' }, loadLocations)
      .subscribe();
    // Refresh periodically as a fallback when a network or Realtime reconnect
    // misses a location update.
    const interval = window.setInterval(loadLocations, 30_000);
    return () => {
      active = false;
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [session, profile?.group_id]);

  useEffect(() => {
    void supabase.from('nodes').select('*').order('sequence_order').then(({ data }) => {
      if (data && data.length > 0) {
        void cacheRows('nodes', data).then(() => setNodes(data));
      } else {
        void supabase.from('nodes').upsert(seedNodes).then(() => setNodes(seedNodes));
      }
    });
    void supabase.from('traffic_reports').select('*').order('created_at', { ascending: false }).then(({ data }) => data && (void cacheRows('traffic_reports', data), setTrafficReports(data as TrafficReport[])));
    void supabase.from('profiles').select('*', { count: 'exact', head: true }).then(({ count }) => setRegisteredProfileCount(count ?? 0));
    const channel = supabase.channel(`vari-live-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'crowd_reports' }, (p) => setReports((r) => [p.new as CrowdReport, ...r.filter((i) => i.id !== p.new.id && !(i.pending && i.node_id === p.new.node_id && i.density === p.new.density && i.reported_by === p.new.reported_by))]))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'traffic_reports' }, (p) => setTrafficReports((r) => [p.new as TrafficReport, ...r.filter((i) => i.id !== p.new.id && !(i.pending && i.node_id === p.new.node_id && i.status === p.new.status && i.reported_by === p.new.reported_by))]))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'item_requests' }, (p) => { const row = p.new as ItemRequest; setItems((r) => [row, ...r.filter((i) => i.id !== row.id && !(i.pending && i.item_name === row.item_name && i.requester_id === row.requester_id))]); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sightings' }, (p) => setSightings((r) => [p.new as Sighting, ...r.filter((i) => i.id !== p.new.id && !(i.pending && i.member_id === p.new.member_id && i.node_id === p.new.node_id && i.note === p.new.note))]))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sos_alerts' }, (p) => setSosAlerts((r) => [p.new as SosAlert, ...r.filter((i) => i.id !== p.new.id && !(i.pending && i.member_id === p.new.member_id && i.node_id === p.new.node_id && i.status === p.new.status))]))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'profiles' }, () => setRegisteredProfileCount((count) => count + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nodes' }, () => void supabase.from('nodes').select('*').order('sequence_order').then(({ data }) => data && setNodes(data as NodePoint[])))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (view === 'sos_mesh') return;
    const mapElement = document.getElementById('map');
    if (!mapElement) return;

    if (mapRef.current && mapRef.current.getContainer() !== mapElement) {
      mapRef.current.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
      routeRef.current = null;
    }

    if (!mapRef.current) {
      mapRef.current = L.map('map', { zoomControl: false, attributionControl: true }).setView([17.95, 74.7], 8);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 18, crossOrigin: true }).addTo(mapRef.current);
      markerLayerRef.current = L.layerGroup().addTo(mapRef.current);
    }
    const latest = new Map<string, Density>();
    reports.forEach((r) => !latest.has(r.node_id) && latest.set(r.node_id, r.density));
    const latestTraffic = new Map<string, TrafficStatus>();
    trafficReports.forEach((r) => !latestTraffic.has(r.node_id) && latestTraffic.set(r.node_id, r.status));
    markerLayerRef.current?.clearLayers();
    nodes.forEach((node) => L.circleMarker([node.lat, node.lng], { radius: 11, color: '#7c2d12', fillColor: densityClass[latest.get(node.id) ?? 'unknown'], fillOpacity: 0.9 })
      .bindPopup(`${node.name}: ${latest.get(node.id) ?? 'no data'} crowd · traffic ${trafficLabel[latestTraffic.get(node.id) ?? 'unknown'].toLowerCase()}`).addTo(markerLayerRef.current!));
    if (session) {
      liveLocations.forEach((live) => {
        const mine = live.user_id === currentMemberId;
        // Keep the map privacy boundary in the UI as well as RLS. This also
        // prevents a stale/cached response from showing another group's dot.
        const isGroupMember = familyProfiles.some((member) => member.id === live.user_id);
        if (!mine && role !== 'admin' && !isGroupMember) return;
        const memberName = familyProfiles.find((member) => member.id === live.user_id)?.display_name || 'Group member';
        L.circleMarker([live.lat, live.lng], { radius: mine ? 8 : 5, color: mine ? '#1d4ed8' : '#7c3aed', fillColor: mine ? '#60a5fa' : '#c4b5fd', fillOpacity: 1 })
          .bindPopup(mine ? 'Your live location' : role === 'admin' ? 'Pilgrim live location' : `${memberName}'s live location`)
          .addTo(markerLayerRef.current!);
      });
      // Group-private nodes only ever render for a signed-in member of that
      // group; RLS on group_nodes already guarantees the fetched list can't
      // contain another group's points.
      groupNodes.forEach((node) => L.marker([node.lat, node.lng], {
        icon: L.divIcon({ className: '', html: '<div style="background:#7c3aed;color:#fff;border-radius:9999px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 1px 4px rgba(0,0,0,.4)">📌</div>', iconSize: [26, 26], iconAnchor: [13, 13] })
      })
        .bindPopup(`<strong>${node.name}</strong><br/>Visible to your group only${node.created_by === currentMemberId ? '<br/><button id="remove-node-' + node.id + '" style="margin-top:6px;color:#dc2626;font-weight:700;font-size:12px">Remove</button>' : ''}`)
        .on('popupopen', () => {
          if (node.created_by !== currentMemberId) return;
          document.getElementById(`remove-node-${node.id}`)?.addEventListener('click', () => void removeGroupNode(node), { once: true });
        })
        .addTo(markerLayerRef.current!));
    }
    routeRef.current?.remove();
    routeRef.current = L.layerGroup().addTo(mapRef.current);
    for (let i = 0; i < nodes.length - 1; i++) {
      const from = nodes[i];
      const to = nodes[i + 1];
      // Color each stretch of the route by the worse of its two endpoints'
      // latest traffic report, so a jam anywhere along a segment stands out.
      const fromStatus = latestTraffic.get(from.id) ?? 'unknown';
      const toStatus = latestTraffic.get(to.id) ?? 'unknown';
      const worse = trafficSeverity[fromStatus] >= trafficSeverity[toStatus] ? fromStatus : toStatus;
      const color = worse === 'unknown' ? '#ea580c' : trafficClass[worse];
      L.polyline([[from.lat, from.lng], [to.lat, to.lng]], { color, weight: 5 })
        .bindPopup(`${from.name} → ${to.name}: ${trafficLabel[worse]}`)
        .addTo(routeRef.current);
    }
    window.requestAnimationFrame(() => mapRef.current?.invalidateSize());
  }, [view, nodes, reports, trafficReports, groupNodes, liveLocations, session, currentMemberId, role, familyProfiles]);

  const latestReports = useMemo(() => nodes.map((node) => ({ node, density: reports.find((r) => r.node_id === node.id)?.density ?? 'unknown' as Density })), [nodes, reports]);
  const latestTrafficReports = useMemo(() => nodes.map((node) => ({ node, status: trafficReports.find((r) => r.node_id === node.id)?.status ?? 'unknown' as TrafficStatus })), [nodes, trafficReports]);
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
    if (!isSupabaseConfigured || !profile?.group_id) { setFamilyProfiles([]); return; }
    let active = true;
    void supabase.from('profiles').select('*').eq('group_id', profile.group_id).order('display_name').then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setLocationError(error.message);
        return;
      }
      setFamilyProfiles((data ?? []) as Profile[]);
    });
    return () => { active = false; };
  }, [profile?.group_id]);

  // Group-private nodes ("our tent", family meeting point, etc). RLS already
  // scopes reads to the caller's own group, but we also gate the query itself
  // so a signed-out or group-less pilgrim never issues it.
  useEffect(() => {
    if (!profile?.group_id || !isSupabaseConfigured) { setGroupNodes([]); return; }
    let active = true;
    const loadGroupNodes = async () => {
      const { data, error } = await supabase.from('group_nodes').select('*').eq('group_id', profile.group_id).order('created_at', { ascending: false });
      if (!active || error) return;
      void cacheRows('group_nodes', data ?? []);
      setGroupNodes((data ?? []) as GroupNode[]);
    };
    void loadGroupNodes();
    const channel = supabase.channel(`group-nodes-${profile.group_id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_nodes', filter: `group_id=eq.${profile.group_id}` }, loadGroupNodes)
      .subscribe();
    return () => { active = false; void supabase.removeChannel(channel); };
  }, [profile?.group_id]);

  async function reportDensity(density: Density) {
    if (!session) {
      setNotice({ type: 'error', text: 'Please sign in to use this feature.' });
      return;
    }
    if (role !== 'admin') {
      setNotice({ type: 'error', text: 'Only admins can report crowd density.' });
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
  async function reportTraffic(status: TrafficStatus) {
    if (!session) {
      setNotice({ type: 'error', text: 'Please sign in to use this feature.' });
      return;
    }
    if (role !== 'admin') {
      setNotice({ type: 'error', text: 'Only admins can report traffic status.' });
      return;
    }
    if (status === 'unknown' || !currentMemberId || !selectedNode) {
      setNotice({ type: 'error', text: 'Choose a route node before reporting traffic.' });
      return;
    }
    const result = await queueWrite<TrafficReport>('traffic_reports', { node_id: selectedNode, status, reported_by: currentMemberId });
    setTrafficReports((r) => [result.serverRecord ?? result.localRecord, ...r.filter((i) => i.id !== result.localRecord.id)]);
    setNotice({ type: 'success', text: 'Traffic status saved.' });
  }
  async function addGroupNode() {
    if (!session) {
      setNotice({ type: 'error', text: 'Please sign in to use this feature.' });
      return;
    }
    if (!profile?.group_id) {
      setNotice({ type: 'error', text: 'Join or create a group before adding a group node.' });
      return;
    }
    if (!newNodeName.trim() || !position || !currentMemberId) {
      setNotice({ type: 'error', text: 'Enter a name and share your location before adding a node.' });
      return;
    }
    const result = await queueWrite<GroupNode>('group_nodes', {
      group_id: profile.group_id,
      name: newNodeName.trim(),
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      created_by: currentMemberId
    });
    setGroupNodes((r) => [result.serverRecord ?? result.localRecord, ...r.filter((i) => i.id !== result.localRecord.id)]);
    setNewNodeName('');
    setNotice({ type: 'success', text: 'Node added — only your group can see it.' });
  }
  async function removeGroupNode(node: GroupNode) {
    if (!node.id || !isSupabaseConfigured) return;
    const { error } = await supabase.from('group_nodes').delete().eq('id', node.id);
    if (error) {
      setNotice({ type: 'error', text: error.message });
      return;
    }
    setGroupNodes((r) => r.filter((n) => n.id !== node.id));
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
    if (item.status === 'accepted' || item.status === 'completed' || item.status === 'cancelled') {
      setNotice({ type: 'error', text: 'This request has already been accepted or is no longer open.' });
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
      setNotice({ type: 'error', text: 'Enter a group code.' });
      return;
    }

    let groupId: string;
    const existing = await supabase.from('groups').select('id').eq('group_code', normalizedGroupCode).maybeSingle();
    if (existing.error) {
      setNotice({ type: 'error', text: existing.error.message });
      return;
    }
    if (existing.data?.id) {
      if (groupAction === 'create') {
        setNotice({ type: 'error', text: 'That group code is already in use. Generate another code or choose Join group.' });
        return;
      }
      groupId = existing.data.id;
    } else {
      if (groupAction === 'join') {
        setNotice({ type: 'error', text: 'We could not find that group code. Check it or create a new group.' });
        return;
      }
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
    setNotice({ type: 'success', text: groupAction === 'join' ? 'Joined group successfully.' : 'Group created successfully. Share the code with your pilgrims.' });
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
    changeView('sos_mesh');
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

  return (
    <main className="min-h-screen bg-saffron-50 text-stone-900">
      <AuthModal open={showAuthModal} onClose={() => setShowAuthModal(false)} />
      <header className="bg-stone-950 px-4 py-3 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3"><div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center text-xl">🚩</span><div><h1 className="text-base font-extrabold leading-tight">Wari Companion</h1><p className="text-xs font-semibold uppercase tracking-widest text-stone-400">Pandharpur Vari</p></div></div><nav className="hidden lg:flex items-center gap-1"><button onClick={() => changeView('pilgrim')} className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${view === 'pilgrim' ? 'bg-saffron-600 text-white' : 'text-stone-300 hover:bg-stone-800 hover:text-white'}`}>Pilgrim view</button><button onClick={() => changeView('news')} className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${view === 'news' ? 'bg-saffron-600 text-white' : 'text-stone-300 hover:bg-stone-800 hover:text-white'}`}>📰 Live News</button><button onClick={() => changeView('sos_mesh')} className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${view === 'sos_mesh' ? 'bg-red-600 text-white' : 'text-red-400 hover:bg-red-900/40'}`}>SOS mesh</button><button onClick={() => changeView('admin')} className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${view === 'admin' ? 'bg-saffron-600 text-white' : 'text-stone-300 hover:bg-stone-800 hover:text-white'}`}>Admin</button></nav>{session ? <button onClick={() => void handleSignOut()} className="flex h-8 w-8 items-center justify-center rounded-full bg-saffron-600 text-xs font-bold text-white">{(profile?.display_name ?? session.user.email ?? '?').slice(0, 2).toUpperCase()}</button> : <button onClick={() => setShowAuthModal(true)} className="rounded-lg bg-stone-800 px-3 py-1.5 text-xs font-semibold text-stone-300">Sign in</button>}</div>
      </header>
      {(notice || authError || profileError || applicationError) && <div className={`mx-4 mt-3 rounded-xl border p-3 text-sm font-semibold ${notice?.type === 'success' ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'}`}>{notice?.text ?? authError ?? profileError ?? applicationError}</div>}
      {view === 'admin' ? <div className="min-h-screen bg-saffron-50 px-4 py-3 pb-20 lg:px-8 lg:pb-4"><h2 className="mb-3 text-xl font-extrabold text-stone-900">Admin dashboard</h2>{role === 'admin' && <><p className="mb-3 text-sm text-stone-600">Live locations for all pilgrims who have granted device permission.</p><div id="map" className="mb-4 h-[320px] w-full overflow-hidden rounded-2xl bg-cream-100" /></>}<AdminLogin userId={currentMemberId} userEmail={session?.user?.email} role={role} activeSosCount={activeSosCount} registeredProfileCount={registeredProfileCount} routeStationCount={nodes.length} nodes={nodes} onNodesChange={setNodes} /></div> : view === 'news' ? <div className="min-h-screen bg-saffron-50 p-4 pb-20 max-w-7xl mx-auto lg:p-6"><LiveNews /></div> : view === 'sos_mesh' ? <div className="min-h-screen bg-stone-950 pb-20 lg:pb-4"><VarkariSosMesh currentMemberId={currentMemberId} profile={profile} position={position} nodes={nodes} nearestNodeId={nearestNodeId} onSosCreated={(newAlert) => setSosAlerts((prev) => [newAlert, ...prev])} onRequestLocationPermission={requestLocation} geoError={geoError} onSetManualLocation={setManualLocation} /></div> : <div className="pb-20 lg:pb-4">
        {activeSosCount > 0 && <div className="sticky top-0 z-40 flex items-center justify-between bg-red-600 px-4 py-3 text-white"><span className="flex items-center text-sm font-bold"><span className="mr-2 h-2.5 w-2.5 animate-pulse rounded-full bg-white" />{activeSosCount} active alert{activeSosCount === 1 ? '' : 's'}</span><button onClick={() => changeView('sos_mesh')} className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-bold">View →</button></div>}
        {session && !position && <div className="mx-4 mt-4 flex items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950"><span>Share your device location to show your live dot to your group.</span><button onClick={requestLocation} className="shrink-0 rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white">Allow location</button></div>}
        {!session && <section className="mx-4 mt-4 rounded-2xl bg-stone-950 p-5 text-white lg:mx-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-extrabold">{guestCopy.title}</h2><p className="mt-1 text-sm text-stone-300">{guestCopy.description}</p></div><div className="flex rounded-xl border border-stone-700 bg-stone-900 p-1" aria-label="Translate page language"><button type="button" onClick={() => setGuestLanguage('en')} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${guestLanguage === 'en' ? 'bg-saffron-600 text-white' : 'text-stone-300'}`}>English</button><button type="button" onClick={() => setGuestLanguage('mr')} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${guestLanguage === 'mr' ? 'bg-saffron-600 text-white' : 'text-stone-300'}`}>मराठी</button></div></div><p className="mt-3 rounded-xl border border-saffron-500/30 bg-saffron-500/10 p-3 text-sm font-semibold text-saffron-100">{guestCopy.authRequired}</p><div className="mt-4 flex flex-wrap gap-2"><button onClick={() => setShowAuthModal(true)} className="rounded-xl bg-saffron-600 px-4 py-2 text-sm font-bold">{guestCopy.signIn}</button><button onClick={() => changeView('news')} className="rounded-xl bg-stone-800 border border-stone-700 px-4 py-2 text-sm font-bold text-white">{guestCopy.news}</button><button onClick={() => setShowApplyModal(true)} className="rounded-xl border border-stone-600 px-4 py-2 text-sm font-bold">{guestCopy.volunteer}</button></div></section>}<div className="lg:grid lg:grid-cols-[2fr_1fr] lg:gap-4 lg:p-4"><div className="space-y-3"><div className="relative mx-4 h-[240px] overflow-hidden rounded-2xl lg:mx-0 lg:h-[400px]"><div id="map" className="h-full w-full bg-cream-100" /><div className="absolute bottom-3 right-3 flex flex-col items-end gap-2">{role === 'admin' && <button onClick={() => setShowTrafficSheet(true)} className="min-h-[44px] rounded-xl bg-stone-900 px-3 py-2 text-xs font-bold text-white shadow-sm">🚦 Report traffic</button>}{role === 'admin' && <button onClick={() => setShowDensitySheet(true)} className="min-h-[44px] rounded-xl bg-saffron-600 px-3 py-2 text-xs font-bold text-white shadow-sm">Report density</button>}{session && profile?.group_id && <button onClick={() => setShowAddNodeSheet(true)} className="min-h-[44px] rounded-xl bg-violet-600 px-3 py-2 text-xs font-bold text-white shadow-sm">📌 Add group node</button>}</div></div><div className="flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-hide lg:hidden">{latestReports.map(({node,density}) => <div key={node.id} className={`w-[140px] flex-shrink-0 rounded-2xl border border-cream-200 border-l-4 bg-white p-3 shadow-sm ${density === 'high' ? 'border-l-red-600' : density === 'medium' ? 'border-l-amber-500' : 'border-l-green-600'}`}><p className="truncate text-sm font-extrabold text-stone-900">{node.name}</p><span className={`mt-2 inline-block rounded-full px-2.5 py-1 text-xs font-bold ${density === 'high' ? 'bg-red-50 text-red-700' : density === 'medium' ? 'bg-amber-50 text-amber-700' : density === 'low' ? 'bg-green-50 text-green-600' : 'bg-cream-100 text-stone-500'}`}>{density === 'unknown' ? 'No data' : density}</span></div>)}</div><div className="flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-hide lg:hidden">{latestTrafficReports.map(({node,status}) => <div key={node.id} className="w-[140px] flex-shrink-0 rounded-2xl border border-cream-200 border-l-4 bg-white p-3 shadow-sm" style={{ borderLeftColor: trafficClass[status] }}><p className="truncate text-sm font-extrabold text-stone-900">{node.name}</p><span className="mt-2 inline-block rounded-full px-2.5 py-1 text-xs font-bold" style={{ backgroundColor: `${trafficClass[status]}1a`, color: trafficClass[status] }}>{trafficLabel[status]}</span></div>)}</div><div className="mx-4 lg:mx-0"><button onClick={() => changeView('news')} className="flex min-h-[52px] w-full items-center justify-between rounded-2xl border border-saffron-300 bg-saffron-100/90 px-4 py-3 text-left shadow-2xs hover:bg-saffron-200/80 transition-all"><span className="flex items-center gap-2.5 font-extrabold text-stone-900 text-sm"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-saffron-600 text-white text-xs">📰</span><span>Live Wari News & Traffic Updates</span></span><span className="rounded-xl bg-saffron-600 px-3 py-1.5 text-xs font-bold text-white">View News Tab →</span></button></div><section className="mx-4 overflow-hidden rounded-2xl border border-cream-200 bg-white lg:mx-0 lg:grid lg:grid-cols-3 lg:gap-4 lg:border-0 lg:bg-transparent">
          {(session ? ([['lending','🤝','Peer lending'],['lost','🔎','Lost & found'],['volunteer','🙋','Volunteer application']] as const) : ([['lost','🔎','Lost & found'],['volunteer','🙋','Volunteer application']] as const)).map(([key,icon,title]) => <div key={key} className="border-b border-cream-200 last:border-0 lg:rounded-2xl lg:border lg:border-cream-200 lg:bg-white lg:p-4 lg:shadow-sm"><button onClick={() => setActivePanel(key)} className="flex min-h-[48px] w-full items-center justify-between px-4 py-3 lg:pointer-events-none lg:px-0 lg:py-0"><span className="flex items-center gap-2 text-sm font-extrabold text-stone-900"><span>{icon}</span>{title}</span><span className={`text-stone-400 transition-transform duration-200 lg:hidden ${activePanel === key ? 'rotate-180' : ''}`}>⌄</span></button><div className={`overflow-hidden transition-all duration-200 ease-out ${activePanel === key ? 'max-h-[700px]' : 'max-h-0'} lg:max-h-[900px]`}><div className="px-4 pb-4 pt-2 lg:px-0">{key === 'lending' ? <><div className="mb-3 flex gap-2 overflow-x-auto pb-2 scrollbar-hide">{['Water','Food','Torch','Medicine','Blanket','First Aid'].map(chip => <button key={chip} onClick={() => setItemName(chip)} className={`flex-shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${itemName === chip ? 'border-saffron-600 bg-saffron-600 text-white' : 'border-cream-200 bg-saffron-50 text-stone-600'}`}>{chip}</button>)}</div><label className="mb-1.5 block text-xs font-semibold text-stone-600">What do you need?</label><input className="w-full min-h-[44px] rounded-xl border border-cream-200 bg-saffron-50 px-3.5 py-3 text-sm text-stone-900 placeholder:text-stone-400 focus:border-saffron-600 focus:ring-2 focus:ring-saffron-600/20 focus:outline-none" value={itemName} onChange={e => setItemName(e.target.value)} placeholder="e.g. water bottle, torch..."/><button disabled={Boolean(myActiveRequest)} onClick={() => void requestItem()} className="mt-3 w-full min-h-[48px] rounded-xl bg-saffron-600 py-3 text-sm font-bold text-white shadow-sm disabled:opacity-60">Request item</button><div className="mt-3 space-y-2">{sortedPrimaryItems.slice(0,3).map(({item:i},idx) => <div key={i.id ?? idx} className="flex items-center justify-between rounded-xl bg-saffron-50 px-3 py-2"><span className="text-xs font-semibold text-stone-800">{i.item_name}</span><div className="flex items-center gap-2">{i.status !== 'accepted' && i.requester_id !== currentMemberId && <button onClick={() => void acceptItem(i)} className="rounded-lg border border-saffron-600 px-2.5 py-1 text-xs font-bold text-saffron-600">Offer</button>}{i.status === 'accepted' && i.accepted_by === currentMemberId && <><button onClick={() => void completeItem(i)} className="rounded-lg border border-saffron-600 px-2.5 py-1 text-xs font-bold text-saffron-600">Mark complete</button><button onClick={() => void unacceptItem(i)} className="text-xs font-bold text-stone-500">Cancel</button></>}{i.status === 'accepted' && i.requester_id === currentMemberId && <span className="text-xs font-semibold text-stone-500">Accepted — help is on the way</span>}{i.status === 'accepted' && i.accepted_by !== currentMemberId && i.requester_id !== currentMemberId && <span className="text-xs font-semibold text-stone-500">Already being helped</span>}{i.requester_id === currentMemberId && i.status === 'open' && <button onClick={() => void cancelItem(i)} className="text-xs font-bold text-stone-500">Cancel request</button>}</div></div>)}</div></> : key === 'lost' ? <GroupPanel session={session} profile={profile} groupAction={groupAction} setGroupAction={setGroupAction} registration={registration} setRegistration={setRegistration} registeredGroup={registeredGroup} familyProfiles={familyProfiles} liveLocations={liveLocations} locationError={locationError} onSubmit={() => void registerGroup()} /> : <><button onClick={() => setShowApplyModal(true)} className="w-full min-h-[48px] rounded-xl bg-saffron-600 py-3 text-sm font-bold text-white shadow-sm">Apply for Seva ⚡</button>{session ? <VolunteerDashboard session={session} profile={profile} role={role} approved={approved} loading={authLoading || profileLoading} nodes={nodes} sosAlerts={sosAlerts} sightings={sightings} setSosAlerts={setSosAlerts} setSightings={setSightings}/> : <p className="mt-3 text-sm text-stone-500">Sign in to access volunteer features.</p>}</>}</div></div></div>)}
        </section></div><aside className="hidden space-y-4 lg:block"><div><h2 className="text-base font-extrabold text-stone-900">Crowd density</h2><div className="mt-2 space-y-2">{latestReports.map(({node,density})=><div key={node.id} className="flex items-center gap-3 rounded-2xl border border-cream-200 bg-white p-3"><span className={`h-3 w-3 rounded-full ${density === 'high' ? 'bg-red-600' : density === 'medium' ? 'bg-amber-500' : 'bg-green-600'}`}/><span className="flex-1 text-sm font-semibold">{node.name}</span><span className="rounded-full bg-cream-100 px-2 py-1 text-xs font-bold capitalize">{density}</span></div>)}</div>{role === 'admin' && <button onClick={() => setShowDensitySheet(true)} className="mt-2 w-full min-h-[48px] rounded-xl border-2 border-saffron-600 py-3 text-sm font-bold text-saffron-600">Report density</button>}</div><div><h2 className="text-base font-extrabold text-stone-900">Traffic status</h2><div className="mt-2 space-y-2">{latestTrafficReports.map(({node,status})=><div key={node.id} className="flex items-center gap-3 rounded-2xl border border-cream-200 bg-white p-3"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: trafficClass[status] }}/><span className="flex-1 text-sm font-semibold">{node.name}</span><span className="rounded-full bg-cream-100 px-2 py-1 text-xs font-bold">{trafficLabel[status]}</span></div>)}</div>{role === 'admin' && <button onClick={() => setShowTrafficSheet(true)} className="mt-2 w-full min-h-[48px] rounded-xl border-2 border-stone-900 py-3 text-sm font-bold text-stone-900">Report traffic</button>}</div>{profile?.group_id && <div><h2 className="text-base font-extrabold text-stone-900">Your group's nodes</h2><p className="mt-1 text-xs text-stone-500">Only visible to members of your group.</p><div className="mt-2 space-y-2">{groupNodes.length === 0 && <p className="text-xs text-stone-400">No group nodes yet.</p>}{groupNodes.map((node)=><div key={node.id} className="flex items-center gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-3"><span className="text-sm">📌</span><span className="flex-1 text-sm font-semibold text-stone-800">{node.name}</span>{node.created_by === currentMemberId && <button onClick={() => void removeGroupNode(node)} className="text-xs font-bold text-red-600">Remove</button>}</div>)}</div><button onClick={() => setShowAddNodeSheet(true)} className="mt-2 w-full min-h-[48px] rounded-xl border-2 border-violet-600 py-3 text-sm font-bold text-violet-600">📌 Add group node</button></div>}</aside></div>
        {showApplyModal && <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-stone-900/60 backdrop-blur-sm sm:items-center"><div className="relative w-full rounded-t-3xl bg-white px-5 pt-2 pb-8 shadow-2xl sm:max-w-lg sm:rounded-3xl sm:p-7"><div className="mx-auto mb-5 h-1.5 w-12 rounded-full bg-stone-200 sm:hidden"/><button onClick={() => setShowApplyModal(false)} className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-stone-400">✕</button><h3 className="mb-5 text-xl font-extrabold">Volunteer application</h3><VolunteerApplication userId={currentMemberId} application={application} nodes={nodes} onRequireAuth={() => setShowAuthModal(true)}/></div></div>}
        {showDensitySheet && <><div className="fixed inset-0 z-40 bg-stone-900/40" onClick={() => setShowDensitySheet(false)}/><div className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl bg-white p-5 shadow-2xl transition-transform duration-300 ease-out"><div className="mx-auto mb-4 h-1 w-12 rounded-full bg-stone-200"/><h2 className="text-base font-extrabold">Report crowd density</h2><select className="mt-4 w-full min-h-[44px] rounded-xl border border-cream-200 bg-saffron-50 px-3.5 py-3 text-sm" value={selectedNode} onChange={e=>setSelectedNode(e.target.value)}>{nodes.map(n=><option key={n.id} value={n.id}>{n.name}</option>)}</select><div className="mt-3 flex gap-2">{(['low','medium','high'] as Density[]).map(d=><button key={d} onClick={() => { void reportDensity(d); setShowDensitySheet(false); }} className={`flex min-h-[80px] flex-1 flex-col items-center justify-center rounded-xl border-2 text-sm font-bold capitalize ${d === 'low' ? 'border-green-500 bg-green-50 text-green-700' : d === 'medium' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-red-500 bg-red-50 text-red-700'}`}>{d === 'low' ? '🟢' : d === 'medium' ? '🟡' : '🔴'}<span>{d}</span></button>)}</div></div></>}
        {showTrafficSheet && <><div className="fixed inset-0 z-40 bg-stone-900/40" onClick={() => setShowTrafficSheet(false)}/><div className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl bg-white p-5 shadow-2xl transition-transform duration-300 ease-out"><div className="mx-auto mb-4 h-1 w-12 rounded-full bg-stone-200"/><h2 className="text-base font-extrabold">Report traffic status</h2><p className="mt-1 text-xs text-stone-500">Reports color the route on the map near this node.</p><select className="mt-4 w-full min-h-[44px] rounded-xl border border-cream-200 bg-saffron-50 px-3.5 py-3 text-sm" value={selectedNode} onChange={e=>setSelectedNode(e.target.value)}>{nodes.map(n=><option key={n.id} value={n.id}>{n.name}</option>)}</select><div className="mt-3 grid grid-cols-2 gap-2">{(['clear','moderate','heavy','jam'] as TrafficStatus[]).map(s=><button key={s} onClick={() => { void reportTraffic(s); setShowTrafficSheet(false); }} className="flex min-h-[64px] flex-col items-center justify-center rounded-xl border-2 text-sm font-bold" style={{ borderColor: trafficClass[s], backgroundColor: `${trafficClass[s]}14`, color: trafficClass[s] }}>{trafficLabel[s]}</button>)}</div></div></>}
        {showAddNodeSheet && <><div className="fixed inset-0 z-40 bg-stone-900/40" onClick={() => setShowAddNodeSheet(false)}/><div className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl bg-white p-5 shadow-2xl transition-transform duration-300 ease-out"><div className="mx-auto mb-4 h-1 w-12 rounded-full bg-stone-200"/><h2 className="text-base font-extrabold">Add a node for your group</h2><p className="mt-1 text-xs text-stone-500">Only pilgrims in your group ({registeredGroup || 'no group yet'}) will see this on the map.</p>{!position && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-700">Share your device location first — the node is placed at your current position.</p>}<input className="mt-4 w-full min-h-[44px] rounded-xl border border-cream-200 bg-violet-50 px-3.5 py-3 text-sm text-stone-900 placeholder:text-stone-400 focus:border-violet-600 focus:ring-2 focus:ring-violet-600/20 focus:outline-none" value={newNodeName} onChange={e=>setNewNodeName(e.target.value)} placeholder="e.g. our tent, meeting point..."/><button disabled={!position || !newNodeName.trim()} onClick={() => { void addGroupNode(); setShowAddNodeSheet(false); }} className="mt-3 w-full min-h-[48px] rounded-xl bg-violet-600 py-3 text-sm font-bold text-white shadow-sm disabled:opacity-50">Add node at my location</button></div></>}
      </div>}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-16 border-t border-cream-200 bg-white pb-safe lg:hidden">{([['pilgrim','🗺️','Pilgrim'],['news','📰','News'],['sos_mesh','🚨','SOS'],['pilgrim','🙋','Volunteer'],['admin','⚡','Admin']] as const).map(([target,icon,label]) => { const isActive = label === 'Volunteer' ? showApplyModal : view === target; return <button key={label} onClick={() => label === 'Volunteer' ? setShowApplyModal(true) : changeView(target)} className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 text-xs font-semibold ${label === 'SOS' ? 'text-red-600' : isActive ? 'border-t-2 border-saffron-600 text-saffron-600' : 'text-stone-400'}`}><span className="text-xl">{icon}</span>{label === 'SOS' && activeSosCount > 0 && <span className="absolute top-2 ml-5 h-2 w-2 animate-pulse rounded-full bg-red-500"/>}<span>{label}</span></button>; })}</nav>
      {activeSosCount === 0 && view === 'pilgrim' && <button onClick={sendSos} className="fixed bottom-[72px] left-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-red-600 text-xl text-white shadow-lg">🚨</button>}
    </main>
  );
}

function GroupPanel({ session, profile, groupAction, setGroupAction, registration, setRegistration, registeredGroup, familyProfiles, liveLocations, locationError, onSubmit }: { session: ReturnType<typeof useSession>['session']; profile: Profile | null; groupAction: 'create' | 'join'; setGroupAction: React.Dispatch<React.SetStateAction<'create' | 'join'>>; registration: Registration; setRegistration: React.Dispatch<React.SetStateAction<Registration>>; registeredGroup: string; familyProfiles: Profile[]; liveLocations: LiveLocation[]; locationError: string; onSubmit: () => void }) {
  if (!session) return <div className="rounded-xl bg-saffron-50 p-3 text-sm text-stone-600">Sign in as a pilgrim to create or join a group and share live locations.</div>;
  const isInGroup = Boolean(profile?.group_id && registeredGroup);
  const sharingLocation = new Set(liveLocations.map((location) => location.user_id));
  if (isInGroup) return <section aria-label="Your group">
    <div className="rounded-xl bg-green-50 p-3 text-xs text-green-800"><p className="font-extrabold">You are in group {registeredGroup}</p><p className="mt-1">Purple dots on the map show members currently sharing their location.</p></div>
    <div className="mt-3 flex items-center justify-between"><h3 className="text-sm font-extrabold text-stone-900">Group members</h3><span className="rounded-full bg-saffron-50 px-2 py-1 text-xs font-bold text-saffron-700">{familyProfiles.length}</span></div>
    <ul className="mt-2 space-y-2">{familyProfiles.map((member) => <li key={member.id} className="flex items-center gap-3 rounded-xl border border-cream-200 bg-white px-3 py-2"><div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-saffron-100 text-xs font-extrabold text-saffron-700">{member.photo_url ? <img src={member.photo_url} alt="" className="h-full w-full object-cover" /> : (member.display_name ?? '?').slice(0, 2).toUpperCase()}</div><span className="min-w-0 flex-1 truncate text-sm font-semibold text-stone-800">{member.id === profile?.id ? 'You' : member.display_name || 'Group member'}</span><span className={`text-xs font-bold ${sharingLocation.has(member.id) ? 'text-violet-700' : 'text-stone-400'}`}>{sharingLocation.has(member.id) ? '● Sharing' : '○ Location off'}</span></li>)}</ul>
    {locationError && <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700">Could not load live locations: {locationError}</p>}
    {familyProfiles.length === 0 && !locationError && <p className="mt-2 text-xs text-stone-500">Loading group members…</p>}
  </section>;
  return <><div className="mb-3 grid grid-cols-2 gap-2"><button onClick={() => { setGroupAction('create'); setRegistration({ ...registration, groupCode: makeGroupCode() }); }} className={`rounded-xl border px-3 py-2 text-xs font-bold ${groupAction === 'create' ? 'border-saffron-600 bg-saffron-600 text-white' : 'border-cream-200 bg-saffron-50 text-stone-600'}`}>Create group</button><button onClick={() => { setGroupAction('join'); setRegistration({ ...registration, groupCode: '' }); }} className={`rounded-xl border px-3 py-2 text-xs font-bold ${groupAction === 'join' ? 'border-saffron-600 bg-saffron-600 text-white' : 'border-cream-200 bg-saffron-50 text-stone-600'}`}>Join group</button></div><p className="mb-3 text-xs text-stone-500">{groupAction === 'create' ? 'A unique code has been generated. Share it only with your group.' : 'Enter the unique code shared by your group organiser.'}</p><input className="mb-3 w-full min-h-[44px] rounded-xl border border-cream-200 bg-saffron-50 px-3.5 py-3 text-sm" placeholder="Your name" value={registration.name} onChange={e => setRegistration({ ...registration, name: e.target.value })}/><input className="mb-3 w-full min-h-[44px] rounded-xl border border-cream-200 bg-saffron-50 px-3.5 py-3 text-sm" placeholder="Unique group code" value={registration.groupCode} onChange={e => setRegistration({ ...registration, groupCode: e.target.value.toUpperCase() })}/><button onClick={onSubmit} className="w-full min-h-[48px] rounded-xl bg-saffron-600 py-3 text-sm font-bold text-white shadow-sm">{groupAction === 'create' ? 'Create & join group' : 'Join group'}</button>{registeredGroup && <><p className="mt-3 rounded-xl bg-green-50 p-3 text-xs font-bold text-green-700">Your group code: {registeredGroup}</p><p className="mt-2 text-xs text-stone-500">{familyProfiles.length} member{familyProfiles.length === 1 ? '' : 's'} in your group. Purple map dots are shared only after each member grants location access.</p></>}</>;
}

function VolunteerDashboard({ session, profile, role, approved, loading, nodes, sosAlerts, sightings, setSosAlerts, setSightings }: { session: ReturnType<typeof useSession>['session']; profile: Profile | null; role: string; approved: boolean; loading: boolean; nodes: NodePoint[]; sosAlerts: SosAlert[]; sightings: Sighting[]; setSosAlerts: React.Dispatch<React.SetStateAction<SosAlert[]>>; setSightings: React.Dispatch<React.SetStateAction<Sighting[]>> }) {
  const [scope, setScope] = useState(profile?.node_id ?? 'all');
  const [groups, setGroups] = useState<Group[]>([]);
  const [inspectedGroup, setInspectedGroup] = useState<Group | null>(null);
  const [groupMembers, setGroupMembers] = useState<Profile[]>([]);
  const [groupsError, setGroupsError] = useState('');
  const [groupsLoading, setGroupsLoading] = useState(false);
  useEffect(() => setScope(profile?.node_id ?? 'all'), [profile?.node_id]);
  const permitted = (role === 'volunteer' || role === 'admin') && approved;
  const scopedAlerts = sosAlerts.filter((s) => scope === 'all' || s.node_id === scope);
  const scopedSightings = sightings.filter((s) => scope === 'all' || s.node_id === scope);

  useEffect(() => {
    if (!permitted || !isSupabaseConfigured) return;
    let active = true;
    setGroupsLoading(true);
    void supabase.from('groups').select('*').order('created_at', { ascending: false }).then(({ data, error }) => {
      if (!active) return;
      setGroups((data ?? []) as Group[]);
      setGroupsError(error?.message ?? '');
      setGroupsLoading(false);
    });
    return () => { active = false; };
  }, [permitted]);

  async function inspectGroup(group: Group) {
    setInspectedGroup(group);
    setGroupMembers([]);
    const { data, error } = await supabase.from('profiles').select('id, display_name, phone, photo_url, group_id').eq('group_id', group.id).order('display_name');
    setGroupMembers((data ?? []) as Profile[]);
    setGroupsError(error?.message ?? '');
  }

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
        <div className="flex items-center justify-between"><h3 className="font-bold">Available groups</h3><span className="text-xs text-stone-500">{groups.length} groups</span></div>
        <p className="mt-1 text-xs text-stone-500">Inspect a group to see its members before coordinating support.</p>
        {groupsLoading && <p className="py-2 text-xs text-stone-500">Loading groups…</p>}
        {groupsError && <p className="py-2 text-xs text-red-700">Could not load group details: {groupsError}</p>}
        <div className="mt-2 max-h-48 space-y-2 overflow-y-auto pr-1">{groups.map((group) => <button key={group.id} onClick={() => void inspectGroup(group)} className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition-colors ${inspectedGroup?.id === group.id ? 'border-saffron-600 bg-saffron-50' : 'border-cream-200 bg-white hover:bg-saffron-50'}`}><span className="font-bold text-stone-800">{group.group_code}</span><span className="text-xs font-semibold text-saffron-700">Inspect →</span></button>)}</div>
        {!groupsLoading && groups.length === 0 && !groupsError && <p className="py-2 text-xs text-stone-500">No groups are available yet.</p>}
        {inspectedGroup && <div className="mt-3 rounded-xl border border-cream-200 bg-saffron-50 p-3"><div className="flex items-center justify-between"><h4 className="font-extrabold text-stone-900">{inspectedGroup.group_code} members</h4><span className="rounded-full bg-white px-2 py-1 text-xs font-bold text-stone-600">{groupMembers.length}</span></div><ul className="mt-2 space-y-2">{groupMembers.map((member) => <li key={member.id} className="flex items-center gap-2 text-xs text-stone-700"><span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-saffron-100 font-extrabold text-saffron-700">{member.photo_url ? <img src={member.photo_url} alt="" className="h-full w-full object-cover" /> : (member.display_name ?? '?').slice(0, 1).toUpperCase()}</span><span className="font-semibold">{member.display_name || 'Group member'}</span>{member.phone && <span className="text-stone-500">· {member.phone}</span>}</li>)}</ul>{groupMembers.length === 0 && <p className="mt-2 text-xs text-stone-500">No members have joined this group yet.</p>}</div>}
      </div>
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
