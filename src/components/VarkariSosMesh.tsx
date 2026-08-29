import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import {
  getEmergencyContacts,
  getMeshGoodsServices,
  getMeshMessages,
  getMeshNews,
  queueWrite,
  saveMeshGoodsService,
  saveMeshMessage,
  saveMeshNews
} from '../db';
import { isSupabaseConfigured, supabase } from '../supabase';
import {
  VOICE_CHUNK_SIZE,
  VOICE_NOTE_MAX_SECONDS,
  VoiceChunkReassembler,
  base64ToAudioSrc,
  blobToBase64,
  chunkVoiceMessage,
  getPreferredVoiceMimeType
} from '../meshVoice';
import type {
  EmergencyContact,
  MeshChatMessage,
  MeshGoodsService,
  MeshNewsBroadcast,
  NodePoint,
  Profile,
  SosAlert,
  SosCategory
} from '../types';

interface VarkariSosMeshProps {
  currentMemberId?: string;
  profile?: Profile | null;
  position?: GeolocationPosition;
  nodes: NodePoint[];
  nearestNodeId?: string;
  onSosCreated?: (alert: SosAlert) => void;
  onRequestLocationPermission?: () => void;
  geoError?: string | null;
  onSetManualLocation?: (lat: number, lng: number, name?: string) => void;
}

const CATEGORY_CONFIG: Record<
  SosCategory,
  { labelMr: string; labelEn: string; icon: string; bg: string; border: string; text: string }
> = {
  medical: {
    labelMr: 'वैद्यकीय मदत',
    labelEn: 'Medical Emergency',
    icon: '🚑',
    bg: 'bg-red-50 hover:bg-red-100/80',
    border: 'border-red-200',
    text: 'text-red-700'
  },
  lost: {
    labelMr: 'रस्ता चुकले / नातेवाईक हरवले',
    labelEn: 'Lost Pilgrim / Missing Person',
    icon: '🏃',
    bg: 'bg-amber-50 hover:bg-amber-100/80',
    border: 'border-amber-200',
    text: 'text-amber-800'
  },
  accident: {
    labelMr: 'अपघात / दुखापत',
    labelEn: 'Accident / Severe Injury',
    icon: '🩹',
    bg: 'bg-rose-50 hover:bg-rose-100/80',
    border: 'border-rose-200',
    text: 'text-rose-800'
  },
  crowd: {
    labelMr: 'गर्दीचा धोका / चेंगराचेंगरी',
    labelEn: 'Crowd Surge / Stampede Risk',
    icon: '⚠️',
    bg: 'bg-orange-50 hover:bg-orange-100/80',
    border: 'border-orange-200',
    text: 'text-orange-800'
  },
  water_food: {
    labelMr: 'अन्न-पाणी टंचाई',
    labelEn: 'Food or Water Shortage',
    icon: '💧',
    bg: 'bg-blue-50 hover:bg-blue-100/80',
    border: 'border-blue-200',
    text: 'text-blue-800'
  },
  general: {
    labelMr: 'इतर आणीबाणी',
    labelEn: 'General Emergency / Immediate Aid',
    icon: '📢',
    bg: 'bg-purple-50 hover:bg-purple-100/80',
    border: 'border-purple-200',
    text: 'text-purple-800'
  }
};



type MeshPacket = {
  type: string;
  payload: unknown;
  packetId: string;
  hopCount: number;
  relayPath: string[];
};

