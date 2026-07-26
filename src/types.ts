export type Density = 'unknown' | 'low' | 'medium' | 'high';
export type QueuePriority = 'sos' | 'normal';
export type UserRole = 'pilgrim' | 'volunteer' | 'admin';

export interface Profile {
  id: string;
  role: UserRole;
  display_name?: string;
  phone?: string;
  emergency_contact?: string;
  node_id?: string;
  approved?: boolean;
  group_id?: string;
  created_at?: string;
}


export type VolunteerApplicationStatus = 'pending' | 'approved' | 'rejected';

export interface VolunteerApplication {
  id: string;
  user_id: string;
  full_name: string;
  phone: string;
  age: number;
  city: string;
  experience: string;
  why_volunteer: string;
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

export interface SosAlert {
  id?: string | number;
  member_id?: string;
  node_id?: string;
  lat?: number;
  lng?: number;
  status?: 'active' | 'resolved';
  resolved_by?: string;
  resolved_at?: string;
  created_at?: string;
  pending?: boolean;
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

export type StoredRecord = CrowdReport | ItemRequest | Sighting | SosAlert;
