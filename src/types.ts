export type Density = 'low' | 'medium' | 'high';
export type QueuePriority = 'sos' | 'normal';

export interface NodePoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  sequence_order: number;
}

export interface CrowdReport {
  id?: string;
  node_id: string;
  density: Density;
  reported_by?: string;
  created_at?: string;
  pending?: boolean;
}

export interface ItemRequest {
  id?: string;
  requester_id?: string;
  item_name: string;
  lat?: number;
  lng?: number;
  status?: 'open' | 'accepted' | 'completed' | 'cancelled';
  accepted_by?: string;
  created_at?: string;
  pending?: boolean;
}

export interface Sighting {
  id?: string;
  member_id?: string;
  node_id?: string;
  reported_by?: string;
  note?: string;
  created_at?: string;
  pending?: boolean;
}

export interface SosAlert {
  id?: string;
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
}
