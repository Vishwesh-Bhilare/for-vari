export type Density = 'unknown' | 'low' | 'medium' | 'high';
export type TrafficStatus = 'unknown' | 'clear' | 'moderate' | 'heavy' | 'jam';
export type QueuePriority = 'sos' | 'normal';
export type UserRole = 'pilgrim' | 'volunteer' | 'admin';

export interface Profile {
  id: string;
  role: UserRole;
  display_name?: string;
  phone?: string;
  emergency_contact?: string;
  photo_url?: string;
  node_id?: string;
  approved?: boolean;
  group_id?: string;
  created_at?: string;
}

export interface Group {
  id: string;
  group_code: string;
  created_at?: string;
}

export interface LiveLocation {
  user_id: string;
  lat: number;
  lng: number;
  accuracy?: number;
  updated_at?: string;
  profile?: Pick<Profile, 'display_name' | 'group_id'>;
}


export type VolunteerApplicationStatus = 'pending' | 'approved' | 'rejected';

export interface VolunteerApplication {
  id?: string;
  user_id: string;
  full_name: string;
  phone: string;
  emergency_contact?: string;
  preferred_station?: string;
  age?: number;
  city?: string;
  experience?: string;
  why_volunteer?: string;
  status: VolunteerApplicationStatus;
  reviewed_by?: string;
  reviewed_at?: string;
  created_at?: string;
}

export interface NodePoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  sequence_order: number;
}

export interface CrowdReport {
  id?: string | number;
  node_id: string;
  density: Density;
  reported_by?: string;
  created_at?: string;
  pending?: boolean;
}

export interface TrafficReport {
  id?: string | number;
  node_id: string;
  status: TrafficStatus;
  note?: string;
  reported_by?: string;
  created_at?: string;
  pending?: boolean;
}

// A route node added by a pilgrim group for their own use (e.g. "our tent",
// "family meeting point"). Only visible to members of the same group.
export interface GroupNode {
  id?: string;
  group_id: string;
  name: string;
  lat: number;
  lng: number;
  note?: string;
  created_by?: string;
  created_at?: string;
  pending?: boolean;
}

export interface ItemRequest {
  id?: string | number;
  requester_id?: string;
  item_name: string;
  lat?: number;
  lng?: number;
  status?: 'open' | 'accepted' | 'completed' | 'cancelled';
  accepted_by?: string;
  accepted_at?: string;
  accepter_lat?: number;
  accepter_lng?: number;
  created_at?: string;
  pending?: boolean;
}

export interface Sighting {
  id?: string | number;
  member_id?: string;
  node_id?: string;
  reported_by?: string;
  group_code?: string;
  note?: string;
  verified?: boolean;
  verified_by?: string;
  verified_at?: string;
  created_at?: string;
  pending?: boolean;
}

export type SosCategory = 'medical' | 'lost' | 'accident' | 'crowd' | 'water_food' | 'general';
export type PacketType = 'sos_outward' | 'chat_outward' | 'news_inward' | 'goods_services_inward';

export interface SosAlert {
  id?: string | number;
  member_id?: string;
  node_id?: string;
  lat?: number;
  lng?: number;
  accuracy?: number;
  altitude?: number | null;
  category?: SosCategory;
  note?: string;
  display_name?: string;
  phone?: string;
  status?: 'active' | 'responding' | 'resolved';
  responder_id?: string;
  responder_name?: string;
  responder_phone?: string;
  responder_lat?: number;
  responder_lng?: number;
  accepted_at?: string;
  resolved_by?: string;
  resolved_at?: string;
  created_at?: string;
  pending?: boolean;
  relayed_by?: string;
  broadcast_method?: 'bluetooth' | 'mesh' | 'web' | 'direct';
  // Multi-Hop Store & Forward Mesh fields
  hop_count?: number;
  max_hops?: number;
  origin_device_id?: string;
  relay_path?: string[];
  delivered_to_gateway?: boolean;
  gateway_id?: string;
}

export interface MeshChatMessage {
  id: string;
  sos_id?: string | number;
  sender_id: string;
  sender_name: string;
  sender_phone?: string;
  text: string;
  category?: SosCategory;
  lat?: number;
  lng?: number;
  accuracy?: number;
  timestamp: number;
  is_sos?: boolean;
  via: 'bluetooth' | 'mesh' | 'web';
  relayed_by?: string;
  // Multi-Hop Store & Forward Mesh fields
  hop_count?: number;
  max_hops?: number;
  origin_device_id?: string;
  relay_path?: string[];
  delivered_to_gateway?: boolean;
  gateway_id?: string;
  packet_type?: PacketType;
}

export interface MeshNewsBroadcast {
  id: string;
  title: string;
  content: string;
  category: 'disaster_update' | 'medical_camp' | 'food_distribution' | 'weather' | 'lost_found';
  publisher: string;
  timestamp: number;
  hop_count: number;
  gateway_id?: string;
  origin_server?: boolean;
}

export interface MeshGoodsService {
  id: string;
  type: 'request' | 'offer';
  category: 'water' | 'food' | 'medical' | 'shelter' | 'charging' | 'transport';
  title: string;
  description: string;
  location_name?: string;
  lat?: number;
  lng?: number;
  contact_phone?: string;
  requester_name?: string;
  status: 'open' | 'fulfilled';
  timestamp: number;
  hop_count: number;
  gateway_synced?: boolean;
}

export interface OutboxEntry {
  id?: number;
  table: string;
  payload: Record<string, unknown>;
  priority: QueuePriority;
  createdAt: number;
  localId?: IDBValidKey;
  attempts?: number;
  nextAttemptAt?: number;
  lastError?: string;
}

export interface EmergencyContact {
  id: string;
  title: string;
  phone: string;
  category: 'ambulance' | 'police' | 'control_room' | 'medical' | 'other';
  icon?: string;
  description?: string;
}

export type StoredRecord = CrowdReport | TrafficReport | ItemRequest | Sighting | SosAlert | GroupNode;

