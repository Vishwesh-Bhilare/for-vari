export type Density = 'unknown' | 'low' | 'medium' | 'high';
export type QueuePriority = 'sos' | 'normal';

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
