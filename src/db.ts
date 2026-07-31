import { openDB } from 'idb';
import { isSupabaseConfigured, supabase } from './supabase';
import type { OutboxEntry, QueuePriority, StoredRecord } from './types';

const MAX_OUTBOX_ATTEMPTS = 5;
const retryDelay = (attempts: number) => Math.min(60_000, 2 ** Math.max(0, attempts - 1) * 2_000);

const dbPromise = openDB('vari-companion', 2, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('nodes')) db.createObjectStore('nodes', { keyPath: 'id' });
    if (!db.objectStoreNames.contains('crowd_reports')) db.createObjectStore('crowd_reports', { keyPath: 'id', autoIncrement: true });
    if (!db.objectStoreNames.contains('item_requests')) db.createObjectStore('item_requests', { keyPath: 'id', autoIncrement: true });
    if (!db.objectStoreNames.contains('sightings')) db.createObjectStore('sightings', { keyPath: 'id', autoIncrement: true });
    if (!db.objectStoreNames.contains('sos_alerts')) db.createObjectStore('sos_alerts', { keyPath: 'id', autoIncrement: true });
    if (!db.objectStoreNames.contains('volunteer_applications')) db.createObjectStore('volunteer_applications', { keyPath: 'id' });
    if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true });
  }
});

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