const getOrCreateDeviceId = (displayName?: string) => {
  const storageKey = 'vari-mitra-mesh-device-id';
  try {
    const existingId = window.localStorage.getItem(storageKey);
    if (existingId) return existingId;

    const friendlyName = displayName?.trim()
      ? displayName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      : 'varkari';
    const randomBytes = new Uint8Array(4);
    window.crypto.getRandomValues(randomBytes);
    const randomSuffix = Array.from(randomBytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    const deviceId = `node-${friendlyName}-${randomSuffix}`;
    window.localStorage.setItem(storageKey, deviceId);
    return deviceId;
  } catch {
    return `node-varkari-${Date.now().toString(36)}`;
  }
};

const QUICK_MESSAGES = [
  { mr: '🚩 मी सुरक्षित आहे', en: '🚩 I am safe' },
  { mr: '🚑 रुग्णवाहिका तातडीने पाठवा!', en: '🚑 Send an ambulance urgently!' },
  { mr: '📍 माझे स्थान पाठवत आहे', en: '📍 Sending my location' },
  { mr: '🌊 येथे पिण्याचे पाणी हवे आहे', en: '🌊 Drinking water is needed here' },
  { mr: '👨‍👩‍👧 लहान मूल / वृद्ध नातेवाईक हरवले आहेत', en: '👨‍👩‍👧 An elderly person or child is missing' },
  { mr: '🚔 पोलीस मदत हवी आहे', en: '🚔 Police assistance is needed' }
];

export const VarkariSosMesh: React.FC<VarkariSosMeshProps> = ({
  currentMemberId,
  profile,
  position,
  nodes,
  nearestNodeId,
  onSosCreated,
  onRequestLocationPermission,
  geoError,
  onSetManualLocation
}) => {
  const [lang, setLang] = useState<'mr' | 'en'>('en');
  const [activeTab, setActiveTab] = useState<'sos' | 'chat' | 'news' | 'goods' | 'mesh_topology'>('sos');
  const [activeCategory, setActiveCategory] = useState<SosCategory>('medical');
  const [customNote, setCustomNote] = useState('');
  const [isBroadcastingSos, setIsBroadcastingSos] = useState(false);
  const [isHoldingSos, setIsHoldingSos] = useState(false);
  const [sosHoldProgress, setSosHoldProgress] = useState(0);
  const sosHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sosHoldAnimationRef = useRef<number | null>(null);
  const sosHoldStartRef = useRef<number | null>(null);
  const [activeSosAlert, setActiveSosAlert] = useState<SosAlert | null>(null);

  // Siren audio & screen strobe beacon
  const [isSirenActive, setIsSirenActive] = useState(false);
  const [isStrobeActive, setIsStrobeActive] = useState(false);
  const [strobeColor, setStrobeColor] = useState<'red' | 'amber'>('red');
  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  // Mesh & Store-and-Forward state
  const [meshMessages, setMeshMessages] = useState<MeshChatMessage[]>([]);
  const [meshNews, setMeshNews] = useState<MeshNewsBroadcast[]>([]);
  const [goodsServices, setGoodsServices] = useState<MeshGoodsService[]>([]);
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([]);
  const [chatText, setChatText] = useState('');
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [voiceElapsedSeconds, setVoiceElapsedSeconds] = useState(0);
  const [voiceError, setVoiceError] = useState('');
  const [voiceChunkProgress, setVoiceChunkProgress] = useState<Record<string, { receivedChunks: number; totalChunks: number; status: 'receiving' | 'stalled' }>>({});
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const voiceStartedAtRef = useRef<number>(0);
  const voiceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const voiceReassemblerRef = useRef(new VoiceChunkReassembler());
  // Real, currently-open WebRTC data-channel peers (this is the only mechanism
  // that actually carries messages between two different devices with no internet).
  const [connectedOfflinePeerCount, setConnectedOfflinePeerCount] = useState(0);
  const [offlinePeerStatus, setOfflinePeerStatus] = useState('No offline peers connected yet.');
  const [localPairingCode, setLocalPairingCode] = useState('');
  const [remotePairingCode, setRemotePairingCode] = useState('');
  const [pendingOfferCode, setPendingOfferCode] = useState('');
  const [pairingQrDataUrl, setPairingQrDataUrl] = useState('');
  const [qrScanMode, setQrScanMode] = useState<'offer' | 'answer' | null>(null);
  const [qrScanError, setQrScanError] = useState('');

  // Gateway status
  const [isOnlineGateway, setIsOnlineGateway] = useState<boolean>(navigator.onLine);
  const [relayedCount, setRelayedCount] = useState<number>(0);
  const [seenPacketIds] = useState<Set<string>>(() => new Set());
  const SEEN_PACKET_CAP = 2000;
  const markPacketSeen = (packetId: string) => {
    seenPacketIds.add(packetId);
    if (seenPacketIds.size > SEEN_PACKET_CAP) {
      const excess = seenPacketIds.size - SEEN_PACKET_CAP;
      let dropped = 0;
      for (const key of seenPacketIds) {
        if (dropped >= excess) break;
        seenPacketIds.delete(key);
        dropped += 1;
      }
    }
  };

  // Form states for Goods & Services creation
  const [gsType, setGsType] = useState<'request' | 'offer'>('request');
  const [gsCategory, setGsCategory] = useState<'water' | 'food' | 'medical' | 'shelter' | 'charging' | 'transport'>('water');
  const [gsTitle, setGsTitle] = useState('');
  const [gsDesc, setGsDesc] = useState('');

  // Device unique identifier for relay paths
  const deviceIdRef = useRef<string>(getOrCreateDeviceId(profile?.display_name));

  // BroadcastChannel & Supabase Realtime for cross-device & local mesh routing
  const meshChannelRef = useRef<BroadcastChannel | null>(null);
  const realtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const offlinePeerConnectionsRef = useRef<RTCPeerConnection[]>([]);
  const offlineDataChannelsRef = useRef<RTCDataChannel[]>([]);
  // The connection created by "Create offline pairing code" (the offerer side),
  // kept explicitly so accepting an answer targets the right connection instead
  // of guessing "whichever was created most recently".
  const pendingOfferConnectionRef = useRef<RTCPeerConnection | null>(null);
  const meshPacketHandlerRef = useRef<((packet: MeshPacket) => void) | null>(null);
  const pitchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qrVideoRef = useRef<HTMLVideoElement | null>(null);
  const qrScanStreamRef = useRef<MediaStream | null>(null);
  const qrScanRafRef = useRef<number | null>(null);

  // State for nearby active SOS alerts triggered by other Varkaris
  const [nearbySosAlerts, setNearbySosAlerts] = useState<SosAlert[]>([]);

  useEffect(() => {
    void Promise.all([
      getMeshMessages().then(setMeshMessages),
      getMeshNews().then((items) => items.length && setMeshNews(items)),
      getMeshGoodsServices().then((items) => items.length && setGoodsServices(items)),
      getEmergencyContacts().then(setEmergencyContacts)
    ]);

    const handleOnline = () => {
      setIsOnlineGateway(true);
      void syncGatewayUplinkAndDownlink();
    };
    const handleOffline = () => setIsOnlineGateway(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const processIncomingPacket = (packet: MeshPacket) => {
      if (!packet?.packetId || seenPacketIds.has(packet.packetId)) return;
      markPacketSeen(packet.packetId);

      const currentHop = (packet.hopCount || 0) + 1;
      const currentPath = [...(packet.relayPath || []), deviceIdRef.current];

      if (packet.type === 'NEW_MESH_MESSAGE') {
        const msg = packet.payload as MeshChatMessage;
        const updatedMsg: MeshChatMessage = {
          type: msg.type ?? 'text',
          ...msg,
          hop_count: msg.hop_count !== undefined ? msg.hop_count : currentHop,
          relay_path: msg.relay_path && msg.relay_path.length > 0 ? msg.relay_path : currentPath
        };
        setMeshMessages((prev) => [updatedMsg, ...prev.filter((m) => m.id !== updatedMsg.id)]);
        void saveMeshMessage(updatedMsg);

        if (currentHop < 10) {
          const relayedPacket = {
            ...packet,
            hopCount: updatedMsg.hop_count,
            relayPath: updatedMsg.relay_path
          };
          meshChannelRef.current?.postMessage(relayedPacket);
          offlineDataChannelsRef.current.forEach((channel) => {
            if (channel.readyState === 'open') channel.send(JSON.stringify(relayedPacket));
          });
        }

        if (navigator.onLine && isSupabaseConfigured) {
          void uploadMessageToGateway(updatedMsg);
        }
      } else if (packet.type === 'NEW_MESH_MESSAGE_CHUNK') {
        const result = voiceReassemblerRef.current.accept(packet.payload as Parameters<VoiceChunkReassembler['accept']>[0]);
        setVoiceChunkProgress((prev) => ({
          ...prev,
          [result.progress.messageId]: {
            receivedChunks: result.progress.receivedChunks,
            totalChunks: result.progress.totalChunks,
            status: result.progress.status
          }
        }));
        if (result.message) {
          const completedMsg: MeshChatMessage = {
            ...result.message,
            hop_count: result.message.hop_count !== undefined ? result.message.hop_count : currentHop,
            relay_path: result.message.relay_path && result.message.relay_path.length > 0 ? result.message.relay_path : currentPath
          };
          setVoiceChunkProgress((prev) => { const next = { ...prev }; delete next[completedMsg.id]; return next; });
          setMeshMessages((prev) => [completedMsg, ...prev.filter((m) => m.id !== completedMsg.id)]);
          void saveMeshMessage(completedMsg);
          if (navigator.onLine && isSupabaseConfigured) void uploadMessageToGateway(completedMsg);
        }
        if (currentHop < 10) {
          const relayedPacket = { ...packet, hopCount: currentHop, relayPath: currentPath };
          meshChannelRef.current?.postMessage(relayedPacket);
          offlineDataChannelsRef.current.forEach((channel) => {
            if (channel.readyState === 'open') channel.send(JSON.stringify(relayedPacket));
          });
        }
      } else if (packet.type === 'NEW_SOS_ALERT') {
        const alert = packet.payload as SosAlert;
        const updatedAlert: SosAlert = {
          ...alert,
          hop_count: alert.hop_count !== undefined ? alert.hop_count : currentHop,
          relay_path: alert.relay_path && alert.relay_path.length > 0 ? alert.relay_path : currentPath
        };

        if (alert.origin_device_id === deviceIdRef.current) {
          setActiveSosAlert(updatedAlert);
        } else {
          setNearbySosAlerts((prev) => [updatedAlert, ...prev.filter((a) => a.id !== updatedAlert.id)]);
        }
        onSosCreated?.(updatedAlert);

        if (currentHop < 10) {
          const relayedPacket = {
            ...packet,
            hopCount: updatedAlert.hop_count,
            relayPath: updatedAlert.relay_path
          };
          meshChannelRef.current?.postMessage(relayedPacket);
          offlineDataChannelsRef.current.forEach((channel) => {
            if (channel.readyState === 'open') channel.send(JSON.stringify(relayedPacket));
          });
        }

        if (navigator.onLine && isSupabaseConfigured) {
          void uploadSosToGateway(updatedAlert);
        }
      } else if (packet.type === 'RESPOND_SOS_ALERT') {
        const alert = packet.payload as SosAlert;
        const updatedAlert: SosAlert = {
          ...alert,
          status: 'responding',
          hop_count: currentHop,
          relay_path: currentPath
        };

        if (alert.origin_device_id === deviceIdRef.current) {
          setActiveSosAlert(updatedAlert);
        }
        setNearbySosAlerts((prev) => prev.map((a) => (a.id === alert.id ? updatedAlert : a)));

        if (currentHop < 10) {
          const relayedPacket = {
            ...packet,
            hopCount: currentHop,
            relayPath: currentPath
          };
          meshChannelRef.current?.postMessage(relayedPacket);
          offlineDataChannelsRef.current.forEach((channel) => {
            if (channel.readyState === 'open') channel.send(JSON.stringify(relayedPacket));
          });
        }
      } else if (packet.type === 'RESOLVE_SOS_ALERT') {
        const alert = packet.payload as SosAlert;
        if (isSupabaseConfigured && navigator.onLine && alert.id) {
          void (async () => {
            try {
              await supabase
                .from('sos_alerts')
                .update({ status: 'resolved', resolved_at: new Date().toISOString() })
                .eq('id', alert.id);
            } catch (err) {
              console.warn('SOS resolve gateway update error:', err);
            }
          })();
        }
        if (alert.origin_device_id === deviceIdRef.current) {
          setActiveSosAlert(null);
          stopSiren();
        }
        setNearbySosAlerts((prev) => prev.filter((a) => a.id !== alert.id));

        if (currentHop < 10) {
          const relayedPacket = {
            ...packet,
            hopCount: currentHop,
            relayPath: currentPath
          };
          meshChannelRef.current?.postMessage(relayedPacket);
          offlineDataChannelsRef.current.forEach((channel) => {
            if (channel.readyState === 'open') channel.send(JSON.stringify(relayedPacket));
          });
        }
      } else if (packet.type === 'NEW_NEWS_BROADCAST') {
        const news = packet.payload as MeshNewsBroadcast;
        const updatedNews: MeshNewsBroadcast = {
          ...news,
          hop_count: currentHop
        };
        setMeshNews((prev) => [updatedNews, ...prev.filter((n) => n.id !== updatedNews.id)]);
        void saveMeshNews(updatedNews);

        if (currentHop < 10) {
          const relayedPacket = {
            ...packet,
            hopCount: currentHop,
            relayPath: currentPath
          };
          meshChannelRef.current?.postMessage(relayedPacket);
          offlineDataChannelsRef.current.forEach((channel) => {
            if (channel.readyState === 'open') channel.send(JSON.stringify(relayedPacket));
          });
        }
      } else if (packet.type === 'NEW_GOODS_SERVICE') {
        const gsItem = packet.payload as MeshGoodsService;
        const updatedItem: MeshGoodsService = {
          ...gsItem,
          hop_count: currentHop
        };
        setGoodsServices((prev) => [updatedItem, ...prev.filter((g) => g.id !== updatedItem.id)]);
        void saveMeshGoodsService(updatedItem);

        if (currentHop < 10) {
          const relayedPacket = {
            ...packet,
            hopCount: currentHop,
            relayPath: currentPath
          };
          meshChannelRef.current?.postMessage(relayedPacket);
          offlineDataChannelsRef.current.forEach((channel) => {
            if (channel.readyState === 'open') channel.send(JSON.stringify(relayedPacket));
          });
        }
      }
    };
    meshPacketHandlerRef.current = processIncomingPacket;

    // Initialize local BroadcastChannel (same device / tabs)
    if ('BroadcastChannel' in window) {
      meshChannelRef.current = new BroadcastChannel('vari-mitra-multihop-mesh-v2');
      meshChannelRef.current.onmessage = (event) => {
        processIncomingPacket(event.data);
      };
    }

    // Initialize Supabase Realtime channel for CROSS-DEVICE mesh sync!
    if (isSupabaseConfigured) {
      realtimeChannelRef.current = supabase.channel('vari-mesh-global-crossdevice');
      realtimeChannelRef.current
        .on('broadcast', { event: 'mesh_packet' }, (event) => {
          if (event.payload) processIncomingPacket(event.payload);
        })
        .subscribe();
    }

    if (navigator.onLine) {
      void syncGatewayUplinkAndDownlink();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      meshChannelRef.current?.close();
      if (realtimeChannelRef.current) void supabase.removeChannel(realtimeChannelRef.current);
      offlineDataChannelsRef.current.forEach((channel) => channel.close());
      offlinePeerConnectionsRef.current.forEach((connection) => connection.close());
      offlineDataChannelsRef.current = [];
      offlinePeerConnectionsRef.current = [];
      meshPacketHandlerRef.current = null;
      stopSiren();
    };
  }, []);

  // Strobe beacon timer
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isStrobeActive) {
      interval = setInterval(() => {
        setStrobeColor((prev) => (prev === 'red' ? 'amber' : 'red'));
      }, 350);
    }
    return () => clearInterval(interval);
  }, [isStrobeActive]);

  // Turn the current WebRTC pairing code (offer or answer) into a QR image.
  // Typing/copy-pasting a raw SDP blob on a phone is unusable in practice;
  // scanning a QR code with the camera is the only realistic phone UX for this.
  useEffect(() => {
    if (!localPairingCode) {
      setPairingQrDataUrl('');
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(localPairingCode, { errorCorrectionLevel: 'M', margin: 1, width: 260 })
      .then((url: string) => {
        if (!cancelled) setPairingQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setPairingQrDataUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [localPairingCode]);

  const stopQrScan = () => {
    if (qrScanRafRef.current) cancelAnimationFrame(qrScanRafRef.current);
    qrScanRafRef.current = null;
    qrScanStreamRef.current?.getTracks().forEach((track) => track.stop());
    qrScanStreamRef.current = null;
    if (qrVideoRef.current) qrVideoRef.current.srcObject = null;
    setQrScanMode(null);
  };

  // Opens the rear camera and decodes QR frames until it finds one, then
  // fills the offer/answer textarea automatically. This is what makes the
  // WebRTC pairing flow above actually usable on a phone.
  const startQrScan = async (mode: 'offer' | 'answer') => {
    setQrScanError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setQrScanError('Camera access is not available in this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      qrScanStreamRef.current = stream;
      setQrScanMode(mode);

      requestAnimationFrame(() => {
        const video = qrVideoRef.current;
        if (!video) return;
        video.srcObject = stream;
        void video.play();

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        const scanFrame = () => {
          if (!qrVideoRef.current) return;
          if (video.readyState < video.HAVE_ENOUGH_DATA) {
            qrScanRafRef.current = requestAnimationFrame(scanFrame);
            return;
          }
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx?.getImageData(0, 0, canvas.width, canvas.height);
          const code = imageData ? jsQR(imageData.data, imageData.width, imageData.height) : null;
          if (code?.data) {
            if (mode === 'offer') setRemotePairingCode(code.data);
            else setPendingOfferCode(code.data);
            stopQrScan();
            return;
          }
          qrScanRafRef.current = requestAnimationFrame(scanFrame);
        };
        qrScanRafRef.current = requestAnimationFrame(scanFrame);
      });
    } catch (err) {
      setQrScanError(err instanceof Error ? err.message : 'Camera access denied or unavailable.');
      setQrScanMode(null);
    }
  };

  useEffect(() => () => stopQrScan(), []);

  useEffect(() => () => {
    if (voiceTimerRef.current) clearInterval(voiceTimerRef.current);
    voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const progress = voiceReassemblerRef.current.getAllProgress();
      setVoiceChunkProgress(Object.fromEntries(progress.map((item) => [item.messageId, {
        receivedChunks: item.receivedChunks,
        totalChunks: item.totalChunks,
        status: item.status
      }])));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Sync Gateway Node: Upload outward mesh messages & download outer world news/services to broadcast to mesh
  const syncGatewayUplinkAndDownlink = async () => {
    if (!navigator.onLine || !isSupabaseConfigured) return;

    try {
      // Downlink: Fetch latest emergency news bulletins from central server
      const { data: remoteNews } = await supabase
        .from('news_broadcasts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

      if (remoteNews && remoteNews.length > 0) {
        remoteNews.forEach((rn) => {
          const newsItem: MeshNewsBroadcast = {
            id: rn.id || `news-${Date.now()}`,
            title: rn.title,
            content: rn.content,
            category: rn.category || 'disaster_update',
            publisher: rn.publisher || 'Central Disaster Response',
            timestamp: new Date(rn.created_at || Date.now()).getTime(),
            hop_count: 0,
            gateway_id: deviceIdRef.current,
            origin_server: true
          };

          setMeshNews((prev) => [newsItem, ...prev.filter((n) => n.id !== newsItem.id)]);
          void saveMeshNews(newsItem);

          // Broadcast news downlink into local offline mesh network!
          meshChannelRef.current?.postMessage({
            type: 'NEW_NEWS_BROADCAST',
            payload: newsItem,
            packetId: newsItem.id,
            hopCount: 0,
            relayPath: [deviceIdRef.current]
          });
        });
      }
    } catch (err) {
      console.warn('Gateway sync error:', err);
    }
  };

  const uploadSosToGateway = async (alert: SosAlert) => {
    if (!isSupabaseConfigured) return;
    try {
      await supabase.from('sos_alerts').insert({
        member_id: alert.member_id,
        node_id: alert.node_id,
        lat: alert.lat,
        lng: alert.lng,
        category: alert.category,
        note: `[Relayed via Gateway ${deviceIdRef.current}] ${alert.note || ''}`,
        status: 'active'
      });
      setRelayedCount((prev) => prev + 1);
    } catch (err) {
      console.warn('SOS gateway upload error:', err);
    }
  };

  const uploadMessageToGateway = async (msg: MeshChatMessage) => {
    if (!isSupabaseConfigured) return;
    try {
      await supabase.from('mesh_chat_relays').insert({
        sender_id: msg.sender_id,
        sender_name: msg.sender_name,
        text: msg.text || null,
        message_type: msg.type ?? 'text',
        audio_base64: msg.type === 'voice' ? msg.audioData : null,
        duration_seconds: msg.type === 'voice' ? msg.durationSeconds : null,
        mime_type: msg.type === 'voice' ? msg.mimeType : null,
        lat: msg.lat,
        lng: msg.lng
      });
      setRelayedCount((prev) => prev + 1);
    } catch (err) {
      console.warn('Message gateway upload error:', err);
    }
  };

  // Audio Siren controls using Web Audio API
  const startSiren = () => {
    try {
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtxRef.current = new AudioCtx();
      }
      if (audioCtxRef.current.state === 'suspended') {
        void audioCtxRef.current.resume();
      }

      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      let isHigh = false;
      pitchIntervalRef.current = setInterval(() => {
        if (!oscillatorRef.current) {
          if (pitchIntervalRef.current) clearInterval(pitchIntervalRef.current);
          return;
        }
        osc.frequency.setTargetAtTime(isHigh ? 800 : 1400, ctx.currentTime, 0.1);
        isHigh = !isHigh;
      }, 400);

      gain.gain.setValueAtTime(0.8, ctx.currentTime);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();

      oscillatorRef.current = osc;
      gainNodeRef.current = gain;
      setIsSirenActive(true);
    } catch (err) {
      console.warn('Audio Siren playback error:', err);
    }
  };

  const stopSiren = () => {
    try {
      if (pitchIntervalRef.current) {
        clearInterval(pitchIntervalRef.current);
        pitchIntervalRef.current = null;
      }
      oscillatorRef.current?.stop();
      oscillatorRef.current?.disconnect();
      oscillatorRef.current = null;
      gainNodeRef.current?.disconnect();
      gainNodeRef.current = null;
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        void audioCtxRef.current.suspend();
      }
    } catch (err) {
      console.warn('Stop siren error:', err);
    } finally {
      setIsSirenActive(false);
    }
  };

  const toggleSiren = () => {
    if (isSirenActive) stopSiren();
    else startSiren();
  };

  // Helper to send packets over both local BroadcastChannel & Supabase Realtime (Cross-Device)
  const broadcastMeshPacket = (type: string, payload: unknown, packetId: string) => {
    const packets = type === 'NEW_MESH_MESSAGE' && (payload as MeshChatMessage).type === 'voice'
      ? chunkVoiceMessage(payload as MeshChatMessage, VOICE_CHUNK_SIZE).map((chunk) => ({
          type: 'NEW_MESH_MESSAGE_CHUNK',
          payload: chunk,
          packetId: `${packetId}-chunk-${chunk.chunkIndex}`,
          hopCount: 0,
          relayPath: [deviceIdRef.current]
        }))
      : [{ type, payload, packetId, hopCount: 0, relayPath: [deviceIdRef.current] }];

    packets.forEach((packet) => {
      // 1. Local BroadcastChannel (same browser / tabs)
      meshChannelRef.current?.postMessage(packet);

      // 2. Direct offline peer links created after a user gesture and pairing-code exchange
      offlineDataChannelsRef.current.forEach((channel) => {
        if (channel.readyState === 'open') channel.send(JSON.stringify(packet));
      });

      // 3. Realtime Channel (Cross-device across Wi-Fi / Internet)
      if (realtimeChannelRef.current) {
        void realtimeChannelRef.current.send({
          type: 'broadcast',
          event: 'mesh_packet',
          payload: packet
        });
      }
    });
  };

  // Dispatch SOS Alert
  const handleTriggerSos = async () => {
    setIsBroadcastingSos(true);

    const lat = position?.coords.latitude;
    const lng = position?.coords.longitude;
    const accuracy = position?.coords.accuracy;
    const altitude = position?.coords.altitude;
    const packetId = `sos-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const sosPayload: SosAlert = {
      member_id: currentMemberId || `guest-${Date.now()}`,
      node_id: nearestNodeId || nodes[0]?.id || `manual-${deviceIdRef.current}`,
      lat,
      lng,
      accuracy,
      altitude,
      category: activeCategory,
      note: customNote.trim() || (lang === 'en' ? CATEGORY_CONFIG[activeCategory].labelEn : CATEGORY_CONFIG[activeCategory].labelMr),
      display_name: profile?.display_name || 'Varkari Pilgrim',
      phone: profile?.phone || '',
      status: 'active',
      created_at: new Date().toISOString(),
      broadcast_method: 'mesh',
      hop_count: 0,
      max_hops: 10,
      origin_device_id: deviceIdRef.current,
      relay_path: [deviceIdRef.current]
    };

    try {
      const result = await queueWrite<SosAlert>('sos_alerts', sosPayload as unknown as Record<string, unknown>, 'sos');
      const finalAlert = result.serverRecord ?? result.localRecord;
      setActiveSosAlert(finalAlert);
      onSosCreated?.(finalAlert);

      markPacketSeen(packetId);
      broadcastMeshPacket('NEW_SOS_ALERT', finalAlert, packetId);

      // Automatic high-priority multi-hop chat packet
      const meshChatMsg: MeshChatMessage = {
        id: `sos-msg-${Date.now()}`,
        sos_id: finalAlert.id,
        sender_id: currentMemberId || 'guest',
        sender_name: profile?.display_name || 'Varkari Pilgrim (SOS)',
        type: 'text',
        sender_phone: profile?.phone,
        text: `🚩 [SOS - ${CATEGORY_CONFIG[activeCategory].icon}] ${sosPayload.note}. GPS: ${lat?.toFixed(5)}, ${lng?.toFixed(5)} (±${Math.round(accuracy || 0)}m)`,
        category: activeCategory,
        lat,
        lng,
        accuracy,
        timestamp: Date.now(),
        is_sos: true,
        via: 'mesh',
        hop_count: 0,
        max_hops: 10,
        origin_device_id: deviceIdRef.current,
        relay_path: [deviceIdRef.current]
      };

      setMeshMessages((prev) => [meshChatMsg, ...prev]);
      await saveMeshMessage(meshChatMsg);
      broadcastMeshPacket('NEW_MESH_MESSAGE', meshChatMsg, meshChatMsg.id);

      startSiren();
      setIsStrobeActive(true);
    } catch (error) {
      console.error('Failed to trigger SOS:', error);
    } finally {
      setIsBroadcastingSos(false);
    }
  };

  const beginSosHold = () => {
    if (isBroadcastingSos || isHoldingSos) return;
    sosHoldStartRef.current = performance.now();
    setSosHoldProgress(0);
    setIsHoldingSos(true);
    const updateProgress = (now: number) => {
      const elapsed = now - (sosHoldStartRef.current ?? now);
      setSosHoldProgress(Math.min((elapsed / 3000) * 100, 100));
      if (elapsed < 3000) sosHoldAnimationRef.current = requestAnimationFrame(updateProgress);
    };
    sosHoldAnimationRef.current = requestAnimationFrame(updateProgress);
    sosHoldTimerRef.current = setTimeout(() => {
      if (sosHoldAnimationRef.current) cancelAnimationFrame(sosHoldAnimationRef.current);
      sosHoldTimerRef.current = null;
      sosHoldAnimationRef.current = null;
      sosHoldStartRef.current = null;
      setSosHoldProgress(100);
      setIsHoldingSos(false);
      void handleTriggerSos();
    }, 3000);
  };
  const cancelSosHold = () => {
    if (sosHoldTimerRef.current) clearTimeout(sosHoldTimerRef.current);
    if (sosHoldAnimationRef.current) cancelAnimationFrame(sosHoldAnimationRef.current);
    sosHoldTimerRef.current = null;
    sosHoldAnimationRef.current = null;
    sosHoldStartRef.current = null;
    setSosHoldProgress(0);
    setIsHoldingSos(false);
  };

  useEffect(() => () => {
    if (sosHoldTimerRef.current) clearTimeout(sosHoldTimerRef.current);
    if (sosHoldAnimationRef.current) cancelAnimationFrame(sosHoldAnimationRef.current);
  }, []);

  // Send Off-Grid Mesh Chat Message
  const handleSendChatMessage = async (textToSend?: string) => {
    const text = textToSend || chatText.trim();
    if (!text) return;

    const lat = position?.coords.latitude;
    const lng = position?.coords.longitude;
    const packetId = `mesh-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const msg: MeshChatMessage = {
      id: packetId,
      sender_id: currentMemberId || 'guest-varkari',
      sender_name: profile?.display_name || 'Varkari Pilgrim',
      sender_phone: profile?.phone,
      text,
      lat,
      lng,
      accuracy: position?.coords.accuracy,
      timestamp: Date.now(),
      via: 'mesh',
      hop_count: 0,
      max_hops: 10,
      origin_device_id: deviceIdRef.current,
      relay_path: [deviceIdRef.current]
    };

    markPacketSeen(packetId);
    setMeshMessages((prev) => [msg, ...prev]);
    await saveMeshMessage(msg);
    if (!textToSend) setChatText('');

    broadcastMeshPacket('NEW_MESH_MESSAGE', msg, packetId);
  };


  const stopVoiceRecording = (cancel = false) => {
    if (voiceTimerRef.current) clearInterval(voiceTimerRef.current);
    voiceTimerRef.current = null;
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = async () => {
        voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
        voiceStreamRef.current = null;
        mediaRecorderRef.current = null;
        setIsRecordingVoice(false);
        if (cancel) return;
        try {
          const mimeType = recorder.mimeType || getPreferredVoiceMimeType() || 'audio/webm';
          const blob = new Blob(voiceChunksRef.current, { type: mimeType });
          const durationSeconds = Math.min(VOICE_NOTE_MAX_SECONDS, Math.max(1, (Date.now() - voiceStartedAtRef.current) / 1000));
          const audioData = await blobToBase64(blob);
          const packetId = `mesh-voice-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          const msg: MeshChatMessage = {
            id: packetId,
            sender_id: currentMemberId || 'guest-varkari',
            sender_name: profile?.display_name || 'Varkari Pilgrim',
            sender_phone: profile?.phone,
            type: 'voice',
            text: '',
            audioData,
            durationSeconds,
            mimeType,
            lat: position?.coords.latitude,
            lng: position?.coords.longitude,
            accuracy: position?.coords.accuracy,
            timestamp: Date.now(),
            via: 'mesh',
            hop_count: 0,
            max_hops: 10,
            origin_device_id: deviceIdRef.current,
            relay_path: [deviceIdRef.current]
          };
          markPacketSeen(packetId);
          setMeshMessages((prev) => [msg, ...prev]);
          await saveMeshMessage(msg);
          broadcastMeshPacket('NEW_MESH_MESSAGE', msg, packetId);
        } catch (err) {
          setVoiceError(err instanceof Error ? err.message : 'Could not send voice note.');
        }
      };
      recorder.stop();
    }
  };

  const startVoiceRecording = async () => {
    setVoiceError('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setVoiceError(lang === 'mr' ? 'या ब्राउझरमध्ये आवाज रेकॉर्डिंग उपलब्ध नाही.' : 'Voice recording is not available in this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMimeType = getPreferredVoiceMimeType();
      const recorder = new MediaRecorder(stream, preferredMimeType ? { mimeType: preferredMimeType } : undefined);
      voiceChunksRef.current = [];
      voiceStartedAtRef.current = Date.now();
      voiceStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) voiceChunksRef.current.push(event.data);
      };
      recorder.start(1000);
      setVoiceElapsedSeconds(0);
      setIsRecordingVoice(true);
      voiceTimerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - voiceStartedAtRef.current) / 1000);
        setVoiceElapsedSeconds(Math.min(elapsed, VOICE_NOTE_MAX_SECONDS));
        if (elapsed >= VOICE_NOTE_MAX_SECONDS) stopVoiceRecording(false);
      }, 250);
    } catch (err) {
      setVoiceError(lang === 'mr' ? 'माइक परवानगी नाकारली किंवा उपलब्ध नाही.' : err instanceof Error ? err.message : 'Microphone permission denied or unavailable.');
    }
  };

  // Create Goods & Services Mesh Post
  const handleCreateGoodsService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gsTitle.trim()) return;

    const lat = position?.coords.latitude;
    const lng = position?.coords.longitude;
    const packetId = `gs-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const item: MeshGoodsService = {
      id: packetId,
      type: gsType,
      category: gsCategory,
      title: gsTitle.trim(),
      description: gsDesc.trim() || 'No additional details provided.',
      location_name: nearestNodeId || 'Vari Route',
      lat,
      lng,
      contact_phone: profile?.phone,
      requester_name: profile?.display_name || 'Varkari Pilgrim',
      status: 'open',
      timestamp: Date.now(),
      hop_count: 0
    };

    markPacketSeen(packetId);
    setGoodsServices((prev) => [item, ...prev]);
    await saveMeshGoodsService(item);
    setGsTitle('');
    setGsDesc('');

    // Multi-hop broadcast to mesh
    broadcastMeshPacket('NEW_GOODS_SERVICE', item, packetId);
  };

  const waitForIceGatheringComplete = (connection: RTCPeerConnection) =>
    new Promise<void>((resolve) => {
      if (connection.iceGatheringState === 'complete') {
        resolve();
        return;
      }

      const timeout = window.setTimeout(() => {
        connection.removeEventListener('icegatheringstatechange', handleChange);
        resolve();
      }, 5000);

      function handleChange() {
        if (connection.iceGatheringState === 'complete') {
          window.clearTimeout(timeout);
          connection.removeEventListener('icegatheringstatechange', handleChange);
          resolve();
        }
      }

      connection.addEventListener('icegatheringstatechange', handleChange);
    });

  // Catch a newly-connected peer up on what this device already knows, so
  // "store & forward" is real: a phone that pairs late still receives the
  // active SOS, recent chat, news and goods/services instead of only future ones.
  const sendBacklogToChannel = (channel: RTCDataChannel) => {
    const trySend = (type: string, payload: unknown, packetId: string, hopCount: number, relayPath: string[]) => {
      if (channel.readyState !== 'open') return;
      try {
        channel.send(JSON.stringify({ type, payload, packetId, hopCount, relayPath }));
      } catch (err) {
        console.warn('Backlog send failed:', err);
      }
    };

    if (activeSosAlert?.id) {
      trySend(
        'NEW_SOS_ALERT',
        activeSosAlert,
        `backlog-sos-${activeSosAlert.id}-${deviceIdRef.current}`,
        activeSosAlert.hop_count ?? 0,
        activeSosAlert.relay_path ?? [deviceIdRef.current]
      );
    }
    nearbySosAlerts.slice(0, 20).forEach((alert) => {
      trySend(
        'NEW_SOS_ALERT',
        alert,
        `backlog-sos-${alert.id}-${deviceIdRef.current}`,
        alert.hop_count ?? 0,
        alert.relay_path ?? [deviceIdRef.current]
      );
    });
    meshMessages.slice(0, 50).forEach((msg) => {
      trySend(
        'NEW_MESH_MESSAGE',
        msg,
        `backlog-msg-${msg.id}-${deviceIdRef.current}`,
        msg.hop_count ?? 0,
        msg.relay_path ?? [deviceIdRef.current]
      );
    });
    meshNews.slice(0, 20).forEach((news) => {
      trySend('NEW_NEWS_BROADCAST', news, `backlog-news-${news.id}-${deviceIdRef.current}`, news.hop_count ?? 0, [deviceIdRef.current]);
    });
    goodsServices.slice(0, 20).forEach((gs) => {
      trySend('NEW_GOODS_SERVICE', gs, `backlog-gs-${gs.id}-${deviceIdRef.current}`, gs.hop_count ?? 0, [deviceIdRef.current]);
    });
  };

  const registerOfflineDataChannel = (channel: RTCDataChannel) => {
    channel.onopen = () => {
      setConnectedOfflinePeerCount(offlineDataChannelsRef.current.filter((c) => c.readyState === 'open').length + 1);
      setOfflinePeerStatus('Offline peer connected. Catching them up and sending messages directly, no internet needed.');
      sendBacklogToChannel(channel);
    };
    channel.onclose = () => {
      offlineDataChannelsRef.current = offlineDataChannelsRef.current.filter((existing) => existing !== channel);
      const remaining = offlineDataChannelsRef.current.filter((c) => c.readyState === 'open').length;
      setConnectedOfflinePeerCount(remaining);
      setOfflinePeerStatus(remaining > 0 ? 'Offline peer disconnected; other peers remain connected.' : 'No offline peers connected yet.');
    };
    channel.onmessage = (event) => {
      try {
        meshPacketHandlerRef.current?.(JSON.parse(event.data));
      } catch (err) {
        console.warn('Unable to read offline mesh packet:', err);
      }
    };
    offlineDataChannelsRef.current.push(channel);
  };

  const createOfflinePeerConnection = () => {
    const connection = new RTCPeerConnection({ iceServers: [] });
    connection.ondatachannel = (event) => registerOfflineDataChannel(event.channel);
    connection.onconnectionstatechange = () => {
      setOfflinePeerStatus(`Offline peer connection: ${connection.connectionState}`);
      if (['closed', 'failed', 'disconnected'].includes(connection.connectionState)) {
        offlinePeerConnectionsRef.current = offlinePeerConnectionsRef.current.filter((c) => c !== connection);
        if (pendingOfferConnectionRef.current === connection) pendingOfferConnectionRef.current = null;
      }
    };
    offlinePeerConnectionsRef.current.push(connection);
    return connection;
  };

  const handleCreateOfflineOffer = async () => {
    try {
      const connection = createOfflinePeerConnection();
      pendingOfferConnectionRef.current = connection;
      const channel = connection.createDataChannel('vari-mitra-offline-mesh');
      registerOfflineDataChannel(channel);
      await connection.setLocalDescription(await connection.createOffer());
      await waitForIceGatheringComplete(connection);
      setLocalPairingCode(JSON.stringify(connection.localDescription));
      setOfflinePeerStatus('Offer ready. Let the nearby device scan the QR code below, then scan their answer back.');
    } catch (err) {
      setOfflinePeerStatus(`Could not create offline offer: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  };

  const handleJoinOfflineOffer = async () => {
    try {
      const connection = createOfflinePeerConnection();
      await connection.setRemoteDescription(JSON.parse(remotePairingCode));
      await connection.setLocalDescription(await connection.createAnswer());
      await waitForIceGatheringComplete(connection);
      setLocalPairingCode(JSON.stringify(connection.localDescription));
      setOfflinePeerStatus('Answer ready. Show this QR code back to the first device to finish pairing.');
    } catch (err) {
      setOfflinePeerStatus(`Could not join offline offer: ${err instanceof Error ? err.message : 'check the scanned/pasted code'}`);
    }
  };

  const handleAcceptOfflineAnswer = async () => {
    try {
      const connection = pendingOfferConnectionRef.current;
      if (!connection) {
        setOfflinePeerStatus('Create an offer on this device first, then scan the other device\u2019s answer.');
        return;
      }
      await connection.setRemoteDescription(JSON.parse(pendingOfferCode));
      setOfflinePeerStatus('Answer accepted. Waiting for the direct connection to open...');
      pendingOfferConnectionRef.current = null;
    } catch (err) {
      setOfflinePeerStatus(`Could not accept offline answer: ${err instanceof Error ? err.message : 'check the scanned/pasted code'}`);
    }
  };

  const handleRespondToSos = (alert: SosAlert) => {
    const responderName = profile?.display_name || 'Varkari Helper';
    const responderPhone = profile?.phone || '';
    const lat = position?.coords.latitude;
    const lng = position?.coords.longitude;

    const updatedAlert: SosAlert = {
      ...alert,
      status: 'responding',
      responder_id: currentMemberId || deviceIdRef.current,
      responder_name: responderName,
      responder_phone: responderPhone,
      responder_lat: lat,
      responder_lng: lng,
      accepted_at: new Date().toISOString()
    };

    broadcastMeshPacket('RESPOND_SOS_ALERT', updatedAlert, `resp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);

    void handleSendChatMessage(
      `🚑 [RESCUE IN PROGRESS] ${responderName} is coming to help! Phone: ${responderPhone}`
    );

    setNearbySosAlerts((prev) => prev.map((a) => (a.id === alert.id ? updatedAlert : a)));
  };

  const handleManualRelaySos = (alert: SosAlert) => {
    const currentHop = (alert.hop_count || 0) + 1;
    const currentPath = [...(alert.relay_path || [alert.origin_device_id || 'node-origin']), deviceIdRef.current];
    const newPacketId = `relay-sos-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const relayedAlert: SosAlert = {
      ...alert,
      hop_count: currentHop,
      relay_path: currentPath
    };

    if (alert.origin_device_id === deviceIdRef.current) {
      setActiveSosAlert(relayedAlert);
    } else {
      setNearbySosAlerts((prev) => [relayedAlert, ...prev.filter((a) => a.id !== alert.id)]);
    }

    broadcastMeshPacket('NEW_SOS_ALERT', relayedAlert, newPacketId);
  };

  const handleManualRelayMessage = (msg: MeshChatMessage) => {
    const currentHop = (msg.hop_count || 0) + 1;
    const currentPath = [...(msg.relay_path || [msg.origin_device_id || 'node-origin']), deviceIdRef.current];
    const newPacketId = `relay-msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const relayedMsg: MeshChatMessage = {
      ...msg,
      hop_count: currentHop,
      relay_path: currentPath
    };

    setMeshMessages((prev) => [relayedMsg, ...prev.filter((m) => m.id !== msg.id)]);

    broadcastMeshPacket('NEW_MESH_MESSAGE', relayedMsg, newPacketId);
  };

  const handleCancelSos = () => {
    stopSiren();
    setIsStrobeActive(false);

    if (activeSosAlert) {
      const resolvedAlert: SosAlert = {
        ...activeSosAlert,
        status: 'resolved',
        resolved_at: new Date().toISOString()
      };
      void (async () => {
        if (isSupabaseConfigured && activeSosAlert.id) {
          try {
            await supabase
              .from('sos_alerts')
              .update({ status: 'resolved', resolved_at: new Date().toISOString() })
              .eq('id', activeSosAlert.id);
          } catch (err) {
            console.warn('SOS resolve update error:', err);
          }
        }
        broadcastMeshPacket('RESOLVE_SOS_ALERT', resolvedAlert, `res-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
      })();
    }

    setActiveSosAlert(null);

    const resolveMsg: MeshChatMessage = {
      id: `resolve-sos-${Date.now()}`,
      sender_id: currentMemberId || 'guest',
      sender_name: profile?.display_name || 'Varkari Pilgrim',
      type: 'text',
      text: '✅ [SOS RESOLVED] मी आता सुरक्षित आहे (SOS alert resolved & safe).',
      timestamp: Date.now(),
      via: 'mesh',
      hop_count: 0
    };

    broadcastMeshPacket('NEW_MESH_MESSAGE', resolveMsg, resolveMsg.id);
  };

  return (
    <div className={`min-h-screen space-y-6 bg-slate-100/90 p-4 sm:p-6 text-slate-900 ${isStrobeActive ? (strobeColor === 'red' ? 'bg-red-100' : 'bg-amber-100') : ''} transition-colors duration-300`}>

      {/* Photosensitivity Safety Overlay Banner when Strobe Active */}
      {isStrobeActive && (
        <div className="sticky top-2 z-[100] rounded-2xl bg-amber-400 text-slate-950 p-4 border-2 border-slate-900 shadow-2xl flex items-center justify-between gap-3 animate-pulse">
          <div className="flex items-center gap-2 text-xs sm:text-sm font-black">
            <span className="text-xl">⚠️</span>
            <span>{lang === 'mr' ? 'बीकन सुरू आहे: तीव्र प्रकाश झोत सुरू आहे (Photosensitivity Warning).' : 'BEACON ACTIVE: Rapid screen strobe is on (Photosensitivity Notice).'}</span>
          </div>
          <button
            type="button"
            onClick={() => setIsStrobeActive(false)}
            className="px-4 py-2.5 rounded-xl bg-slate-950 text-white text-xs font-black uppercase shadow hover:bg-slate-900 shrink-0 touch-target-48 flex items-center gap-1"
          >
            <span>🛑</span>
            <span>{lang === 'mr' ? 'बीकन बंद करा' : 'STOP BEACON'}</span>
          </button>
        </div>
      )}

      {/* Top Banner & Multi-Hop Gateway Bar */}
      <div className="rounded-3xl border border-slate-200 bg-white p-5 text-slate-900 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl animate-pulse">🚩</span>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">
                {lang === 'mr' ? 'वारकरी मल्टी-हॉप मेश नेटवर्क' : 'Varkari Multi-Hop Mesh Network'}
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 mt-1 font-medium">
              {lang === 'mr'
                ? 'डिव्हाइस-टू-डिव्हाइस साखळी द्वारे नेटवर्क नसलेल्या भागातून बाह्य जगापर्यंत आपत्कालीन संदेश व बातम्या पोहोचवा'
                : 'Hop messages through a chain of offline devices until reaching a connected Internet Gateway'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLang(lang === 'mr' ? 'en' : 'mr')}
              className="px-3.5 py-2 rounded-xl bg-saffron-50 hover:bg-saffron-100 text-saffron-900 text-xs font-black border border-saffron-200 transition shadow-2xs"
            >
              🌐 {lang === 'mr' ? 'English' : 'मराठी'}
            </button>
          </div>
        </div>

        {/* Live Internet Gateway Status Indicator */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-2">
            <span
              className={`h-3 w-3 rounded-full ${
                isOnlineGateway ? 'bg-emerald-500 animate-ping' : 'bg-amber-500 animate-pulse'
              }`}
            />
            <span className="font-black uppercase tracking-wide text-slate-800">
              {isOnlineGateway
                ? lang === 'mr'
                  ? '🌐 इंटरनेट गेटवे नोड सक्रिय'
                  : '🌐 Internet Gateway Node Active'
                : lang === 'mr'
                ? '📡 ऑफलाईन मेश रिले नोड'
                : '📡 Offline Mesh Relay Node'}
            </span>
          </div>

          <div className="flex items-center gap-2 font-mono text-[11px] bg-slate-100 px-3 py-1 rounded-full border border-slate-200 text-slate-700 font-semibold">
            <span>Node ID: {deviceIdRef.current.slice(0, 12)}</span>
            <span>|</span>
            <span>Relayed to Web: {relayedCount}</span>
          </div>
        </div>
      </div>

      {/* Tabs Navigation Bar */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('sos')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition flex items-center gap-1.5 ${
            activeTab === 'sos'
              ? 'bg-red-600 text-white shadow-md font-black scale-102 ring-2 ring-red-300'
              : 'bg-white text-slate-700 hover:bg-slate-200/70 border border-slate-200'
          }`}
        >
          <span>🚨</span>
          <span>{lang === 'mr' ? '१-क्लिक एसओएस आणि अलार्म' : '1-Click SOS & Alarm'}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('chat')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition flex items-center gap-1.5 ${
            activeTab === 'chat'
              ? 'bg-saffron-600 text-white shadow-md font-black scale-102 ring-2 ring-saffron-300'
              : 'bg-white text-slate-700 hover:bg-slate-200/70 border border-slate-200'
          }`}
        >
          <span>💬</span>
          <span>{lang === 'mr' ? 'मल्टी-हॉप मेश चॅट' : 'Multi-Hop Chat'}</span>
          {meshMessages.length > 0 && (
            <span className="bg-saffron-100 text-saffron-900 px-2 py-0.5 rounded-full text-[10px] font-black">
              {meshMessages.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('news')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition flex items-center gap-1.5 ${
            activeTab === 'news'
              ? 'bg-blue-600 text-white shadow-md font-black scale-102 ring-2 ring-blue-300'
              : 'bg-white text-slate-700 hover:bg-slate-200/70 border border-slate-200'
          }`}
        >
          <span>📰</span>
          <span>{lang === 'mr' ? 'गेटवे आपत्ती बातम्या' : 'Disaster News'}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('goods')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition flex items-center gap-1.5 ${
            activeTab === 'goods'
              ? 'bg-emerald-600 text-white shadow-md font-black scale-102 ring-2 ring-emerald-300'
              : 'bg-white text-slate-700 hover:bg-slate-200/70 border border-slate-200'
          }`}
        >
          <span>📦</span>
          <span>{lang === 'mr' ? 'अन्न-पाणी व सेवा' : 'Goods & Services'}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('mesh_topology')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition flex items-center gap-1.5 ${
            activeTab === 'mesh_topology'
              ? 'bg-purple-600 text-white shadow-md font-black scale-102 ring-2 ring-purple-300'
              : 'bg-white text-slate-700 hover:bg-slate-200/70 border border-slate-200'
          }`}
        >
          <span>🕸️</span>
          <span>{lang === 'mr' ? 'मेश साखळी रचना' : 'Mesh Topology'}</span>
        </button>
      </div>

      {/* Location Permission & Sensor Accuracy Card */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-3 text-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-2xl ${position ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
              📍
            </div>
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-wider">
                {lang === 'mr' ? 'जीपीएस स्थान आणि अचूकता' : 'GPS Location & Sensor'}
              </p>
              {position ? (
                <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-800 mt-0.5">
                  <span>
                    Lat: {position.coords.latitude.toFixed(5)}, Lng: {position.coords.longitude.toFixed(5)}
                  </span>
                  <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full font-black">
                    ±{Math.round(position.coords.accuracy)}m {lang === 'mr' ? 'अचूक' : 'Accuracy'}
                  </span>
                </div>
              ) : (
                <p className="text-xs font-bold text-amber-700 mt-0.5">
                  {lang === 'mr' ? 'GPS स्थान मिळवत आहे... परवानगी आवश्यक' : 'Fetching GPS location... Permission needed'}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onRequestLocationPermission && (
              <button
                type="button"
                onClick={onRequestLocationPermission}
                className="px-3.5 py-2 rounded-xl bg-saffron-600 hover:bg-saffron-700 text-white text-xs font-black shadow transition flex items-center gap-1"
              >
                <span>📡</span>
                <span>{lang === 'mr' ? 'स्थानाची परवानगी द्या' : 'Grant Location Access'}</span>
              </button>
            )}
            {position && (
              <a
                href={`https://maps.google.com/?q=${position.coords.latitude},${position.coords.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-bold transition flex items-center gap-1"
              >
                🗺️ {lang === 'mr' ? 'मॅप उघडा' : 'Open Map'}
              </a>
            )}
          </div>
        </div>

        {/* Permission Error Banner */}
        {geoError && (
          <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1">
            <p className="font-bold flex items-center gap-1.5">
              <span>⚠️</span> {geoError}
            </p>
          </div>
        )}

        {/* Manual Route Station Selector Fallback */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-xs">
          <span className="font-bold text-slate-500">
            {lang === 'mr' ? 'स्थान स्वतः निवडा:' : 'Select Location Manually:'}
          </span>
          <select
            className="px-3 py-1.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 font-bold"
            onChange={(e) => {
              const node = nodes.find((n) => n.id === e.target.value);
              if (node && onSetManualLocation) {
                onSetManualLocation(node.lat, node.lng, node.name);
              }
            }}
            defaultValue=""
          >
            <option value="" disabled>
              {lang === 'mr' ? '-- पालखी मुक्काम / थांबा निवडा --' : '-- Select Route Station --'}
            </option>
            {nodes.map((node) => (
              <option key={node.id} value={node.id}>
                📍 {node.name} ({node.lat.toFixed(3)}, {node.lng.toFixed(3)})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* TAB 1: Emergency SOS Panic Trigger */}
      {activeTab === 'sos' && (
        <div className="bg-white border-2 border-red-500/30 rounded-3xl p-6 shadow-lg space-y-5 text-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <span>🚨</span>
              {lang === 'mr' ? 'आणीबाणीचा प्रकार निवडा' : 'Select Emergency Category'}
            </h3>
            <span className="text-xs font-black uppercase px-3 py-1 rounded-full bg-red-100 text-red-700">
              {lang === 'mr' ? '1-क्लिक SOS' : 'Instant 1-Click'}
            </span>
          </div>

          {/* Category Pills */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {(Object.keys(CATEGORY_CONFIG) as SosCategory[]).map((catKey) => {
              const config = CATEGORY_CONFIG[catKey];
              const isSelected = activeCategory === catKey;
              const borderPattern = catKey === 'medical' ? 'border-pattern-medical'
                : catKey === 'crowd' ? 'border-pattern-crowd'
                : catKey === 'lost' ? 'border-pattern-lost'
                : catKey === 'water_food' ? 'border-pattern-water'
                : 'border-solid';

              return (
                <button
                  key={catKey}
                  type="button"
                  onClick={() => setActiveCategory(catKey)}
                  className={`p-3.5 rounded-2xl border min-h-[68px] touch-target-48 text-left transition-all flex flex-col justify-between ${
                    isSelected
                      ? `bg-red-600 text-white ${borderPattern} shadow-lg scale-102 font-black ring-2 ring-white/40`
                      : `${config.bg} ${config.border} ${config.text} hover:scale-101 font-bold`
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="text-2xl">{config.icon}</span>
                    {isSelected && <span className="text-[10px] uppercase font-black px-1.5 py-0.5 rounded bg-white text-red-700">✓ Selected</span>}
                  </div>
                  <div>
                    <p className="text-xs font-black leading-snug">{config.labelMr}</p>
                    <p className="text-[11px] opacity-80 leading-tight font-medium">{config.labelEn}</p>
                  </div>
                </button>
              );
            })}
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-400 mb-1">
              {lang === 'mr' ? 'अधिक तपशील किंवा स्थानाची सूचना:' : 'Optional Additional Details:'}
            </label>
            <input
              type="text"
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              placeholder={
                lang === 'mr'
                  ? 'उदा. ज्ञानेश्वर माऊली पालखी जवळ, किंवा १०८ रुग्णवाहिका हवी आहे'
                  : 'e.g. Near Dnyaneshwar Mauli Palkhi, or need ambulance'
              }
              className="w-full px-4 py-2.5 rounded-xl border border-stone-700 bg-stone-800 text-stone-100 text-xs focus:ring-2 focus:ring-red-500 focus:outline-none"
            />
          </div>

          {/* Big Trigger Button & Beacon Controls */}
          <div className="pt-2 flex flex-col items-center justify-center space-y-4">
            <div
              className={`rounded-full p-1 ${isHoldingSos ? 'sos-hold-ring' : ''}`}
              style={{ '--sos-progress': `${sosHoldProgress}%` } as React.CSSProperties}
            >
              <button
                type="button"
                onPointerDown={beginSosHold}
                onPointerUp={cancelSosHold}
                onPointerLeave={cancelSosHold}
                onPointerCancel={cancelSosHold}
                disabled={isBroadcastingSos}
                className="flex h-32 w-32 flex-col items-center justify-center rounded-full bg-red-600 text-white shadow-xl active:scale-[0.98] transition-transform duration-100 disabled:opacity-60"
                aria-label="Hold for three seconds to activate emergency alert"
              >
                <span className="text-4xl">🚨</span><span className="mt-1 text-xs font-bold">{isBroadcastingSos ? 'Sending…' : 'SOS'}</span>
              </button>
            </div>
            <p className="text-center text-xs text-stone-400">{isHoldingSos ? 'Keep holding to activate…' : 'Hold 3 seconds to activate emergency alert'}</p>

            {/* Audio Siren & Flashlight Strobe Beacon Controls */}
            <div className="flex flex-wrap items-center justify-center gap-3 w-full pt-2">
              <button
                type="button"
                onClick={toggleSiren}
                className={`px-4 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-2 transition ${
                  isSirenActive
                    ? 'bg-red-600 text-white animate-pulse shadow-lg ring-2 ring-red-400'
                    : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
                }`}
              >
                <span>{isSirenActive ? '🔊' : '🔇'}</span>
                <span>
                  {isSirenActive
                    ? lang === 'mr'
                      ? 'ध्वनी अलार्म बंद करा'
                      : 'Stop Siren Alarm'
                    : lang === 'mr'
                    ? 'ध्वनी अलार्म सुरू करा'
                    : 'Play Emergency Siren'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setIsStrobeActive(!isStrobeActive)}
                className={`px-4 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-2 transition ${
                  isStrobeActive
                    ? 'bg-amber-500 text-black font-black animate-pulse shadow-lg'
                    : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
                }`}
              >
                <span>🔦</span>
                <span>
                  {isStrobeActive
                    ? lang === 'mr'
                      ? 'लाइट बीकन बंद करा'
                      : 'Stop Screen Beacon'
                    : lang === 'mr'
                    ? 'रात्रीसाठी स्क्रीन फ्लॅश बीकन'
                    : 'Screen Flash Beacon'}
                </span>
              </button>
            </div>
          </div>

          {activeSosAlert && (
            <div
              className={`p-4 rounded-2xl border space-y-2.5 transition-all ${
                activeSosAlert.status === 'responding'
                  ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-950 text-emerald-100 ring-2 ring-emerald-500/40'
                  : 'bg-red-500/10 border-red-500/30 text-red-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-black text-sm flex items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      activeSosAlert.status === 'responding'
                        ? 'bg-emerald-500 animate-ping'
                        : 'bg-red-600 animate-ping'
                    }`}
                  />
                  {activeSosAlert.status === 'responding'
                    ? lang === 'mr'
                      ? '🚑 मदत येत आहे!'
                      : '🚑 HELP IS ON THE WAY!'
                    : lang === 'mr'
                    ? 'सक्रिय मेश SOS अलर्ट प्रसारित होत आहे!'
                    : 'Active Multi-Hop SOS Live!'}
                </span>
                <span className="text-xs font-mono">{activeSosAlert.created_at?.slice(11, 19)}</span>
              </div>

              <p className="text-xs font-semibold">
                {activeSosAlert.note} | Category: {activeSosAlert.category?.toUpperCase()}
              </p>

              {activeSosAlert.status === 'responding' ? (
                <div className="p-3 rounded-xl bg-emerald-600/10 border border-emerald-500/30 text-emerald-200 text-xs space-y-1">
                  <p className="font-extrabold text-sm">
                    👤 {lang === 'mr' ? 'मदतनीस:' : 'Helper:'} {activeSosAlert.responder_name}
                  </p>
                  {activeSosAlert.responder_phone && (
                    <p className="font-bold text-blue-300">
                      📞 Phone:{' '}
                      <a href={`tel:${activeSosAlert.responder_phone}`} className="underline font-black">
                        {activeSosAlert.responder_phone}
                      </a>
                    </p>
                  )}
                  <p className="text-[11px] opacity-80">
                    {lang === 'mr'
                      ? 'मदतनीस तुमच्या स्थानाकडे येत आहे. मदत मिळाल्यावर खालील बटण दाबा.'
                      : 'Helper is en route to your coordinates. Tap below once aid is received.'}
                  </p>
                </div>
              ) : (
                <p className="text-[11px] opacity-80">
                  {lang === 'mr'
                    ? 'तुमचा संदेश जवळील मेश उपकरणांच्या साखळीद्वारे इंटरनेट गेटवे मिळेपर्यंत आगेकूच करत राहील.'
                    : 'Distress packet hopping across local mesh devices until reaching an internet gateway node.'}
                </p>
              )}

              {/* Stop / Resolve Active SOS Button */}
              <button
                type="button"
                onClick={handleCancelSos}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs shadow-lg transition flex items-center justify-center gap-2 mt-2 border border-emerald-400/40"
              >
                <span>✅</span>
                <span>
                  {lang === 'mr'
                    ? 'मी सुरक्षित आहे / मदत मिळाली'
                    : 'MARK SAFE & RESOLVE SOS'}
                </span>
              </button>
            </div>
          )}

          {/* Nearby Active SOS Alerts Triggered by Other Varkaris */}
          {nearbySosAlerts.length > 0 && (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/40 text-stone-100 space-y-3">
              <h4 className="text-xs font-black uppercase text-amber-300 flex items-center gap-2">
                <span>🚨</span>
                <span>
                  {lang === 'mr'
                    ? `जवळील सक्रिय आणीबाणी अलर्ट (${nearbySosAlerts.length})`
                    : `Nearby Active SOS Alerts (${nearbySosAlerts.length})`}
                </span>
              </h4>

              <div className="space-y-2.5">
                {nearbySosAlerts.map((nAlert) => (
                  <div
                    key={nAlert.id}
                    className="p-3.5 rounded-xl bg-stone-800 border border-stone-700 text-xs space-y-1.5 shadow-sm"
                  >
                    <div className="flex items-center justify-between font-bold">
                      <span className="text-red-400 font-extrabold text-sm flex items-center gap-1.5">
                        <span>👤 {nAlert.display_name || 'Varkari Pilgrim'}</span>
                        <span className="bg-red-950 text-red-300 text-[10px] uppercase px-2 py-0.5 rounded-full font-black">
                          {nAlert.category?.toUpperCase()}
                        </span>
                      </span>
                      <span className="text-[10px] text-stone-400 font-mono">Hop #{nAlert.hop_count}</span>
                    </div>

                    <p className="text-xs text-stone-200">{nAlert.note}</p>

                    {/* Relay Chain Path & Hop Count Tag */}
                    <div className="flex items-center justify-between text-[10px] text-stone-400 font-mono py-1 border-t border-b border-stone-700/50">
                      <span>🔗 Path: {nAlert.relay_path?.slice(-2).join(' ➔ ') || 'direct'}</span>
                      <span className="font-extrabold text-orange-400">
                        {nAlert.hop_count === 1 ? 'Direct 1-Hop' : `${nAlert.hop_count}-Hop Relay`}
                      </span>
                    </div>

                    {nAlert.status === 'responding' ? (
                      <div className="p-2 rounded-lg bg-emerald-950/80 text-emerald-200 text-[11px] font-bold">
                        🚑 {lang === 'mr' ? 'मदतनीस रस्ताने येत आहे:' : 'Rescue in progress by:'}{' '}
                        {nAlert.responder_name} ({nAlert.responder_phone})
                      </div>
                    ) : (
                      <div className="flex gap-2 mt-1">
                        <button
                          type="button"
                          onClick={() => handleRespondToSos(nAlert)}
                          className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow transition flex items-center justify-center gap-1.5"
                        >
                          <span>🚑</span>
                          <span>{lang === 'mr' ? 'मी मदत करत आहे' : 'Respond / Help'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleManualRelaySos(nAlert)}
                          className="py-2 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow transition flex items-center gap-1"
                        >
                          <span>🔄</span>
                          <span>{lang === 'mr' ? 'रीले करा (+१ हॉप)' : 'Relay (+1 Hop)'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Multi-Hop Off-Grid Chat */}
      {activeTab === 'chat' && (
        <div className="bg-stone-900 border border-stone-800 rounded-3xl p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between border-b border-stone-800 pb-3">
            <h3 className="text-base font-black text-stone-100 flex items-center gap-2">
              <span>💬</span>
              <span>{lang === 'mr' ? 'ऑफलाईन मल्टी-हॉप मेश चॅट' : 'Multi-Hop Chat Mesh'}</span>
            </h3>
            <span className="text-xs font-bold text-stone-500">
              {meshMessages.length} {lang === 'mr' ? 'संदेश' : 'messages'}
            </span>
          </div>

          {/* Quick Message Presets Grid */}
          <div>
            <p className="text-[11px] font-black uppercase tracking-wider text-saffron-400 mb-2.5 flex items-center gap-1.5">
              <span>⚡</span>
              <span>{lang === 'mr' ? 'त्वरित १-क्लिक संदेश:' : '1-Click Preset Messages:'}</span>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {QUICK_MESSAGES.map((message, idx) => {
                const msgText = message[lang];
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => void handleSendChatMessage(msgText)}
                    className="p-3 rounded-2xl bg-stone-800/90 hover:bg-saffron-950/60 active:scale-98 text-stone-100 text-xs font-bold border border-stone-700 hover:border-saffron-500/50 shadow-sm transition text-left min-h-[48px] touch-target-48 flex items-center justify-between"
                  >
                    <span>{msgText}</span>
                    <span className="text-[10px] text-saffron-400 font-extrabold uppercase shrink-0 ml-2">Send ➔</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Message Input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSendChatMessage();
              }}
              placeholder={
                lang === 'mr'
                  ? 'मेश साखळीत संदेश पाठवा (नेटवर्क नसतानाही कनेक्टेड नोडपर्यंत पोहचेल)...'
                  : 'Type multi-hop mesh message...'
              }
              className="flex-1 px-4 py-2.5 rounded-xl border border-stone-700 bg-stone-800 text-stone-100 text-xs focus:ring-2 focus:ring-orange-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => isRecordingVoice ? stopVoiceRecording(false) : void startVoiceRecording()}
              className={`px-3 py-2.5 rounded-xl text-white text-xs font-bold shadow transition ${isRecordingVoice ? 'bg-red-600 animate-pulse' : 'bg-stone-700 hover:bg-stone-600'}`}
              aria-label={lang === 'mr' ? 'आवाज रेकॉर्ड करा' : 'Record voice note'}
            >
              🎙️
            </button>
            <button
              type="button"
              onClick={() => void handleSendChatMessage()}
              className="px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold shadow transition"
            >
              {lang === 'mr' ? 'पाठवा' : 'Send'}
            </button>
          </div>
          {Object.values(voiceChunkProgress).length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-950/30 p-3 text-[11px] font-bold text-amber-100">
              {Object.entries(voiceChunkProgress).map(([id, progress]) => (
                <div key={id}>
                  {progress.status === 'stalled'
                    ? lang === 'mr' ? 'व्हॉइस नोट अर्धवट आहे — अजून भाग येऊ शकतात.' : 'Voice note incomplete — waiting for more chunks.'
                    : lang === 'mr' ? `व्हॉइस नोट मिळत आहे… ${progress.receivedChunks}/${progress.totalChunks}` : `Receiving voice note… ${progress.receivedChunks}/${progress.totalChunks}`}
                </div>
              ))}
            </div>
          )}
          {(isRecordingVoice || voiceError) && (
            <div className="rounded-xl border border-stone-700 bg-stone-800 p-3 text-xs text-stone-100">
              {isRecordingVoice ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between font-bold">
                    <span>🔴 {lang === 'mr' ? 'रेकॉर्डिंग…' : 'Recording…'} {voiceElapsedSeconds}s</span>
                    <span>{VOICE_NOTE_MAX_SECONDS - voiceElapsedSeconds}s</span>
                  </div>
                  <div className="h-2 rounded-full bg-stone-700"><div className="h-2 rounded-full bg-red-500" style={{ width: `${(voiceElapsedSeconds / VOICE_NOTE_MAX_SECONDS) * 100}%` }} /></div>
                  <button type="button" onClick={() => stopVoiceRecording(true)} className="text-[11px] font-bold text-red-300 underline">{lang === 'mr' ? 'रद्द करा' : 'Cancel'}</button>
                </div>
              ) : <span className="text-red-300">{voiceError}</span>}
            </div>
          )}

          {/* Chat Feed */}
          <div className="max-h-80 overflow-y-auto space-y-3 pr-1 divide-y divide-stone-800">
            {meshMessages.length === 0 ? (
              <p className="text-center text-xs text-stone-400 py-6 italic">
                {lang === 'mr' ? 'अद्याप कोणतेही संदेश नाहीत. त्वरीत संदेश पाठवा.' : 'No mesh messages yet.'}
              </p>
            ) : (
              meshMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`pt-2 text-xs ${
                    msg.is_sos ? 'p-3 rounded-2xl bg-red-500/10 border border-red-500/30' : ''
                  }`}
                >
                  <div className="flex items-center justify-between font-bold text-stone-200 mb-1">
                    <span className="flex items-center gap-2">
                      <span className="text-orange-600">👤 {msg.sender_name}</span>
                      {msg.is_sos && (
                        <span className="bg-red-600 text-white text-[10px] uppercase font-black px-2 py-0.5 rounded-full">
                          SOS
                        </span>
                      )}
                    </span>
                    <span className="text-[10px] text-stone-400 font-mono">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  {(msg.type ?? 'text') === 'voice' ? (
                    <div className="rounded-2xl border border-orange-500/30 bg-orange-950/30 p-3 text-stone-100">
                      <div className="mb-2 flex items-center justify-between text-[11px] font-bold text-orange-200">
                        <span>🎙️ {lang === 'mr' ? 'व्हॉइस नोट' : 'Voice note'}</span>
                        <span>{Math.round(msg.durationSeconds ?? 0)}s</span>
                      </div>
                      {msg.audioData ? (
                        <audio controls preload="metadata" src={base64ToAudioSrc(msg.audioData, msg.mimeType)} className="w-full" />
                      ) : (
                        <p className="text-[11px] text-amber-200">{lang === 'mr' ? 'व्हॉइस नोट मिळत आहे…' : 'Receiving voice note…'}</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs font-medium text-stone-100 leading-relaxed">{msg.text}</p>
                  )}

                  {/* Multi-Hop Relay Information Trace */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-stone-500">
                    <span className="bg-stone-800 px-2 py-0.5 rounded font-mono">
                      🔗 Hops: {msg.hop_count ?? 0}
                    </span>
                    {msg.relay_path && msg.relay_path.length > 0 && (
                      <span className="text-stone-400 italic">
                        Path: {msg.relay_path.join(' ➔ ')}
                      </span>
                    )}
                    {msg.lat && msg.lng && (
                      <a
                        href={`https://maps.google.com/?q=${msg.lat},${msg.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-orange-600 underline font-bold"
                      >
                        📍 Map
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => handleManualRelayMessage(msg)}
                      className="ml-auto px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-[10px] font-bold transition flex items-center gap-1"
                    >
                      <span>🔄</span>
                      <span>Relay (+1 Hop)</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 3: Gateway News & Disaster Bulletins */}
      {activeTab === 'news' && (
        <div className="bg-stone-900 border border-stone-800 rounded-3xl p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between border-b border-stone-800 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">📰</span>
              <h3 className="text-base font-black text-stone-100">
                {lang === 'mr' ? 'आपत्ती अपडेट्स व अधिकृत बातम्या' : 'Gateway Disaster Bulletins'}
              </h3>
            </div>
            <span className="text-[10px] bg-blue-950 text-blue-200 px-2.5 py-1 rounded-full font-extrabold uppercase">
              Relayed Downlink
            </span>
          </div>

          <p className="text-xs text-stone-400">
            {lang === 'mr'
              ? 'गेटवे नोडद्वारे इंटरनेटवरून प्राप्त झालेल्या ताज्या बातम्या व वैद्यकीय कॅम्प माहिती संपूर्ण ऑफलाईन मेश नेटवर्कमध्ये स्वयंचलित प्रसारित होते.'
              : 'Official news & bulletins fetched by internet gateway nodes are automatically relayed down the offline mesh chain.'}
          </p>

          <div className="space-y-3">
            {meshNews.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-2xl bg-blue-500/5 border border-blue-500/20 text-stone-100 space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-blue-400 uppercase tracking-wider">
                    📢 {item.category.toUpperCase().replace('_', ' ')}
                  </span>
                  <span className="text-[10px] text-stone-400 font-mono">
                    Hop #{item.hop_count} | {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <h4 className="text-sm font-black text-white">{item.title}</h4>
                <p className="text-xs leading-relaxed text-stone-300">{item.content}</p>
                <p className="text-[11px] font-bold text-stone-500 pt-1">
                  Source: <span className="text-blue-300">{item.publisher}</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: Goods & Services Off-Grid Marketplace */}
      {activeTab === 'goods' && (
        <div className="bg-stone-900 border border-stone-800 rounded-3xl p-5 shadow-lg space-y-5">
          <div className="flex items-center justify-between border-b border-stone-800 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">📦</span>
              <h3 className="text-base font-black text-stone-100">
                {lang === 'mr' ? 'अन्न, पाणी व सेवा मागणी/पुरवठा' : 'Goods & Services Off-Grid Market'}
              </h3>
            </div>
            <span className="text-xs font-bold text-emerald-400">
              {goodsServices.length} active listings
            </span>
          </div>

          {/* Form to Post New Request/Offer */}
          <form onSubmit={(e) => void handleCreateGoodsService(e)} className="p-4 rounded-2xl bg-stone-800/60 border border-stone-700 space-y-3">
            <h4 className="text-xs font-extrabold uppercase text-stone-300">
              {lang === 'mr' ? 'नवीन मागणी किंवा सेवा नोंदवा:' : 'Post Goods / Service Request or Offer:'}
            </h4>

            <div className="grid grid-cols-2 gap-2">
              <select
                value={gsType}
                onChange={(e) => setGsType(e.target.value as 'request' | 'offer')}
                className="px-3 py-2 rounded-xl border border-stone-700 bg-stone-800 text-stone-100 text-xs font-bold"
              >
                <option value="request">{lang === 'mr' ? '🆘 मला गरज आहे' : '🆘 Request'}</option>
                <option value="offer">{lang === 'mr' ? '🤝 मी मदत देऊ शकतो' : '🤝 Offer help'}</option>
              </select>

              <select
                value={gsCategory}
                onChange={(e) => setGsCategory(e.target.value as 'water' | 'food' | 'medical' | 'shelter' | 'charging' | 'transport')}
                className="px-3 py-2 rounded-xl border border-stone-700 bg-stone-800 text-stone-100 text-xs font-bold"
              >
                <option value="water">{lang === 'mr' ? '💧 पिण्याचे पाणी' : '💧 Drinking water'}</option>
                <option value="food">{lang === 'mr' ? '🍲 अन्नदान / जेवण' : '🍲 Food'}</option>
                <option value="medical">{lang === 'mr' ? '🚑 औषधे / प्रथमोपचार' : '🚑 Medical supplies'}</option>
                <option value="shelter">{lang === 'mr' ? '⛺ निवारा' : '⛺ Shelter'}</option>
                <option value="charging">{lang === 'mr' ? '🔋 चार्जिंग' : '🔋 Battery charging'}</option>
                <option value="transport">{lang === 'mr' ? '🚚 वाहतूक मदत' : '🚚 Transport help'}</option>
              </select>
            </div>

            <input
              type="text"
              required
              value={gsTitle}
              onChange={(e) => setGsTitle(e.target.value)}
              placeholder={lang === 'mr' ? 'उदा. ५०० लोकांसाठी पिण्याच्या पाण्याची टँकर हवी आहे' : 'e.g. Drinking water needed for 500 pilgrims'}
              className="w-full px-3.5 py-2 rounded-xl border border-stone-700 bg-stone-800 text-stone-100 text-xs"
            />

            <input
              type="text"
              value={gsDesc}
              onChange={(e) => setGsDesc(e.target.value)}
              placeholder={lang === 'mr' ? 'स्थान व इतर संपर्क तपशील...' : 'Location & contact details...'}
              className="w-full px-3.5 py-2 rounded-xl border border-stone-700 bg-stone-800 text-stone-100 text-xs"
            />

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow transition"
            >
              {lang === 'mr' ? 'मेशवर पोस्ट करा' : 'Post to Off-Grid Mesh'}
            </button>
          </form>

          {/* Listings */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {goodsServices.map((gs) => (
              <div
                key={gs.id}
                className={`p-4 rounded-2xl border ${
                  gs.type === 'request'
                    ? 'bg-amber-500/10 border-amber-500/30'
                    : 'bg-emerald-500/10 border-emerald-500/30'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span
                    className={`text-[10px] uppercase font-black px-2 py-0.5 rounded-full ${
                      gs.type === 'request'
                        ? 'bg-amber-600 text-white'
                        : 'bg-emerald-600 text-white'
                    }`}
                  >
                    {gs.type === 'request' ? (lang === 'mr' ? 'गरज' : 'Request') : (lang === 'mr' ? 'मदत उपलब्ध' : 'Offer')}
                  </span>
                  <span className="text-[10px] text-stone-500 font-mono">Hop #{gs.hop_count}</span>
                </div>

                <h4 className="text-xs font-black text-stone-100">{gs.title}</h4>
                <p className="text-xs text-stone-400 mt-1">{gs.description}</p>

                <div className="mt-2.5 flex items-center justify-between text-[11px] text-stone-500 border-t border-stone-800 pt-2">
                  <span>📍 {gs.location_name}</span>
                  {gs.contact_phone && (
                    <a href={`tel:${gs.contact_phone}`} className="font-bold text-blue-600 underline">
                      📞 Call {gs.contact_phone}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: Mesh Topology Chain & Peer Inspector */}
      {activeTab === 'mesh_topology' && (
        <div className="bg-stone-900 border border-stone-800 rounded-3xl p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between border-b border-stone-800 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">🕸️</span>
              <h3 className="text-base font-black text-stone-100">
                {lang === 'mr' ? 'मेश नेटवर्क साखळी रचना' : 'Mesh Chain Topology & Gateway Routing'}
              </h3>
            </div>
            <span className="text-xs font-mono bg-purple-950 text-purple-200 px-2.5 py-1 rounded-full font-bold">
              Multi-Hop Active
            </span>
          </div>

          {/* Visual Mesh Chain Graph */}
          <div className="p-5 rounded-2xl bg-stone-900 text-white space-y-4 border border-stone-800">
            <h4 className="text-xs font-extrabold uppercase text-purple-400 tracking-wider">
              LIVE MULTI-HOP PROPAGATION PATH
            </h4>

            <div className="flex flex-wrap items-center justify-center gap-3 text-xs font-bold py-4">
              <div className="p-3 rounded-2xl bg-red-600 text-center shadow-lg border border-red-400/40">
                <div>📱 Offline Device A</div>
                <div className="text-[10px] opacity-80">(Hop #0 - Sender)</div>
              </div>

              <div className="text-xl text-stone-500 font-mono">➔</div>

              <div className="p-3 rounded-2xl bg-amber-600 text-center shadow-lg border border-amber-400/40">
                <div>📡 Relay Device B</div>
                <div className="text-[10px] opacity-80">(Hop #1 - WebRTC Relay)</div>
              </div>

              <div className="text-xl text-stone-500 font-mono">➔</div>

              <div className="p-3 rounded-2xl bg-purple-600 text-center shadow-lg border border-purple-400/40">
                <div>📱 Relay Device C</div>
                <div className="text-[10px] opacity-80">(Hop #2 - Store & Forward)</div>
              </div>

              <div className="text-xl text-stone-500 font-mono">➔</div>

              <div className="p-3 rounded-2xl bg-emerald-600 text-center shadow-lg border border-emerald-400/40">
                <div>🌐 Internet Gateway</div>
                <div className="text-[10px] opacity-80">(Connected to Outer World)</div>
              </div>
            </div>

            <p className="text-xs text-stone-400 text-center italic">
              Messages continuously hop between devices until encountering any node with cellular/Wi-Fi connection to upload SOS alerts and download disaster news.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-stone-800/70 border border-stone-700 space-y-3">
            <div>
              <h4 className="text-xs font-extrabold uppercase text-purple-300">
                {lang === 'mr' ? 'इंटरनेटशिवाय थेट संदेश जोडणी' : 'Direct offline text link'}
              </h4>
              <p className="mt-1 text-[11px] text-stone-400">
                {lang === 'mr'
                  ? 'दोन्ही उपकरणे जवळ असताना, वापरकर्त्याच्या कृतीनंतर ब्राउझर WebRTC स्थानिक peer कनेक्शन तयार करतो. कोणताही STUN/TURN सर्व्हर किंवा हार्डकोड गेटवे वापरला जात नाही — हीच खरी ऑफलाईन डिव्हाइस-टू-डिव्हाइस जोडणी आहे.'
                  : 'This QR pairing is the actual offline device-to-device link — the only mechanism here that carries messages between two different phones with zero internet. Everything else on this screen (tabs syncing, the gateway sync) either only works within one browser or needs one side to be online.'}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => void handleCreateOfflineOffer()}
                  className="w-full px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow transition"
                >
                  {lang === 'mr' ? '१. जोडणी कोड तयार करा (डिव्हाइस A)' : '1. Create pairing code (Device A)'}
                </button>
                {pairingQrDataUrl ? (
                  <div className="flex flex-col items-center gap-1.5 rounded-xl border border-stone-700 bg-stone-950 p-3">
                    <img src={pairingQrDataUrl} alt="Pairing QR code" className="h-40 w-40 rounded-lg bg-white p-1" />
                    <p className="text-[10px] text-stone-400 text-center">
                      {lang === 'mr' ? 'दुसऱ्या डिव्हाइसच्या कॅमेऱ्याने हा कोड स्कॅन करा' : 'Have the other device scan this with its camera'}
                    </p>
                  </div>
                ) : (
                  <textarea
                    readOnly
                    value={localPairingCode}
                    placeholder={lang === 'mr' ? 'इथे तुमचा शेअर करण्याचा कोड दिसेल' : 'Your code to share appears here (or as a QR above)'}
                    className="h-20 w-full rounded-xl border border-stone-700 bg-stone-950 p-2 text-[10px] text-stone-200"
                  />
                )}
              </div>

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => void startQrScan('offer')}
                  className="w-full px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow transition flex items-center justify-center gap-1.5"
                >
                  <span>📷</span>
                  <span>{lang === 'mr' ? '२. Offer कोड स्कॅन करा (डिव्हाइस B)' : '2. Scan offer code (Device B)'}</span>
                </button>
                <textarea
                  value={remotePairingCode}
                  onChange={(e) => setRemotePairingCode(e.target.value)}
                  placeholder={lang === 'mr' ? 'किंवा इथे offer कोड पेस्ट करा' : 'Or paste the offer code here manually'}
                  className="h-14 w-full rounded-xl border border-stone-700 bg-stone-950 p-2 text-[10px] text-stone-200"
                />
                <button
                  type="button"
                  onClick={() => void handleJoinOfflineOffer()}
                  disabled={!remotePairingCode}
                  className="w-full px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-bold shadow transition"
                >
                  {lang === 'mr' ? 'Answer तयार करा' : 'Create answer'}
                </button>

                <button
                  type="button"
                  onClick={() => void startQrScan('answer')}
                  className="w-full px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow transition flex items-center justify-center gap-1.5"
                >
                  <span>📷</span>
                  <span>{lang === 'mr' ? '३. Answer कोड स्कॅन करा (डिव्हाइस A)' : '3. Scan answer code (Device A)'}</span>
                </button>
                <textarea
                  value={pendingOfferCode}
                  onChange={(e) => setPendingOfferCode(e.target.value)}
                  placeholder={lang === 'mr' ? 'किंवा इथे answer कोड पेस्ट करा' : 'Or paste the answer code here manually'}
                  className="h-14 w-full rounded-xl border border-stone-700 bg-stone-950 p-2 text-[10px] text-stone-200"
                />
                <button
                  type="button"
                  onClick={() => void handleAcceptOfflineAnswer()}
                  disabled={!pendingOfferCode}
                  className="w-full px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-bold shadow transition"
                >
                  {lang === 'mr' ? 'Answer स्वीकारा' : 'Accept answer'}
                </button>
              </div>
            </div>

            {qrScanMode && (
              <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/90 p-4">
                <p className="text-sm font-bold text-white">
                  {lang === 'mr' ? 'कॅमेऱ्यासमोर QR कोड धरा' : `Point the camera at the ${qrScanMode} QR code`}
                </p>
                <video ref={qrVideoRef} playsInline muted className="w-full max-w-sm rounded-xl border border-stone-700" />
                {qrScanError && <p className="text-xs text-red-400">{qrScanError}</p>}
                <button
                  type="button"
                  onClick={stopQrScan}
                  className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-white text-xs font-bold"
                >
                  {lang === 'mr' ? 'रद्द करा' : 'Cancel'}
                </button>
              </div>
            )}

            <p className="text-xs text-stone-300 font-mono">{offlinePeerStatus}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${connectedOfflinePeerCount > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-stone-600'}`}
            />
            <span className="text-xs font-bold text-stone-300">
              {connectedOfflinePeerCount > 0
                ? lang === 'mr'
                  ? `${connectedOfflinePeerCount} थेट ऑफलाईन पिअर कनेक्ट झाले`
                  : `${connectedOfflinePeerCount} direct offline peer${connectedOfflinePeerCount === 1 ? '' : 's'} connected`
                : lang === 'mr'
                ? 'अद्याप कोणतेही थेट पिअर कनेक्ट झालेले नाहीत'
                : 'No direct peers connected yet — pair using the QR flow above'}
            </span>
          </div>
          <p className="text-[11px] text-stone-500">
            {lang === 'mr'
              ? 'टीप: वेब पेज ब्लूटूथवरून चॅट संदेश पाठवू शकत नाही — ब्राउझर फक्त डिव्हाइस शोधू शकतो, GATT सर्व्हर तयार करू शकत नाही. तसेच टॅब-सिंक (BroadcastChannel) फक्त याच डिव्हाइसवरील एकाच ब्राउझरच्या टॅब्समध्ये काम करते, दुसऱ्या डिव्हाइसपर्यंत नाही.'
              : 'Note: a website cannot send chat data over Bluetooth — the browser can only discover nearby devices, not run a GATT server, so Bluetooth can\u2019t carry messages here. The tab-sync channel above also only syncs multiple tabs on this same device/browser, not a different phone — QR-paired WebRTC is what actually crosses devices.'}
          </p>
        </div>
      )}

      {/* Emergency Helplines Speed Dial */}
      {emergencyContacts.length > 0 && (
        <div className="bg-stone-900 text-white rounded-3xl p-5 shadow-lg space-y-3">
          <h4 className="text-sm font-black text-orange-400 flex items-center gap-2">
            <span>📞</span>
            <span>{lang === 'mr' ? 'आपत्कालीन हेल्पलाइन क्रमांक' : 'Direct Emergency Helplines'}</span>
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {emergencyContacts.map((contact) => (
              <a
                key={contact.id}
                href={`tel:${contact.phone}`}
                className="p-3 rounded-2xl bg-stone-800 hover:bg-stone-700 border border-stone-700 text-center transition block"
              >
                <div className="text-lg">{contact.icon || '📞'}</div>
                <div className="font-black text-sm text-red-400">{contact.phone}</div>
                <div className="text-[11px] text-stone-300">{contact.title}</div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
