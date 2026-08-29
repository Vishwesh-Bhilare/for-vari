import { openDB } from 'idb';
import { isSupabaseConfigured, supabase } from './supabase';
import type { EmergencyContact, MeshChatMessage, MeshGoodsService, MeshNewsBroadcast, OutboxEntry, QueuePriority, StoredRecord } from './types';

const MAX_OUTBOX_ATTEMPTS = 5;
const retryDelay = (attempts: number) => Math.min(60_000, 2 ** Math.max(0, attempts - 1) * 2_000);

const dbPromise = openDB('vari-companion', 7, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('nodes')) db.createObjectStore('nodes', { keyPath: 'id' });
    if (!db.objectStoreNames.contains('crowd_reports')) db.createObjectStore('crowd_reports', { keyPath: 'id', autoIncrement: true });
    if (!db.objectStoreNames.contains('traffic_reports')) db.createObjectStore('traffic_reports', { keyPath: 'id', autoIncrement: true });
    if (!db.objectStoreNames.contains('group_nodes')) db.createObjectStore('group_nodes', { keyPath: 'id', autoIncrement: true });
    if (!db.objectStoreNames.contains('item_requests')) db.createObjectStore('item_requests', { keyPath: 'id', autoIncrement: true });
    if (!db.objectStoreNames.contains('sightings')) db.createObjectStore('sightings', { keyPath: 'id', autoIncrement: true });
    if (!db.objectStoreNames.contains('sos_alerts')) db.createObjectStore('sos_alerts', { keyPath: 'id', autoIncrement: true });
    if (!db.objectStoreNames.contains('broadcast_messages')) db.createObjectStore('broadcast_messages', { keyPath: 'id', autoIncrement: true });
    if (!db.objectStoreNames.contains('volunteer_applications')) db.createObjectStore('volunteer_applications', { keyPath: 'id' });
    if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true });
    if (!db.objectStoreNames.contains('mesh_messages')) db.createObjectStore('mesh_messages', { keyPath: 'id' });
    if (!db.objectStoreNames.contains('mesh_news')) db.createObjectStore('mesh_news', { keyPath: 'id' });
    if (!db.objectStoreNames.contains('mesh_goods_services')) db.createObjectStore('mesh_goods_services', { keyPath: 'id' });
    if (!db.objectStoreNames.contains('emergency_contacts')) db.createObjectStore('emergency_contacts', { keyPath: 'id' });
  }
});

export async function saveEmergencyContact(contact: EmergencyContact) {
  const db = await dbPromise;
  await db.put('emergency_contacts', contact);
}

export async function getEmergencyContacts(): Promise<EmergencyContact[]> {
  const db = await dbPromise;
  return (await db.getAll('emergency_contacts')) as EmergencyContact[];
}

export async function deleteEmergencyContact(id: string) {
  const db = await dbPromise;
  await db.delete('emergency_contacts', id);
}

export async function saveMeshMessage(msg: MeshChatMessage) {
  const db = await dbPromise;
  await db.put('mesh_messages', msg);
}

export async function getMeshMessages(): Promise<MeshChatMessage[]> {
  const db = await dbPromise;
  const messages = (await db.getAll('mesh_messages')) as MeshChatMessage[];
  return messages
    .map((message) => ({ ...message, type: message.type ?? 'text' as const }))
    .sort((a, b) => b.timestamp - a.timestamp);
}

export async function saveMeshNews(news: MeshNewsBroadcast) {
  const db = await dbPromise;
  await db.put('mesh_news', news);
}

export async function getMeshNews(): Promise<MeshNewsBroadcast[]> {
  const db = await dbPromise;
  const items = await db.getAll('mesh_news');
  return items.sort((a, b) => b.timestamp - a.timestamp);
}

export async function saveMeshGoodsService(item: MeshGoodsService) {
  const db = await dbPromise;
  await db.put('mesh_goods_services', item);
}

export async function getMeshGoodsServices(): Promise<MeshGoodsService[]> {
  const db = await dbPromise;
  const items = await db.getAll('mesh_goods_services');
  return items.sort((a, b) => b.timestamp - a.timestamp);
}

export async function cacheRows<T extends { id?: string | number }>(store: string, rows: T[]) {
  const db = await dbPromise;
  const tx = db.transaction(store, 'readwrite');
  await Promise.all(rows.map((row) => tx.store.put(row)));
  await tx.done;
}

export async function getRows<T>(store: string): Promise<T[]> {
  return (await dbPromise).getAll(store);
}

export async function queueWrite<T extends StoredRecord>(table: string, payload: Record<string, unknown>, priority: QueuePriority = 'normal') {
  const db = await dbPromise;
  const localPayload = { ...payload, pending: true, created_at: new Date().toISOString() } as T;
  const localId = await db.add(table, localPayload);
  const localRecord = { ...localPayload, id: localId } as T;

  if (!navigator.onLine || !isSupabaseConfigured) {
    await db.add('outbox', { table, payload, priority, createdAt: Date.now(), localId, attempts: 0, nextAttemptAt: Date.now() });
    return { queued: true, localRecord };
  }

  const { data, error } = await supabase.from(table).insert(payload).select().single();
  if (error) {
    await db.add('outbox', { table, payload, priority, createdAt: Date.now(), localId, attempts: 0, nextAttemptAt: Date.now() });
    return { queued: true, error, localRecord };
  }

  await db.delete(table, localId);
  if (data) await cacheRows(table, [data]);
  return { queued: false, localRecord, serverRecord: data as T };
}

export async function drainOutbox() {
  if (!navigator.onLine || !isSupabaseConfigured) return;
  const db = await dbPromise;
  const entries = (await db.getAll('outbox')) as OutboxEntry[];
  entries.sort((a, b) => (a.priority === b.priority ? a.createdAt - b.createdAt : a.priority === 'sos' ? -1 : 1));

  const now = Date.now();
  for (const entry of entries) {
    if ((entry.attempts ?? 0) >= MAX_OUTBOX_ATTEMPTS || (entry.nextAttemptAt ?? 0) > now) continue;
    const { error } = await supabase.from(entry.table).insert(entry.payload).select().single();
    if (!error && entry.id) {
      const tx = db.transaction([entry.table, 'outbox'], 'readwrite');
      if (entry.localId !== undefined) await tx.objectStore(entry.table).delete(entry.localId);
      await tx.objectStore('outbox').delete(entry.id);
      await tx.done;
      continue;
    }
    if (error && entry.id) {
      const attempts = (entry.attempts ?? 0) + 1;
      await db.put('outbox', { ...entry, attempts, nextAttemptAt: Date.now() + retryDelay(attempts), lastError: error.message });
    }
  }
}

window.addEventListener('online', () => void drainOutbox());
